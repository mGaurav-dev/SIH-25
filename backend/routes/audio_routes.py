import os
import uuid
import time
from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from datetime import datetime
import logging

from extensions import db
from models import User, ChatSession, ChatMessage, AudioFile
from services.translation_service import TranslationService
from services.location_service import LocationService
from services.speech_service import SpeechService
from services.llm_service import AgriculturalLLMService
from services.weather_service import WeatherService

logger = logging.getLogger(__name__)

audio_bp = Blueprint('audio', __name__)

@audio_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_audio():
    """Upload audio file for speech-to-text conversion"""
    try:
        user_id = get_jwt_identity()
        
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Initialize speech service
        speech_service = SpeechService(current_app.config['UPLOAD_FOLDER'])
        
        # Generate secure filename
        original_filename = secure_filename(audio_file.filename)
        filename = f"audio_{user_id}_{uuid.uuid4().hex}.wav"
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        # Save file
        audio_file.save(file_path)
        
        # Convert speech to text
        language = request.form.get('language', 'en-US')
        text = speech_service.speech_to_text(file_path, language)
        
        if not text:
            return jsonify({'error': 'Could not recognize speech'}), 400
        
        # Save audio file record
        audio_record = AudioFile(
            filename=filename,
            original_filename=original_filename,
            file_path=file_path,
            file_type='input',
            file_size=os.path.getsize(file_path)
        )
        db.session.add(audio_record)
        db.session.commit()
        
        return jsonify({
            'text': text,
            'audio_file_id': audio_record.id,
            'original_filename': original_filename
        }), 200
        
    except Exception as e:
        logger.error(f"Audio upload error: {e}")
        return jsonify({'error': 'Failed to process audio'}), 500

@audio_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_audio():
    """Generate audio from text"""
    try:
        data = request.get_json()
        text = data.get('text')
        language = data.get('language', 'en')
        
        if not text:
            return jsonify({'error': 'Text is required'}), 400
        
        # Initialize speech service
        speech_service = SpeechService(current_app.config['UPLOAD_FOLDER'])
        
        # Generate audio file
        audio_path = speech_service.text_to_speech(text, language)
        
        if not audio_path:
            return jsonify({'error': 'Failed to generate audio'}), 500
        
        # Save audio file record
        filename = os.path.basename(audio_path)
        audio_record = AudioFile(
            filename=filename,
            original_filename=f"tts_{int(time.time())}.mp3",
            file_path=audio_path,
            file_type='output',
            file_size=os.path.getsize(audio_path)
        )
        db.session.add(audio_record)
        db.session.commit()
        
        return jsonify({
            'audio_file_id': audio_record.id,
            'filename': filename,
            'download_url': f'/api/audio/download/{audio_record.id}'
        }), 200
        
    except Exception as e:
        logger.error(f"Audio generation error: {e}")
        return jsonify({'error': 'Failed to generate audio'}), 500

