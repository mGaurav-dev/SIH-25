import React, { useState, useEffect } from 'react';
import { Settings, User, Lock, MessageSquare, Bell, LogOut } from 'lucide-react';
import './settings.css';

const SettingsPage = ({ user, onNavigate, onLogout }) => {
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
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
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
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
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
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setErrors({ general: 'Failed to update profile. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!passwordData.currentPassword && !passwordData.newPassword) {
      return; // No password change requested
    }

    const validationErrors = validatePassword();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setSuccess('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setSuccess('Password updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setErrors({ password: 'Failed to update password. Please try again.' });
    } finally {
      setIsLoading(false);
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
            <h1>AgriQuery</h1>
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
              style={{backgroundImage: `url(${user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaVbolBSpJqtR_Erc2nNL9r4TAp7kC1UhQMyX_YqqfUvMnnriJhvvFqmZ4LFsXQsGXektbyt6e-sj8pKBKY8rh5MchaKHoy_EPePQibn57jOS_vxUxtDXTQIkYlZUXte2vQc5r_Buo0GlvrUxdiWz01S_RG1Qi_3qCm64CcVlXG7XHzC69XrYMA_3norcTgfc4jpSmTM_eYLpw9Mbxh3dzH8Wezbpm9lzTXZvJayueBFHuZl_QCkWuvUNERnuYx38e0b0Nkw_0HWH1'})`}}
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
                    style={{backgroundImage: `url(${user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaVbolBSpJqtR_Erc2nNL9r4TAp7kC1UhQMyX_YqqfUvMnnriJhvvFqmZ4LFsXQsGXektbyt6e-sj8pKBKY8rh5MchaKHoy_EPePQibn57jOS_vxUxtDXTQIkYlZUXte2vQc5r_Buo0GlvrUxdiWz01S_RG1Qi_3qCm64CcVlXG7XHzC69XrYMA_3norcTgfc4jpSmTM_eYLpw9Mbxh3dzH8Wezbpm9lzTXZvJayueBFHuZl_QCkWuvUNERnuYx38e0b0Nkw_0HWH1'})`}}
                  ></div>
                  <div className="picture-actions">
                    <button className="btn-primary" type="button">Change Picture</button>
                    <button className="btn-secondary" type="button">Remove</button>
                  </div>
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
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="preferred_language">Preferred Language</label>
                    <select
                      id="preferred_language"
                      name="preferred_language"
                      value={formData.preferred_language}
                      onChange={handleInputChange}
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
                    />
                    {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                  </div>
                </div>

                {errors.password && <div className="error-text">{errors.password}</div>}

                <div className="form-actions">
                  <button 
                    className="btn-primary"
                    onClick={handlePasswordSave}
                    disabled={isLoading}
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