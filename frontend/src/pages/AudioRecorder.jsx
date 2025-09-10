import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Square, AlertCircle, Volume2 } from 'lucide-react';

const AudioRecorder = ({ 
  onRecordingComplete, 
  disabled = false, 
  maxDuration = 120,
  minDuration = 1,
  className = '',
  showWaveform = true,
  audioFormat = 'wav'
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(true);
  const [recordingState, setRecordingState] = useState('idle'); // idle, starting, recording, stopping, processing

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsSupported(false);
      setError('Audio recording not supported in this browser');
      return;
    }

    if (!window.MediaRecorder) {
      setIsSupported(false);
      setError('MediaRecorder not supported in this browser');
      return;
    }

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    chunksRef.current = [];
    setAudioLevel(0);
    setRecordingTime(0);
  };

  const getMimeType = () => {
    // Check for supported MIME types in order of preference
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/wav',
      'audio/mp4',
      'audio/mpeg'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback to default
    return '';
  };

  const setupAudioAnalyser = (stream) => {
    try {
      // Create audio context for visualisation and level detection
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      
      analyserRef.current = analyser;
      
      // Start monitoring audio levels
      monitorAudioLevel();
    } catch (err) {
      console.warn('Could not setup audio analyser:', err);
    }
  };

  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!analyserRef.current || recordingState !== 'recording') return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average audio level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalizedLevel = Math.min(average / 128, 1);
      
      setAudioLevel(normalizedLevel);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  };

  const startRecording = async () => {
    if (disabled || !isSupported) return;

    try {
      setError(null);
      setRecordingState('starting');
      chunksRef.current = [];

      // Request microphone access with enhanced constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
          sampleSize: 16
        }
      });

      streamRef.current = stream;
      setupAudioAnalyser(stream);

      // Create MediaRecorder with best available format
      const mimeType = getMimeType();
      const options = {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000
      };

      mediaRecorderRef.current = new MediaRecorder(stream, options);

      // Set up event handlers
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        setRecordingState('processing');
        await handleRecordingComplete();
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError('Recording failed: ' + event.error.message);
        setRecordingState('idle');
        cleanup();
      };

      // Start recording
      mediaRecorderRef.current.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingState('recording');
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          
          // Auto-stop at max duration
          if (newTime >= maxDuration) {
            stopRecording();
          }
          
          return newTime;
        });
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      
      let errorMessage = 'Failed to start recording. ';
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Please allow microphone access.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No microphone found.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Microphone is being used by another application.';
      } else {
        errorMessage += err.message;
      }
      
      setError(errorMessage);
      setRecordingState('idle');
      cleanup();
    }
  };

  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    setRecordingState('stopping');
    setIsRecording(false);

    // Stop the media recorder
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop monitoring audio levels
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const handleRecordingComplete = async () => {
    try {
      if (chunksRef.current.length === 0) {
        throw new Error('No audio data recorded');
      }

      // Check minimum duration
      if (recordingTime < minDuration) {
        throw new Error(`Recording too short. Minimum ${minDuration} second(s) required.`);
      }

      // Create blob from chunks
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/wav';
      const audioBlob = new Blob(chunksRef.current, { type: mimeType });

      // Validate blob
      if (audioBlob.size === 0) {
        throw new Error('Audio recording is empty');
      }

      if (audioBlob.size < 1000) { // Very small file might indicate no actual audio
        throw new Error('Audio recording appears to be empty or corrupted');
      }

      console.log('Recording completed:', {
        size: audioBlob.size,
        type: audioBlob.type,
        duration: recordingTime
      });

      // Call the completion handler
      if (onRecordingComplete) {
        await onRecordingComplete(audioBlob);
      }

      setRecordingState('idle');
      
    } catch (err) {
      console.error('Recording completion error:', err);
      setError(err.message);
      setRecordingState('idle');
    } finally {
      cleanup();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getButtonClass = () => {
    let baseClass = 'inline-flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 relative overflow-hidden';
    
    if (disabled || !isSupported) {
      baseClass += ' bg-gray-50 text-gray-300 cursor-not-allowed';
    } else if (recordingState === 'recording') {
      baseClass += ' bg-red-500 text-white hover:bg-red-600 animate-pulse';
    } else if (recordingState === 'starting' || recordingState === 'stopping' || recordingState === 'processing') {
      baseClass += ' bg-amber-500 text-white';
    } else {
      baseClass += ' bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105 cursor-pointer';
    }
    
    return baseClass;
  };

  const renderRecordingIndicator = () => {
    if (recordingState !== 'recording') return null;

    return (
      <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50 flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
        <span className="font-semibold">{formatTime(recordingTime)}</span>
        {maxDuration && (
          <span className="opacity-70">/ {formatTime(maxDuration)}</span>
        )}
        {showWaveform && (
          <div className="w-8 h-1 bg-white bg-opacity-30 rounded-full overflow-hidden ml-1">
            <div 
              className="h-full transition-all duration-100 rounded-full"
              style={{ 
                width: `${audioLevel * 100}%`,
                backgroundColor: audioLevel > 0.7 ? '#ef4444' : audioLevel > 0.4 ? '#f59e0b' : '#10b981'
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderError = () => {
    if (!error) return null;

    return (
      <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 text-red-600 px-2 py-1.5 rounded text-xs whitespace-nowrap z-50 flex items-center gap-1 max-w-60">
        <AlertCircle size={16} />
        <span>{error}</span>
        <button 
          className="ml-1 hover:text-red-800"
          onClick={() => setError(null)}
        >
          ×
        </button>
      </div>
    );
  };

  const getButtonIcon = () => {
    switch (recordingState) {
      case 'recording':
        return <Square size={20} />;
      case 'starting':
      case 'stopping':
      case 'processing':
        return <Volume2 size={20} className="animate-spin" />;
      default:
        return disabled ? <MicOff size={20} /> : <Mic size={20} />;
    }
  };

  const getButtonTitle = () => {
    switch (recordingState) {
      case 'recording':
        return `Stop recording (${formatTime(recordingTime)})`;
      case 'starting':
        return 'Starting recording...';
      case 'stopping':
        return 'Stopping recording...';
      case 'processing':
        return 'Processing recording...';
      default:
        return disabled ? 'Recording disabled' : 'Start voice recording';
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-1 text-gray-400 text-xs">
        <MicOff size={20} />
        <span>Audio recording not supported</span>
      </div>
    );
  }

  return (
    <div className={`relative inline-block ${className}`}>
      {renderError()}
      
      <button
        className={getButtonClass()}
        onClick={toggleRecording}
        disabled={disabled || !isSupported || recordingState === 'processing'}
        title={getButtonTitle()}
      >
        {getButtonIcon()}
      </button>
      
      {renderRecordingIndicator()}
    </div>
  );
};

export default AudioRecorder;