@audio_bp.route('/download/<int:audio_id>')
@jwt_required()
def download_audio(audio_id):
    """Download audio file - FIXED VERSION"""
    try:
        user_id = get_jwt_identity()
        logger.info(f"Audio download request - User: {user_id}, Audio ID: {audio_id}")
        
        audio_file = AudioFile.query.get(audio_id)
        
        if not audio_file:
            logger.error(f"Audio file not found in database: {audio_id}")
            return jsonify({'error': 'Audio file not found'}), 404
        
        if not os.path.exists(audio_file.file_path):
            logger.error(f"Audio file not found on disk: {audio_file.file_path}")
            return jsonify({'error': 'Audio file not found on disk'}), 404
        
        logger.info(f"Serving audio file: {audio_file.file_path}")
        
        # Create response with proper headers for audio streaming
        response = send_file(
            audio_file.file_path,
            as_attachment=False,  # Allow streaming instead of forcing download
            download_name=audio_file.original_filename,
            mimetype='audio/mpeg'
        )
        
        # Add CORS headers for frontend access
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(audio_file.file_size)
        
        # Add cache headers to prevent caching issues
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        logger.error(f"Audio download error: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to download audio'}), 500

@audio_bp.route('/stream/<int:audio_id>')
@jwt_required()
def stream_audio(audio_id):
    """Stream audio file - Alternative endpoint for streaming"""
    try:
        user_id = get_jwt_identity()
        logger.info(f"Audio stream request - User: {user_id}, Audio ID: {audio_id}")
        
        audio_file = AudioFile.query.get(audio_id)
        
        if not audio_file:
            return jsonify({'error': 'Audio file not found'}), 404
        
        if not os.path.exists(audio_file.file_path):
            return jsonify({'error': 'Audio file not found on disk'}), 404
        
        # Read file and return as response
        with open(audio_file.file_path, 'rb') as f:
            audio_data = f.read()
        
        response = current_app.response_class(
            audio_data,
            mimetype='audio/mpeg',
            headers={
                'Content-Disposition': f'inline; filename="{audio_file.original_filename}"',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Content-Length': str(len(audio_data)),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            }
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Audio stream error: {e}")
        return jsonify({'error': 'Failed to stream audio'}), 500

# Fixed voice query processing in audio_routes.py

@audio_bp.route('/voice-query', methods=['POST'])
@jwt_required()
def process_voice_query():
    """Process voice input and generate audio response - FIXED Hindi/Multi-language Support"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)

        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404

        # Validate audio presence
        if 'audio' not in request.files:
            logger.error("No audio file in request")
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        if not audio_file or audio_file.filename == '':
            logger.error("Empty audio file")
            return jsonify({'error': 'No audio file selected'}), 400

        logger.info(f"Processing voice query for user {user_id}")

        # Params
        location = request.form.get('location', user.location or 'Unknown')
        session_id = request.form.get('session_id')

        if not location or location == 'Unknown':
            logger.error("No location provided")
            return jsonify({'error': 'Location is required for weather context'}), 400

        # Services initialization
        google_api_key = current_app.config.get('GOOGLE_API_KEY', '')
        weather_api_key = current_app.config.get('WEATHER_API_KEY', '')

        if not google_api_key:
            return jsonify({'error': 'AI service not configured'}), 503

        speech_service = SpeechService(current_app.config['UPLOAD_FOLDER'])
        translation_service = TranslationService()
        weather_service = WeatherService(weather_api_key)
        location_service = LocationService(weather_api_key)
        llm_service = AgriculturalLLMService(google_api_key)

        # Save audio file
        ext = '.webm'  # Default for most browsers
        content_type = audio_file.content_type or ''
        if 'webm' in content_type:
            ext = '.webm'
        elif 'ogg' in content_type:
            ext = '.ogg'
        elif 'wav' in content_type:
            ext = '.wav'

        filename = f"voice_{user_id}_{uuid.uuid4().hex}{ext}"
        audio_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        logger.info(f"Saving audio file to: {audio_path}")
        audio_file.save(audio_path)

        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            logger.error("Audio file save failed or empty")
            return jsonify({'error': 'Audio file processing failed'}), 500

        # Convert to WAV if needed for better STT
        wav_path = audio_path
        if ext in ['.webm', '.ogg']:
            try:
                from pydub import AudioSegment
                wav_filename = f"voice_{user_id}_{uuid.uuid4().hex}.wav"
                wav_path = os.path.join(current_app.config['UPLOAD_FOLDER'], wav_filename)
                audio_segment = AudioSegment.from_file(audio_path)
                audio_segment.export(wav_path, format="wav")
                logger.info(f"Converted to WAV: {wav_path}")
            except Exception as conv_error:
                logger.warning(f"Audio conversion failed: {conv_error}; using original")
                wav_path = audio_path

        # ENHANCED Speech-to-text with better language detection
        query_text = None
        detected_language = 'en'
        
        # Define recognition attempts with better Hindi support
        recognition_attempts = [
            ('hi-IN', 'hi'),  # Try Hindi first for Indian users
            ('en-US', 'en'),
            ('mr-IN', 'mr'),
            ('gu-IN', 'gu'),
            ('ta-IN', 'ta'),
            ('te-IN', 'te'),
            ('kn-IN', 'kn'),
            ('bn-IN', 'bn'),
            ('auto', 'en')   # Auto as last resort
        ]
        
        logger.info("Starting enhanced speech recognition with Hindi priority")
        for lang_code, lang_hint in recognition_attempts:
            try:
                logger.info(f"STT attempt with {lang_code}")
                txt = speech_service.speech_to_text(wav_path, lang_code)
                if txt and len(txt.strip()) > 2:
                    query_text = txt.strip()
                    detected_language = lang_hint
                    logger.info(f"STT SUCCESS with {lang_code}: '{query_text}' -> Language: {detected_language}")
                    break
                else:
                    logger.warning(f"STT returned empty/short text for {lang_code}")
            except Exception as e:
                logger.warning(f"STT failed for {lang_code}: {e}")
                continue

        if not query_text:
            logger.error("All speech recognition attempts failed")
            return jsonify({
                'error': 'Could not recognize speech. Please speak clearly.',
                'debug': 'All STT attempts failed' if current_app.debug else None
            }), 400

        # ENHANCED language detection from recognized text
        try:
            text_detected_lang = translation_service.detect_language(query_text)
            if text_detected_lang and text_detected_lang != 'en':
                detected_language = text_detected_lang
                logger.info(f"Language refined by text analysis: {detected_language}")
        except Exception as e:
            logger.warning(f"Text-based language detection failed: {e}")

        # CRITICAL: Log the detected language clearly
        logger.info(f"FINAL DETECTED LANGUAGE: {detected_language} for text: '{query_text}'")

        # Get/create chat session
        session = None
        if session_id:
            session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if not session:
            session = ChatSession(
                user_id=user_id,
                session_id=str(uuid.uuid4()),
                title=query_text[:50] + ('...' if len(query_text) > 50 else '')
            )
            db.session.add(session)
            db.session.flush()

        # ENHANCED Translation to English for LLM (ONLY if not English)
        english_query = query_text
        if detected_language != 'en':
            try:
                logger.info(f"Translating '{query_text}' from {detected_language} to English")
                english_query = translation_service.translate_to_english(query_text, detected_language)
                logger.info(f"English translation: '{english_query}'")
                
                if not english_query or len(english_query.strip()) < 3:
                    logger.warning("Translation to English failed or too short, using original")
                    english_query = query_text
                    
            except Exception as e:
                logger.error(f"Critical translation error: {e}")
                english_query = query_text

        # Get weather context
        weather_info = {}
        try:
            lat, lon = location_service.get_coordinates(location)
            if lat and lon:
                weather_info = weather_service.get_weather(lat, lon)
        except Exception as e:
            logger.warning(f"Weather retrieval failed: {e}")

        # Generate AI response in English
        try:
            ai_response = llm_service.generate_response(english_query, location, weather_info)
            if not ai_response:
                raise Exception("LLM returned empty response")
            logger.info(f"AI response (English): '{ai_response}'")
        except Exception as e:
            logger.error(f"AI generation failed: {e}")
            return jsonify({'error': 'AI service temporarily unavailable'}), 500

        # CRITICAL FIX: Enhanced translation back to user's language
        final_response = ai_response
        translation_success = False

        if detected_language != 'en':
            logger.info(f"TRANSLATING AI RESPONSE back to {detected_language}")
            
            # Multiple translation attempts with different strategies
            for attempt in range(3):  # 3 attempts instead of 2
                try:
                    logger.info(f"Translation attempt {attempt + 1} to {detected_language}")
                    
                    if attempt == 0:
                        # First attempt: Direct translation
                        translated = translation_service.translate_from_english(ai_response, detected_language)
                    elif attempt == 1:
                        # Second attempt: Use full language name
                        lang_names = {'hi': 'Hindi', 'mr': 'Marathi', 'gu': 'Gujarati', 'ta': 'Tamil', 'te': 'Telugu', 'kn': 'Kannada', 'bn': 'Bengali'}
                        full_lang_name = lang_names.get(detected_language, detected_language)
                        translated = GoogleTranslator(source='english', target=full_lang_name).translate(ai_response)
                    else:
                        # Third attempt: Direct Google Translate with language code
                        from deep_translator import GoogleTranslator
                        translated = GoogleTranslator(source='en', target=detected_language).translate(ai_response)
                    
                    # Validate translation
                    if translated and len(translated.strip()) > 10 and translated.strip() != ai_response.strip():
                        final_response = translated.strip()
                        translation_success = True
                        logger.info(f"TRANSLATION SUCCESS (attempt {attempt + 1}): '{final_response}'")
                        break
                    else:
                        logger.warning(f"Translation attempt {attempt + 1} invalid: '{translated}'")
                        
                except Exception as e:
                    logger.error(f"Translation attempt {attempt + 1} failed: {e}")
                    continue

            # Fallback with localized error messages if all attempts fail
            if not translation_success:
                logger.error(f"ALL TRANSLATION ATTEMPTS FAILED for language: {detected_language}")
                fallback_messages = {
                    'hi': 'मुझे आपकी भाषा में उत्तर देने में समस्या हो रही है। कृपया दोबारा कोशिश करें।',
                    'mr': 'मला तुमच्या भाषेत उत्तर देण्यात अडचण येत आहे. कृपया पुन्हा प्रयत्न करा.',
                    'gu': 'મને તમારી ભાષામાં જવાબ આપવામાં સમસ્યા આવી રહી છે. કૃપા કરીને ફરીથી પ્રયાસ કરો.',
                    'ta': 'உங்கள் மொழியில் பதிலளிப்பதில் எனக்கு சிக்கல் உள்ளது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.',
                    'te': 'మీ భాషలో సమాధానం ఇవ్వడంలో నాకు సమస్య ఉంది. దయచేసి మళ్లీ ప్రయత్నించండి.',
                    'kn': 'ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಉತ್ತರಿಸುವಲ್ಲಿ ನನಗೆ ಸಮಸ್ಯೆ ಇದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
                    'bn': 'আপনার ভাষায় উত্তর দিতে আমার সমস্যা হচ্ছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
                }
                final_response = fallback_messages.get(detected_language, ai_response)
        else:
            logger.info("Response language is English, no translation needed")
            translation_success = True

        # ENHANCED TTS generation with better language support
        output_audio_id = None
        audio_response_path = None
        
        try:
            logger.info(f"GENERATING TTS in language: {detected_language}")
            
            # Enhanced TTS language mapping
            tts_lang_mapping = {
                'hi': 'hi',  # Hindi
                'mr': 'mr',  # Marathi  
                'gu': 'gu',  # Gujarati
                'ta': 'ta',  # Tamil
                'te': 'te',  # Telugu
                'kn': 'kn',  # Kannada
                'bn': 'bn',  # Bengali
                'pa': 'pa',  # Punjabi
                'ml': 'ml',  # Malayalam
                'ur': 'ur',  # Urdu
                'ne': 'ne',  # Nepali
                'en': 'en'   # English
            }
            
            tts_lang_code = tts_lang_mapping.get(detected_language, 'en')
            logger.info(f"Using TTS language code: {tts_lang_code}")
            
            # Generate TTS
            audio_response_path = speech_service.text_to_speech(final_response, tts_lang_code)
            
            if audio_response_path and speech_service.validate_audio_file(audio_response_path):
                output_audio = AudioFile(
                    filename=os.path.basename(audio_response_path),
                    original_filename=f'voice_response_{detected_language}_{int(time.time())}.mp3',
                    file_path=audio_response_path,
                    file_type='output',
                    file_size=os.path.getsize(audio_response_path)
                )
                db.session.add(output_audio)
                db.session.flush()
                output_audio_id = output_audio.id
                logger.info(f"TTS SUCCESS: Audio generated with ID {output_audio_id} in {tts_lang_code}")
            else:
                logger.error("TTS generation failed - invalid audio file")
                
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            # Continue without audio rather than failing

        # Save input audio record
        try:
            input_audio = AudioFile(
                filename=filename,
                original_filename=audio_file.filename or f'voice_input{ext}',
                file_path=audio_path,
                file_type='input',
                file_size=os.path.getsize(audio_path)
            )
            db.session.add(input_audio)
            db.session.flush()
        except Exception as e:
            logger.error(f"Failed to save input audio record: {e}")

        # Save conversation to database
        try:
            user_message = ChatMessage(
                session_id=session.id,
                message_type='user',
                content=query_text,
                original_language=detected_language,
                input_type='voice',
                audio_file_path=audio_path,
                location=location,
                weather_data=weather_info
            )
            db.session.add(user_message)

            ai_message = ChatMessage(
                session_id=session.id,
                message_type='assistant',
                content=final_response,
                original_language=detected_language,
                audio_file_path=audio_response_path if output_audio_id else None,
                location=location,
                weather_data=weather_info
            )
            db.session.add(ai_message)

            session.updated_at = datetime.utcnow()
            db.session.commit()
            logger.info("Conversation saved to database")
            
        except Exception as e:
            logger.error(f"Database save error: {e}")
            db.session.rollback()
            return jsonify({'error': 'Failed to save conversation'}), 500

        # Build comprehensive response
        response_data = {
            'session_id': session.id,
            'recognized_text': query_text,
            'transcription': query_text,
            'response_text': final_response,
            'response': final_response,
            'ai_response': final_response,
            'detected_language': detected_language,
            'response_language': detected_language,
            'translation_success': translation_success,
            'location': location,
            'weather': weather_info,
            'status': 'success'
        }

        # Add original English response if translation occurred
        if detected_language != 'en' and translation_success:
            response_data.update({
                'original_response': ai_response,
                'original_english_response': ai_response,
                'translated_response': final_response,
                'translation_language': detected_language
            })

        # Add audio URLs if available
        if output_audio_id:
            response_data.update({
                'output_audio_id': output_audio_id,
                'audio_file_id': output_audio_id,
                'audio_url': f'/api/audio/download/{output_audio_id}',
                'audio_download_url': f'/api/audio/download/{output_audio_id}',
                'audio_stream_url': f'/api/audio/stream/{output_audio_id}'
            })

        logger.info(f"VOICE QUERY COMPLETE - Language: {detected_language}, Translation: {translation_success}, Audio: {output_audio_id}")
        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Unexpected voice query error: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except:
            pass
        
        return jsonify({
            'error': 'Failed to process voice query',
            'details': str(e) if current_app.debug else 'Internal server error',
            'status': 'error'
        }), 500

# Add OPTIONS handler for CORS preflight requests
@audio_bp.route('/download/<int:audio_id>', methods=['OPTIONS'])
@audio_bp.route('/stream/<int:audio_id>', methods=['OPTIONS'])
def handle_preflight(audio_id=None):
    """Handle CORS preflight requests"""
    response = jsonify({'status': 'ok'})
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    return response