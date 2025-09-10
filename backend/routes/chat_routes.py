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
        # Log the incoming request with more details
        logger.info("Processing chat query request")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request headers: {dict(request.headers)}")
        logger.info(f"Request URL: {request.url}")
        
        user_id = get_jwt_identity()
        logger.info(f"User ID: {user_id}")
        
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        logger.info(f"User found: {user.email}")
        
        # Enhanced JSON parsing with comprehensive debugging
        try:
            # Check content type first
            content_type = request.headers.get('Content-Type', '').lower()
            logger.info(f"Content-Type header: '{content_type}'")
            
            # Check if request has data
            if not request.data:
                logger.error("No request data found")
                return jsonify({
                    'error': 'No data in request',
                    'details': 'Request body is empty'
                }), 400
            
            # Get raw data for debugging
            raw_data = request.get_data(as_text=True)
            logger.info(f"Raw request data length: {len(raw_data)}")
            logger.info(f"Raw request data: {repr(raw_data)}")  # Use repr to see hidden characters
            
            # Check for common JSON issues
            if not raw_data.strip():
                logger.error("Request data is empty or whitespace only")
                return jsonify({'error': 'Empty request body'}), 400
            
            if not (raw_data.strip().startswith('{') and raw_data.strip().endswith('}')):
                logger.error("Request data doesn't look like JSON")
                return jsonify({
                    'error': 'Invalid JSON format',
                    'details': 'Data does not appear to be JSON',
                    'received': raw_data[:100] + '...' if len(raw_data) > 100 else raw_data
                }), 400
            
            data = None
            parse_method = None
            
            # Method 1: Standard get_json() - most reliable
            if 'application/json' in content_type:
                try:
                    data = request.get_json()
                    parse_method = "request.get_json()"
                    logger.info("Successfully parsed JSON with get_json()")
                except Exception as e1:
                    logger.warning(f"get_json() failed: {e1}")
                    data = None
            
            # Method 2: Force JSON parsing if content-type is wrong
            if data is None:
                try:
                    data = request.get_json(force=True)
                    parse_method = "request.get_json(force=True)"
                    logger.info("Successfully parsed JSON with get_json(force=True)")
                except Exception as e2:
                    logger.warning(f"get_json(force=True) failed: {e2}")
                    data = None
            
            # Method 3: Manual JSON parsing as last resort
            if data is None:
                try:
                    # Clean the raw data
                    cleaned_data = raw_data.strip()
                    data = json.loads(cleaned_data)
                    parse_method = "json.loads()"
                    logger.info("Successfully parsed JSON with json.loads()")
                except json.JSONDecodeError as e3:
                    logger.error(f"JSON decode error: {e3}")
                    logger.error(f"Error at line {e3.lineno}, column {e3.colno}: {e3.msg}")
                    return jsonify({
                        'error': 'Invalid JSON syntax',
                        'details': f'{e3.msg} at line {e3.lineno}, column {e3.colno}',
                        'received_data': raw_data[:200] + '...' if len(raw_data) > 200 else raw_data
                    }), 400
                except Exception as e3:
                    logger.error(f"Manual JSON parsing failed: {e3}")
                    return jsonify({
                        'error': 'JSON parsing failed',
                        'details': str(e3),
                        'received_data': raw_data[:200] + '...' if len(raw_data) > 200 else raw_data
                    }), 400
            
            if data is None:
                logger.error("All JSON parsing methods failed")
                return jsonify({
                    'error': 'Unable to parse JSON',
                    'details': 'All parsing methods failed',
                    'content_type': content_type,
                    'data_preview': raw_data[:100] + '...' if len(raw_data) > 100 else raw_data
                }), 400
            
            logger.info(f"Successfully parsed JSON using {parse_method}")
            logger.info(f"Parsed JSON data: {data}")
            logger.info(f"Data type: {type(data)}")
            
        except Exception as json_error:
            logger.error(f"JSON processing error: {json_error}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return jsonify({
                'error': 'JSON processing failed',
                'details': str(json_error),
                'traceback': traceback.format_exc()
            }), 400
        
        # Enhanced field extraction with detailed validation
        try:
            # Check if data is a dictionary
            if not isinstance(data, dict):
                logger.error(f"Parsed data is not a dictionary: {type(data)}")
                return jsonify({
                    'error': 'Invalid data format',
                    'details': f'Expected JSON object, got {type(data).__name__}'
                }), 400
            
            # Extract and validate fields
            query = data.get('query')
            location = data.get('location')
            session_id = data.get('session_id')
            input_language = data.get('language')
            generate_audio = data.get('generate_audio', True)  # Default to True for audio generation
            
            logger.info(f"Raw extracted fields - Query: {repr(query)}, Location: {repr(location)}, Language: {repr(input_language)}, Session ID: {repr(session_id)}, Generate Audio: {generate_audio}")
            
            # Process query
            if query is None:
                logger.error("Query field is missing")
                return jsonify({
                    'error': 'Missing required field: query',
                    'received_fields': list(data.keys())
                }), 400
            
            if not isinstance(query, str):
                logger.error(f"Query must be a string, got {type(query)}")
                return jsonify({
                    'error': 'Invalid query type',
                    'details': f'Query must be a string, got {type(query).__name__}'
                }), 400
            
            query = query.strip()
            
            # Process location
            if location is None:
                location = user.location if hasattr(user, 'location') and user.location else ''
            elif not isinstance(location, str):
                logger.error(f"Location must be a string, got {type(location)}")
                return jsonify({
                    'error': 'Invalid location type',
                    'details': f'Location must be a string, got {type(location).__name__}'
                }), 400
            else:
                location = location.strip()
            
            # Process language
            if input_language is None:
                input_language = user.preferred_language if hasattr(user, 'preferred_language') and user.preferred_language else 'en'
            elif not isinstance(input_language, str):
                logger.error(f"Language must be a string, got {type(input_language)}")
                return jsonify({
                    'error': 'Invalid language type',
                    'details': f'Language must be a string, got {type(input_language).__name__}'
                }), 400
            else:
                input_language = input_language.strip()
            
            # Process session_id
            if session_id is not None and not isinstance(session_id, (int, str)):
                logger.error(f"Session ID must be int or string, got {type(session_id)}")
                return jsonify({
                    'error': 'Invalid session_id type',
                    'details': f'Session ID must be integer or string, got {type(session_id).__name__}'
                }), 400
            
            logger.info(f"Processed fields - Query: '{query}', Location: '{location}', Language: '{input_language}', Session ID: {session_id}")
            
        except Exception as extract_error:
            logger.error(f"Field extraction error: {extract_error}")
            logger.error(f"Extraction traceback: {traceback.format_exc()}")
            return jsonify({
                'error': 'Field extraction failed',
                'details': str(extract_error)
            }), 400
        
        # Enhanced validation with specific error messages
        if not query:
            logger.error("Query is empty after stripping")
            return jsonify({
                'error': 'Query cannot be empty',
                'details': 'Please provide a valid query'
            }), 400
        
        if len(query) < 3:
            logger.error(f"Query too short: '{query}' ({len(query)} characters)")
            return jsonify({
                'error': 'Query too short',
                'details': 'Query must be at least 3 characters long'
            }), 400
        
        if len(query) > 1000:
            logger.error(f"Query too long: {len(query)} characters")
            return jsonify({
                'error': 'Query too long',
                'details': 'Query must be no more than 1000 characters'
            }), 400
        
        if not location:
            logger.error("Location is empty")
            return jsonify({
                'error': 'Location is required',
                'details': 'Please provide a valid location'
            }), 400
        
        # Initialize services with error checking
        try:
            weather_api_key = current_app.config.get('WEATHER_API_KEY', '')
            google_api_key = current_app.config.get('GOOGLE_API_KEY', '')
            
            logger.info(f"API Keys - Weather: {'Present' if weather_api_key else 'Missing'}, Google: {'Present' if google_api_key else 'Missing'}")
            
            if not google_api_key:
                logger.error("Google API key is missing")
                return jsonify({'error': 'AI service not configured'}), 503
            
            weather_service = WeatherService(weather_api_key)
            location_service = LocationService(weather_api_key)
            llm_service = AgriculturalLLMService(google_api_key)
            speech_service = SpeechService(current_app.config.get('UPLOAD_FOLDER', '/tmp'))
            
        except Exception as service_error:
            logger.error(f"Service initialization error: {service_error}")
            logger.error(f"Service traceback: {traceback.format_exc()}")
            return jsonify({'error': 'Failed to initialize services'}), 503
        
        # Get or create chat session
        session = None
        try:
            if session_id:
                session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
                logger.info(f"Found existing session: {session is not None}")
            
            if not session:
                logger.info("Creating new session")
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
        try:
            if not input_language or input_language == 'auto':
                logger.info("Detecting language...")
                input_language = translation_service.detect_language(query)
                logger.info(f"Detected language: {input_language}")
            
            english_query = query
            if input_language != 'en':
                logger.info("Translating query to English...")
                english_query = translation_service.translate_to_english(query, input_language)
                logger.info(f"Translated query: {english_query}")
                
        except Exception as translation_error:
            logger.warning(f"Translation error: {translation_error}")
            english_query = query
            input_language = 'en'
        
        # Get location and weather data
        weather_info = None
        try:
            logger.info("Getting location coordinates...")
            lat, lon = location_service.get_coordinates(location)
            logger.info(f"Coordinates: {lat}, {lon}")
            
            if lat and lon:
                logger.info("Getting weather data...")
                weather_info = weather_service.get_weather(lat, lon)
                logger.info(f"Weather retrieved: {weather_info is not None}")
            
        except Exception as location_error:
            logger.warning(f"Location/Weather error: {location_error}")
            weather_info = {'error': 'Weather data unavailable'}
        
        # Generate AI response
        try:
            logger.info("Generating AI response...")
            response = llm_service.generate_response(english_query, location, weather_info)
            
            if not response or not response.strip():
                logger.error("Empty response from LLM service")
                return jsonify({'error': 'Failed to generate response'}), 500
                
            logger.info(f"AI response generated: {len(response)} characters")
            
        except Exception as llm_error:
            logger.error(f"LLM generation error: {llm_error}")
            logger.error(f"LLM traceback: {traceback.format_exc()}")
            return jsonify({'error': 'AI service temporarily unavailable'}), 500
        
        # Translate response back if needed
        translated_response = response
        try:
            if input_language != 'en':
                logger.info("Translating response back to original language...")
                translated_response = translation_service.translate_from_english(response, input_language)
                
        except Exception as translation_error:
            logger.warning(f"Response translation error: {translation_error}")
            translated_response = response
        
        # Generate audio responses
        audio_file_id = None
        translated_audio_file_id = None
        audio_download_url = None
        translated_audio_download_url = None
        
        if generate_audio and speech_service:
            try:
                logger.info("Generating audio responses...")
                
                # Generate original audio (in English)
                if response:
                    logger.info("Generating English audio response...")
                    original_audio_path = speech_service.text_to_speech(response, 'en')
                    
                    if original_audio_path and os.path.exists(original_audio_path):
                        # Save original audio file record
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
                        logger.info(f"Original audio saved with ID: {audio_file_id}")
                
                # Generate translated audio (if different language)
                if translated_response and input_language != 'en':
                    logger.info(f"Generating {input_language} audio response...")
                    translated_audio_path = speech_service.text_to_speech(translated_response, input_language)
                    
                    if translated_audio_path and os.path.exists(translated_audio_path):
                        # Save translated audio file record
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
                        logger.info(f"Translated audio saved with ID: {translated_audio_file_id}")
                
            except Exception as audio_error:
                logger.warning(f"Audio generation error: {audio_error}")
                # Continue without audio - don't fail the entire request
                audio_file_id = None
                translated_audio_file_id = None
        
        # Save messages to database
        try:
            logger.info("Saving messages to database...")
            
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
                content=translated_response,  # Use translated response for storage
                original_language=input_language,
                location=location,
                weather_data=weather_info,
                audio_file_path=original_audio_file.file_path if audio_file_id else None
            )
            db.session.add(ai_message)
            
            session.updated_at = datetime.utcnow()
            
            db.session.commit()
            logger.info("Messages saved successfully")
            
        except Exception as db_error:
            logger.error(f"Database save error: {db_error}")
            logger.error(f"DB traceback: {traceback.format_exc()}")
            db.session.rollback()
            return jsonify({'error': 'Failed to save conversation'}), 500
        
        # Return successful response with both text and audio
        response_data = {
            'session_id': session.id,
            'query': query,
            'response': translated_response,
            'response_text': translated_response,
            'original_response': response if input_language != 'en' else translated_response,
            'language': input_language,
            'location': location,
            'weather': weather_info,
            'user_message_id': user_message.id,
            'ai_message_id': ai_message.id,
        }
        
        # Add audio URLs if available
        if audio_download_url:
            response_data['audio_url'] = audio_download_url
            response_data['audio_download_url'] = audio_download_url
            response_data['audio_file_id'] = audio_file_id
        
        if translated_audio_download_url:
            response_data['translated_audio_url'] = translated_audio_download_url
            response_data['translated_audio_download_url'] = translated_audio_download_url
            response_data['translated_audio_file_id'] = translated_audio_file_id
        
        # Add language information
        response_data['response_language'] = 'en'
        response_data['translation_language'] = input_language
        
        if input_language != 'en':
            response_data['translated_text'] = translated_response
        
        logger.info(f"Returning response with audio URLs: original={audio_download_url}, translated={translated_audio_download_url}")
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Unexpected error in chat query processing: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except:
            pass
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500


