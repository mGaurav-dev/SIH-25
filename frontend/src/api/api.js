// Enhanced apiService.js - Complete Backend Integration with Audio Translation

class ApiService {
  constructor() {
    this.baseURL = this.getApiBaseUrl();
    this.token = this.getStoredToken();
    this.debugMode = process.env.NODE_ENV === 'development';
  }

  getApiBaseUrl() {
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
    
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000/api';
      } else {
        return 'https://your-production-api-url.com/api';
      }
    }
    
    return 'http://localhost:5000/api';
  }

  getStoredToken() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem('access_token');
      }
    } catch (error) {
      console.warn('LocalStorage not available:', error);
    }
    return null;
  }

  setToken(token) {
    this.token = token;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('access_token', token);
      }
    } catch (error) {
      console.warn('Could not store token:', error);
    }
  }

  removeToken() {
    this.token = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('access_token');
      }
    } catch (error) {
      console.warn('Could not remove token:', error);
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    // Ensure we have the latest token
    if (!this.token) {
      this.token = this.getStoredToken();
    }
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      },
    };

    const config = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    if (this.debugMode) {
      console.log(`[API] ${options.method || 'GET'} ${url}`, {
        headers: config.headers,
        body: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body
      });
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: response.statusText };
        }
        
        switch (response.status) {
          case 401:
            this.removeToken();
            throw new Error(errorData.error || 'Authentication failed');
          case 403:
            throw new Error(errorData.error || 'Access denied');
          case 404:
            throw new Error(errorData.error || 'Resource not found');
          case 413:
            throw new Error(errorData.error || 'File too large');
          case 500:
            throw new Error(errorData.error || 'Server error occurred');
          default:
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const data = await response.json();
      
      if (this.debugMode) {
        console.log(`[API] Response:`, data);
      }
      
      return data;
    } catch (error) {
      if (this.debugMode) {
        console.error(`[API] Request failed for ${endpoint}:`, error);
      }
      throw error;
    }
  }

  // ==================== AUTHENTICATION METHODS ====================

  async register(userData) {
    try {
      const response = await this.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      
      if (response.access_token) {
        this.setToken(response.access_token);
      }
      
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async login(credentials) {
    try {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      
      if (response.access_token) {
        this.setToken(response.access_token);
      }
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async validateToken() {
    try {
      if (!this.token) {
        throw new Error('No token available');
      }

      const response = await this.request('/auth/validate-token', {
        method: 'GET',
      });
      
      return response;
    } catch (error) {
      console.error('Token validation failed:', error);
      this.removeToken();
      throw error;
    }
  }

  async getUserProfile() {
    try {
      const response = await this.request('/auth/profile', {
        method: 'GET',
      });
      
      return response;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(profileData) {
    try {
      const response = await this.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData),
      });
      
      return response;
    } catch (error) {
      console.error('Failed to update user profile:', error);
      throw error;
    }
  }

  async changePassword(passwordData) {
    try {
      const response = await this.request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword
        }),
      });
      
      return response;
    } catch (error) {
      console.error('Failed to change password:', error);
      throw error;
    }
  }

  async logout() {
    try {
      // Call logout endpoint if it exists
      try {
        await this.request('/auth/logout', {
          method: 'POST',
        });
      } catch (error) {
        // Ignore error if logout endpoint doesn't exist
        console.warn('Logout endpoint not available:', error);
      }
      
      this.removeToken();
    } catch (error) {
      console.error('Logout failed:', error);
      this.removeToken();
    }
  }

  isAuthenticated() {
    return !!this.token;
  }

  getToken() {
    return this.token;
  }

  async autoLogin() {
    try {
      if (!this.token) {
        return null;
      }

      const validation = await this.validateToken();
      if (validation.valid) {
        const profile = await this.getUserProfile();
        return profile.user;
      }
      
      return null;
    } catch (error) {
      console.error('Auto-login failed:', error);
      this.removeToken();
      return null;
    }
  }

  // ==================== CHAT SESSION METHODS ====================

  async getChatSessions() {
    try {
      const response = await this.request('/chat/sessions');
      return response;
    } catch (error) {
      console.error('Failed to get chat sessions:', error);
      // Return fallback data structure
      return { sessions: [] };
    }
  }

  async createChatSession(title = 'New Chat') {
    try {
      const response = await this.request('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      return response;
    } catch (error) {
      console.error('Failed to create chat session:', error);
      // Return fallback session
      const fallbackSession = {
        session: {
          id: Date.now(),
          title: title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };
      return fallbackSession;
    }
  }

  async getChatMessages(sessionId) {
    try {
      const response = await this.request(`/chat/sessions/${sessionId}/messages`);
      return response;
    } catch (error) {
      console.error('Failed to get chat messages:', error);
      // Return fallback data structure
      return { 
        messages: [{
          id: 1,
          message_type: 'assistant',
          content: "Hello! How can I assist you today with your farming questions?",
          timestamp: new Date().toISOString()
        }]
      };
    }
  }

  async deleteChatSession(sessionId) {
    try {
      const response = await this.request(`/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error) {
      console.error('Failed to delete chat session:', error);
      throw error;
    }
  }

  // ==================== CHAT QUERY METHODS ====================

  async sendTextQuery(queryData) {
    try {
      if (this.debugMode) {
        console.log('[API] Sending text query:', queryData);
      }
      
      const response = await this.request('/chat/query', {
        method: 'POST',
        body: JSON.stringify({
          query: queryData.query,
          location: queryData.location,
          session_id: queryData.session_id || null,
          language: queryData.language || 'en'
        }),
      });

      if (this.debugMode) {
        console.log('[API] Chat query response:', response);
      }

      return response;
    } catch (error) {
      console.error('Text query failed:', error);
      throw error;
    }
  }

  // ==================== ENHANCED AUDIO METHODS ====================

  async uploadAudio(audioFile, additionalData = {}) {
    const formData = new FormData();
    formData.append('audio', audioFile);
    
    Object.keys(additionalData).forEach(key => {
      if (additionalData[key] !== undefined && additionalData[key] !== null) {
        formData.append(key, additionalData[key].toString());
      }
    });

    return await this.request('/audio/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  /**
   * Enhanced voice query processing with translation support
   * @param {Blob} audioBlob - Audio blob from recording
   * @param {Object} queryData - Query configuration
   * @returns {Promise<Object>} Processing response with translated audio
   */
  async processVoiceQuery(audioBlob, queryData = {}) {
    try {
      // Validate audio blob
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Audio recording is empty or invalid');
      }

      // Create properly formatted audio file
      const audioFile = this.createAudioFile(audioBlob, queryData.format || 'wav');

      const formData = new FormData();
      formData.append('audio', audioFile);
      
      // Include all query parameters
      const params = {
        location: queryData.location || '',
        session_id: queryData.session_id || null,
        language: queryData.language || 'en',
        translate_response: true, // Request translated audio response
        response_format: 'json', // Ensure we get structured response
        ...queryData
      };

      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          formData.append(key, params[key].toString());
        }
      });

      if (this.debugMode) {
        console.log('[API] Processing voice query with data:', params);
        console.log('[API] Audio file size:', audioFile.size, 'bytes');
        console.log('[API] Audio file type:', audioFile.type);
      }

      const response = await this.request('/audio/voice-query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          // Don't set Content-Type for FormData - let browser set it with boundary
        },
        body: formData,
      });

      if (this.debugMode) {
        console.log('[API] Voice query response:', response);
      }

      // Ensure we have the expected response structure
      const processedResponse = {
        recognized_text: response.recognized_text || response.transcription || '',
        response_text: response.response_text || response.response || response.ai_response || '',
        translated_text: response.translated_text || '', // Translated version of response
        audio_url: response.audio_download_url || response.audio_url || null,
        translated_audio_url: response.translated_audio_url || null, // Translated audio
        session_id: response.session_id || queryData.session_id,
        weather: response.weather || null,
        language: response.language || queryData.language || 'en',
        translation_language: response.translation_language || queryData.language || 'en',
        status: response.status || 'success',
        ...response
      };

      return processedResponse;
    } catch (error) {
      console.error('Voice query processing failed:', error);
      
      // Provide more specific error messages
      if (error.message.includes('empty') || error.message.includes('invalid')) {
        throw new Error('Audio recording failed or is empty. Please try recording again.');
      } else if (error.message.includes('format')) {
        throw new Error('Audio format not supported. Please try again.');
      } else if (error.message.includes('Authentication')) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error.message.includes('413')) {
        throw new Error('Audio file too large. Please record a shorter message.');
      }
      
      throw error;
    }
  }

  /**
   * Create a properly formatted audio file from blob
   * @param {Blob} audioBlob - Audio blob
   * @param {string} format - Audio format (wav, mp3, etc.)
   * @returns {File} Formatted audio file
   */
  createAudioFile(audioBlob, format = 'wav') {
    const timestamp = Date.now();
    const filename = `voice_recording_${timestamp}.${format}`;
    
    // Ensure proper MIME type
    const mimeType = this.getAudioMimeType(format);
    
    return new File([audioBlob], filename, {
      type: mimeType,
      lastModified: timestamp
    });
  }

  /**
   * Get proper MIME type for audio format
   * @param {string} format - Audio format
   * @returns {string} MIME type
   */
  getAudioMimeType(format) {
    const mimeTypes = {
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg',
      'ogg': 'audio/ogg',
      'webm': 'audio/webm',
      'm4a': 'audio/mp4'
    };
    
    return mimeTypes[format.toLowerCase()] || 'audio/wav';
  }

  /**
   * Generate translated audio from text
   * @param {string} text - Text to convert to speech
   * @param {string} language - Target language code
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Audio generation response
   */
  async generateTranslatedAudio(text, language = 'en', options = {}) {
    try {
      const response = await this.request('/audio/generate-translated', {
        method: 'POST',
        body: JSON.stringify({ 
          text, 
          language,
          voice: options.voice || 'default',
          speed: options.speed || 1.0,
          pitch: options.pitch || 1.0
        }),
      });

      return response;
    } catch (error) {
      console.error('Translated audio generation failed:', error);
      throw error;
    }
  }

  async generateAudio(text, language = 'en', options = {}) {
    try {
      const response = await this.request('/audio/generate', {
        method: 'POST',
        body: JSON.stringify({ 
          text, 
          language,
          ...options
        }),
      });

      return response;
    } catch (error) {
      console.error('Audio generation failed:', error);
      throw error;
    }
  }

  async downloadAudio(audioId) {
    const response = await fetch(`${this.baseURL}/audio/download/${audioId}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download audio');
    }

    return response.blob();
  }

  getAudioUrl(audioId) {
    if (!audioId) return null;
    return `${this.baseURL}/audio/download/${audioId}?token=${this.token}`;
  }

  /**
   * Enhanced audio playback with error handling and translation support
   * @param {string} audioUrl - Audio URL to play
   * @param {Object} options - Playback options
   * @returns {Promise<void>} Playback promise
   */
  async playAudioWithTranslation(audioUrl, options = {}) {
    if (!audioUrl) {
      throw new Error('No audio URL provided');
    }

    try {
      const audio = new Audio(audioUrl);
      
      // Set audio properties
      if (options.volume !== undefined) audio.volume = options.volume;
      if (options.playbackRate !== undefined) audio.playbackRate = options.playbackRate;

      // Return promise that resolves when audio finishes playing
      return new Promise((resolve, reject) => {
        audio.addEventListener('ended', resolve);
        audio.addEventListener('error', reject);
        
        audio.play().catch(reject);
      });
    } catch (error) {
      console.error('Audio playback failed:', error);
      throw new Error('Failed to play audio response');
    }
  }

  // ==================== AUDIO UTILITY METHODS ====================

  /**
   * Validate audio blob before sending
   * @param {Blob} audioBlob - Audio blob to validate
   * @returns {boolean} Is valid
   */
  validateAudioBlob(audioBlob) {
    if (!audioBlob) {
      console.error('Audio blob is null or undefined');
      return false;
    }

    if (audioBlob.size === 0) {
      console.error('Audio blob is empty');
      return false;
    }

    if (audioBlob.size > 50 * 1024 * 1024) { // 50MB limit
      console.error('Audio blob too large:', audioBlob.size);
      return false;
    }

    const validTypes = ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
    if (!validTypes.some(type => audioBlob.type.includes(type.split('/')[1]))) {
      console.warn('Audio blob type may not be supported:', audioBlob.type);
    }

    return true;
  }

  /**
   * Convert audio blob to different format if needed
   * @param {Blob} audioBlob - Original audio blob
   * @param {string} targetFormat - Target format
   * @returns {Promise<Blob>} Converted audio blob
   */
  async convertAudioFormat(audioBlob, targetFormat = 'wav') {
    // This is a placeholder for audio conversion
    // In a real implementation, you might use WebAudio API or a conversion library
    console.log(`Converting audio from ${audioBlob.type} to ${targetFormat}`);
    return audioBlob; // For now, return original
  }

  // ==================== SYSTEM METHODS ====================

  async healthCheck() {
    return await this.request('/system/health');
  }

  async getSystemStats() {
    return await this.request('/system/stats');
  }

  async cleanupOldFiles() {
    return await this.request('/system/files/cleanup', {
      method: 'POST',
    });
  }

  // ==================== ERROR HANDLING HELPERS ====================

  handleError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    
    if (error.message.includes('fetch')) {
      return 'Network error. Please check your connection.';
    } else if (error.message.includes('401')) {
      return 'Authentication required. Please login again.';
    } else if (error.message.includes('403')) {
      return 'Access denied. Insufficient permissions.';
    } else if (error.message.includes('404')) {
      return 'Resource not found.';
    } else if (error.message.includes('413')) {
      return 'File too large. Please try a smaller file.';
    } else if (error.message.includes('500')) {
      return 'Server error. Please try again later.';
    }
    
    return error.message || 'An unexpected error occurred.';
  }

  validateRequest(data, requiredFields) {
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`${field} is required`);
      }
    }
  }

  // Additional utility methods (keeping existing ones)...
  async requestWithRetry(endpoint, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.request(endpoint, options);
      } catch (error) {
        lastError = error;
        
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
        
        if (i < maxRetries) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async batchRequest(requests) {
    const promises = requests.map(({ endpoint, options }) => 
      this.request(endpoint, options).catch(error => ({ error: error.message }))
    );
    
    return await Promise.all(promises);
  }

  async uploadFile(file, endpoint, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    Object.keys(additionalData).forEach(key => {
      if (additionalData[key] !== undefined && additionalData[key] !== null) {
        formData.append(key, additionalData[key].toString());
      }
    });

    return await this.request(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  clearCache() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('chat_cache');
        localStorage.removeItem('user_cache');
        localStorage.removeItem('session_cache');
      }
    } catch (error) {
      console.warn('Could not clear cache:', error);
    }
    this.removeToken();
  }

  getConfig() {
    return {
      baseURL: this.baseURL,
      authenticated: this.isAuthenticated(),
      debugMode: this.debugMode,
    };
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

export default apiService;
export { ApiService };