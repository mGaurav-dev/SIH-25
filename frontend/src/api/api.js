// Enhanced apiService.js - Complete Backend Integration

class ApiService {
  constructor() {
    // Fix: Use environment variables if available (Create React App automatically provides these)
    this.baseURL = this.getApiBaseUrl();
    this.token = this.getStoredToken();
    
    // Request interceptor for debugging
    this.debugMode = process.env.NODE_ENV === 'development';
  }

  // Helper method to get API base URL
  getApiBaseUrl() {
    // Option 1: Use environment variables if available
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
    
    // Option 2: Determine based on current hostname
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000/api';
      } else {
        // For production, use your actual API URL
        return 'https://your-production-api-url.com/api';
      }
    }
    
    // Option 3: Fallback
    return 'http://localhost:5000/api';
  }

  // Helper method to safely get stored token
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

  // Set authentication token
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

  // Remove authentication token
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

  // Generic API request method with enhanced error handling
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
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

    // Debug logging
    if (this.debugMode) {
      console.log(`[API] ${options.method || 'GET'} ${url}`, {
        headers: config.headers,
        body: options.body ? JSON.parse(options.body) : null
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
        
        // Handle specific HTTP status codes
        switch (response.status) {
          case 401:
            this.removeToken(); // Remove invalid token
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

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.login_id - Phone number or email
   * @param {string} userData.email - Email address
   * @param {string} userData.name - Full name
   * @param {string} userData.password - Password
   * @param {string} [userData.phone_number] - Phone number (optional)
   * @param {string} [userData.preferred_language='en'] - Preferred language
   * @param {string} [userData.location] - Location (optional)
   * @returns {Promise<Object>} Registration response with user data and token
   */
  async register(userData) {
    try {
      const response = await this.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      
      // Automatically set token if registration is successful
      if (response.access_token) {
        this.setToken(response.access_token);
      }
      
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.login_id - Phone number or email
   * @param {string} credentials.password - Password
   * @returns {Promise<Object>} Login response with user data and token
   */
  async login(credentials) {
    try {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      
      // Automatically set token if login is successful
      if (response.access_token) {
        this.setToken(response.access_token);
      }
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Validate current authentication token
   * @returns {Promise<Object>} Validation response
   */
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
      // If token validation fails, remove the invalid token
      this.removeToken();
      throw error;
    }
  }

  /**
   * Get user profile
   * @returns {Promise<Object>} User profile data
   */
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

  /**
   * Update user profile
   * @param {Object} profileData - Profile data to update
   * @param {string} [profileData.name] - Full name
   * @param {string} [profileData.phone_number] - Phone number
   * @param {string} [profileData.preferred_language] - Preferred language
   * @param {string} [profileData.location] - Location
   * @returns {Promise<Object>} Update response
   */
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

  /**
   * Logout user
   */
  async logout() {
    try {
      // Just remove the token locally since your backend doesn't have logout endpoint
      this.removeToken();
    } catch (error) {
      console.error('Logout failed:', error);
      // Still remove token even if logout fails
      this.removeToken();
    }
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Get current authentication token
   * @returns {string|null} Current token or null
   */
  getToken() {
    return this.token;
  }

  /**
   * Auto-login check on app startup
   * @returns {Promise<Object|null>} User data if auto-login successful, null otherwise
   */
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

  /**
   * Get user's chat sessions
   * @returns {Promise<Object>} Sessions data
   */
  async getChatSessions() {
    return await this.request('/chat/sessions');
  }

  /**
   * Create new chat session
   * @param {string} title - Session title
   * @returns {Promise<Object>} Created session data
   */
  async createChatSession(title = 'New Chat') {
    return await this.request('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  /**
   * Get messages for a chat session
   * @param {number} sessionId - Session ID
   * @returns {Promise<Object>} Messages data
   */
  async getChatMessages(sessionId) {
    return await this.request(`/chat/sessions/${sessionId}/messages`);
  }

  /**
   * Delete a chat session
   * @param {number} sessionId - Session ID
   * @returns {Promise<Object>} Deletion response
   */
  async deleteChatSession(sessionId) {
    return await this.request(`/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // ==================== CHAT QUERY METHODS ====================

  /**
   * Send text query to agricultural AI
   * @param {Object} queryData - Query data
   * @param {string} queryData.query - The question/query
   * @param {string} queryData.location - User location
   * @param {number} [queryData.session_id] - Optional session ID
   * @param {string} [queryData.language] - Language preference
   * @returns {Promise<Object>} AI response
   */
  async sendTextQuery(queryData) {
    return await this.request('/chat/query', {
      method: 'POST',
      body: JSON.stringify(queryData),
    });
  }

  // ==================== AUDIO METHODS ====================

  /**
   * Upload audio file for speech-to-text
   * @param {File} audioFile - Audio file
   * @param {Object} additionalData - Additional form data
   * @returns {Promise<Object>} Upload response
   */
  async uploadAudio(audioFile, additionalData = {}) {
    const formData = new FormData();
    formData.append('audio', audioFile);
    
    // Add additional form data
    Object.keys(additionalData).forEach(key => {
      if (additionalData[key] !== undefined && additionalData[key] !== null) {
        formData.append(key, additionalData[key].toString());
      }
    });

    return await this.request('/audio/upload', {
      method: 'POST',
      headers: {
        // Don't set Content-Type - let browser set it with boundary for FormData
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  /**
   * Process voice query (complete voice interaction)
   * @param {File} audioFile - Audio file
   * @param {Object} queryData - Query parameters
   * @param {string} [queryData.location] - User location
   * @param {number} [queryData.session_id] - Session ID
   * @param {string} [queryData.language] - Language preference
   * @returns {Promise<Object>} Complete voice processing response
   */
  async processVoiceQuery(audioFile, queryData = {}) {
    const formData = new FormData();
    formData.append('audio', audioFile);
    
    // Add query parameters
    Object.keys(queryData).forEach(key => {
      if (queryData[key] !== undefined && queryData[key] !== null) {
        formData.append(key, queryData[key].toString());
      }
    });

    return await this.request('/audio/voice-query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  /**
   * Generate audio from text (TTS)
   * @param {string} text - Text to convert to speech
   * @param {string} language - Language code
   * @returns {Promise<Object>} Generated audio response
   */
  async generateAudio(text, language = 'en') {
    return await this.request('/audio/generate', {
      method: 'POST',
      body: JSON.stringify({ text, language }),
    });
  }

  /**
   * Download audio file
   * @param {number} audioId - Audio file ID
   * @returns {Promise<Blob>} Audio file blob
   */
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

  /**
   * Get audio file URL for direct playback
   * @param {number} audioId - Audio file ID
   * @returns {string} Audio file URL
   */
  getAudioUrl(audioId) {
    return `${this.baseURL}/audio/download/${audioId}?token=${this.token}`;
  }

  // ==================== SYSTEM METHODS ====================

  /**
   * System health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return await this.request('/system/health');
  }

  /**
   * Get system statistics
   * @returns {Promise<Object>} System stats
   */
  async getSystemStats() {
    return await this.request('/system/stats');
  }

  /**
   * Clean up old files (admin function)
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOldFiles() {
    return await this.request('/system/files/cleanup', {
      method: 'POST',
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Retry mechanism for failed requests
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<Object>} API response
   */
  async requestWithRetry(endpoint, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.request(endpoint, options);
      } catch (error) {
        lastError = error;
        
        // Don't retry for certain errors
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
        
        if (i < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Batch request processing
   * @param {Array} requests - Array of request objects
   * @returns {Promise<Array>} Array of responses
   */
  async batchRequest(requests) {
    const promises = requests.map(({ endpoint, options }) => 
      this.request(endpoint, options).catch(error => ({ error: error.message }))
    );
    
    return await Promise.all(promises);
  }

  /**
   * Upload file helper
   * @param {File} file - File to upload
   * @param {string} endpoint - Upload endpoint
   * @param {Object} additionalData - Additional form data
   * @returns {Promise<Object>} Upload response
   */
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

  /**
   * Clear all cached data
   */
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
    // Also clear auth token
    this.removeToken();
  }

  /**
   * Get API configuration
   * @returns {Object} API configuration
   */
  getConfig() {
    return {
      baseURL: this.baseURL,
      authenticated: this.isAuthenticated(),
      debugMode: this.debugMode,
    };
  }

  /**
   * Set debug mode
   * @param {boolean} enabled - Enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  // ==================== SPECIALIZED AGRICULTURAL METHODS ====================

  /**
   * Get weather data for location
   * @param {string} location - Location string
   * @returns {Promise<Object>} Weather data
   */
  async getWeatherData(location) {
    return await this.request(`/weather?location=${encodeURIComponent(location)}`);
  }

  /**
   * Get location coordinates
   * @param {string} locationName - Location name
   * @returns {Promise<Object>} Coordinates
   */
  async getLocationCoordinates(locationName) {
    return await this.request(`/location/coordinates?name=${encodeURIComponent(locationName)}`);
  }

  /**
   * Reverse geocoding - get location name from coordinates
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} Location data
   */
  async reverseGeocode(lat, lon) {
    return await this.request(`/location/reverse?lat=${lat}&lon=${lon}`);
  }

  // ==================== VOICE INTERACTION HELPERS ====================

  /**
   * Create audio blob from array buffer
   * @param {ArrayBuffer} buffer - Audio buffer
   * @returns {Blob} Audio blob
   */
  createAudioBlob(buffer) {
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Play audio from URL
   * @param {string} audioUrl - Audio URL
   * @returns {Promise<void>} Play promise
   */
  async playAudio(audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  }

  // ==================== ERROR HANDLING HELPERS ====================

  /**
   * Handle API errors consistently
   * @param {Error} error - Error object
   * @param {string} context - Error context
   * @returns {string} User-friendly error message
   */
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
    } else if (error.message.includes('500')) {
      return 'Server error. Please try again later.';
    }
    
    return error.message || 'An unexpected error occurred.';
  }

  /**
   * Validate request data
   * @param {Object} data - Data to validate
   * @param {Array} requiredFields - Required field names
   * @throws {Error} Validation error
   */
  validateRequest(data, requiredFields) {
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`${field} is required`);
      }
    }
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

export default apiService;

// Export the class as well for testing purposes
export { ApiService };