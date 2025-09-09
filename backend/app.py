import os
from flask import Flask, request
from flask_cors import CORS
from config import Config
from extensions import db, jwt
from routes.auth_routes import register_routes
import logging


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app(config_class=Config):
    """Application factory pattern"""
    app = Flask(__name__)
    @app.before_request
    def _debug_auth_header():
     ah = request.headers.get('Authorization')
     print(f"[DEBUG] Authorization header: {ah!r}")
    app.config.from_object(config_class)
    
    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    CORS(app)
    
    # Register routes
    register_routes(app)
    
    # Error handlers
    register_error_handlers(app)
    
    return app

def register_error_handlers(app):
    """Register error handlers"""
    from flask import jsonify
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({'error': 'Internal server error'}), 500

    @app.errorhandler(413)
    def file_too_large(error):
        return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({'error': 'Token has expired'}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({'error': 'Invalid token'}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({'error': 'Authentication token required'}), 401

def init_database():
    """Initialize database tables"""
    try:
        with app.app_context():
            db.create_all()
            logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

if __name__ == '__main__':
    app = create_app()
    print(f"[BOOT] JWT_SECRET_KEY in app.config = {app.config.get('JWT_SECRET_KEY')!r}")

    
    # Initialize database
    init_database()
    
    # Check environment variables
    print("\n=== Environment Check ===")
    print(f"GOOGLE_API_KEY: {'✓ Set' if os.getenv('GOOGLE_API_KEY') else '✗ Missing'}")
    print(f"WEATHER_API_KEY: {'✓ Set' if os.getenv('WEATHER_API_KEY') else '✗ Missing'}")
    print(f"DATABASE_URL: {os.getenv('DATABASE_URL', 'sqlite:///agricultural_ai.db')}")
    print(f"JWT_SECRET_KEY: {'✓ Set' if os.getenv('JWT_SECRET_KEY') else '✗ Using default'}")
    
    # Start the application
    port = int(os.getenv('PORT', 5000))
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f"\n🚀 Starting Agricultural AI Backend on port {port}")
    print(f"Debug mode: {debug_mode}")
    print("\n📚 API Documentation available at: /api/health")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug_mode
    )