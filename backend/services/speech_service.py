# services/speech_service.py
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
    Backend-safe speech service:
    - No pygame/streamlit/pyaudio
    - Works with files you upload via Flask
    - STT: uses SpeechRecognition (Google online or Sphinx offline)
    - TTS: uses gTTS and SAVES the mp3 to UPLOAD_FOLDER
    """
    def __init__(self, upload_folder: str):
        self.upload_folder = upload_folder
        os.makedirs(self.upload_folder, exist_ok=True)

        if _SR_AVAILABLE:
            self.recognizer = sr.Recognizer()
            # Reasonable defaults
            self.recognizer.energy_threshold = 300
            self.recognizer.dynamic_energy_threshold = True
        else:
            self.recognizer = None
            logger.warning("SpeechRecognition not available. Install with: pip install SpeechRecognition pocketsphinx")

    # ---------- STT ----------
    def speech_to_text(self, file_path: str, language: str = "en-US") -> str | None:
        """
        Convert an audio file to text.
        Supports wav/flac/aiff (formats SpeechRecognition can read).
        `language` should be like 'en-US', 'hi-IN', etc.
        """
        if not _SR_AVAILABLE or not self.recognizer:
            logger.error("SpeechRecognition not installed/initialized")
            return None

        if not os.path.exists(file_path):
            logger.error(f"Audio file does not exist: {file_path}")
            return None

        try:
            with sr.AudioFile(file_path) as source:
                audio = self.recognizer.record(source)

            # Try Google first (online, free quota)
            try:
                text = self.recognizer.recognize_google(audio, language=language)
                return text
            except sr.UnknownValueError:
                logger.info("Google STT could not understand audio; will try Sphinx if available")
            except sr.RequestError as e:
                logger.warning(f"Google STT request error: {e}; will try Sphinx if available")

            # Fallback to Sphinx (offline)
            try:
                text = self.recognizer.recognize_sphinx(audio)
                return text
            except Exception as e:
                logger.warning(f"Sphinx STT failed: {e}")
                return None

        except Exception as e:
            logger.exception(f"speech_to_text failed: {e}")
            return None

    # ---------- TTS ----------
    def text_to_speech(self, text: str, language: str = "en") -> str | None:
        """
        Convert text to speech and SAVE an mp3 into the upload folder.
        `language` should be a gTTS code like 'en', 'hi', 'mr', etc.
        Returns the ABSOLUTE file path, or None on failure.
        """
        try:
            tts = gTTS(text=text, lang=language, slow=False)
            filename = f"tts_{uuid.uuid4().hex}.mp3"
            out_path = os.path.join(self.upload_folder, filename)
            tts.save(out_path)
            # DO NOT delete the file here. Caller will serve it / clean it later.
            return out_path
        except Exception as e:
            logger.exception(f"text_to_speech failed: {e}")
            return None

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
        return mapping.get(lang_code, 'en-US')

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
        return mapping.get(lang_code, 'en')
