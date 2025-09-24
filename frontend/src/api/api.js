// Enhanced apiService.js - Auto Language Detection Support

class ApiService {
  constructor() {
    this.baseURL = this.getApiBaseUrl();
    this.token = this.getStoredToken();
    this.debugMode = process.env.NODE_ENV === "development";
  }

  getApiBaseUrl() {
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.REACT_APP_API_URL
    ) {
      return process.env.REACT_APP_API_URL;
    }

    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;

      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:5000/api";
      } else {
        return "https://your-production-api-url.com/api";
      }
    }

    return "http://localhost:5000/api";
  }

  getStoredToken() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return localStorage.getItem("access_token");
      }
    } catch (error) {
      console.warn("LocalStorage not available:", error);
    }
    return null;
  }

  setToken(token) {
    this.token = token;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem("access_token", token);
      }
    } catch (error) {
      console.warn("Could not store token:", error);
    }
  }

  removeToken() {
    this.token = null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem("access_token");
      }
    } catch (error) {
      console.warn("Could not remove token:", error);
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    if (!this.token) {
      this.token = this.getStoredToken();
    }

    const defaultOptions = {
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
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
      console.log(`[API] ${options.method || "GET"} ${url}`, {
        headers: config.headers,
        body:
          options.body && typeof options.body === "string"
            ? JSON.parse(options.body)
            : options.body,
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
            throw new Error(errorData.error || "Authentication failed");
          case 403:
            throw new Error(errorData.error || "Access denied");
          case 404:
            throw new Error(errorData.error || "Resource not found");
          case 413:
            throw new Error(errorData.error || "File too large");
          case 500:
            throw new Error(errorData.error || "Server error occurred");
          default:
            throw new Error(
              errorData.error ||
                `HTTP ${response.status}: ${response.statusText}`
            );
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
      const response = await this.request("/auth/register", {
        method: "POST",
        body: JSON.stringify(userData),
      });

      if (response.access_token) {
        this.setToken(response.access_token);
      }

      return response;
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  }

  async login(credentials) {
    try {
      const response = await this.request("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      if (response.access_token) {
        this.setToken(response.access_token);
      }

      return response;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }

  async validateToken() {
    try {
      if (!this.token) {
        throw new Error("No token available");
      }

      const response = await this.request("/auth/validate-token", {
        method: "GET",
      });

      return response;
    } catch (error) {
      console.error("Token validation failed:", error);
      this.removeToken();
      throw error;
    }
  }

  async getUserProfile() {
    try {
      const response = await this.request("/auth/profile", {
        method: "GET",
      });

      return response;
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      throw error;
    }
  }

  async updateUserProfile(profileData) {
    try {
      const response = await this.request("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(profileData),
      });

      return response;
    } catch (error) {
      console.error("Failed to update user profile:", error);
      throw error;
    }
  }

  async changePassword(passwordData) {
    try {
      const response = await this.request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
        }),
      });

      return response;
    } catch (error) {
      console.error("Failed to change password:", error);
      throw error;
    }
  }

  async logout() {
    try {
      try {
        await this.request("/auth/logout", {
          method: "POST",
        });
      } catch (error) {
        console.warn("Logout endpoint not available:", error);
      }

      this.removeToken();
    } catch (error) {
      console.error("Logout failed:", error);
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
      console.error("Auto-login failed:", error);
      this.removeToken();
      return null;
    }
  }

  // ==================== CHAT SESSION METHODS ====================

  async getChatSessions() {
    try {
      const response = await this.request("/chat/sessions");
      return response;
    } catch (error) {
      console.error("Failed to get chat sessions:", error);
      return { sessions: [] };
    }
  }

  async createChatSession(title = "New Chat") {
    try {
      const response = await this.request("/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      return response;
    } catch (error) {
      console.error("Failed to create chat session:", error);
      const fallbackSession = {
        session: {
          id: Date.now(),
          title: title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
      return fallbackSession;
    }
  }

  async getChatMessages(sessionId) {
    try {
      const response = await this.request(
        `/chat/sessions/${sessionId}/messages`
      );
      return response;
    } catch (error) {
      console.error("Failed to get chat messages:", error);
      return {
        messages: [
          {
            id: 1,
            message_type: "assistant",
            content:
              "Hello! How can I assist you today with your farming questions?",
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
  }

  async deleteChatSession(sessionId) {
    try {
      const response = await this.request(`/chat/sessions/${sessionId}`, {
        method: "DELETE",
      });
      return response;
    } catch (error) {
      console.error("Failed to delete chat session:", error);
      throw error;
    }
  }

  // ==================== UPDATED CHAT QUERY METHODS - AUTO LANGUAGE DETECTION ====================

  /**
   * UPDATED: Send text query with automatic language detection
   * Removed manual language parameter - backend handles detection
   */
  async sendTextQuery(queryData) {
    try {
      if (this.debugMode) {
        console.log("[API] Sending text query with auto detection:", queryData);
      }

      // UPDATED: Removed language parameter - backend will auto-detect
      const response = await this.request("/chat/query", {
        method: "POST",
        body: JSON.stringify({
          query: queryData.query,
          location: queryData.location,
          session_id: queryData.session_id || null,
          generate_audio: queryData.generate_audio !== false, // Default to true
        }),
      });

      if (this.debugMode) {
        console.log("[API] Auto-detected language response:", {
          detected_language: response.detected_language,
          response_language: response.response_language,
          has_audio: !!response.audio_file_id
        });
      }

      return response;
    } catch (error) {
      console.error("Text query with auto detection failed:", error);
      throw error;
    }
  }

  // ==================== UPDATED AUDIO METHODS - AUTO LANGUAGE DETECTION ====================

  async uploadAudio(audioFile, additionalData = {}) {
    const formData = new FormData();
    formData.append("audio", audioFile);

    Object.keys(additionalData).forEach((key) => {
      if (additionalData[key] !== undefined && additionalData[key] !== null) {
        formData.append(key, additionalData[key].toString());
      }
    });

    return await this.request("/audio/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  /**
   * UPDATED: Voice query processing with automatic language detection
   * Removed manual language parameter - backend handles detection and translation
   */
  async processVoiceQuery(audioBlob, queryData = {}) {
    console.log("[API] Starting processVoiceQuery with:", {
      audioBlobSize: audioBlob?.size,
      audioBlobType: audioBlob?.type,
      queryData: queryData
    });
  
    try {
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("Audio recording is empty or invalid");
      }
  
      // Check authentication first
      if (!this.token) {
        this.token = this.getStoredToken();
      }
      if (!this.token) {
        throw new Error("No authentication token available");
      }
      console.log("[API] Authentication token present:", this.token ? "YES" : "NO");
  
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice_input.webm');
      formData.append('location', queryData.location || 'Unknown');
      formData.append('translate_response', queryData.translate_response ? 'true' : 'false');
      
      if (queryData.session_id) {
        formData.append('session_id', queryData.session_id.toString());
      }
  
      console.log("[API] FormData created with:", {
        hasAudio: formData.has('audio'),
        location: formData.get('location'),
        translateResponse: formData.get('translate_response'),
        sessionId: formData.get('session_id')
      });
  
      const url = `${this.baseURL}/audio/voice-query`;
      console.log("[API] Making request to:", url);
  
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        body: formData
      });
  
      console.log("[API] Response received:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
  
      if (!response.ok) {
        let errorData;
        const responseText = await response.text();
        console.log("[API] Error response text:", responseText);
        
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          console.log("[API] Failed to parse error as JSON:", parseError);
          errorData = { error: responseText || response.statusText };
        }
  
        console.log("[API] Parsed error data:", errorData);
  
        switch (response.status) {
          case 400:
            throw new Error(`Bad Request: ${errorData.error || responseText}`);
          case 401:
            this.removeToken();
            throw new Error(`Authentication failed: ${errorData.error || responseText}`);
          case 403:
            throw new Error(`Access denied: ${errorData.error || responseText}`);
          case 404:
            throw new Error(`Resource not found: ${errorData.error || responseText}`);
          case 413:
            throw new Error(`File too large: ${errorData.error || responseText}`);
          case 500:
            throw new Error(`Server error: ${errorData.error || responseText}`);
          default:
            throw new Error(`HTTP ${response.status}: ${errorData.error || responseText || response.statusText}`);
        }
      }
  
      const responseText = await response.text();
      console.log("[API] Success response text:", responseText.substring(0, 500) + "...");
      
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("[API] Parsed response data:", {
          hasRecognizedText: !!data.recognized_text,
          hasResponseText: !!data.response_text,
          detectedLanguage: data.detected_language,
          sessionId: data.session_id,
          hasAudioId: !!data.output_audio_id
        });
      } catch (parseError) {
        console.error("[API] Failed to parse success response as JSON:", parseError);
        throw new Error(`Invalid JSON response from server: ${responseText.substring(0, 200)}`);
      }
  
      // Enhanced response structure
      const processedResponse = {
        recognized_text: data.recognized_text || data.transcription || "",
        response_text: data.response_text || data.response || data.ai_response || "",
        translated_text: data.translated_text || "",
        audio_url: data.audio_download_url || data.audio_url || null,
        translated_audio_url: data.translated_audio_url || null,
        session_id: data.session_id || queryData.session_id,
        weather: data.weather || null,
        detected_language: data.detected_language || 'en',
        response_language: data.response_language || data.detected_language || 'en',
        translation_language: data.translation_language || data.detected_language || 'en',
        status: data.status || "success",
        output_audio_id: data.output_audio_id || data.audio_file_id,
        translated_audio_id: data.translated_audio_id,
        ...data,
      };
  
      console.log("[API] Returning processed response:", {
        recognizedTextLength: processedResponse.recognized_text?.length,
        responseTextLength: processedResponse.response_text?.length,
        hasAudioUrl: !!processedResponse.audio_url,
        detectedLanguage: processedResponse.detected_language
      });
  
      return processedResponse;
    } catch (error) {
      console.error("[API] Voice query failed with error:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
  
      // Enhanced error messages based on common issues
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        throw new Error("Network connection failed. Please check your internet connection and try again.");
      } else if (error.message.includes("empty") || error.message.includes("invalid")) {
        throw new Error("Audio recording failed or is empty. Please try recording again.");
      } else if (error.message.includes("format") || error.message.includes("codec")) {
        throw new Error("Audio format not supported. Please try again.");
      } else if (error.message.includes("Authentication") || error.message.includes("401")) {
        throw new Error("Authentication failed. Please log in again.");
      } else if (error.message.includes("413") || error.message.includes("too large")) {
        throw new Error("Audio file too large. Please record a shorter message.");
      } else if (error.message.includes("400") || error.message.includes("Bad Request")) {
        throw new Error(`Invalid request: ${error.message}`);
      } else if (error.message.includes("500") || error.message.includes("Server error")) {
        throw new Error(`Server error: ${error.message}`);
      }
  
      // Re-throw with original message if no specific handling
      throw error;
    }
  }
  /**
   * Create a properly formatted audio file from blob
   */
  createAudioFile(audioBlob, format = "wav") {
    const timestamp = Date.now();
    const filename = `voice_recording_${timestamp}.${format}`;
    const mimeType = this.getAudioMimeType(format);

    return new File([audioBlob], filename, {
      type: mimeType,
      lastModified: timestamp,
    });
  }

  /**
   * Get proper MIME type for audio format
   */
  getAudioMimeType(format) {
    const mimeTypes = {
      wav: "audio/wav",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      webm: "audio/webm",
      m4a: "audio/mp4",
    };

    return mimeTypes[format.toLowerCase()] || "audio/wav";
  }

  /**
   * Generate audio in automatically detected language
   * UPDATED: Language detection handled by backend
   */
  async generateAudio(text, options = {}) {
    try {
      const response = await this.request("/audio/generate", {
        method: "POST",
        body: JSON.stringify({
          text,
          auto_detect_language: true, // Let backend detect language
          ...options,
        }),
      });

      return response;
    } catch (error) {
      console.error("Auto-language audio generation failed:", error);
      throw error;
    }
  }

  async downloadAudio(audioId) {
    const response = await fetch(`${this.baseURL}/audio/download/${audioId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to download audio");
    }

    return response.blob();
  }

  getAudioUrl(audioId) {
    if (!audioId) return null;
    return `${this.baseURL}/audio/download/${audioId}?token=${this.token}`;
  }

  /**
   * UPDATED: Get authenticated audio URL with better error handling
   */
  async getAuthenticatedAudioUrl(audioId) {
    try {
      const response = await fetch(
        `${this.baseURL}/audio/download/${audioId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const objectUrl = URL.createObjectURL(audioBlob);

      console.log(`Created blob URL for auto-detected audio ${audioId}: ${objectUrl}`);
      return objectUrl;
    } catch (error) {
      console.error(`Failed to get authenticated audio URL for ${audioId}:`, error);
      throw error;
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
      console.error("Audio blob is null or undefined");
      return false;
    }

    if (audioBlob.size === 0) {
      console.error("Audio blob is empty");
      return false;
    }

    if (audioBlob.size > 50 * 1024 * 1024) {
      // 50MB limit
      console.error("Audio blob too large:", audioBlob.size);
      return false;
    }

    const validTypes = [
      "audio/wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
    ];
    if (
      !validTypes.some((type) => audioBlob.type.includes(type.split("/")[1]))
    ) {
      console.warn("Audio blob type may not be supported:", audioBlob.type);
    }

    return true;
  }

  /**
   * Convert audio blob to different format if needed
   * @param {Blob} audioBlob - Original audio blob
   * @param {string} targetFormat - Target format
   * @returns {Promise<Blob>} Converted audio blob
   */
  async convertAudioFormat(audioBlob, targetFormat = "wav") {
    // This is a placeholder for audio conversion
    // In a real implementation, you might use WebAudio API or a conversion library
    console.log(`Converting audio from ${audioBlob.type} to ${targetFormat}`);
    return audioBlob; // For now, return original
  }

  // ==================== SYSTEM METHODS ====================

  async healthCheck() {
    return await this.request("/system/health");
  }

  async getSystemStats() {
    return await this.request("/system/stats");
  }

  async cleanupOldFiles() {
    return await this.request("/system/files/cleanup", {
      method: "POST",
    });
  }

  // ==================== ERROR HANDLING HELPERS ====================

  handleError(error, context = "") {
    console.error(`API Error ${context}:`, error);

    if (error.message.includes("fetch")) {
      return "Network error. Please check your connection.";
    } else if (error.message.includes("401")) {
      return "Authentication required. Please login again.";
    } else if (error.message.includes("403")) {
      return "Access denied. Insufficient permissions.";
    } else if (error.message.includes("404")) {
      return "Resource not found.";
    } else if (error.message.includes("413")) {
      return "File too large. Please try a smaller file.";
    } else if (error.message.includes("500")) {
      return "Server error. Please try again later.";
    }

    return error.message || "An unexpected error occurred.";
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

        if (error.message.includes("401") || error.message.includes("403")) {
          throw error;
        }

        if (i < maxRetries) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async batchRequest(requests) {
    const promises = requests.map(({ endpoint, options }) =>
      this.request(endpoint, options).catch((error) => ({
        error: error.message,
      }))
    );

    return await Promise.all(promises);
  }

  async uploadFile(file, endpoint, additionalData = {}) {
    const formData = new FormData();
    formData.append("file", file);

    Object.keys(additionalData).forEach((key) => {
      if (additionalData[key] !== undefined && additionalData[key] !== null) {
        formData.append(key, additionalData[key].toString());
      }
    });

    return await this.request(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });
  }

  clearCache() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem("chat_cache");
        localStorage.removeItem("user_cache");
        localStorage.removeItem("session_cache");
      }
    } catch (error) {
      console.warn("Could not clear cache:", error);
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
  // Add this method to your ApiService class for debugging
async testVoiceEndpoint() {
  try {
    const url = `${this.baseURL}/audio/voice-query`;
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Authorization: `Bearer ${this.token}`,
      }
    });
    
    console.log("[API] Voice endpoint test:", {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return response.ok;
  } catch (error) {
    console.error("[API] Voice endpoint test failed:", error);
    return false;
  }
}
// Add this method to your ApiService class in apiService.js

async deleteChatSession(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (this.debugMode) {
      console.log(`[API] Deleting chat session: ${sessionId}`);
    }

    const response = await this.request(`/chat/sessions/${sessionId}`, {
      method: 'DELETE'
    });

    if (this.debugMode) {
      console.log(`[API] Session ${sessionId} deleted successfully:`, response);
    }

    return response;
  } catch (error) {
    console.error(`Failed to delete chat session ${sessionId}:`, error);
    
    // Provide user-friendly error messages
    if (error.message.includes('404')) {
      throw new Error('Chat session not found or already deleted');
    } else if (error.message.includes('403')) {
      throw new Error('You do not have permission to delete this chat session');
    } else if (error.message.includes('401')) {
      throw new Error('Authentication required. Please log in again.');
    } else if (error.message.includes('500')) {
      throw new Error('Server error while deleting chat session. Please try again later.');
    }
    
    throw error;
  }
}
// Add this enhanced getChatMessages method to your ApiService class
async getChatMessages(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (this.debugMode) {
      console.log(`[API] Getting messages for session: ${sessionId}`);
    }

    const response = await this.request(`/chat/sessions/${sessionId}/messages`);
    
    if (this.debugMode) {
      console.log(`[API] Messages response for session ${sessionId}:`, {
        messageCount: response.messages?.length || 0,
        hasMessages: !!response.messages,
        firstMessage: response.messages?.[0] ? {
          id: response.messages[0].id,
          type: response.messages[0].message_type,
          hasContent: !!response.messages[0].content,
          hasTimestamp: !!response.messages[0].timestamp
        } : null
      });
    }

    // Validate response structure
    if (!response.messages || !Array.isArray(response.messages)) {
      console.warn(`[API] Invalid messages format for session ${sessionId}:`, response);
      return { messages: [] };
    }

    // Validate each message has required fields
    const validMessages = response.messages.filter(msg => {
      const hasRequiredFields = msg.id && msg.message_type && msg.content !== undefined;
      if (!hasRequiredFields) {
        console.warn(`[API] Invalid message structure:`, msg);
      }
      return hasRequiredFields;
    });

    if (validMessages.length !== response.messages.length) {
      console.warn(`[API] Filtered out ${response.messages.length - validMessages.length} invalid messages`);
    }

    return { messages: validMessages };
  } catch (error) {
    console.error(`Failed to get chat messages for session ${sessionId}:`, error);
    
    // Provide user-friendly error messages
    if (error.message.includes('404')) {
      throw new Error('Chat session not found or has been deleted');
    } else if (error.message.includes('403')) {
      throw new Error('You do not have permission to access this chat session');
    } else if (error.message.includes('401')) {
      throw new Error('Authentication required. Please log in again.');
    } else if (error.message.includes('500')) {
      throw new Error('Server error while loading chat messages. Please try again later.');
    }
    
    // Return empty messages array on error instead of throwing for better UX
    console.warn(`[API] Returning empty messages due to error: ${error.message}`);
    return { messages: [] };
  }
}
}

// Create and export a singleton instance
const apiService = new ApiService();

export default apiService;
export { ApiService };
