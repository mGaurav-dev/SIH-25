from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import uuid
import logging

from extensions import db
from models import User, ChatSession, ChatMessage
from services.translation_service import TranslationService
from services.location_service import LocationService
from services.speech_service import SpeechService
from services.llm_service import AgriculturalLLMService
from services.weather_service import WeatherService

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)   

# Initialize services
translation_service = TranslationService()

@chat_bp.route('/sessions', methods=['GET'])
@jwt_required()
def get_chat_sessions():
    """Get user's chat sessions"""
    try:
        user_id = get_jwt_identity()
        sessions = ChatSession.query.filter_by(user_id=user_id)\
                                   .order_by(ChatSession.updated_at.desc())\
                                   .all()
        
        return jsonify({
            'sessions': [session.to_dict() for session in sessions]
        }), 200
        
    except Exception as e:
        logger.error(f"Chat sessions fetch error: {e}")
        return jsonify({'error': 'Failed to fetch chat sessions'}), 500

@chat_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_chat_session():
    """Create new chat session"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        session = ChatSession(
            user_id=user_id,
            session_id=str(uuid.uuid4()),
            title=data.get('title', 'New Chat')
        )
        
        db.session.add(session)
        db.session.commit()
        
        return jsonify({
            'message': 'Chat session created',
            'session': session.to_dict()
        }), 201
        
    except Exception as e:
        logger.error(f"Chat session creation error: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to create chat session'}), 500

@chat_bp.route('/sessions/<int:session_id>/messages', methods=['GET'])
@jwt_required()
def get_chat_messages(session_id):
    """Get messages for a chat session"""
    try:
        user_id = get_jwt_identity()
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        
        if not session:
            return jsonify({'error': 'Chat session not found'}), 404
        
        messages = ChatMessage.query.filter_by(session_id=session_id)\
                                   .order_by(ChatMessage.timestamp.asc())\
                                   .all()
        
        return jsonify({
            'messages': [message.to_dict() for message in messages]
        }), 200
        
    except Exception as e:
        logger.error(f"Chat messages fetch error: {e}")
        return jsonify({'error': 'Failed to fetch messages'}), 500

@chat_bp.route('/query', methods=['POST'])
@jwt_required()
def process_chat_query():
    """Process agricultural query and generate response"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Initialize services
        weather_service = WeatherService(current_app.config.get('WEATHER_API_KEY', ''))
        location_service = LocationService(current_app.config.get('WEATHER_API_KEY', ''))
        llm_service = AgriculturalLLMService(current_app.config.get('GOOGLE_API_KEY'))
        
        if not llm_service:
            return jsonify({'error': 'AI service not available'}), 503
        
        data = request.get_json()
        query = data.get('query')
        location = data.get('location', user.location)
        session_id = data.get('session_id')
        input_language = data.get('language', user.preferred_language)
        
        if not query:
            return jsonify({'error': 'Query is required'}), 400
        
        if not location:
            return jsonify({'error': 'Location is required'}), 400
        
        # Get or create chat session
        session = None
        if session_id:
            session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        
        if not session:
            session = ChatSession(
                user_id=user_id,
                session_id=str(uuid.uuid4()),
                title=query[:50] + ('...' if len(query) > 50 else '')
            )
            db.session.add(session)
            db.session.flush()  # Get session ID
        
        # Detect language if not provided
        if not input_language or input_language == 'auto':
            input_language = translation_service.detect_language(query)
        
        # Translate query to English if needed
        english_query = query
        if input_language != 'en':
            english_query = translation_service.translate_to_english(query, input_language)
        
        # Get location coordinates and weather
        lat, lon = location_service.get_coordinates(location)
        weather_info = weather_service.get_weather(lat, lon)
        
        # Generate AI response
        response = llm_service.generate_response(english_query, location, weather_info)
        
        # Translate response back to original language
        if input_language != 'en':
            response = translation_service.translate_from_english(response, input_language)
        
        # Save user message
        user_message = ChatMessage(
            session_id=session.id,
            message_type='user',
            content=query,
            original_language=input_language,
            input_type='text',
            location=location,
            weather_data=weather_info
        )
        db.session.add(user_message)
        
        # Save AI response
        ai_message = ChatMessage(
            session_id=session.id,
            message_type='assistant',
            content=response,
            original_language=input_language,
            location=location,
            weather_data=weather_info
        )
        db.session.add(ai_message)
        
        # Update session timestamp
        session.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'session_id': session.id,
            'query': query,
            'response': response,
            'language': input_language,
            'location': location,
            'weather': weather_info,
            'user_message_id': user_message.id,
            'ai_message_id': ai_message.id
        }), 200
        
    except Exception as e:
        logger.error(f"Chat query processing error: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to process query'}), 500