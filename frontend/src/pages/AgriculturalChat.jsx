import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Plus, Settings, User, MessageSquare, MapPin, Sun, Bell, Menu, X, LogOut, Volume2, Play, Pause } from 'lucide-react';
import apiService from '../api/api.js';
import AudioRecorder from './AudioRecorder';
import './AgriculturalChat.css';
import './AudioRecorder.css';

const AgriculturalChat = ({ user: propUser, onLogout, onNavigate }) => {
  const [user, setUser] = useState(propUser || { 
    name: 'Farmer Ben', 
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzLOB-GfoW-PIgKfO3Y6_HskMu1_8zWhLtsGBUJapsaZPM09TPHEEKCg7sjv2Zvxa5GGDhYHzno5dnD8YNMRgfL4ssNk4NSVwiRNo_f9PAappT36Qjcq1Optj9zA_jtTSDkgcd_W70tDCehe2qhZmMCydnPem2cOVAlEDej6Cv7YaUF-NwcXOk4o2LjfrhA53ECf14yBdfnhCd-OEC3LTO6Kq_v-HmQz5dRexIoyVVYyXXJs6TxDYUXWdbnXu_O8bz2AjdHqQgodTu',
    preferred_language: 'en',
    location: 'Narmadapuram, Madhya Pradesh, India'
  });
  
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([
    {
      id: 1,
      message_type: 'assistant',
      content: "Hello! How can I assist you today with your farming questions?",
      timestamp: new Date().toISOString()
    }
  ]);
  
  const [inputText, setInputText] = useState('');
  const [location, setLocation] = useState(user.location || 'Narmadapuram, Madhya Pradesh, India');
  const [language, setLanguage] = useState(user.preferred_language || 'en');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const currentAudioRef = useRef(null);

  // Update user state when props change
  useEffect(() => {
    if (propUser) {
      setUser(propUser);
      setLocation(propUser.location || 'Narmadapuram, Madhya Pradesh, India');
      setLanguage(propUser.preferred_language || 'en');
    }
  }, [propUser]);

  // Initialize component and ensure token is set
  useEffect(() => {
    initializeComponent();
  }, []);

  const initializeComponent = async () => {
    // Ensure apiService has the current token
    const token = localStorage.getItem('access_token');
    if (token && !apiService.getToken()) {
      apiService.setToken(token);
    }
    
    // Load initial data
    await loadInitialData();
    getUserLocation();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      // Cleanup audio on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, [profileDropdownOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation(`${latitude},${longitude}`);
        },
        (error) => {
          console.warn('Geolocation failed:', error);
          setLocation(user.location || 'Narmadapuram, Madhya Pradesh, India');
        }
      );
    }
  };

  const loadInitialData = async () => {
    try {
      // Double-check that apiService has the token before making requests
      const token = localStorage.getItem('access_token');
      if (token && !apiService.getToken()) {
        apiService.setToken(token);
      }

      if (!apiService.isAuthenticated()) {
        console.error('ApiService is not authenticated');
        setError('Authentication required. Please log in again.');
        if (onLogout) {
          onLogout();
        }
        return;
      }

      const sessionsData = await apiService.getChatSessions();
      setSessions(sessionsData.sessions || []);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      
      // Handle authentication errors specifically
      if (error.message.includes('Authentication') || error.message.includes('401')) {
        setError('Session expired. Please log in again.');
        if (onLogout) {
          onLogout();
        }
        return;
      }
      
      setError('Failed to load chat sessions');
      // Keep sessions empty if API fails
      setSessions([]);
    }
  };

  const handleError = (message, error) => {
    console.error(message, error);
    
    // Handle authentication errors
    if (error?.message?.includes('Authentication') || error?.message?.includes('401')) {
      setError('Session expired. Please log in again.');
      if (onLogout) {
        setTimeout(() => onLogout(), 2000);
      }
      return;
    }
    
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const ensureAuthentication = () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    if (!apiService.getToken()) {
      apiService.setToken(token);
    }
    
    if (!apiService.isAuthenticated()) {
      throw new Error('Authentication failed');
    }
  };

  const sendTextMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    try {
      // Ensure we're authenticated before making the request
      ensureAuthentication();
    } catch (error) {
      handleError('Authentication required. Please log in again.', error);
      return;
    }

    const userMessage = {
      id: Date.now(),
      message_type: 'user',
      content: inputText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    const currentInput = inputText;
    setInputText('');

    try {
      const response = await apiService.sendTextQuery({
        query: currentInput,
        location: location,
        session_id: currentSession,
        language: language
      });

      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response || response.message || 'I received your message but couldn\'t generate a proper response.',
        timestamp: new Date().toISOString(),
        weather_data: response.weather
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Update session if response contains session_id
      if (response.session_id && !currentSession) {
        setCurrentSession(response.session_id);
        const newSession = {
          id: response.session_id,
          title: currentInput.substring(0, 50) + (currentInput.length > 50 ? '...' : ''),
          created_at: 'Just now'
        };
        setSessions(prev => [newSession, ...prev]);
      }

    } catch (error) {
      console.error('Text query error:', error);
      let errorMessage = 'Sorry, I encountered an error processing your request. Please try again.';
      
      // Handle specific error types from backend
      if (error.message.includes('Query cannot be empty')) {
        errorMessage = 'Please provide a question or message.';
      } else if (error.message.includes('Query too short')) {
        errorMessage = 'Your message is too short. Please provide more details.';
      } else if (error.message.includes('Location is required')) {
        errorMessage = 'Location information is required. Please check your settings.';
      } else if (error.message.includes('Authentication') || error.message.includes('401')) {
        handleError('Session expired. Please log in again.', error);
        return;
      } else if (error.message.includes('AI service')) {
        errorMessage = 'AI service is temporarily unavailable. Please try again later.';
      }
      
      handleError(errorMessage, error);
      const errorMessageObj = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: errorMessage,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessageObj]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceRecording = async (audioBlob) => {
    try {
      // Ensure we're authenticated before making the request
      ensureAuthentication();
    } catch (error) {
      handleError('Authentication required. Please log in again.', error);
      return;
    }

    // Validate audio blob first
    if (!apiService.validateAudioBlob(audioBlob)) {
      handleError('Invalid audio recording. Please try again.', new Error('Invalid audio blob'));
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await apiService.processVoiceQuery(audioBlob, {
        location: location,
        session_id: currentSession,
        language: language,
        translate_response: true // Request translated audio response
      });

      // Create user message with recognized text
      const userMessage = {
        id: Date.now(),
        message_type: 'user',
        content: response.recognized_text || 'Voice message processed',
        input_type: 'voice',
        timestamp: new Date().toISOString(),
        original_language: response.detected_language || language
      };

      // Create AI response message with both text and audio
      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response_text || response.response || 'I processed your voice message.',
        translated_content: response.translated_text || null, // Translated version if different language
        audio_url: response.audio_url || response.audio_download_url,
        translated_audio_url: response.translated_audio_url, // Translated audio in user's language
        timestamp: new Date().toISOString(),
        weather_data: response.weather,
        response_language: response.language || language,
        translation_language: response.translation_language || language
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);
      
      // Update session if response contains session_id
      if (response.session_id && !currentSession) {
        setCurrentSession(response.session_id);
        const newSession = {
          id: response.session_id,
          title: response.recognized_text ? 
                 response.recognized_text.substring(0, 50) + (response.recognized_text.length > 50 ? '...' : '') : 
                 'Voice Chat',
          created_at: 'Just now'
        };
        setSessions(prev => [newSession, ...prev]);
      }

    } catch (error) {
      handleError('Failed to process voice input. Please try again.', error);
      const errorMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: 'Sorry, I couldn\'t process your voice message. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewSession = async () => {
    try {
      ensureAuthentication();
      const response = await apiService.createChatSession('New Chat');
      setCurrentSession(response.session.id);
      setSessions(prev => [response.session, ...prev]);
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      handleError('Failed to create new session', error);
      // Fallback: create local session
      const newSession = {
        id: Date.now(),
        title: 'New Chat',
        created_at: 'Just now'
      };
      setCurrentSession(newSession.id);
      setSessions(prev => [newSession, ...prev]);
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const loadSession = async (sessionId) => {
    try {
      ensureAuthentication();
      setCurrentSession(sessionId);
      const response = await apiService.getChatMessages(sessionId);
      setMessages(response.messages || [{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      handleError('Failed to load session', error);
      // Fallback: show default message
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const playAudio = async (audioUrl, messageId) => {
    if (!audioUrl) {
      console.warn('No audio URL provided');
      return;
    }

    try {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
        setPlayingAudio(null);
      }

      setPlayingAudio(messageId);
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.addEventListener('ended', () => {
        setPlayingAudio(null);
        currentAudioRef.current = null;
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio playback failed:', e);
        setPlayingAudio(null);
        currentAudioRef.current = null;
        handleError('Failed to play audio response', new Error('Audio playback failed'));
      });

      await audio.play();
    } catch (error) {
      console.error('Failed to play audio:', error);
      setPlayingAudio(null);
      currentAudioRef.current = null;
      handleError('Failed to play audio response', error);
    }
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setPlayingAudio(null);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleProfileDropdown = () => {
    setProfileDropdownOpen(!profileDropdownOpen);
  };

  const handleSettings = () => {
    setProfileDropdownOpen(false);
    if (onNavigate) {
      onNavigate('settings');
    }
  };

  const handleLogoutClick = () => {
    setProfileDropdownOpen(false);
    if (onLogout) {
      onLogout();
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getLanguageName = (langCode) => {
    const languages = {
      'en': 'English',
      'hi': 'हिंदी',
      'mr': 'मराठी',
      'gu': 'ગુજરાતી',
      'ta': 'தமிழ்',
      'te': 'తెలుగు',
      'kn': 'ಕನ್ನಡ',
      'bn': 'বাংলা'
    };
    return languages[langCode] || langCode.toUpperCase();
  };

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  const renderAudioControls = (message) => {
    const hasOriginalAudio = message.audio_url;
    const hasTranslatedAudio = message.translated_audio_url;
    const isPlaying = playingAudio === message.id;
    
    if (!hasOriginalAudio && !hasTranslatedAudio) {
      return null;
    }

    return (
      <div className="audio-controls">
        {hasOriginalAudio && (
          <button 
            className={`audio-btn ${isPlaying ? 'playing' : ''}`}
            onClick={() => isPlaying ? stopAudio() : playAudio(message.audio_url, message.id)}
            title={`Play response in ${getLanguageName(message.response_language || 'en')}`}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            <Volume2 size={14} />
            <span>Original</span>
          </button>
        )}
        
        {hasTranslatedAudio && message.translation_language !== message.response_language && (
          <button 
            className={`audio-btn translated ${isPlaying ? 'playing' : ''}`}
            onClick={() => isPlaying ? stopAudio() : playAudio(message.translated_audio_url, `${message.id}_translated`)}
            title={`Play response in ${getLanguageName(message.translation_language || language)}`}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            <Volume2 size={14} />
            <span>{getLanguageName(message.translation_language || language)}</span>
          </button>
        )}
      </div>
    );
  };

  const renderMessageContent = (message) => {
    const showTranslated = message.translated_content && 
                          message.translated_content !== message.content &&
                          message.translation_language !== message.response_language;

    return (
      <div className="message-text-content">
        <div className={`message-bubble ${message.message_type}`}>
          {message.content}
        </div>
        
        {showTranslated && (
          <div className="message-bubble translated">
            <div className="translation-label">
              Translated to {getLanguageName(message.translation_language)}:
            </div>
            {message.translated_content}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            {sidebarOpen ? <X /> : <Menu />}
          </button>
          <div className="logo">
            <svg className="logo-icon" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z" fill="currentColor"></path>
            </svg>
            <h1>AgriAssist</h1>
          </div>
        </div>
        
        <div className="header-right">
          <button className="header-btn">
            <Bell />
          </button>
          <div className="profile-dropdown" ref={dropdownRef}>
            <div 
              className="user-avatar" 
              style={{backgroundImage: `url(${user.avatar})`}}
              onClick={toggleProfileDropdown}
            ></div>
            {profileDropdownOpen && (
              <>
                <div className="dropdown-overlay" onClick={() => setProfileDropdownOpen(false)}></div>
                <div className={`dropdown-menu ${profileDropdownOpen ? 'open' : ''}`}>
                  <div className="dropdown-header">
                    <div className="dropdown-user-info">
                      <div 
                        className="dropdown-avatar" 
                        style={{backgroundImage: `url(${user.avatar})`}}
                      ></div>
                      <div className="dropdown-user-details">
                        <h4>{user.name}</h4>
                        <p>{user.location}</p>
                      </div>
                    </div>
                  </div>
                  <button className="dropdown-item" onClick={handleSettings}>
                    <Settings />
                    <span>Settings</span>
                  </button>
                  <button className="dropdown-item" onClick={handleLogoutClick}>
                    <LogOut />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Chat Area */}
        <div className="chat-container">
          <div className="chat-header">
            <h2>Ask AgriAssist</h2>
            <p>Your AI-powered farming expert. Ready to help.</p>
            <div className="location-info">
              <MapPin className="location-icon" />
              <span>{location}</span>
            </div>
          </div>

          <div className="messages-container custom-scrollbar">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.message_type} fade-in`}>
                {message.message_type === 'assistant' ? (
                  <div className="message-avatar ai-avatar">
                    <MessageSquare />
                  </div>
                ) : (
                  <div className="message-avatar user-avatar" style={{backgroundImage: `url(${user.avatar})`}}></div>
                )}
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">
                      {message.message_type === 'assistant' ? 'AgriAssist AI' : user.name}
                    </span>
                    {message.input_type === 'voice' && (
                      <div className="voice-indicator">
                        <Mic size={14} />
                        <span>Voice</span>
                      </div>
                    )}
                    <span className="message-time">{formatTimestamp(message.timestamp)}</span>
                  </div>
                  
                  {renderMessageContent(message)}
                  
                  {message.message_type === 'assistant' && renderAudioControls(message)}
                  
                  {message.weather_data && (
                    <div className="weather-info">
                      <Sun className="weather-icon" />
                      <span>{Math.round(message.weather_data.temperature)}°C</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message assistant fade-in">
                <div className="message-avatar ai-avatar">
                  <MessageSquare />
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">AgriAssist AI</span>
                  </div>
                  <div className="message-bubble assistant typing">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <div className="input-wrapper">
              <textarea
                ref={inputRef}
                className="message-input"
                placeholder="Type your message here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                rows="1"
                disabled={isLoading}
              />
              <div className="input-controls">
                <AudioRecorder
                  onRecordingComplete={handleVoiceRecording}
                  disabled={isLoading}
                  maxDuration={120}
                  minDuration={1}
                  showWaveform={true}
                  audioFormat="wav"
                />
                <button
                  className="send-btn"
                  onClick={sendTextMessage}
                  disabled={!inputText.trim() || isLoading}
                >
                  <Send />
                </button>
              </div>
            </div>
            
            <div className="input-footer">
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                className="language-select"
                disabled={isLoading}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="mr">मराठी (Marathi)</option>
                <option value="gu">ગુજરાતી (Gujarati)</option>
                <option value="ta">தமிழ் (Tamil)</option>
                <option value="te">తెలుగు (Telugu)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
                <option value="bn">বাংলা (Bengali)</option>
              </select>
              <div className="input-stats">
                <span className="character-count">{inputText.length}/2000</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <h3>Chat History</h3>
            <button className="new-chat-btn" onClick={createNewSession} disabled={isLoading}>
              <Plus />
              <span>New Chat</span>
            </button>
          </div>
          
          <div className="sessions-list custom-scrollbar">
            {sessions.length === 0 ? (
              <div className="empty-sessions">
                <MessageSquare className="empty-icon" />
                <p>No chat sessions yet</p>
                <p className="empty-subtitle">Start a conversation to see your history here</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${currentSession === session.id ? 'active' : ''}`}
                  onClick={() => loadSession(session.id)}
                >
                  <div className="session-icon">
                    <MessageSquare />
                  </div>
                  <div className="session-info">
                    <p className="session-title">{session.title}</p>
                    <p className="session-date">{session.created_at}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </main>

      <style jsx>{`
        .audio-controls {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          align-items: center;
        }

        .audio-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 16px;
          color: #374151;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .audio-btn:hover {
          background: rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        .audio-btn.playing {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .audio-btn.translated {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }

        .audio-btn.translated:hover {
          background: #059669;
        }

        .message-text-content {
          width: 100%;
        }

        .message-bubble.translated {
          margin-top: 8px;
          background: #f0f9ff;
          border-left: 3px solid #3b82f6;
          padding: 12px;
        }

        .translation-label {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .voice-indicator {
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(16, 185, 129, 0.1);
          padding: 2px 6px;
          border-radius: 10px;
          color: #10b981;
          font-size: 10px;
        }
      `}</style>
    </div>
  );
};

export default AgriculturalChat;