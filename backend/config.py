import os
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

class Config:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")  # Add tis line
    WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "")
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-super-secret-key-change-this-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///agricultural_ai.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'supersecretkey12345!change')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    UPLOAD_FOLDER = 'uploads'
    
    # Free API endpoints
    WEATHER_BASE_URL = "http://api.openweathermap.org/data/2.5/weather"
    GEOCODING_BASE_URL = "http://api.openweathermap.org/geo/1.0/direct"
class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///agricultural_ai_dev.db')

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    SECRET_KEY = os.getenv('SECRET_KEY')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False