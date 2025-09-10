import React, { useState, useEffect, useRef } from 'react';
import { Settings, User, Lock, MessageSquare, Bell, LogOut, Upload, Trash2, Camera } from 'lucide-react';
import apiService from '../api/api.js';
import './settings.css';

const SettingsPage = ({ user, onNavigate, onLogout, onUserUpdate }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    location: '',
    phone_number: '',
    preferred_language: 'en'
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [userStats, setUserStats] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        location: user.location || 'Narmadapuram, Madhya Pradesh, India',
        phone_number: user.phone_number || '',
        preferred_language: user.preferred_language || 'en'
      });
    }
    
    // Load user stats
    loadUserStats();
  }, [user]);

  const loadUserStats = async () => {
    try {
      const stats = await apiService.getUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error('Failed to load user stats:', error);
      // Set fallback stats
      setUserStats({
        total_sessions: 0,
        total_messages: 0,
        member_since: user?.created_at || new Date().toISOString()
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({
          ...prev,
          avatar: 'Please select an image file'
        }));
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({
          ...prev,
          avatar: 'Image must be smaller than 5MB'
        }));
        return;
      }

      setAvatar(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target.result);
      };
      reader.readAsDataURL(file);
      
      // Clear any previous errors
      if (errors.avatar) {
        setErrors(prev => ({
          ...prev,
          avatar: ''
        }));
      }
    }
  };

  const uploadAvatar = async () => {
    if (!avatar) return null;

    try {
      const response = await apiService.uploadAvatar(avatar);
      return response.avatar_url;
    } catch (error) {
      console.error('Avatar upload failed:', error);
      throw new Error('Failed to upload avatar');
    }
  };

  const deleteAvatar = async () => {
    try {
      await apiService.deleteAvatar();
      setAvatarPreview(null);
      setAvatar(null);
      setSuccess('Avatar removed successfully!');
      
      // Update user object
      if (onUserUpdate) {
        onUserUpdate({ avatar: null });
      }
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to delete avatar:', error);
      setErrors(prev => ({
        ...prev,
        avatar: 'Failed to remove avatar'
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    return newErrors;
  };

  const validatePassword = () => {
    const newErrors = {};
    
    if (passwordData.newPassword && !passwordData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }
    
    if (passwordData.newPassword && passwordData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters';
    }
    
    if (passwordData.newPassword && passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    return newErrors;
  };

  const handleProfileSave = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setSuccess('');
    setErrors({});
    
    try {
      let avatarUrl = user?.avatar;
      
      // Upload avatar if changed
      if (avatar) {
        avatarUrl = await uploadAvatar();
      }
      
      // Update profile
      const profileData = {
        ...formData,
        ...(avatarUrl && { avatar: avatarUrl })
      };
      
      const response = await apiService.updateUserProfile(profileData);
      
      setSuccess('Profile updated successfully!');
      
      // Update user object in parent component
      if (onUserUpdate) {
        onUserUpdate({
          ...formData,
          ...(avatarUrl && { avatar: avatarUrl })
        });
      }
      
      // Clear avatar selection
      setAvatar(null);
      setAvatarPreview(null);
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Profile update failed:', error);
      
      let errorMessage = 'Failed to update profile. Please try again.';
      if (error.message.includes('Authentication')) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.message.includes('email')) {
        errorMessage = 'Email address is already taken.';
      } else if (error.message.includes('avatar')) {
        errorMessage = 'Failed to upload avatar. Please try a different image.';
      }
      
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!passwordData.currentPassword && !passwordData.newPassword) {
      return;
    }

    const validationErrors = validatePassword();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setSuccess('');
    setErrors({});
    
    try {
      await apiService.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      setSuccess('Password updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Password change failed:', error);
      
      let errorMessage = 'Failed to update password. Please try again.';
      if (error.message.includes('current password')) {
        errorMessage = 'Current password is incorrect.';
      } else if (error.message.includes('Authentication')) {
        errorMessage = 'Session expired. Please log in again.';
      }
      
      setErrors({ password: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const formatMemberSince = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="settings-container">
      {/* Sidebar */}
      <aside className="settings-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <svg className="logo-icon" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z" fill="currentColor"></path>
            </svg>
            <h1>AgriAssist</h1>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className="nav-link"
            onClick={() => onNavigate('dashboard')}
          >
            <MessageSquare />
            <span>Chat</span>
          </button>
          <button className="nav-link active">
            <Settings />
            <span>Settings</span>
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <button className="nav-link" onClick={onLogout}>
            <LogOut />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="settings-main">
        {/* Header */}
        <header className="settings-header">
          <div>
            <h2>Settings</h2>
            <p>Manage your account and preferences.</p>
          </div>
          <div className="header-actions">
            <button className="notification-btn">
              <Bell />
              <span className="notification-badge"></span>
            </button>
            <div 
              className="user-avatar" 
              style={{backgroundImage: `url(${avatarPreview || user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaVbolBSpJqtR_Erc2nNL9r4TAp7kC1UhQMyX_YqqfUvMnnriJhvvFqmZ4LFsXQsGXektbyt6e-sj8pKBKY8rh5MchaKHoy_EPePQibn57jOS_vxUxtDXTQIkYlZUXte2vQc5r_Buo0GlvrUxdiWz01S_RG1Qi_3qCm64CcVlXG7XHzC69XrYMA_3norcTgfc4jpSmTM_eYLpw9Mbxh3dzH8Wezbpm9lzTXZvJayueBFHuZl_QCkWuvUNERnuYx38e0b0Nkw_0HWH1'})`}}
            ></div>
          </div>
        </header>

        {/* Content */}
        <main className="settings-content">
          <div className="settings-container-inner">
            {/* Success Message */}
            {success && (
              <div className="success-toast">
                {success}
              </div>
            )}

            {/* Error Message */}
            {errors.general && (
              <div className="error-toast">
                {errors.general}
              </div>
            )}

            {/* Account Statistics */}
            {userStats && (
              <div className="settings-section">
                <div className="section-header">
                  <h3>
                    <User className="section-icon" />
                    Account Overview
                  </h3>
                  <p>Your account activity and statistics.</p>
                </div>
                
                <div className="section-content">
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-value">{userStats.total_sessions || 0}</div>
                      <div className="stat-label">Chat Sessions</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">{userStats.total_messages || 0}</div>
                      <div className="stat-label">Messages Sent</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">{formatMemberSince(userStats.member_since)}</div>
                      <div className="stat-label">Member Since</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Profile Information Section */}
            <div className="settings-section">
              <div className="section-header">
                <h3>
                  <User className="section-icon" />
                  Profile Information
                </h3>
                <p>Update your personal details here.</p>
              </div>
              
              <div className="section-content">
                <div className="profile-picture-section">
                  <div 
                    className="profile-picture" 
                    style={{backgroundImage: `url(${avatarPreview || user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaVbolBSpJqtR_Erc2nNL9r4TAp7kC1UhQMyX_YqqfUvMnnriJhvvFqmZ4LFsXQsGXektbyt6e-sj8pKBKY8rh5MchaKHoy_EPePQibn57jOS_vxUxtDXTQIkYlZUXte2vQc5r_Buo0GlvrUxdiWz01S_RG1Qi_3qCm64CcVlXG7XHzC69XrYMA_3norcTgfc4jpSmTM_eYLpw9Mbxh3dzH8Wezbpm9lzTXZvJayueBFHuZl_QCkWuvUNERnuYx38e0b0Nkw_0HWH1'})`}}
                  >
                    {!avatarPreview && !user?.avatar && (
                      <div className="avatar-placeholder">
                        <Camera size={24} />
                      </div>
                    )}
                  </div>
                  <div className="picture-actions">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <button 
                      className="btn-primary" 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                    >
                      <Upload size={16} />
                      Change Picture
                    </button>
                    {(user?.avatar || avatarPreview) && (
                      <button 
                        className="btn-secondary" 
                        type="button"
                        onClick={deleteAvatar}
                        disabled={isLoading}
                      >
                        <Trash2 size={16} />
                        Remove
                      </button>
                    )}
                  </div>
                  {errors.avatar && <span className="error-text">{errors.avatar}</span>}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="name">Full Name</label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={errors.name ? 'error' : ''}
                      placeholder="Enter your full name"
                      disabled={isLoading}
                    />
                    {errors.name && <span className="error-text">{errors.name}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={errors.email ? 'error' : ''}
                      placeholder="Enter your email"
                      disabled={isLoading}
                    />
                    {errors.email && <span className="error-text">{errors.email}</span>}
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="location">Location</label>
                    <input
                      id="location"
                      name="location"
                      type="text"
                      value={formData.location}
                      onChange={handleInputChange}
                      className={errors.location ? 'error' : ''}
                      placeholder="Enter your location (City, State, Country)"
                      disabled={isLoading}
                    />
                    {errors.location && <span className="error-text">{errors.location}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone_number">Phone Number</label>
                    <input
                      id="phone_number"
                      name="phone_number"
                      type="tel"
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      placeholder="Enter your phone number"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="preferred_language">Preferred Language</label>
                    <select
                      id="preferred_language"
                      name="preferred_language"
                      value={formData.preferred_language}
                      onChange={handleInputChange}
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
                  </div>
                </div>

                <div className="form-actions">
                  <button 
                    className="btn-primary"
                    onClick={handleProfileSave}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>

            {/* Password & Security Section */}
            <div className="settings-section">
              <div className="section-header">
                <h3>
                  <Lock className="section-icon" />
                  Password & Security
                </h3>
                <p>Manage your password and keep your account secure.</p>
              </div>
              
              <div className="section-content">
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label htmlFor="currentPassword">Current Password</label>
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className={errors.currentPassword ? 'error' : ''}
                      placeholder="Enter current password"
                      disabled={isLoading}
                    />
                    {errors.currentPassword && <span className="error-text">{errors.currentPassword}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="newPassword">New Password</label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className={errors.newPassword ? 'error' : ''}
                      placeholder="Enter new password"
                      disabled={isLoading}
                    />
                    {errors.newPassword && <span className="error-text">{errors.newPassword}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      className={errors.confirmPassword ? 'error' : ''}
                      placeholder="Confirm new password"
                      disabled={isLoading}
                    />
                    {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                  </div>
                </div>

                {errors.password && <div className="error-text">{errors.password}</div>}

                <div className="form-actions">
                  <button 
                    className="btn-primary"
                    onClick={handlePasswordSave}
                    disabled={isLoading || (!passwordData.currentPassword && !passwordData.newPassword)}
                  >
                    {isLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;