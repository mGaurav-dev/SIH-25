import os
from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import logging

from backend.extensions import db
from backend.models import User, ChatSession, ChatMessage, AudioFile
from services.llm_service import AgriculturalLLMService
from services.speech_service import SpeechService

logger = logging.getLogger(__name__)

system_bp = Blueprint('system', __name__)

@system_bp.route('/health', methods=['GET'])
def health_check():
    """System health check"""
    try:
        # Check database connection
        db.session.execute('SELECT 1')
        db_status = 'healthy'
    except Exception:
        db_status = 'unhealthy'
    
    # Check AI service
    llm_service = AgriculturalLLMService(current_app.config.get('GOOGLE_API_KEY'))
    ai_status = 'healthy' if llm_service else 'unavailable'
    
    # Check speech service
    speech_service = SpeechService(current_app.config['UPLOAD_FOLDER'])
    speech_status = 'healthy' if speech_service.recognizer else 'unavailable'
    
    return jsonify({
        'status': 'running',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'database': db_status,
            'ai_service': ai_status,
            'speech_service': speech_status
        }
    }), 200

@system_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_system_stats():
    """Get system statistics"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # User statistics
        user_sessions = ChatSession.query.filter_by(user_id=user_id).count()
        user_messages = ChatMessage.query.join(ChatSession).filter(
            ChatSession.user_id == user_id
        ).count()
        
        # System statistics (for admin users only - simplified for demo)
        total_users = User.query.count()
        total_sessions = ChatSession.query.count()
        total_messages = ChatMessage.query.count()
        
        return jsonify({
            'user_stats': {
                'chat_sessions': user_sessions,
                'total_messages': user_messages,
                'member_since': user.created_at.isoformat()
            },
            'system_stats': {
                'total_users': total_users,
                'total_sessions': total_sessions,
                'total_messages': total_messages
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Stats fetch error: {e}")
        return jsonify({'error': 'Failed to fetch statistics'}), 500

@system_bp.route('/files/cleanup', methods=['POST'])
@jwt_required()
def cleanup_old_files():
    """Clean up old audio files (admin function)"""
    try:
        # Delete files older than 7 days
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        old_files = AudioFile.query.filter(AudioFile.created_at < cutoff_date).all()
        
        deleted_count = 0
        for audio_file in old_files:
            try:
                if os.path.exists(audio_file.file_path):
                    os.remove(audio_file.file_path)
                db.session.delete(audio_file)
                deleted_count += 1
            except Exception as e:
                logger.error(f"Failed to delete file {audio_file.filename}: {e}")
        
        db.session.commit()
        
        return jsonify({
            'message': f'Cleaned up {deleted_count} old files',
            'deleted_count': deleted_count
        }), 200
        
    except Exception as e:
        logger.error(f"File cleanup error: {e}")
        db.session.rollback()
        return jsonify({'error': 'File cleanup failed'}), 500