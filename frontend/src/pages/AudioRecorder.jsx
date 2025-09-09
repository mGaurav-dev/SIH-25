// AudioRecorder.js - Audio Recording Component

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Square, Play, Pause } from 'lucide-react';

const AudioRecorder = ({
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  maxDuration = 120, // 2 minutes max
  className = '',
  disabled = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: getSupportedMimeType()
      });

      mediaRecorderRef.current = mediaRecorder;

      // Handle data available event
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      // Handle recording stop
      mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: getSupportedMimeType()
        });
        
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        if (onRecordingComplete) {
          onRecordingComplete(audioBlob, url);
        }
      });

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setDuration(0);

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          // Auto-stop if max duration reached
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

      if (onRecordingStart) {
        onRecordingStart();
      }

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone. Please check permissions.');
      cleanup();
    }
  }, [maxDuration, onRecordingComplete, onRecordingStart, cleanup]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      cleanup();

      if (onRecordingStop) {
        onRecordingStop();
      }
    }
  }, [isRecording, cleanup, onRecordingStop]);

  // Pause/Resume recording (if supported)
  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      // Resume timer
      intervalRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      // Pause timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isPaused, maxDuration, stopRecording]);

  // Play/Pause audio preview
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  // Get supported MIME type
  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    return 'audio/webm'; // fallback
  };

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [cleanup, audioUrl]);

  // Handle audio events
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [audioUrl]);

  // Reset recording
  const resetRecording = useCallback(() => {
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  }, [audioUrl]);

  return (
    <div className={`audio-recorder ${className}`}>
      {error && (
        <div className="audio-recorder-error">
          <span className="error-message">{error}</span>
          <button 
            className="error-dismiss"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="audio-recorder-controls">
        {!isRecording && !audioUrl && (
          <button
            className="record-button start"
            onClick={startRecording}
            disabled={disabled}
            title="Start recording"
          >
            <Mic />
          </button>
        )}

        {isRecording && (
          <div className="recording-controls">
            <button
              className="record-button stop"
              onClick={stopRecording}
              title="Stop recording"
            >
              <Square />
            </button>

            {MediaRecorder.prototype.pause && (
              <button
                className="record-button pause"
                onClick={togglePause}
                title={isPaused ? "Resume recording" : "Pause recording"}
              >
                {isPaused ? <Play /> : <Pause />}
              </button>
            )}

            <div className="recording-status">
              <div className="recording-indicator">
                <div className="pulse-dot"></div>
                <span>Recording</span>
              </div>
              <div className="duration">{formatDuration(duration)}</div>
            </div>
          </div>
        )}

        {audioUrl && (
          <div className="playback-controls">
            <button
              className="play-button"
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause /> : <Play />}
            </button>
            
            <div className="audio-info">
              <span className="duration">{formatDuration(duration)}</span>
            </div>

            <button
              className="reset-button"
              onClick={resetRecording}
              title="Record again"
            >
              <MicOff />
            </button>

            <audio
              ref={audioRef}
              src={audioUrl}
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>

      {isRecording && (
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${(duration / maxDuration) * 100}%` }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;