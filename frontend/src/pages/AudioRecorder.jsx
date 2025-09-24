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
  const startTimeRef = useRef(null); // Track actual recording start time

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
    startTimeRef.current = null;
  };

  const getMimeType = () => {
    // Try WAV first, then WebM with better codec
    const types = [
      'audio/wav',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg'
    ];
  
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`Using MIME type: ${type}`);
        return type;
      }
    }
  
    return '';
  };

  const setupAudioAnalyser = (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      
      analyserRef.current = analyser;
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

      const mimeType = getMimeType();
      const options = {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000
      };

      mediaRecorderRef.current = new MediaRecorder(stream, options);

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

      // Start recording and track actual start time
      mediaRecorderRef.current.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingState('recording');
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          
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

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

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

      // Calculate actual recording duration using timestamps
      const actualDuration = startTimeRef.current ? 
        Math.round((Date.now() - startTimeRef.current) / 1000) : recordingTime;

      console.log('Recording completed:', {
        actualDuration,
        displayedTime: recordingTime,
        minDuration,
        chunks: chunksRef.current.length
      });

      // Check minimum duration using actual duration
      if (actualDuration < minDuration) {
        throw new Error(`Recording too short. Minimum ${minDuration} second(s) required. Recorded ${actualDuration} seconds.`);
      }

      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(chunksRef.current, { type: mimeType });

      if (audioBlob.size === 0) {
        throw new Error('Audio recording is empty');
      }

      if (audioBlob.size < 1000) {
        throw new Error('Audio recording appears to be empty or corrupted');
      }

      console.log('Audio blob created:', {
        size: audioBlob.size,
        type: audioBlob.type,
        duration: actualDuration
      });

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
    let baseClass = 'audio-record-button';
    
    if (disabled || !isSupported) {
      baseClass += ' disabled';
    } else if (recordingState === 'recording') {
      baseClass += ' recording';
    } else if (recordingState === 'starting' || recordingState === 'stopping' || recordingState === 'processing') {
      baseClass += ' processing';
    } else {
      baseClass += ' idle';
    }
    
    return baseClass;
  };

  const renderRecordingIndicator = () => {
    if (recordingState !== 'recording') return null;

    return (
      <div className="recording-tooltip">
        <div className="pulse-indicator"></div>
        <span className="recording-time">{formatTime(recordingTime)}</span>
        {maxDuration && (
          <span className="max-duration">/ {formatTime(maxDuration)}</span>
        )}
        {showWaveform && (
          <div className="audio-visualizer">
            <div 
              className="audio-level-bar"
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
      <div className="error-tooltip">
        <AlertCircle size={16} />
        <span>{error}</span>
        <button 
          className="error-dismiss"
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
        return <Volume2 size={20} className="spinning" />;
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
      <div className="audio-recorder-unsupported">
        <MicOff size={20} />
        <span>Audio recording not supported</span>
      </div>
    );
  }

  return (
    <div className={`audio-recorder-container ${className}`}>
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