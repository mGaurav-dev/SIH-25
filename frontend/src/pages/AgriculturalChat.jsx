import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Plus, Settings, User, MessageSquare, MapPin, Sun, Bell, Menu, X, LogOut, Volume2, Play, Pause, Globe, Trash2, MoreVertical } from 'lucide-react';
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
  const [detectedLanguage, setDetectedLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(null); // For session dropdown menus
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const currentAudioRef = useRef(null);
  const sessionMenuRef = useRef(null);

  // Language detection function
  const detectLanguage = (text) => {
    if (!text || text.trim().length < 3) return 'en';
    
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasTamil = /[\u0B80-\u0BFF]/.test(text);
    const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
    const hasKannada = /[\u0C80-\u0CFF]/.test(text);
    const hasBengali = /[\u0980-\u09FF]/.test(text);
    const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
    
    const asciiCount = (text.match(/[\x00-\x7F]/g) || []).length;
    const asciiRatio = asciiCount / text.length;
    
    if (hasDevanagari) return 'hi';
    if (hasTamil) return 'ta';
    if (hasTelugu) return 'te';
    if (hasKannada) return 'kn';
    if (hasBengali) return 'bn';
    if (hasGujarati) return 'gu';
    if (asciiRatio > 0.8) return 'en';
    
    return 'en';
  };

  useEffect(() => {
    if (propUser) {
      setUser(propUser);
      setLocation(propUser.location || 'Narmadapuram, Madhya Pradesh, India');
    }
  }, [propUser]);

  useEffect(() => {
    initializeComponent();
  }, []);

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (apiService && apiService.clearAudioCache) {
        apiService.clearAudioCache();
      }
    };
  }, []);

  useEffect(() => {
    if (inputText.trim()) {
      const detected = detectLanguage(inputText);
      setDetectedLanguage(detected);
    }
  }, [inputText]);

  const initializeComponent = async () => {
    const token = localStorage.getItem('access_token');
    if (token && !apiService.getToken()) {
      apiService.setToken(token);
    }
    
    await loadInitialData();
    getUserLocation();
  };

  // Handle clicks outside session menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(event.target)) {
        setSessionMenuOpen(null);
      }
    };

    if (profileDropdownOpen || sessionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileDropdownOpen, sessionMenuOpen]);

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
      
      if (error.message.includes('Authentication') || error.message.includes('401')) {
        setError('Session expired. Please log in again.');
        if (onLogout) {
          onLogout();
        }
        return;
      }
      
      setError('Failed to load chat sessions');
      setSessions([]);
    }
  };

  const handleError = (message, error) => {
    console.error(message, error);
    
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

  const playAudio = async (audioUrl, messageId) => {
    if (!audioUrl) {
      console.warn('No audio URL provided');
      return;
    }

    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
        setPlayingAudio(null);
      }

      setPlayingAudio(messageId);
      console.log(`Starting audio playback for message ${messageId}, URL: ${audioUrl}`);
      
      let finalAudioUrl = audioUrl;
      
      if (audioUrl.startsWith('/api/') || audioUrl.startsWith('/audio/')) {
        try {
          const audioIdMatch = audioUrl.match(/\/(\d+)$/);
          if (audioIdMatch) {
            const audioId = parseInt(audioIdMatch[1]);
            console.log(`Fetching authenticated audio for ID: ${audioId}`);
            
            finalAudioUrl = await apiService.getAuthenticatedAudioUrl(audioId);
            console.log(`Got authenticated audio URL: ${finalAudioUrl}`);
          } else {
            throw new Error('Could not extract audio ID from URL');
          }
        } catch (fetchError) {
          console.error('Failed to get authenticated audio URL:', fetchError);
          throw fetchError;
        }
      }
      
      const audio = new Audio(finalAudioUrl);
      currentAudioRef.current = audio;
      
      audio.preload = 'auto';
      audio.volume = 1.0;
      
      audio.addEventListener('loadstart', () => {
        console.log(`Audio loading started for message ${messageId}`);
      });
      
      audio.addEventListener('canplay', () => {
        console.log(`Audio ready to play for message ${messageId}`);
      });
      
      audio.addEventListener('ended', () => {
        console.log(`Audio playback ended for message ${messageId}`);
        setPlayingAudio(null);
        currentAudioRef.current = null;
        
        if (finalAudioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalAudioUrl);
          console.log(`Cleaned up blob URL for message ${messageId}`);
        }
      });

      audio.addEventListener('error', (e) => {
        console.error(`Audio playback failed for message ${messageId}:`, e);
        setPlayingAudio(null);
        currentAudioRef.current = null;
        
        if (finalAudioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalAudioUrl);
        }
        
        let errorMessage = 'Failed to play audio response';
        if (e.target?.error?.code === 4) {
          errorMessage = 'Audio file format not supported';
        } else if (e.target?.error?.code === 3) {
          errorMessage = 'Audio file corrupted or incomplete';
        } else if (e.target?.error?.code === 2) {
          errorMessage = 'Network error while loading audio';
        }
        
        handleError(errorMessage, new Error('Audio playback failed'));
      });
      
      console.log(`Attempting to play audio for message ${messageId}`);
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        console.log(`Audio playback started successfully for message ${messageId}`);
      }
      
    } catch (error) {
      console.error(`Failed to play audio for message ${messageId}:`, error);
      setPlayingAudio(null);
      currentAudioRef.current = null;
      
      let userMessage = 'Failed to play audio response';
      
      if (error.message.includes('Authentication') || error.message.includes('401')) {
        userMessage = 'Authentication failed. Please log in again.';
        if (onLogout) {
          setTimeout(() => onLogout(), 2000);
        }
      } else if (error.message.includes('NotAllowedError')) {
        userMessage = 'Audio playback blocked by browser. Please click to enable audio.';
      } else if (error.message.includes('NotSupportedError')) {
        userMessage = 'Audio format not supported by your browser.';
      } else if (error.message.includes('404')) {
        userMessage = 'Audio file not found on server.';
      } else if (error.message.includes('Network')) {
        userMessage = 'Network error. Please check your connection.';
      }
      
      handleError(userMessage, error);
    }
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      
      const src = currentAudioRef.current.src;
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      
      currentAudioRef.current = null;
    }
    setPlayingAudio(null);
  };

  const sendTextMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    try {
      ensureAuthentication();
    } catch (error) {
      handleError('Authentication required. Please log in again.', error);
      return;
    }

    const userMessage = {
      id: Date.now(),
      message_type: 'user',
      content: inputText,
      timestamp: new Date().toISOString(),
      original_language: detectedLanguage,
      input_type: 'text'
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
        generate_audio: true
      });

      console.log('Text query response:', response);

      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response || response.response_text || response.message || 'I received your message but couldn\'t generate a proper response.',
        original_content: response.original_response || response.original_english_text || null,
        translated_content: response.translated_text || null,
        timestamp: new Date().toISOString(),
        weather_data: response.weather,
        audio_url: response.audio_url || response.audio_download_url || (response.audio_file_id ? `/api/audio/download/${response.audio_file_id}` : null),
        audio_stream_url: response.audio_stream_url || (response.audio_file_id ? `/api/audio/stream/${response.audio_file_id}` : null),
        translated_audio_url: response.translated_audio_url || (response.translated_audio_file_id ? `/api/audio/download/${response.translated_audio_file_id}` : null),
        translated_audio_stream_url: response.translated_audio_stream_url || (response.translated_audio_file_id ? `/api/audio/stream/${response.translated_audio_file_id}` : null),
        english_audio_url: response.english_audio_url || (response.english_audio_file_id ? `/api/audio/download/${response.english_audio_file_id}` : null),
        response_language: response.response_language || response.detected_language || 'en',
        translation_language: response.translation_language || response.detected_language || 'en',
        detected_language: response.detected_language || 'en',
        audio_file_id: response.audio_file_id,
        translated_audio_file_id: response.translated_audio_file_id,
        english_audio_file_id: response.english_audio_file_id
      };

      console.log('Created AI message with audio URLs:', {
        audio_url: aiMessage.audio_url,
        translated_audio_url: aiMessage.translated_audio_url,
        english_audio_url: aiMessage.english_audio_url,
        audio_file_id: aiMessage.audio_file_id
      });

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

    } catch (error) {
      console.error('Text query error:', error);
      let errorMessage = 'Sorry, I encountered an error processing your request. Please try again.';
      
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
    console.log("[CHAT] Starting voice recording handler");
    
    try {
      ensureAuthentication();
    } catch (error) {
      handleError('Authentication required. Please log in again.', error);
      return;
    }
  
    if (!audioBlob || audioBlob.size === 0) {
      console.error("[CHAT] Invalid audio blob:", { size: audioBlob?.size, type: audioBlob?.type });
      handleError('Invalid audio recording. Please try again.', new Error('Empty audio blob'));
      return;
    }
  
    console.log("[CHAT] Audio blob validation passed:", {
      size: audioBlob.size,
      type: audioBlob.type
    });
  
    setIsLoading(true);
    
    try {
      // Test endpoint availability first
      const endpointOk = await apiService.testVoiceEndpoint();
      console.log("[CHAT] Voice endpoint test result:", endpointOk);
  
      const response = await apiService.processVoiceQuery(audioBlob, {
        location: location,
        session_id: currentSession,
        translate_response: true
      });
  
      console.log("[CHAT] Voice query completed successfully");
  
      // Rest of your existing code for handling the response...
      const userMessage = {
        id: Date.now(),
        message_type: 'user',
        content: response.recognized_text || response.transcription || 'Voice message processed',
        input_type: 'voice',
        timestamp: new Date().toISOString(),
        original_language: response.detected_language || 'en'
      };
  
      const aiMessage = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: response.response_text || response.response || response.ai_response || 'I processed your voice message.',
        original_content: response.original_response || null,
        translated_content: response.translated_text || null,
        timestamp: new Date().toISOString(),
        weather_data: response.weather,
        audio_url: response.audio_url || response.audio_download_url || (response.output_audio_id ? `/api/audio/download/${response.output_audio_id}` : null),
        audio_stream_url: response.audio_stream_url || (response.output_audio_id ? `/api/audio/stream/${response.output_audio_id}` : null),
        translated_audio_url: response.translated_audio_url || (response.translated_audio_id ? `/api/audio/download/${response.translated_audio_id}` : null),
        response_language: response.response_language || 'en',
        translation_language: response.translation_language || 'en',
        detected_language: response.detected_language || 'en',
        audio_file_id: response.output_audio_id,
        translated_audio_file_id: response.translated_audio_id
      };
  
      setMessages(prev => [...prev, userMessage, aiMessage]);
      
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
      console.error("[CHAT] Voice processing failed:", error);
      
      // Use the enhanced error message from the API service
      handleError(error.message, error);
      
      const errorMessage_obj = {
        id: Date.now() + 1,
        message_type: 'assistant',
        content: error.message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage_obj]);
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
      setSessionMenuOpen(null); // Close any open menus
    } catch (error) {
      handleError('Failed to create new session', error);
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

// FIXED: Enhanced loadSession function with better error handling and debugging
const loadSession = async (sessionId) => {
  try {
    ensureAuthentication();
    setCurrentSession(sessionId);
    setIsLoading(true);
    
    console.log(`Loading session ${sessionId}...`);
    
    const response = await apiService.getChatMessages(sessionId);
    console.log('Session messages response:', response);
    
    // Check if we have messages from the API response
    if (response.messages && Array.isArray(response.messages)) {
      if (response.messages.length > 0) {
        // Transform the messages to match frontend format
        const transformedMessages = response.messages.map(msg => {
          console.log('Transforming message:', msg);
          
          // FIXED: Handle both timestamp formats properly
          let messageTimestamp = msg.timestamp;
          if (!messageTimestamp) {
            messageTimestamp = msg.created_at || new Date().toISOString();
          }
          
          return {
            id: msg.id,
            message_type: msg.message_type,
            content: msg.content,
            timestamp: messageTimestamp,
            original_language: msg.original_language,
            input_type: msg.input_type || 'text',
            location: msg.location,
            weather_data: msg.weather_data,
            audio_url: msg.audio_url,
            audio_stream_url: msg.audio_stream_url,
            detected_language: msg.original_language || 'en'
          };
        });
        
        console.log(`Transformed ${transformedMessages.length} messages for session ${sessionId}`);
        setMessages(transformedMessages);
      } else {
        console.log(`Session ${sessionId} has no messages, showing default greeting`);
        // Show default greeting if session has no messages
        setMessages([{
          id: 1,
          message_type: 'assistant',
          content: "Hello! How can I assist you today with your farming questions?",
          timestamp: new Date().toISOString()
        }]);
      }
    } else {
      console.warn('Invalid messages format in response:', response);
      // Show default greeting on invalid response
      setMessages([{
        id: 1,
        message_type: 'assistant',
        content: "Hello! How can I assist you today with your farming questions?",
        timestamp: new Date().toISOString()
      }]);
    }
    
    setSessionMenuOpen(null); // Close any open menus
    
  } catch (error) {
    console.error('Failed to load session:', error);
    handleError('Failed to load session', error);
    
    // Show default greeting on error
    setMessages([{
      id: 1,
      message_type: 'assistant',
      content: "Hello! How can I assist you today with your farming questions?",
      timestamp: new Date().toISOString()
    }]);
  } finally {
    setIsLoading(false);
  }
};

  // NEW: Delete session function
  const deleteSession = async (sessionId, event) => {
    // Prevent triggering loadSession when clicking delete
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this chat? This action cannot be undone.')) {
      return;
    }
    
    try {
      ensureAuthentication();
      await apiService.deleteChatSession(sessionId);
      
      // Remove session from local state
      setSessions(prev => prev.filter(session => session.id !== sessionId));
      
      // If we deleted the current session, reset to default
      if (currentSession === sessionId) {
        setCurrentSession(null);
        setMessages([{
          id: 1,
          message_type: 'assistant',
          content: "Hello! How can I assist you today with your farming questions?",
          timestamp: new Date().toISOString()
        }]);
      }
      
      setSessionMenuOpen(null);
      console.log(`Session ${sessionId} deleted successfully`);
      
    } catch (error) {
      console.error('Failed to delete session:', error);
      handleError('Failed to delete session', error);
    }
  };

  const toggleSessionMenu = (sessionId, event) => {
    event.stopPropagation(); // Prevent triggering loadSession
    setSessionMenuOpen(sessionMenuOpen === sessionId ? null : sessionId);
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

  // Updated handleSettings and handleLogoutClick functions for AgriculturalChat.jsx

// Fixed handleSettings and handleLogoutClick functions for AgriculturalChat.jsx

const handleSettings = (e) => {
  console.log('=== SETTINGS CLICKED ===');
  
  // Prevent event bubbling
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log('onNavigate function exists:', typeof onNavigate === 'function');
  console.log('onNavigate value:', onNavigate);
  
  // Close dropdown first
  setProfileDropdownOpen(false);
  
  if (onNavigate && typeof onNavigate === 'function') {
    console.log('Calling onNavigate with "settings"');
    // Add small delay to ensure dropdown closes first
    setTimeout(() => {
      onNavigate('settings');
    }, 100);
    console.log('onNavigate call completed');
  } else {
    console.error('onNavigate function not provided or not a function');
    console.log('All props:', { onNavigate, onLogout, user: !!user });
  }
};

const handleLogoutClick = (e) => {
  console.log('=== LOGOUT CLICKED ===');
  
  // Prevent event bubbling
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log('onLogout function exists:', typeof onLogout === 'function');
  console.log('onLogout value:', onLogout);
  
  // Close dropdown first
  setProfileDropdownOpen(false);
  
  // Show confirmation dialog
  if (confirm('Are you sure you want to logout?')) {
    console.log('User confirmed logout');
    
    if (onLogout && typeof onLogout === 'function') {
      console.log('Calling onLogout function');
      // Add small delay to ensure dropdown closes first
      setTimeout(() => {
        onLogout();
      }, 100);
      console.log('onLogout call completed');
    } else {
      console.error('onLogout function not provided or not a function');
      console.log('Performing manual logout');
      
      // Manual logout as fallback
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_data');
      window.location.reload();
    }
  } else {
    console.log('User cancelled logout');
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

  // Enhanced audio controls with better error handling
  const renderAudioControls = (message) => {
    const hasOriginalAudio = message.audio_url && !message.translated_audio_url;
    const hasTranslatedAudio = message.translated_audio_url;
    const hasBothAudios = message.audio_url && message.translated_audio_url;
    
    const isPlaying = playingAudio === message.id;
    const isTranslatedPlaying = playingAudio === `${message.id}_translated`;
    
    console.log(`Rendering audio controls for message ${message.id}:`, {
      hasOriginalAudio,
      hasTranslatedAudio,
      hasBothAudios,
      audio_url: message.audio_url,
      translated_audio_url: message.translated_audio_url,
      audio_file_id: message.audio_file_id
    });
    
    if (!hasOriginalAudio && !hasTranslatedAudio) {
      return null;
    }

    const handleAudioPlay = async (audioUrl, playbackId) => {
      try {
        console.log(`Audio button clicked - URL: ${audioUrl}, ID: ${playbackId}`);
        if (playingAudio === playbackId) {
          stopAudio();
        } else {
          await playAudio(audioUrl, playbackId);
        }
      } catch (error) {
        console.error('Audio playback error:', error);
        handleError('Failed to play audio', error);
      }
    };

    return (
      <div className="audio-controls">
        {hasTranslatedAudio && (
          <button 
            className={`audio-btn primary ${isTranslatedPlaying ? 'playing' : ''}`}
            onClick={() => handleAudioPlay(message.translated_audio_url, `${message.id}_translated`)}
            title={`Play response in ${getLanguageName(message.translation_language || message.detected_language || 'en')}`}
            disabled={isLoading}
          >
            {isTranslatedPlaying ? <Pause size={16} /> : <Play size={16} />}
            <Volume2 size={14} />
            <span>{getLanguageName(message.translation_language || message.detected_language || 'en')}</span>
          </button>
        )}
        
        {hasOriginalAudio && (
          <button 
            className={`audio-btn ${hasBothAudios ? 'secondary' : 'primary'} ${isPlaying ? 'playing' : ''}`}
            onClick={() => handleAudioPlay(message.audio_url, message.id)}
            title={hasBothAudios ? "Play original English response" : "Play audio response"}
            disabled={isLoading}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            <Volume2 size={14} />
            <span>{hasBothAudios ? 'English' : 'Audio'}</span>
          </button>
        )}
        
        {apiService.debugMode && (
          <small style={{ color: '#666', fontSize: '10px', marginLeft: '8px' }}>
            ID: {message.audio_file_id || 'N/A'}
          </small>
        )}
      </div>
    );
  };

  // Enhanced message content rendering with proper translation display
  const renderMessageContent = (message) => {
    if (message.message_type === 'user' && message.original_language && message.original_language !== 'en') {
      return (
        <div className="message-text-content">
          <div className={`message-bubble ${message.message_type}`}>
            {message.content}
          </div>
          {message.translated_content && message.translated_content !== message.content && (
            <div className="message-bubble english-translation">
              <div className="translation-label">
                English: 
              </div>
              {message.translated_content}
            </div>
          )}
        </div>
      );
    }

    if (message.message_type === 'assistant') {
      const userLanguage = message.detected_language || 'en';
      const showOriginal = message.original_content && 
                          message.original_content !== message.content &&
                          userLanguage !== 'en' &&
                          message.original_content.trim() !== message.content.trim();

      return (
        <div className="message-text-content">
          <div className={`message-bubble ${message.message_type}`}>
            {message.content}
          </div>
          
          {showOriginal && (
            <div className="message-bubble english-original">
              <div className="translation-label">
                Original (English):
              </div>
              {message.original_content}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="message-text-content">
        <div className={`message-bubble ${message.message_type}`}>
          {message.content}
        </div>
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
      <div className="dropdown-menu open">
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
        
        <button 
          className="dropdown-item" 
          onClick={handleSettings}
          type="button"
        >
          <Settings />
          <span>Settings</span>
        </button>
        
        <button 
          className="dropdown-item" 
          onClick={handleLogoutClick}
          type="button"
        >
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
            <p>Your AI-powered farming expert. Ready to help in any language.</p>
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
                    {message.detected_language && message.detected_language !== 'en' && (
                      <div className="language-indicator">
                        <Globe size={12} />
                        <span>{getLanguageName(message.detected_language)}</span>
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
                placeholder="Type your message in any language..."
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
                  audioFormat="webm"
                  className="voice-recorder"
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
              <div className="auto-detect-info">
                {inputText.trim() && (
                  <div className="language-detection">
                    <Globe size={14} />
                    <span>Detected: {getLanguageName(detectedLanguage)}</span>
                  </div>
                )}
              </div>
              <div className="input-stats">
                <span className="character-count">{inputText.length}/2000</span>
                <span className="auto-language-info">Language automatically detected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar with Delete Functionality */}
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
                  <div className="session-menu" ref={sessionMenuOpen === session.id ? sessionMenuRef : null}>
                    <button
                      className="session-menu-btn"
                      onClick={(e) => toggleSessionMenu(session.id, e)}
                      title="More options"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {sessionMenuOpen === session.id && (
                      <>
                        <div className="dropdown-overlay" onClick={() => setSessionMenuOpen(null)}></div>
                        <div className="session-dropdown-menu">
                          <button
                            className="session-dropdown-item delete-item"
                            onClick={(e) => deleteSession(session.id, e)}
                          >
                            <Trash2 size={14} />
                            <span>Delete Chat</span>
                          </button>
                        </div>
                      </>
                    )}
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