@chat_bp.route('/test-json', methods=['POST'])
@jwt_required()
def test_json():
    """Enhanced test endpoint for debugging JSON parsing"""
    try:
        logger.info("=== JSON PARSING TEST ===")
        
        # Request details
        logger.info(f"Method: {request.method}")
        logger.info(f"URL: {request.url}")
        logger.info(f"Headers: {dict(request.headers)}")
        
        # Content analysis
        content_type = request.headers.get('Content-Type', 'Not set')
        content_length = request.headers.get('Content-Length', 'Not set')
        
        logger.info(f"Content-Type: {content_type}")
        logger.info(f"Content-Length: {content_length}")
        
        # Raw data analysis
        raw_data = request.get_data(as_text=True)
        logger.info(f"Raw data length: {len(raw_data)}")
        logger.info(f"Raw data (first 500 chars): {raw_data[:500]}")
        logger.info(f"Raw data repr: {repr(raw_data[:100])}")
        
        # Check for BOM or hidden characters
        if raw_data.startswith('\ufeff'):
            logger.warning("UTF-8 BOM detected in request data")
        
        # Parsing attempts
        parsing_results = {}
        
        # Method 1: get_json()
        try:
            data1 = request.get_json()
            parsing_results['get_json'] = {'success': True, 'data': data1}
            logger.info("get_json() - SUCCESS")
        except Exception as e:
            parsing_results['get_json'] = {'success': False, 'error': str(e)}
            logger.warning(f"get_json() - FAILED: {e}")
        
        # Method 2: get_json(force=True)
        try:
            data2 = request.get_json(force=True)
            parsing_results['get_json_force'] = {'success': True, 'data': data2}
            logger.info("get_json(force=True) - SUCCESS")
        except Exception as e:
            parsing_results['get_json_force'] = {'success': False, 'error': str(e)}
            logger.warning(f"get_json(force=True) - FAILED: {e}")
        
        # Method 3: json.loads()
        try:
            data3 = json.loads(raw_data)
            parsing_results['json_loads'] = {'success': True, 'data': data3}
            logger.info("json.loads() - SUCCESS")
        except Exception as e:
            parsing_results['json_loads'] = {'success': False, 'error': str(e)}
            logger.warning(f"json.loads() - FAILED: {e}")
        
        # Find successful parsing method
        successful_data = None
        successful_method = None
        
        for method, result in parsing_results.items():
            if result['success']:
                successful_data = result['data']
                successful_method = method
                break
        
        response_data = {
            'status': 'test_completed',
            'request_info': {
                'method': request.method,
                'content_type': content_type,
                'content_length': content_length,
                'data_length': len(raw_data),
                'has_bom': raw_data.startswith('\ufeff')
            },
            'raw_data': raw_data,
            'raw_data_repr': repr(raw_data),
            'parsing_attempts': parsing_results,
            'successful_method': successful_method,
            'parsed_data': successful_data
        }
        
        if successful_data is not None:
            response_data['field_analysis'] = {
                'data_type': str(type(successful_data)),
                'is_dict': isinstance(successful_data, dict),
                'keys': list(successful_data.keys()) if isinstance(successful_data, dict) else None,
                'query': successful_data.get('query') if isinstance(successful_data, dict) else None,
                'location': successful_data.get('location') if isinstance(successful_data, dict) else None,
                'session_id': successful_data.get('session_id') if isinstance(successful_data, dict) else None,
                'language': successful_data.get('language') if isinstance(successful_data, dict) else None
            }
        
        logger.info("=== TEST COMPLETED ===")
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Test JSON error: {e}")
        logger.error(f"Test traceback: {traceback.format_exc()}")
        return jsonify({
            'status': 'test_failed',
            'error': str(e),
            'traceback': traceback.format_exc(),
            'raw_data': request.get_data(as_text=True) if hasattr(request, 'get_data') else 'Unable to get raw data'
        }), 500