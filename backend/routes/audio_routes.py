import os
import uuid
import time
from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from datetime import datetime
import logging

from backend.extensions import db
from backend.models import User, ChatSession, ChatMessage, AudioFile
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
    """Download audio file"""
    try:
        audio_file = AudioFile.query.get(audio_id)
        
        if not audio_file:
            return jsonify({'error': 'Audio file not found'}), 404
        
        if not os.path.exists(audio_file.file_path):
            return jsonify({'error': 'Audio file not found on disk'}), 404
        
        return send_file(
            audio_file.file_path,
            as_attachment=True,
            download_name=audio_file.original_filename,
            mimetype='audio/mpeg'
        )
        
    except Exception as e:
        logger.error(f"Audio download error: {e}")
        return jsonify({'error': 'Failed to download audio'}), 500

@audio_bp.route('/voice-query', methods=['POST'])
@jwt_required()
def process_voice_query():
    """Process voice input and generate audio response"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check for audio file upload
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        location = request.form.get('location', user.location)
        session_id = request.form.get('session_id')
        language = request.form.get('language', user.preferred_language)
        
        if not location:
            return jsonify({'error': 'Location is required'}), 400
        
        # Initialize services
        speech_service = SpeechService(current_app.config['UPLOAD_FOLDER'])
        translation_service = TranslationService()
        weather_service = WeatherService(current_app.config.get('WEATHER_API_KEY', ''))
        location_service = LocationService(current_app.config.get('WEATHER_API_KEY', ''))
        llm_service = AgriculturalLLMService(current_app.config.get('GOOGLE_API_KEY'))
        
        if not llm_service:
            return jsonify({'error': 'AI service not available'}), 503
        
        # Save uploaded audio
        filename = f"voice_{user_id}_{uuid.uuid4().hex}.wav"
        audio_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(audio_path)
        
        # Convert speech to text
        speech_lang = 'en-US' if language == 'en' else f'{language}-IN'
        query_text = speech_service.speech_to_text(audio_path, speech_lang)
        
        if not query_text:
            return jsonify({'error': 'Could not recognize speech'}), 400
        
        # Get or create chat session
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
        
        # Detect and process language
        detected_lang = translation_service.detect_language(query_text)
        english_query = query_text
        if detected_lang != 'en':
            english_query = translation_service.translate_to_english(query_text, detected_lang)
        
        # Get weather and location data
        lat, lon = location_service.get_coordinates(location)
        weather_info = weather_service.get_weather(lat, lon)
        
        # Generate AI response
        ai_response = llm_service.generate_response(english_query, location, weather_info)
        
        # Translate response back to detected language
        if detected_lang != 'en':
            ai_response = translation_service.translate_from_english(ai_response, detected_lang)
        
        # Generate audio response
        tts_lang = detected_lang if detected_lang in ['hi', 'en', 'mr', 'gu', 'ta', 'te', 'kn', 'bn'] else 'en'
        audio_response_path = speech_service.text_to_speech(ai_response, tts_lang)
        
        # Save input audio record
        input_audio = AudioFile(
            filename=filename,
            original_filename=audio_file.filename or 'voice_input.wav',
            file_path=audio_path,
            file_type='input',
            file_size=os.path.getsize(audio_path)
        )
        db.session.add(input_audio)
        
        # Save output audio record
        output_audio = None
        if audio_response_path:
            output_filename = os.path.basename(audio_response_path)
            output_audio = AudioFile(
                filename=output_filename,
                original_filename=f'response_{int(time.time())}.mp3',
                file_path=audio_response_path,
                file_type='output',
                file_size=os.path.getsize(audio_response_path)
            )
            db.session.add(output_audio)
        
        # Save user message
        user_message = ChatMessage(
            session_id=session.id,
            message_type='user',
            content=query_text,
            original_language=detected_lang,
            input_type='voice',
            audio_file_path=audio_path,
            location=location,
            weather_data=weather_info
        )
        db.session.add(user_message)
        
        # Save AI response
        ai_message = ChatMessage(
            session_id=session.id,
            message_type='assistant',
            content=ai_response,
            original_language=detected_lang,
            audio_file_path=audio_response_path,
            location=location,
            weather_data=weather_info
        )
        db.session.add(ai_message)
        
        # Update session
        session.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'session_id': session.id,
            'recognized_text': query_text,
            'response_text': ai_response,
            'language': detected_lang,
            'location': location,
            'weather': weather_info,
            'input_audio_id': input_audio.id,
            'output_audio_id': output_audio.id if output_audio else None,
            'audio_download_url': f'/api/audio/download/{output_audio.id}' if output_audio else None
        }), 200
        
    except Exception as e:
        logger.error(f"Voice query processing error: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to process voice query'}), 500