# Enhanced services/speech_service.py with better debugging and error handling
import os
import uuid
import logging
from gtts import gTTS

# Optional: use SpeechRecognition for Google/Sphinx recognition
try:
    import speech_recognition as sr
    _SR_AVAILABLE = True
except Exception:
    _SR_AVAILABLE = False

logger = logging.getLogger(__name__)

class SpeechService:
    """
    Backend-safe speech service with enhanced error handling and debugging
    """
    def __init__(self, upload_folder: str):
        self.upload_folder = upload_folder
        os.makedirs(self.upload_folder, exist_ok=True)
        logger.info(f"SpeechService initialized with upload folder: {self.upload_folder}")

        if _SR_AVAILABLE:
            self.recognizer = sr.Recognizer()
            # Reasonable defaults
            self.recognizer.energy_threshold = 300
            self.recognizer.dynamic_energy_threshold = True
            logger.info("SpeechRecognition available and configured")
        else:
            self.recognizer = None
            logger.warning("SpeechRecognition not available. Install with: pip install SpeechRecognition pocketsphinx")

    # ---------- STT ----------
    def speech_to_text(self, file_path: str = None, language: str = "en-US", duration: int = 5) -> str | None:
        """
        Convert an audio file to text, or record from microphone if no file_path.
        Supports wav/flac/aiff (formats SpeechRecognition can read).
        `language` should be like 'en-US', 'hi-IN', etc.
        """
        if not _SR_AVAILABLE or not self.recognizer:
            logger.error("SpeechRecognition not installed/initialized")
            return None

        try:
            logger.info(f"Starting speech-to-text conversion for file: {file_path}, language: {language}")
            
            # If file_path provided, read from file
            if file_path and os.path.exists(file_path):
                logger.info(f"Reading audio from file: {file_path}")
                with sr.AudioFile(file_path) as source:
                    audio = self.recognizer.record(source)
                    logger.info(f"Audio loaded successfully from file")
            else:
                logger.error(f"Audio file not found or not provided: {file_path}")
                return None

            # Handle language parameter
            if language == 'auto':
                language = 'en-US'  # Default fallback
            
            logger.info(f"Attempting speech recognition with language: {language}")
            
            # Try Google first (online, free quota)
            try:
                text = self.recognizer.recognize_google(audio, language=language)
                logger.info(f"Google STT successful: {text}")
                return text
            except sr.UnknownValueError:
                logger.warning("Google STT could not understand audio; will try Sphinx if available")
            except sr.RequestError as e:
                logger.warning(f"Google STT request error: {e}; will try Sphinx if available")

            # Fallback to Sphinx (offline)
            try:
                text = self.recognizer.recognize_sphinx(audio)
                logger.info(f"Sphinx STT successful: {text}")
                return text
            except Exception as e:
                logger.warning(f"Sphinx STT failed: {e}")
                return None

        except Exception as e:
            logger.exception(f"speech_to_text failed: {e}")
            return None

    # ---------- TTS with Enhanced Error Handling ----------
    def text_to_speech(self, text: str, language: str = "en") -> str | None:
        """
        Convert text to speech and SAVE an mp3 into the upload folder.
        Returns the ABSOLUTE file path, or None on failure.
        """
        try:
            logger.info(f"Starting text-to-speech conversion")
            logger.info(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}")
            logger.info(f"Language: {language}")
            logger.info(f"Upload folder: {self.upload_folder}")
            
            if not text or not text.strip():
                logger.error("Text is empty or None")
                return None
            
            if not os.path.exists(self.upload_folder):
                logger.info(f"Creating upload folder: {self.upload_folder}")
                os.makedirs(self.upload_folder, exist_ok=True)
            
            # Validate language code for gTTS
            valid_gtts_languages = [
                'en', 'hi', 'mr', 'gu', 'pa', 'ta', 'te', 'kn', 'bn', 'ur', 'ml', 'or', 'as', 'ne'
            ]
            
            if language not in valid_gtts_languages:
                logger.warning(f"Language {language} not supported by gTTS, falling back to English")
                language = 'en'
            
            # Create gTTS object
            logger.info(f"Creating gTTS object with language: {language}")
            tts = gTTS(text=text, lang=language, slow=False)
            
            # Generate filename
            filename = f"tts_{uuid.uuid4().hex}.mp3"
            out_path = os.path.join(self.upload_folder, filename)
            
            logger.info(f"Saving audio to: {out_path}")
            
            # Save the audio file
            tts.save(out_path)
            
            # Verify file was created and has content
            if os.path.exists(out_path):
                file_size = os.path.getsize(out_path)
                logger.info(f"Audio file created successfully: {out_path}")
                logger.info(f"File size: {file_size} bytes")
                
                if file_size > 0:
                    return out_path
                else:
                    logger.error("Generated audio file is empty")
                    return None
            else:
                logger.error("Audio file was not created")
                return None
                
        except Exception as e:
            logger.exception(f"text_to_speech failed: {e}")
            logger.error(f"Error details - Text length: {len(text) if text else 0}, Language: {language}")
            return None

    # ---------- Language Mapping Methods ----------
    def get_language_code_for_speech(self, lang_code: str) -> str:
        """
        Get language code for speech recognition.
        Maps app language codes to SpeechRecognition format.
        """
        if lang_code == 'auto':
            return 'auto'
        return self.map_sr_language(lang_code)
    
    def get_tts_language_code(self, lang_code: str) -> str:
        """
        Get language code for text-to-speech.
        Maps app language codes to gTTS format.
        """
        mapped = self.map_tts_language(lang_code)
        logger.info(f"Mapped language code {lang_code} -> {mapped}")
        return mapped

    # ---------- Helpers ----------
    @staticmethod
    def map_sr_language(lang_code: str) -> str:
        """
        Map app language like 'en','hi','mr' to SpeechRecognition locale e.g. 'en-US','hi-IN'
        """
        mapping = {
            'en': 'en-US',
            'hi': 'hi-IN',
            'mr': 'mr-IN',
            'gu': 'gu-IN',
            'pa': 'pa-IN',
            'ta': 'ta-IN',
            'te': 'te-IN',
            'kn': 'kn-IN',
            'bn': 'bn-IN',
            'ur': 'ur-PK',
            'ml': 'ml-IN',
            'or': 'or-IN',
            'as': 'as-IN',
            'ne': 'ne-NP',
        }
        result = mapping.get(lang_code, 'en-US')
        logger.debug(f"SR Language mapping: {lang_code} -> {result}")
        return result

    @staticmethod
    def map_tts_language(lang_code: str) -> str:
        """
        Map app language like 'en','hi','mr' to gTTS code (simpler).
        """
        mapping = {
            'en': 'en',
            'hi': 'hi',
            'mr': 'mr',
            'gu': 'gu',
            'pa': 'pa',
            'ta': 'ta',
            'te': 'te',
            'kn': 'kn',
            'bn': 'bn',
            'ur': 'ur',
            'ml': 'ml',
            'ne': 'ne',
        }
        result = mapping.get(lang_code, 'en')
        logger.debug(f"TTS Language mapping: {lang_code} -> {result}")
        return result
    
    # ---------- Utility Methods ----------
    def validate_audio_file(self, file_path: str) -> bool:
        """Validate that an audio file exists and has content"""
        try:
            if not file_path or not os.path.exists(file_path):
                logger.error(f"Audio file does not exist: {file_path}")
                return False
            
            file_size = os.path.getsize(file_path)
            if file_size == 0:
                logger.error(f"Audio file is empty: {file_path}")
                return False
            
            logger.info(f"Audio file validation passed: {file_path} ({file_size} bytes)")
            return True
        except Exception as e:
            logger.error(f"Error validating audio file {file_path}: {e}")
            return False
    
    def cleanup_old_files(self, max_age_hours: int = 24):
        """Clean up old audio files to save disk space"""
        try:
            import time
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            cleaned_count = 0
            for filename in os.listdir(self.upload_folder):
                file_path = os.path.join(self.upload_folder, filename)
                if os.path.isfile(file_path):
                    file_age = current_time - os.path.getmtime(file_path)
                    if file_age > max_age_seconds:
                        os.remove(file_path)
                        cleaned_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} old audio files")
            return cleaned_count
        except Exception as e:
            logger.error(f"Error cleaning up old files: {e}")
            return 0
    
    def get_service_status(self) -> dict:
        """Get status information about the speech service"""
        return {
            'upload_folder': self.upload_folder,
            'upload_folder_exists': os.path.exists(self.upload_folder),
            'speech_recognition_available': _SR_AVAILABLE,
            'gtts_available': True,  # gTTS is always available if imported
            'folder_writable': os.access(self.upload_folder, os.W_OK) if os.path.exists(self.upload_folder) else False
        }