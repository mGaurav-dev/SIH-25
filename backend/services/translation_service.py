from deep_translator import GoogleTranslator
from langdetect import detect
import logging
import re

# Enhanced Translation Service with better Hindi/Indian language support

class TranslationService:
    def __init__(self):
        self.translator = GoogleTranslator()
        # Enhanced language mapping with better Hindi support
        self.language_map = {
            'hi': 'hindi',
            'mr': 'marathi', 
            'gu': 'gujarati',
            'ta': 'tamil',
            'te': 'telugu',
            'kn': 'kannada',
            'bn': 'bengali',
            'pa': 'punjabi',
            'ml': 'malayalam',
            'or': 'odia',
            'as': 'assamese',
            'ne': 'nepali',
            'ur': 'urdu',
            'en': 'english'
        }
        
        # Language codes for Google Translator
        self.google_lang_codes = {
            'hindi': 'hi',
            'marathi': 'mr',
            'gujarati': 'gu',
            'tamil': 'ta',
            'telugu': 'te',
            'kannada': 'kn',
            'bengali': 'bn',
            'punjabi': 'pa',
            'malayalam': 'ml',
            'odia': 'or',
            'assamese': 'as',
            'nepali': 'ne',
            'urdu': 'ur',
            'english': 'en'
        }
        
    def detect_language(self, text: str, max_retries: int = 3) -> str:
        """Enhanced language detection with better Hindi support"""
        if not text or len(text.strip()) < 3:
            return 'en'
        
        # Immediate character-based detection for Indian scripts
        char_based_lang = self._detect_by_characters(text)
        if char_based_lang != 'en':
            logging.info(f"Character-based detection found: {char_based_lang}")
            return char_based_lang
            
        for attempt in range(max_retries):
            try:
                # Try Google Translate detection
                detected = GoogleTranslator().detect(text)
                if detected and len(detected) >= 2:
                    lang_code = detected[:2].lower()
                    if lang_code in self.language_map:
                        logging.info(f"Language detected (attempt {attempt + 1}): {lang_code}")
                        return lang_code
                        
            except Exception as e:
                logging.warning(f"Language detection attempt {attempt + 1} failed: {e}")
                continue
                
        logging.warning("All language detection attempts failed, defaulting to English")
        return 'en'
        
    def _detect_by_characters(self, text: str) -> str:
        """Enhanced character-based language detection with better Hindi support"""
        # Unicode ranges for Indian languages
        char_ranges = {
            'hi': (0x0900, 0x097F),  # Devanagari (Hindi, Marathi, Nepali)
            'ta': (0x0B80, 0x0BFF),  # Tamil
            'te': (0x0C00, 0x0C7F),  # Telugu
            'kn': (0x0C80, 0x0CFF),  # Kannada
            'bn': (0x0980, 0x09FF),  # Bengali
            'gu': (0x0A80, 0x0AFF),  # Gujarati
            'pa': (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
            'ml': (0x0D00, 0x0D7F),  # Malayalam
            'or': (0x0B00, 0x0B7F),  # Odia
        }
        
        char_counts = {lang: 0 for lang in char_ranges}
        total_chars = len(text)
        
        for char in text:
            char_code = ord(char)
            for lang, (start, end) in char_ranges.items():
                if start <= char_code <= end:
                    char_counts[lang] += 1
                    break
        
        # Find language with highest character count
        max_lang = max(char_counts, key=char_counts.get)
        max_count = char_counts[max_lang]
        
        # Require at least 10% of characters to be in the script
        if max_count > 0 and (max_count / total_chars) > 0.1:
            logging.info(f"Character-based detection: {max_lang} ({max_count}/{total_chars} chars)")
            return max_lang
                
        return 'en'
    
    def translate_to_english(self, text: str, source_lang: str, max_retries: int = 3) -> str:
        """Enhanced translation to English with better error handling"""
        if not text or source_lang == 'en':
            return text
        
        logging.info(f"Translating to English: '{text[:100]}...' from {source_lang}")
            
        for attempt in range(max_retries):
            try:
                # Method 1: Direct language code
                if attempt == 0:
                    translated = GoogleTranslator(source=source_lang, target='en').translate(text)
                
                # Method 2: Full language name
                elif attempt == 1:
                    lang_name = self.language_map.get(source_lang, source_lang)
                    translated = GoogleTranslator(source=lang_name, target='english').translate(text)
                
                # Method 3: Auto-detect source
                else:
                    translated = GoogleTranslator(source='auto', target='en').translate(text)
                
                if translated and len(translated.strip()) > 0:
                    logging.info(f"Translation to English successful (attempt {attempt + 1}): '{translated[:100]}...'")
                    return translated.strip()
                    
            except Exception as e:
                logging.error(f"Translation to English attempt {attempt + 1} failed: {e}")
                continue
        
        logging.error(f"All translation attempts to English failed for: {text[:50]}...")
        raise Exception(f"Failed to translate '{text[:30]}...' from {source_lang} to English after {max_retries} attempts")
    
    def translate_from_english(self, text: str, target_lang: str, max_retries: int = 3) -> str:
        """Enhanced translation from English with better Hindi support"""
        if not text or target_lang == 'en':
            return text
        
        original_length = len(text.split())
        logging.info(f"Translating from English to {target_lang}: '{text[:100]}...'")
        
        for attempt in range(max_retries):
            try:
                # Method 1: Direct language code
                if attempt == 0:
                    translated = GoogleTranslator(source='en', target=target_lang).translate(text)
                
                # Method 2: Full language name
                elif attempt == 1:
                    lang_name = self.language_map.get(target_lang, target_lang)
                    translated = GoogleTranslator(source='english', target=lang_name).translate(text)
                
                # Method 3: Try alternative approach for Hindi specifically
                elif attempt == 2 and target_lang == 'hi':
                    # Special handling for Hindi
                    translated = GoogleTranslator(source='en', target='hindi').translate(text)
                
                if self._validate_translation(translated, original_length, target_lang):
                    logging.info(f"Translation from English successful (attempt {attempt + 1}): '{translated[:100]}...'")
                    return translated.strip()
                else:
                    logging.warning(f"Translation validation failed for attempt {attempt + 1}")
                    
            except Exception as e:
                logging.error(f"Translation from English attempt {attempt + 1} failed: {e}")
                continue
        
        logging.error(f"All translation attempts from English failed for: {text[:50]}...")
        raise Exception(f"Failed to translate '{text[:30]}...' from English to {target_lang} after {max_retries} attempts")
    
    def _validate_translation(self, translated_text: str, original_word_count: int, target_lang: str = None) -> bool:
        """Enhanced validation with language-specific checks"""
        if not translated_text or len(translated_text.strip()) < 5:
            return False
        
        # Check if translation is just the original text (failed translation)
        if translated_text.strip() == translated_text.strip():
            # Additional check for script-based languages
            if target_lang in ['hi', 'mr', 'gu', 'ta', 'te', 'kn', 'bn', 'pa', 'ml', 'or']:
                # For Indian languages, check if translation contains appropriate script
                if target_lang == 'hi' and not any(0x0900 <= ord(char) <= 0x097F for char in translated_text):
                    logging.warning("Hindi translation doesn't contain Devanagari script")
                    return False
                elif target_lang == 'ta' and not any(0x0B80 <= ord(char) <= 0x0BFF for char in translated_text):
                    logging.warning("Tamil translation doesn't contain Tamil script")
                    return False
                # Add similar checks for other languages as needed
        
        translated_word_count = len(translated_text.split())
        
        # Allow wider range for Indian languages due to different word structures
        min_ratio = 0.2 if target_lang in ['hi', 'ta', 'te', 'kn', 'bn', 'gu', 'ml'] else 0.3
        max_ratio = 4.0 if target_lang in ['hi', 'ta', 'te', 'kn', 'bn', 'gu', 'ml'] else 3.0
        
        if translated_word_count < original_word_count * min_ratio or translated_word_count > original_word_count * max_ratio:
            logging.warning(f"Translation length suspicious for {target_lang}: original {original_word_count} words, translated {translated_word_count} words")
            return False
            
        return True
    
    def get_language_name(self, lang_code: str) -> str:
        """Get human-readable language name"""
        names = {
            'en': 'English',
            'hi': 'हिंदी (Hindi)',
            'mr': 'मराठी (Marathi)',
            'gu': 'ગુજરાતી (Gujarati)',
            'ta': 'தமிழ் (Tamil)',
            'te': 'తెలుగు (Telugu)',
            'kn': 'ಕನ್ನಡ (Kannada)',
            'bn': 'বাংলা (Bengali)',
            'pa': 'ਪੰਜਾਬੀ (Punjabi)',
            'ml': 'മലയാളം (Malayalam)',
            'or': 'ଓଡ଼ିଆ (Odia)',
            'as': 'অসমীয়া (Assamese)',
            'ne': 'नेपाली (Nepali)',
            'ur': 'اردو (Urdu)'
        }
        return names.get(lang_code, lang_code.upper())
    
    def is_supported_language(self, lang_code: str) -> bool:
        """Check if language is supported"""
        return lang_code in self.language_map
    
    def get_supported_languages(self) -> list:
        """Get list of supported language codes"""
        return list(self.language_map.keys())

# Helper function for testing
def test_translation_service():
    """Test function to verify Hindi translation works"""
    service = TranslationService()
    
    test_cases = [
        ("What is the best fertilizer for wheat?", "en", "hi"),
        ("गेहूं के लिए सबसे अच्छा उर्वरक क्या है?", "hi", "en"),
        ("How do I grow rice?", "en", "hi"),
        ("धान कैसे उगाएं?", "hi", "en")
    ]
    
    print("Testing Enhanced Translation Service...")
    for text, source_lang, target_lang in test_cases:
        try:
            if source_lang == "en":
                result = service.translate_from_english(text, target_lang)
            else:
                result = service.translate_to_english(text, source_lang)
            print(f"✓ {source_lang} -> {target_lang}: '{text}' -> '{result}'")
        except Exception as e:
            print(f"✗ {source_lang} -> {target_lang}: '{text}' -> ERROR: {e}")

if __name__ == "__main__":
    test_translation_service()