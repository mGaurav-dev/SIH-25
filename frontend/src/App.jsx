import React, { useState, useEffect } from 'react';
import LoginSignup from './pages/LoginSignup';
// import Dashboard from './components/Dashboard';
import './App.css';

const App = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('access_token');
    if (token) {
      validateToken(token);
    }
  }, []);

  const validateToken = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/validate-token', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setIsAuthenticated(true);
          setCurrentPage('dashboard');
          // Fetch user profile
          fetchUserProfile(token);
        }
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('access_token');
      }
    } catch (error) {
      console.error('Token validation error:', error);
      localStorage.removeItem('access_token');
    }
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
    }
  };

  const handleLogin = (userData, token) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('access_token', token);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('access_token');
    setCurrentPage('login');
  };

  const navigateTo = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="App">
      {currentPage === 'login' && (
        <LoginSignup 
          onLogin={handleLogin}
          onNavigate={navigateTo}
        />
      )}
      {/* {currentPage === 'dashboard' && isAuthenticated && (
        <Dashboard 
          user={user}
          onLogout={handleLogout}
          onNavigate={navigateTo}
        />
      )}
      {currentPage === 'profile' && isAuthenticated && (
        <div>Profile Page (To be implemented)</div>
      )} */}
    </div>
  );
};

export default App;