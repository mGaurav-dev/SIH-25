from deep_translator import GoogleTranslator
from langdetect import detect
import logging
import re

class TranslationService:
    def __init__(self):
        self.supported_languages = {
            'hindi': 'hi',
            'marathi': 'mr', 
            'gujarati': 'gu',
            'punjabi': 'pa',
            'tamil': 'ta',
            'telugu': 'te',
            'kannada': 'kn',
            'bengali': 'bn',
            'english': 'en',
            'urdu': 'ur',
            'odia': 'or',
            'assamese': 'as',
            'malayalam': 'ml',
            'nepali': 'ne',
            'sindhi': 'sd'
        }
        
        # Reverse mapping for language code to name
        self.language_codes = {v: k for k, v in self.supported_languages.items()}
    
    def is_english(self, text):
        """Simple check if text is primarily English"""
        if not text:
            return True
        # Check for ASCII characters
        ascii_count = sum(1 for char in text if ord(char) < 128)
        ascii_ratio = ascii_count / len(text)
        
        # Also check for common English words
        english_words = {'the', 'is', 'at', 'which', 'on', 'and', 'a', 'to', 'are', 'as', 'was', 'will', 'what', 'when', 'where', 'how'}
        words = re.findall(r'\b\w+\b', text.lower())
        english_word_count = sum(1 for word in words if word in english_words)
        english_word_ratio = english_word_count / len(words) if words else 0
        
        return ascii_ratio > 0.8 or english_word_ratio > 0.1
    
    def detect_language(self, text):
        """Detect language using langdetect library"""
        try:
            if self.is_english(text):
                return 'en'
            
            detected = detect(text)
            logging.info(f"Detected language: {detected}")
            return detected
        except Exception as e:
            logging.error(f"Language detection failed: {e}")
            return 'en'
    
    def get_language_name(self, lang_code):
        """Get language name from language code"""
        return self.language_codes.get(lang_code, 'unknown')
    
    def translate_to_english(self, text, source_language=None):
        """FIXED: Translate text to English with optional source language parameter"""
        try:
            # Skip translation if already English
            if self.is_english(text):
                return text
            
            # Detect source language if not provided
            if not source_language:
                source_language = self.detect_language(text)
                logging.info(f"Auto-detected source language: {source_language}")
            
            # Skip if source is already English
            if source_language == 'en':
                return text
            
            # Use Google Translator
            translator = GoogleTranslator(source=source_language, target='en')
            result = translator.translate(text)
            logging.info(f"Translated '{text[:50]}...' from {source_language} to English: '{result[:50]}...'")
            return result if result else text
            
        except Exception as e:
            logging.error(f"Translation to English failed: {e}")
            return text
    
    def translate_from_english(self, text, target_language_code):
        """Translate from English to target language using language code"""
        try:
            # Skip if target is English
            if target_language_code == 'en':
                return text
            
            # Skip if text is empty
            if not text or not text.strip():
                return text
            
            # Use Google Translator
            translator = GoogleTranslator(source='en', target=target_language_code)
            result = translator.translate(text)
            logging.info(f"Translated '{text[:50]}...' from English to {target_language_code}: '{result[:50]}...'")
            return result if result else text
            
        except Exception as e:
            logging.error(f"Translation from English to {target_language_code} failed: {e}")
            return text
    
    def translate_text(self, text, source_lang='auto', target_lang='en'):
        """General translation method"""
        try:
            if source_lang == target_lang:
                return text
                
            translator = GoogleTranslator(source=source_lang, target=target_lang)
            result = translator.translate(text)
            logging.info(f"Translated '{text[:50]}...' from {source_lang} to {target_lang}: '{result[:50]}...'")
            return result if result else text
            
        except Exception as e:
            logging.error(f"Translation failed: {e}")
            return text
    
    def batch_translate(self, texts, source_lang='auto', target_lang='en'):
        """Translate multiple texts at once"""
        try:
            if source_lang == target_lang:
                return texts
            
            translator = GoogleTranslator(source=source_lang, target=target_lang)
            results = []
            
            for text in texts:
                if not text or not text.strip():
                    results.append(text)
                    continue
                
                try:
                    result = translator.translate(text)
                    results.append(result if result else text)
                except Exception as e:
                    logging.warning(f"Individual translation failed: {e}")
                    results.append(text)
            
            return results
            
        except Exception as e:
            logging.error(f"Batch translation failed: {e}")
            return texts