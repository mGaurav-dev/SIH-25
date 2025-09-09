import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Plus, Settings, User, MessageSquare, MapPin, Sun, Bell, Menu, X, LogOut } from 'lucide-react';
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
  const [isRecording, setIsRecording] = useState(false);
  const [location, setLocation] = useState(user.location || 'Narmadapuram, Madhya Pradesh, India');
  const [language, setLanguage] = useState(user.preferred_language || 'en');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Update user state when props change
  useEffect(() => {
    if (propUser) {
      setUser(propUser);
      setLocation(propUser.location || 'Narmadapuram, Madhya Pradesh, India');
      setLanguage(propUser.preferred_language || 'en');
    }
  }, [propUser]);

  // Initialize component
  useEffect(() => {
    loadInitialData();
    getUserLocation();
  }, []);

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
      // const sessionsData = await apiService.getChatSessions();
      // setSessions(sessionsData.sessions || []);
      // Mock data for demo
      setSessions([]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setError('Failed to load chat sessions');
    }
  };

  const handleError = (message, error) => {
    console.error(message, error);
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const sendTextMessage = async () => {
    if (!inputText.trim() || isLoading) return;

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
      // Mock API response for demo
      setTimeout(() => {
        const aiMessage = {
          id: Date.now() + 1,
          message_type: 'assistant',
          content: `I understand you're asking about "${currentInput}". This is a demo response. In a real implementation, this would connect to your agricultural AI service to provide expert farming advice.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsLoading(false);
      }, 1500);

      /*
      const response = await apiService.sendTextQuery({
        query: currentInput,
        location: location,
        session_id: currentSession,
        language: language
      });

      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
        weather_data: response.weather
      };

      setMessages(prev => [...prev, aiMessage]);
      
      if (response.session_id && !currentSession) {
        setCurrentSession(response.session_id);
        const newSession = {
          id: response.session_id,
          title: currentInput.substring(0, 50) + (currentInput.length > 50 ? '...' : ''),
          created_at: 'Just now'
        };
        setSessions(prev => [newSession, ...prev]);
      }
      */

    } catch (error) {
      handleError('Failed to send message. Please try again.', error);
      const errorMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleVoiceRecording = async (audioBlob) => {
    setIsLoading(true);
    
    try {
      // Mock voice processing for demo
      setTimeout(() => {
        const userMessage = {
          id: Date.now(),
          message_type: 'user',
          content: 'This is a transcribed voice message (demo)',
          input_type: 'voice',
          timestamp: new Date().toISOString()
        };

        const aiMessage = {
          id: Date.now() + 1,
          message_type: 'assistant',
          content: 'I heard your voice message. This is a demo response to voice input.',
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage, aiMessage]);
        setIsLoading(false);
      }, 2000);

      /*
      const response = await apiService.processVoiceQuery(audioBlob, {
        location: location,
        session_id: currentSession,
        language: language
      });

      const userMessage = {
        id: Date.now(),
        message_type: 'user',
        content: response.recognized_text,
        input_type: 'voice',
        timestamp: new Date().toISOString()
      };

      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response_text,
        audio_url: response.audio_download_url,
        timestamp: new Date().toISOString(),
        weather_data: response.weather
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);
      
      if (response.session_id && !currentSession) {
        setCurrentSession(response.session_id);
        const newSession = {
          id: response.session_id,
          title: response.recognized_text.substring(0, 50) + '...',
          created_at: 'Just now'
        };
        setSessions(prev => [newSession, ...prev]);
      }
      */

    } catch (error) {
      handleError('Failed to process voice input. Please try again.', error);
      setIsLoading(false);
    }
  };

  const createNewSession = async () => {
    try {
      // Mock session creation for demo
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

      /*
      const response = await apiService.createChatSession('New Chat');
      setCurrentSession(response.session.id);
      setSessions(prev => [response.session, ...prev]);
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
      */
    } catch (error) {
      handleError('Failed to create new session', error);
    }
  };

  const loadSession = async (sessionId) => {
    try {
      setCurrentSession(sessionId);
      // Mock loading session messages
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);

      /*
      const response = await apiService.getChatMessages(sessionId);
      setMessages(response.messages || []);
      */
    } catch (error) {
      handleError('Failed to load session', error);
    }
  };

  const playAudio = async (audioUrl) => {
    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        await audio.play();
      } catch (error) {
        console.error('Failed to play audio:', error);
      }
    }
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

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

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
                    {message.input_type === 'voice' && <Mic className="voice-indicator" />}
                    <span className="message-time">{formatTimestamp(message.timestamp)}</span>
                  </div>
                  <div className={`message-bubble ${message.message_type}`}>
                    {message.content}
                  </div>
                  {message.audio_url && (
                    <button 
                      className="play-audio-btn" 
                      onClick={() => playAudio(message.audio_url)}
                    >
                      🔊 Play Audio
                    </button>
                  )}
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
    </div>
  );
};

export default AgriculturalChat;