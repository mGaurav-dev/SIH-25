from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import uuid
import logging
import traceback
import json
import os

from extensions import db
from models import User, ChatSession, ChatMessage, AudioFile
from services.translation_service import TranslationService
from services.location_service import LocationService
from services.speech_service import SpeechService
from services.llm_service import AgriculturalLLMService
from services.weather_service import WeatherService

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

# Initialize services
translation_service = TranslationService()

@chat_bp.route('/query', methods=['POST'])
@jwt_required()
def process_chat_query():
    """Process agricultural query with automatic language detection"""
    try:
        logger.info("Processing chat query request")
        
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        # Parse JSON data
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            query = data.get('query', '').strip()
            location = data.get('location', '').strip() or user.location or 'Unknown'
            session_id = data.get('session_id')
            generate_audio = data.get('generate_audio', True)
            
            logger.info(f"Query: '{query}', Location: '{location}'")
            
        except Exception as e:
            logger.error(f"JSON parsing error: {e}")
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        # Validation
        if not query or len(query) < 3:
            return jsonify({'error': 'Query must be at least 3 characters long'}), 400
        
        if location == 'Unknown':
            return jsonify({'error': 'Location is required'}), 400
        
        # Initialize services
        try:
            google_api_key = current_app.config.get('GOOGLE_API_KEY', '')
            weather_api_key = current_app.config.get('WEATHER_API_KEY', '')
            
            if not google_api_key:
                return jsonify({'error': 'AI service not configured'}), 503
            
            weather_service = WeatherService(weather_api_key)
            location_service = LocationService(weather_api_key)
            llm_service = AgriculturalLLMService(google_api_key)
            speech_service = SpeechService(current_app.config.get('UPLOAD_FOLDER', '/tmp'))
            
        except Exception as e:
            logger.error(f"Service initialization error: {e}")
            return jsonify({'error': 'Failed to initialize services'}), 503
        
        # Get or create chat session
        try:
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
                db.session.flush()
                
        except Exception as e:
            logger.error(f"Session error: {e}")
            db.session.rollback()
            return jsonify({'error': 'Failed to create session'}), 500
        
        # AUTOMATIC LANGUAGE DETECTION
        try:
            detected_language = translation_service.detect_language(query)
            logger.info(f"Auto-detected language: {detected_language}")
            
            # Translate to English for LLM processing
            english_query = query
            if detected_language != 'en':
                english_query = translation_service.translate_to_english(query, detected_language)
                logger.info(f"Translated query: {english_query}")
                
        except Exception as e:
            logger.warning(f"Language detection/translation error: {e}")
            detected_language = 'en'
            english_query = query
        
        # Get weather data
        weather_info = {}
        try:
            lat, lon = location_service.get_coordinates(location)
            if lat and lon:
                weather_info = weather_service.get_weather(lat, lon)
        except Exception as e:
            logger.warning(f"Weather error: {e}")
        
        # Generate AI response
        try:
            ai_response = llm_service.generate_response(english_query, location, weather_info)
            if not ai_response:
                return jsonify({'error': 'Failed to generate response'}), 500
                
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return jsonify({'error': 'AI service temporarily unavailable'}), 500
        
        # Translate response back to detected language
        final_response = ai_response
        try:
            if detected_language != 'en':
                final_response = translation_service.translate_from_english(ai_response, detected_language)
                logger.info(f"Translated response to {detected_language}")
        except Exception as e:
            logger.warning(f"Response translation error: {e}")
            final_response = ai_response
        
        # Generate audio response
        audio_file_id = None
        audio_url = None
        
        if generate_audio and speech_service:
            try:
                logger.info(f"Generating audio in {detected_language}")
                tts_lang_code = speech_service.get_tts_language_code(detected_language)
                audio_path = speech_service.text_to_speech(final_response, tts_lang_code)
                
                if audio_path and os.path.exists(audio_path):
                    if speech_service.validate_audio_file(audio_path):
                        audio_file = AudioFile(
                            filename=os.path.basename(audio_path),
                            original_filename=f'response_{detected_language}_{int(datetime.now().timestamp())}.mp3',
                            file_path=audio_path,
                            file_type='output',
                            file_size=os.path.getsize(audio_path)
                        )
                        db.session.add(audio_file)
                        db.session.flush()
                        audio_file_id = audio_file.id
                        audio_url = f'/api/audio/download/{audio_file_id}'
                        logger.info(f"Audio generated with ID: {audio_file_id}")
                        
            except Exception as e:
                logger.error(f"Audio generation error: {e}")
        
        # Save messages to database
        try:
            user_message = ChatMessage(
                session_id=session.id,
                message_type='user',
                content=query,
                original_language=detected_language,
                input_type='text',
                location=location,
                weather_data=weather_info
            )
            db.session.add(user_message)
            
            ai_message = ChatMessage(
                session_id=session.id,
                message_type='assistant',
                content=final_response,
                original_language=detected_language,
                location=location,
                weather_data=weather_info,
                audio_file_path=audio_path if audio_file_id else None
            )
            db.session.add(ai_message)
            
            session.updated_at = datetime.utcnow()
            db.session.commit()
            
        except Exception as e:
            logger.error(f"Database save error: {e}")
            db.session.rollback()
            return jsonify({'error': 'Failed to save conversation'}), 500
        
        # FIXED: Prepare response with correct field names that frontend expects
        response_data = {
            'session_id': session.id,
            'query': query,
            'response': final_response,
            'response_text': final_response,
            'message': final_response,  # Additional field for compatibility
            'detected_language': detected_language,
            'response_language': detected_language,
            'language': detected_language,
            'location': location,
            'weather': weather_info,
            'user_message_id': user_message.id,
            'ai_message_id': ai_message.id,
            'status': 'success'
        }
        
        # Add audio info if available
        if audio_file_id:
            response_data.update({
                'audio_file_id': audio_file_id,
                'audio_url': audio_url,
                'audio_download_url': audio_url,
                'audio_stream_url': f'/api/audio/stream/{audio_file_id}'
            })
        
        # Add translation info if different from English
        if detected_language != 'en':
            response_data.update({
                'original_response': ai_response,
                'original_english_text': ai_response,
                'translated_text': final_response
            })
        
        logger.info(f"Returning successful response - Language: {detected_language}, Audio: {audio_file_id}")
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except:
            pass
        
        return jsonify({
            'error': 'Internal server error',
            'details': str(e),
            'status': 'error'
        }), 500

@chat_bp.route('/sessions', methods=['GET'])
@jwt_required()
def get_chat_sessions():
    """Get all chat sessions for the current user"""
    try:
        user_id = get_jwt_identity()
        sessions = ChatSession.query.filter_by(user_id=user_id).order_by(ChatSession.updated_at.desc()).all()
        
        sessions_data = []
        for session in sessions:
            # Get message count for each session
            message_count = ChatMessage.query.filter_by(session_id=session.id).count()
            
            # Get last message preview
            last_message = ChatMessage.query.filter_by(session_id=session.id).order_by(ChatMessage.timestamp.desc()).first()
            
            session_data = {
                'id': session.id,
                'title': session.title,
                'created_at': session.created_at.strftime('%Y-%m-%d %H:%M') if session.created_at else 'Unknown',
                'updated_at': session.updated_at.isoformat(),
                'message_count': message_count,
                'last_message': last_message.content[:50] + '...' if last_message and len(last_message.content) > 50 else (last_message.content if last_message else '')
            }
            sessions_data.append(session_data)
        
        logger.info(f"Retrieved {len(sessions_data)} chat sessions for user {user_id}")
        return jsonify({'sessions': sessions_data}), 200
        
    except Exception as e:
        logger.error(f"Failed to get chat sessions: {e}")
        return jsonify({'error': 'Failed to get chat sessions'}), 500



@chat_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_chat_session():
    """Create a new chat session"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        title = data.get('title', 'New Chat')
        
        session = ChatSession(
            user_id=user_id,
            session_id=str(uuid.uuid4()),
            title=title
        )
        db.session.add(session)
        db.session.commit()
        
        return jsonify({
            'session': {
                'id': session.id,
                'title': session.title,
                'created_at': session.created_at.isoformat(),
                'updated_at': session.updated_at.isoformat()
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Failed to create chat session: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to create chat session'}), 500


@chat_bp.route('/sessions/<int:session_id>/messages', methods=['GET'])
@jwt_required()
def get_chat_messages(session_id):
    """Get messages for a specific chat session"""
    try:
        user_id = get_jwt_identity()
        
        # Verify session belongs to user
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # FIXED: Order by timestamp (which is the actual column name) instead of created_at
        messages = ChatMessage.query.filter_by(session_id=session_id).order_by(ChatMessage.timestamp.asc()).all()
        
        messages_data = []
        for message in messages:
            message_data = {
                'id': message.id,
                'message_type': message.message_type,
                'content': message.content,
                'timestamp': message.timestamp.isoformat(),  # FIXED: Use timestamp field
                'original_language': message.original_language,
                'input_type': message.input_type,
                'location': message.location,
                'weather_data': message.weather_data
            }
            
            # Add audio URL if available
            if message.audio_file_path and os.path.exists(message.audio_file_path):
                # Find audio file record
                audio_file = AudioFile.query.filter_by(file_path=message.audio_file_path).first()
                if audio_file:
                    message_data['audio_url'] = f'/api/audio/download/{audio_file.id}'
                    message_data['audio_stream_url'] = f'/api/audio/stream/{audio_file.id}'
            
            messages_data.append(message_data)
        
        logger.info(f"Retrieved {len(messages_data)} messages for session {session_id}")
        return jsonify({'messages': messages_data}), 200
        
    except Exception as e:
        logger.error(f"Failed to get chat messages: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to get chat messages'}), 500


@chat_bp.route('/sessions/<int:session_id>', methods=['DELETE'])
@jwt_required()
def delete_chat_session(session_id):
    """Delete a chat session and its messages"""
    try:
        user_id = get_jwt_identity()
        
        # Verify session belongs to user
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Delete associated messages
        ChatMessage.query.filter_by(session_id=session_id).delete()
        
        # Delete session
        db.session.delete(session)
        db.session.commit()
        
        return jsonify({'message': 'Session deleted successfully'}), 200
        
    except Exception as e:
        logger.error(f"Failed to delete chat session: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to delete chat session'}), 500