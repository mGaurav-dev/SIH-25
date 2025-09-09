from .auth_routes import auth_bp
from .chat_routes import chat_bp
from .audio_routes import audio_bp
from .system_routes import system_bp

def register_routes(app):
    """Register all route blueprints"""
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(audio_bp, url_prefix='/api/audio')
    app.register_blueprint(system_bp, url_prefix='/api')