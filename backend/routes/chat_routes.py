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
    """Process agricultural query and generate both text and audio response"""
    try:
        logger.info("Processing chat query request")
        
        user_id = get_jwt_identity()
        logger.info(f"User ID: {user_id}")
        
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        logger.info(f"User found: {user.email}")
        
        # Enhanced JSON parsing
        try:
            content_type = request.headers.get('Content-Type', '').lower()
            logger.info(f"Content-Type header: '{content_type}'")
            
            if not request.data:
                logger.error("No request data found")
                return jsonify({
                    'error': 'No data in request',
                    'details': 'Request body is empty'
                }), 400
            
            raw_data = request.get_data(as_text=True)
            logger.info(f"Raw request data: {raw_data}")
            
            data = None
            
            # Try different parsing methods
            if 'application/json' in content_type:
                try:
                    data = request.get_json()
                    logger.info("Successfully parsed JSON with get_json()")
                except Exception as e1:
                    logger.warning(f"get_json() failed: {e1}")
            
            if data is None:
                try:
                    data = request.get_json(force=True)
                    logger.info("Successfully parsed JSON with get_json(force=True)")
                except Exception as e2:
                    logger.warning(f"get_json(force=True) failed: {e2}")
            
            if data is None:
                try:
                    data = json.loads(raw_data)
                    logger.info("Successfully parsed JSON with json.loads()")
                except json.JSONDecodeError as e3:
                    logger.error(f"JSON decode error: {e3}")
                    return jsonify({
                        'error': 'Invalid JSON syntax',
                        'details': f'{e3.msg} at line {e3.lineno}, column {e3.colno}',
                        'received_data': raw_data[:200] + '...' if len(raw_data) > 200 else raw_data
                    }), 400
                except Exception as e3:
                    logger.error(f"Manual JSON parsing failed: {e3}")
                    return jsonify({
                        'error': 'JSON parsing failed',
                        'details': str(e3)
                    }), 400
            
            if data is None:
                logger.error("All JSON parsing methods failed")
                return jsonify({
                    'error': 'Unable to parse JSON',
                    'details': 'All parsing methods failed'
                }), 400
            
            logger.info(f"Parsed JSON data: {data}")
            
        except Exception as json_error:
            logger.error(f"JSON processing error: {json_error}")
            return jsonify({
                'error': 'JSON processing failed',
                'details': str(json_error)
            }), 400
        
        # Extract and validate fields
        try:
            if not isinstance(data, dict):
                return jsonify({
                    'error': 'Invalid data format',
                    'details': f'Expected JSON object, got {type(data).__name__}'
                }), 400
            
            query = data.get('query', '').strip() if data.get('query') else ''
            location = data.get('location', '').strip() if data.get('location') else ''
            session_id = data.get('session_id')
            input_language = data.get('language', 'en').strip() if data.get('language') else 'en'
            generate_audio = data.get('generate_audio', True)
            
            logger.info(f"Extracted - Query: '{query}', Location: '{location}', Language: '{input_language}'")
            
        except Exception as extract_error:
            logger.error(f"Field extraction error: {extract_error}")
            return jsonify({
                'error': 'Field extraction failed',
                'details': str(extract_error)
            }), 400
        
        # Validation
        if not query:
            return jsonify({
                'error': 'Query cannot be empty',
                'details': 'Please provide a valid query'
            }), 400
        
        if len(query) < 3:
            return jsonify({
                'error': 'Query too short',
                'details': 'Query must be at least 3 characters long'
            }), 400
        
        if not location:
            # Use user's default location if not provided
            location = user.location if hasattr(user, 'location') and user.location else 'Unknown'
            if location == 'Unknown':
                return jsonify({
                    'error': 'Location is required',
                    'details': 'Please provide a valid location'
                }), 400
        
        # Initialize services
        try:
            weather_api_key = current_app.config.get('WEATHER_API_KEY', '')
            google_api_key = current_app.config.get('GOOGLE_API_KEY', '')
            
            if not google_api_key:
                logger.error("Google API key is missing")
                return jsonify({'error': 'AI service not configured'}), 503
            
            weather_service = WeatherService(weather_api_key)
            location_service = LocationService(weather_api_key)
            llm_service = AgriculturalLLMService(google_api_key)
            speech_service = SpeechService(current_app.config.get('UPLOAD_FOLDER', '/tmp'))
            
            logger.info(f"Services initialized successfully")
            
        except Exception as service_error:
            logger.error(f"Service initialization error: {service_error}")
            return jsonify({'error': 'Failed to initialize services'}), 503
        
        # Get or create chat session
        session = None
        try:
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
                logger.info(f"New session created with ID: {session.id}")
                
        except Exception as session_error:
            logger.error(f"Session handling error: {session_error}")
            db.session.rollback()
            return jsonify({'error': 'Failed to create session'}), 500
        
        # Language detection and translation
        english_query = query
        try:
            if not input_language or input_language == 'auto':
                input_language = translation_service.detect_language(query)
                logger.info(f"Detected language: {input_language}")
            
            if input_language != 'en':
                logger.info("Translating query to English...")
                # FIXED: Use correct method signature
                english_query = translation_service.translate_to_english(query, input_language)
                logger.info(f"Translated query: {english_query}")
                
        except Exception as translation_error:
            logger.warning(f"Translation error: {translation_error}")
            english_query = query
            input_language = 'en'
        
        # Get location and weather data
        weather_info = None
        try:
            lat, lon = location_service.get_coordinates(location)
            if lat and lon:
                weather_info = weather_service.get_weather(lat, lon)
        except Exception as location_error:
            logger.warning(f"Location/Weather error: {location_error}")
            weather_info = {'error': 'Weather data unavailable'}
        
        # Generate AI response
        try:
            logger.info("Generating AI response...")
            response = llm_service.generate_response(english_query, location, weather_info or {})
            
            if not response or not response.strip():
                logger.error("Empty response from LLM service")
                return jsonify({'error': 'Failed to generate response'}), 500
                
            logger.info(f"AI response generated: {len(response)} characters")
            
        except Exception as llm_error:
            logger.error(f"LLM generation error: {llm_error}")
            return jsonify({'error': 'AI service temporarily unavailable'}), 500
        
        # Translate response back if needed - FIXED LOGIC
        translated_response = response
        try:
            if input_language != 'en':
                logger.info(f"Translating response back to {input_language}...")
                translated_response = translation_service.translate_from_english(response, input_language)
                logger.info(f"Translated response: {translated_response}")
                
                # Ensure we actually got a translation
                if not translated_response or translated_response.strip() == response.strip():
                    logger.warning("Translation failed or returned same text, using original response")
                    translated_response = response
                
        except Exception as translation_error:
            logger.warning(f"Response translation error: {translation_error}")
            translated_response = response
        
        # ENHANCED AUDIO GENERATION WITH COMPLETE ERROR HANDLING
        audio_file_id = None
        translated_audio_file_id = None
        audio_download_url = None
        translated_audio_download_url = None
        
        if generate_audio and speech_service:
            try:
                logger.info("Starting audio generation process...")
                
                # Check speech service status first
                service_status = speech_service.get_service_status()
                logger.info(f"Speech service status: {service_status}")
                
                if not service_status.get('folder_writable', False):
                    logger.error(f"Upload folder not writable: {service_status.get('upload_folder')}")
                    # Continue without audio generation
                else:
                    # Generate original audio (English) - For reference/debugging
                    original_audio_file = None
                    if response and response.strip():
                        try:
                            logger.info("Generating English audio response...")
                            logger.info(f"English text to convert: {response[:100]}...")
                            
                            original_audio_path = speech_service.text_to_speech(response, 'en')
                            logger.info(f"English audio path returned: {original_audio_path}")
                            
                            if original_audio_path and os.path.exists(original_audio_path):
                                if speech_service.validate_audio_file(original_audio_path):
                                    original_audio_file = AudioFile(
                                        filename=os.path.basename(original_audio_path),
                                        original_filename=f'response_en_{int(datetime.now().timestamp())}.mp3',
                                        file_path=original_audio_path,
                                        file_type='output',
                                        file_size=os.path.getsize(original_audio_path)
                                    )
                                    db.session.add(original_audio_file)
                                    db.session.flush()
                                    audio_file_id = original_audio_file.id
                                    audio_download_url = f'/api/audio/download/{audio_file_id}'
                                    logger.info(f"Original English audio saved with ID: {audio_file_id}")
                                else:
                                    logger.warning("English audio file validation failed")
                            else:
                                logger.warning(f"Failed to generate English audio. Path: {original_audio_path}, Exists: {os.path.exists(original_audio_path) if original_audio_path else False}")
                                
                        except Exception as en_audio_error:
                            logger.error(f"English audio generation failed: {en_audio_error}")
                            logger.error(f"English audio error traceback: {traceback.format_exc()}")
                    
                    # Generate translated audio (Primary audio for user)
                    translated_audio_file = None
                    if translated_response and translated_response.strip() and input_language != 'en':
                        try:
                            logger.info(f"Generating {input_language} audio response...")
                            logger.info(f"Translated text to convert: {translated_response[:100]}...")
                            
                            # Use the speech service TTS language mapping
                            tts_lang_code = speech_service.get_tts_language_code(input_language)
                            logger.info(f"Using TTS language code: {tts_lang_code}")
                            
                            translated_audio_path = speech_service.text_to_speech(translated_response, tts_lang_code)
                            logger.info(f"Translated audio path returned: {translated_audio_path}")
                            
                            if translated_audio_path and os.path.exists(translated_audio_path):
                                if speech_service.validate_audio_file(translated_audio_path):
                                    translated_audio_file = AudioFile(
                                        filename=os.path.basename(translated_audio_path),
                                        original_filename=f'response_{input_language}_{int(datetime.now().timestamp())}.mp3',
                                        file_path=translated_audio_path,
                                        file_type='output',
                                        file_size=os.path.getsize(translated_audio_path)
                                    )
                                    db.session.add(translated_audio_file)
                                    db.session.flush()
                                    translated_audio_file_id = translated_audio_file.id
                                    translated_audio_download_url = f'/api/audio/download/{translated_audio_file_id}'
                                    logger.info(f"Translated {input_language} audio saved with ID: {translated_audio_file_id}")
                                else:
                                    logger.warning(f"Translated {input_language} audio file validation failed")
                            else:
                                logger.warning(f"Failed to generate {input_language} audio. Path: {translated_audio_path}, Exists: {os.path.exists(translated_audio_path) if translated_audio_path else False}")
                                
                        except Exception as trans_audio_error:
                            logger.error(f"Translated audio generation failed: {trans_audio_error}")
                            logger.error(f"Translated audio error traceback: {traceback.format_exc()}")
                    
                    # If we didn't generate translated audio but user language isn't English,
                    # try generating audio in user's language with the final response
                    elif input_language != 'en' and translated_response and translated_response.strip():
                        try:
                            logger.info(f"Generating fallback {input_language} audio...")
                            logger.info(f"Fallback text to convert: {translated_response[:100]}...")
                            
                            tts_lang_code = speech_service.get_tts_language_code(input_language)
                            logger.info(f"Using fallback TTS language code: {tts_lang_code}")
                            
                            fallback_audio_path = speech_service.text_to_speech(translated_response, tts_lang_code)
                            logger.info(f"Fallback audio path returned: {fallback_audio_path}")
                            
                            if fallback_audio_path and os.path.exists(fallback_audio_path):
                                if speech_service.validate_audio_file(fallback_audio_path):
                                    translated_audio_file = AudioFile(
                                        filename=os.path.basename(fallback_audio_path),
                                        original_filename=f'response_{input_language}_fallback_{int(datetime.now().timestamp())}.mp3',
                                        file_path=fallback_audio_path,
                                        file_type='output',
                                        file_size=os.path.getsize(fallback_audio_path)
                                    )
                                    db.session.add(translated_audio_file)
                                    db.session.flush()
                                    translated_audio_file_id = translated_audio_file.id
                                    translated_audio_download_url = f'/api/audio/download/{translated_audio_file_id}'
                                    logger.info(f"Fallback {input_language} audio saved with ID: {translated_audio_file_id}")
                                else:
                                    logger.warning(f"Fallback {input_language} audio file validation failed")
                        except Exception as fallback_error:
                            logger.error(f"Fallback audio generation failed: {fallback_error}")
                            logger.error(f"Fallback audio error traceback: {traceback.format_exc()}")
                
                # Log final audio status
                logger.info(f"Audio generation complete - English: {'✓' if audio_file_id else '✗'}, {input_language}: {'✓' if translated_audio_file_id else '✗'}")
                
            except Exception as audio_error:
                logger.error(f"Audio generation error: {audio_error}")
                logger.error(f"Audio error traceback: {traceback.format_exc()}")
                # Continue without audio - don't fail the entire request
        else:
            logger.info(f"Audio generation skipped - generate_audio: {generate_audio}, speech_service available: {speech_service is not None}")
        
        # Save messages to database
        try:
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
            
            ai_message = ChatMessage(
                session_id=session.id,
                message_type='assistant',
                content=translated_response,
                original_language=input_language,
                location=location,
                weather_data=weather_info,
                audio_file_path=original_audio_file.file_path if original_audio_file else None
            )
            db.session.add(ai_message)
            
            session.updated_at = datetime.utcnow()
            db.session.commit()
            logger.info("Messages and audio files saved to database successfully")
            
        except Exception as db_error:
            logger.error(f"Database save error: {db_error}")
            logger.error(f"DB error traceback: {traceback.format_exc()}")
            db.session.rollback()
            return jsonify({'error': 'Failed to save conversation'}), 500
        
        # Prepare response data - FIXED STRUCTURE
        response_data = {
            'session_id': session.id,
            'query': query,
            'response': translated_response,  # Primary response in user's language
            'response_text': translated_response,
            'original_response': response,  # Original English response
            'language': input_language,
            'detected_language': input_language,
            'location': location,
            'weather': weather_info,
            'user_message_id': user_message.id,
            'ai_message_id': ai_message.id,
            'response_language': input_language,  # Changed from 'en'
            'translation_language': input_language,
        }
        
        # Add audio URLs if available - PRIORITIZE USER'S LANGUAGE
        if translated_audio_download_url:
            # Primary audio should be in user's language
            response_data['audio_url'] = translated_audio_download_url
            response_data['audio_download_url'] = translated_audio_download_url
            response_data['audio_file_id'] = translated_audio_file_id
            response_data['translated_audio_url'] = translated_audio_download_url
            response_data['translated_audio_file_id'] = translated_audio_file_id
            logger.info(f"Added translated audio URL to response: {translated_audio_download_url}")
        elif audio_download_url:
            # Fallback to English audio if no translated audio available
            response_data['audio_url'] = audio_download_url
            response_data['audio_download_url'] = audio_download_url
            response_data['audio_file_id'] = audio_file_id
            logger.info(f"Added English audio URL to response: {audio_download_url}")
        
        # Add both audio URLs if both exist
        if audio_download_url and translated_audio_download_url:
            response_data['english_audio_url'] = audio_download_url
            response_data['english_audio_file_id'] = audio_file_id
        
        # Add translation info if different languages
        if input_language != 'en':
            response_data['translated_text'] = translated_response
            response_data['original_english_text'] = response
        
        logger.info(f"Returning successful response with audio status - Primary: {'✓' if response_data.get('audio_url') else '✗'}")
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Unexpected error in chat query processing: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except:
            pass
        
        # CRITICAL: Always return a response, even on error
        return jsonify({
            'error': 'Internal server error',
            'details': str(e),
            'traceback': traceback.format_exc() if current_app.debug else None
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
            sessions_data.append({
                'id': session.id,
                'title': session.title,
                'created_at': session.created_at.isoformat(),
                'updated_at': session.updated_at.isoformat()
            })
        
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
        
        messages = ChatMessage.query.filter_by(session_id=session_id).order_by(ChatMessage.created_at.asc()).all()
        
        messages_data = []
        for message in messages:
            message_data = {
                'id': message.id,
                'message_type': message.message_type,
                'content': message.content,
                'timestamp': message.created_at.isoformat(),
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
            
            messages_data.append(message_data)
        
        return jsonify({'messages': messages_data}), 200
        
    except Exception as e:
        logger.error(f"Failed to get chat messages: {e}")
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