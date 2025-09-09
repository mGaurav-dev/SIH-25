import React, { useState } from 'react';
import './LoginSignup.css';

const LoginSignup = ({ onLogin, onNavigate }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    login_id: '',
    email: '',
    name: '',
    phone_number: '',
    password: '',
    preferred_language: 'en',
    location: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const endpoint = isLogin ? '/login' : '/register';
      const payload = isLogin 
        ? { login_id: formData.login_id, password: formData.password }
        : formData;

      const response = await fetch(`http://localhost:5000/api/auth${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        onLogin(data.user, data.access_token);
      } else {
        setError(data.error || 'Operation failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    // For demo purposes, create a guest user
    const guestUser = {
      id: 'guest',
      name: 'Guest User',
      login_id: 'guest',
      email: 'guest@krishisaathi.com',
      preferred_language: 'en'
    };
    onLogin(guestUser, 'guest-token');
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({
      login_id: '',
      email: '',
      name: '',
      phone_number: '',
      password: '',
      preferred_language: 'en',
      location: ''
    });
    setError('');
    setSuccess('');
  };

  return (
    <div className="login-signup-container">
      <div className="content-wrapper">
        <div className="image-section">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfabZElBaJzNgjGYVVSvW1xScuVvFIfC7gEF70YihXq7R04zhO-0nX7r68StgaDlz0TYT2I40YjB76sxTw_3A7sPDS_zsPNeIJ1m9W5FXpVWHjQsRmqdwjCSyTsPTGjpczzRgU2O8ZJ5mp3_lZqaD2i-NKAio0roMduMbrWI-0HTBLOePYsR5jAInSnRQocvbRmVE5Sv6OtDWWJuL73XLXjDd7LtBDdobw9FUoUEaUdtt-YMv0uefuc3H_3lg0w7QkzzgRcdGpPLgK"
            alt="A farmer talking to a digital assistant"
            className="hero-image"
          />
        </div>

        <div className="form-section">
          <div className="form-container">
            <div className="form-header">
              <h2>Namaskaram!</h2>
              <p>Welcome to Your Smart Farming Assistant.</p>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="input-group">
                <span className="material-symbols-outlined input-icon">person</span>
                <input
                  type="text"
                  name="login_id"
                  placeholder="Phone number / Email"
                  value={formData.login_id}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>

              {!isLogin && (
                <>
                  <div className="input-group">
                    <span className="material-symbols-outlined input-icon">email</span>
                    <input
                      type="email"
                      name="email"
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="form-input"
                    />
                  </div>

                  <div className="input-group">
                    <span className="material-symbols-outlined input-icon">account_circle</span>
                    <input
                      type="text"
                      name="name"
                      placeholder="Full Name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="form-input"
                    />
                  </div>

                  <div className="input-group">
                    <span className="material-symbols-outlined input-icon">phone</span>
                    <input
                      type="tel"
                      name="phone_number"
                      placeholder="Phone Number"
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                  </div>

                  <div className="input-group">
                    <span className="material-symbols-outlined input-icon">location_on</span>
                    <input
                      type="text"
                      name="location"
                      placeholder="Location (Optional)"
                      value={formData.location}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                  </div>

                  <div className="input-group">
                    <span className="material-symbols-outlined input-icon">language</span>
                    <select
                      name="preferred_language"
                      value={formData.preferred_language}
                      onChange={handleInputChange}
                      className="form-input"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिंदी</option>
                      <option value="bn">বাংলা</option>
                      <option value="ta">தமிழ்</option>
                      <option value="te">తెలుగు</option>
                      <option value="mr">मराठी</option>
                      <option value="gu">ગુજરાતી</option>
                      <option value="kn">ಕನ್ನಡ</option>
                      <option value="ml">മലയാളം</option>
                      <option value="pa">ਪੰਜਾਬੀ</option>
                    </select>
                  </div>
                </>
              )}

              <div className="input-group">
                <span className="material-symbols-outlined input-icon">lock</span>
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>

              {isLogin && (
                <div className="form-options">
                  <a href="#" className="forgot-password">Forgot password?</a>
                </div>
              )}

              <div className="button-group">
                <button
                  type="submit"
                  disabled={loading}
                  className="primary-button"
                >
                  {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                </button>

                <button
                  type="button"
                  onClick={toggleMode}
                  className="secondary-button"
                >
                  {isLogin ? 'Create Account' : 'Already have account?'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginSignup;