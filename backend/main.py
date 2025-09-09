import streamlit as st
import logging
import tempfile
import os
from services.translation_service import TranslationService
from services.location_service import LocationService
from services.weather_service import WeatherService
from services.llm_service import AgriculturalLLMService
from services.speech_service import SpeechService
from backend.config import Config
import time

# Configure logging
logging.basicConfig(level=logging.INFO)

try:
    import cgi
except ImportError:
    # For Python 3.13 compatibility
    import sys
    try:
        import legacy_cgi as cgi
        sys.modules['cgi'] = cgi
    except ImportError:
        pass

class EnhancedAgriculturalChatbot:
    def __init__(self):
        self.translation_service = TranslationService()
        self.location_service = LocationService(Config.WEATHER_API_KEY)
        self.weather_service = WeatherService(Config.WEATHER_API_KEY)
        self.speech_service = SpeechService()
        
        # Use Gemini for LLM
        if Config.GOOGLE_API_KEY:
            self.llm_service = AgriculturalLLMService(Config.GOOGLE_API_KEY)
        else:
            st.error("Google API key required for Gemini")
            st.stop()
    
    def process_query(self, query, location, input_language=None):
        """Main processing pipeline for any agricultural query"""
        try:
            # Step 1: Detect original language if not provided
            if not input_language:
                st.write("🔍 Detecting language...")
                original_language = self.translation_service.detect_language(query)
            else:
                original_language = input_language
                
            language_name = self.translation_service.get_language_name(original_language)
            st.write(f"Language: {language_name} ({original_language})")
            
            # Step 2: Translate query to English if needed
            if original_language != 'en':
                st.write("🔄 Translating query to English...")
                english_query = self.translation_service.translate_to_english(query)
                st.write(f"English query: {english_query}")
            else:
                english_query = query
                st.write("Query is already in English")
            
            # Step 3: Get coordinates from location
            st.write("📍 Getting location coordinates...")
            lat, lon = self.location_service.get_coordinates(location)
            if not lat or not lon:
                error_msg = "Sorry, I couldn't find the location. Please provide a valid location."
                if original_language != 'en':
                    error_msg = self.translation_service.translate_from_english(error_msg, original_language)
                return error_msg, original_language
            st.write(f"Coordinates: {lat:.4f}, {lon:.4f}")
            
            # Step 4: Get weather information
            st.write("🌤️ Fetching weather data...")
            weather_info = self.weather_service.get_weather(lat, lon)
            if weather_info:
                st.write(f"Current weather: {weather_info['description']}, {weather_info['temperature']}°C")
            
            # Step 5: Generate LLM response
            st.write("🤖 Generating agricultural advice...")
            response = self.llm_service.generate_response(english_query, location, weather_info)
            
            # Step 6: Translate response back to original language if needed
            if original_language != 'en':
                st.write(f"🔄 Translating response back to {language_name}...")
                response = self.translation_service.translate_from_english(response, original_language)
            else:
                st.write("Response is already in English")
            
            return response, original_language
            
        except Exception as e:
            logging.error(f"Error in processing query: {e}")
            error_msg = f"An error occurred while processing your query: {str(e)}"
            
            # Try to translate error message to original language
            try:
                if 'original_language' in locals() and original_language != 'en':
                    error_msg = self.translation_service.translate_from_english(error_msg, original_language)
                    return error_msg, original_language
            except:
                pass
                
            return error_msg, 'en'
    
    def process_speech_input(self, location, selected_language='auto'):
        """Process speech input and return response"""
        try:
            # Convert language code for speech recognition
            if selected_language != 'auto':
                speech_lang = self.speech_service.get_language_code_for_speech(selected_language)
            else:
                speech_lang = 'auto'
            
            # Get speech input
            speech_text = self.speech_service.speech_to_text(language=speech_lang, duration=5)
            
            if speech_text:
                st.success(f"🎤 Recognized: {speech_text}")
                
                # Process the recognized text
                response, response_language = self.process_query(
                    speech_text, location, 
                    input_language=selected_language if selected_language != 'auto' else None
                )
                
                return speech_text, response, response_language
            else:
                return None, "Sorry, I couldn't understand your speech. Please try again.", 'en'
                
        except Exception as e:
            logging.error(f"Speech processing error: {e}")
            return None, f"Speech processing failed: {str(e)}", 'en'

def create_audio_player_with_controls(audio_file_path):
    """Create an audio player with stop controls"""
    if audio_file_path and os.path.exists(audio_file_path):
        # Read the audio file and encode it
        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()
        
        # Create audio player with controls
        st.audio(audio_bytes, format='audio/mp3', start_time=0)
        
        # Add stop button
        col1, col2, col3 = st.columns([1, 1, 2])
        with col1:
            if st.button("⏹️ Stop Audio"):
                st.success("Audio stopped!")
                st.experimental_rerun()
        
        with col2:
            if st.button("🔄 Replay"):
                st.experimental_rerun()

def main():
    st.set_page_config(
        page_title="Agricultural AI Assistant with Speech", 
        page_icon="🌾",
        layout="wide"
    )
    
    st.title("🌾 Agricultural AI Assistant with Speech Support")
    st.markdown("**🎤 NEW: Voice Input & Audio Response** | Get personalized farming advice in your native language!")
    st.markdown("**Supports:** Hindi, English, Marathi, Gujarati, Tamil, Telugu, Bengali, Kannada, Punjabi, and more!")
    
    # Check API keys
    if not Config.GOOGLE_API_KEY:
        st.error("⚠️ Google API key required. Please add GOOGLE_API_KEY to your .env file.")
        st.stop()
    
    if not Config.WEATHER_API_KEY:
        st.error("⚠️ Weather API key not found. Please get a free key from OpenWeatherMap and add it to your .env file.")
        st.stop()
    
    st.success("✅ Using Google Gemini AI with Speech Support")
    
    # Initialize session state for audio control
    if 'audio_playing' not in st.session_state:
        st.session_state.audio_playing = False
    if 'current_audio_file' not in st.session_state:
        st.session_state.current_audio_file = None
    
    # Initialize chatbot
    if 'chatbot' not in st.session_state:
        try:
            st.session_state.chatbot = EnhancedAgriculturalChatbot()
        except Exception as e:
            st.error(f"Failed to initialize chatbot: {e}")
            st.stop()
    
    if 'conversation_history' not in st.session_state:
        st.session_state.conversation_history = []
    
    # Sidebar for language selection
    with st.sidebar:
        st.header("🎯 Settings")
        
        preferred_language = st.selectbox(
            "Preferred Language:",
            options=['auto', 'en', 'hi', 'mr', 'gu', 'pa', 'ta', 'te', 'kn', 'bn', 'ur', 'ml'],
            format_func=lambda x: {
                'auto': '🔄 Auto-detect',
                'en': '🇺🇸 English',
                'hi': '🇮🇳 हिन्दी (Hindi)',
                'mr': '🇮🇳 मराठी (Marathi)',
                'gu': '🇮🇳 ગુજરાતી (Gujarati)',
                'pa': '🇮🇳 ਪੰਜਾਬੀ (Punjabi)',
                'ta': '🇮🇳 தமிழ் (Tamil)',
                'te': '🇮🇳 తెలుగు (Telugu)',
                'kn': '🇮🇳 ಕನ್ನಡ (Kannada)',
                'bn': '🇮🇳 বাংলা (Bengali)',
                'ur': '🇵🇰 اردو (Urdu)',
                'ml': '🇮🇳 മലയാളം (Malayalam)'
            }.get(x, x)
        )
        
        st.markdown("### 📝 Instructions")
        st.info("1. Enter your location\n2. Type your question OR use voice input\n3. Get advice in text and audio")
        
        # Audio controls
        st.markdown("### 🔊 Audio Settings")
        enable_audio_response = st.checkbox("Enable Audio Response", value=True)
        audio_speed = st.select_slider("Audio Speed", options=['slow', 'normal'], value='normal')
        
        # Speech recognition settings
        st.markdown("### 🎤 Speech Settings")
        recording_duration = st.slider("Recording Duration (seconds)", min_value=3, max_value=10, value=5)
        
        # System status in sidebar
        st.markdown("### 📊 Quick Status")
        try:
            import speech_recognition as sr
            st.success("🎤 Speech Recognition: Ready")
        except ImportError:
            st.error("🎤 Speech Recognition: Not Available")
        
        try:
            import pygame
            st.success("🔊 Audio Playback: Ready")
        except ImportError:
            st.error("🔊 Audio Playback: Not Available")
    
    # Main interface
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Location input
        location = st.text_input(
            "📍 Your location:",
            placeholder="e.g., Mumbai, Maharashtra, India",
            help="Enter your city, state, and country for accurate weather and regional advice"
        )
        
        # Input method selection
        input_method = st.radio(
            "Choose input method:",
            ["💬 Text Input", "🎤 Voice Input"],
            horizontal=True
        )
        
        if input_method == "💬 Text Input":
            # Text input
            query = st.text_area(
                "Ask your agricultural question:",
                placeholder="e.g., What is the best fertilizer for tomatoes? / टमाटर के लिए सबसे अच्छा उर्वरक कौन सा है?",
                height=100,
                help="Ask any farming question in your preferred language"
            )
            
            if st.button("🚀 Get Advice", type="primary", use_container_width=True):
                if query and location:
                    with st.spinner("🔄 Processing your query..."):
                        response, response_lang = st.session_state.chatbot.process_query(
                            query, location, 
                            input_language=preferred_language if preferred_language != 'auto' else None
                        )
                        
                        # Display response
                        st.success("✅ Response Generated!")
                        st.markdown("### 📋 Agricultural Advice:")
                        st.markdown(response)
                        
                        # Audio response with controls
                        if enable_audio_response:
                            st.markdown("### 🔊 Audio Response:")
                            with st.spinner("🎵 Generating audio..."):
                                tts_lang = st.session_state.chatbot.speech_service.get_tts_language_code(response_lang)
                                is_slow = (audio_speed == 'slow')
                                
                                try:
                                    # Generate audio but don't auto-play
                                    from gtts import gTTS
                                    import tempfile
                                    
                                    tts = gTTS(text=response, lang=tts_lang, slow=is_slow)
                                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                                    tts.save(temp_file.name)
                                    temp_file.close()
                                    
                                    # Store audio file path
                                    st.session_state.current_audio_file = temp_file.name
                                    
                                    # Create audio player with controls
                                    with open(temp_file.name, "rb") as f:
                                        audio_bytes = f.read()
                                    
                                    st.audio(audio_bytes, format='audio/mp3')
                                    
                                    # Audio control buttons
                                    col_a, col_b = st.columns(2)
                                    with col_a:
                                        if st.button("🔄 Replay Audio"):
                                            st.experimental_rerun()
                                    with col_b:
                                        if st.button("💾 Download Audio"):
                                            st.download_button(
                                                label="Download MP3",
                                                data=audio_bytes,
                                                file_name=f"response_{int(time.time())}.mp3",
                                                mime="audio/mp3"
                                            )
                                    
                                except Exception as e:
                                    st.error(f"Audio generation failed: {e}")
                                    st.info("Try using text-to-speech offline mode or check your internet connection")
                        
                        # Save to conversation history
                        st.session_state.conversation_history.append({
                            'query': query,
                            'response': response,
                            'location': location,
                            'language': response_lang,
                            'timestamp': time.time()
                        })
                else:
                    st.error("❌ Please provide both query and location.")
        
        else:  # Voice Input
            st.markdown("### 🎤 Voice Input")
            st.info(f"Click the button below and speak your question clearly for {recording_duration} seconds!")
            
            # Add speech recognition diagnostics
            try:
                import speech_recognition as sr
                import pyaudio
                
                # Test microphone availability
                try:
                    # List available microphones
                    mic_list = sr.Microphone.list_microphone_names()
                    if mic_list:
                        st.info(f"🎤 Found {len(mic_list)} microphone(s). Using default microphone.")
                    else:
                        st.warning("⚠️ No microphones detected. Please check your audio devices.")
                except Exception as e:
                    st.warning(f"Microphone check failed: {e}")
                
            except ImportError as e:
                st.error(f"❌ Required packages missing: {e}")
                st.error("Please install: pip install SpeechRecognition pyaudio")
                st.stop()
            
            if st.button("🎙️ Start Voice Recording", type="primary", use_container_width=True):
                if location:
                    try:
                        with st.spinner(f"🎤 Listening for {recording_duration} seconds... Please speak your question now!"):
                            speech_text, response, response_lang = st.session_state.chatbot.process_speech_input(
                                location, 
                                selected_language=preferred_language
                            )
                            
                            if speech_text:
                                # Display recognized speech
                                st.success("✅ Speech Recognition Complete!")
                                st.markdown(f"**🎤 You said:** {speech_text}")
                                
                                # Display response
                                st.markdown("### 📋 Agricultural Advice:")
                                st.markdown(response)
                                
                                # Audio response with controls
                                if enable_audio_response and response_lang:
                                    st.markdown("### 🔊 Audio Response:")
                                    with st.spinner("🎵 Generating audio..."):
                                        tts_lang = st.session_state.chatbot.speech_service.get_tts_language_code(response_lang)
                                        is_slow = (audio_speed == 'slow')
                                        
                                        try:
                                            from gtts import gTTS
                                            import tempfile
                                            
                                            tts = gTTS(text=response, lang=tts_lang, slow=is_slow)
                                            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                                            tts.save(temp_file.name)
                                            temp_file.close()
                                            
                                            with open(temp_file.name, "rb") as f:
                                                audio_bytes = f.read()
                                            
                                            st.audio(audio_bytes, format='audio/mp3')
                                            
                                        except Exception as e:
                                            st.error(f"Audio generation failed: {e}")
                                
                                # Save to conversation history
                                st.session_state.conversation_history.append({
                                    'query': speech_text,
                                    'response': response,
                                    'location': location,
                                    'language': response_lang,
                                    'timestamp': time.time(),
                                    'input_type': 'voice'
                                })
                            else:
                                st.error("❌ Could not recognize speech. Please try again.")
                                st.info("💡 Tips:\n- Speak clearly and loudly\n- Reduce background noise\n- Check microphone permissions\n- Try speaking in English first")
                    
                    except Exception as e:
                        st.error(f"Speech recognition error: {e}")
                        st.info("Troubleshooting:\n1. Check microphone permissions\n2. Ensure microphone is working\n3. Try refreshing the page\n4. Check internet connection")
                else:
                    st.error("❌ Please enter your location first.")
    
    with col2:
        st.markdown("### 📚 Recent Conversations")
        
        if st.session_state.conversation_history:
            # Display last 3 conversations
            for i, conv in enumerate(reversed(st.session_state.conversation_history[-3:])):
                with st.expander(f"💬 Query {len(st.session_state.conversation_history) - i}"):
                    st.markdown(f"**Q:** {conv['query']}")
                    st.markdown(f"**Location:** {conv['location']}")
                    st.markdown(f"**Language:** {conv['language']}")
                    if 'input_type' in conv:
                        st.markdown(f"**Input:** {conv['input_type']}")
                    st.markdown(f"**A:** {conv['response'][:200]}...")
        else:
            st.info("No conversations yet. Start by asking a question!")
        
        # Clear history button
        if st.button("🗑️ Clear History"):
            st.session_state.conversation_history = []
            st.success("History cleared!")
    
    # Testing and diagnostics section
    with st.expander("🧪 System Diagnostics & Testing"):
        st.markdown("### Test System Components")
        
        # Enhanced speech recognition test
        if st.button("Test Speech Recognition"):
            st.info("Testing speech recognition capabilities...")
            try:
                import speech_recognition as sr
                import pyaudio
                
                r = sr.Recognizer()
                
                # Test microphone list
                try:
                    mics = sr.Microphone.list_microphone_names()
                    st.write(f"Available microphones: {len(mics)}")
                    for i, mic in enumerate(mics[:3]):  # Show first 3
                        st.write(f"  {i}: {mic}")
                except Exception as e:
                    st.error(f"Microphone enumeration failed: {e}")
                
                # Test microphone access
                try:
                    with sr.Microphone() as source:
                        r.adjust_for_ambient_noise(source, duration=1)
                    st.success("✅ Microphone access: Available")
                    st.success("✅ Speech recognition: Ready")
                except Exception as e:
                    st.error(f"❌ Microphone test failed: {e}")
                    st.error("Possible fixes:\n- Check microphone permissions\n- Restart browser\n- Try different microphone")
                    
            except ImportError as e:
                st.error(f"❌ Required packages missing: {e}")
                st.error("Install with: pip install SpeechRecognition pyaudio")
        
        # Test text-to-speech
        if st.button("Test Text-to-Speech"):
            test_text = "This is a test of the text-to-speech system."
            st.info("Testing text-to-speech...")
            try:
                from gtts import gTTS
                import tempfile
                
                tts = gTTS(text=test_text, lang='en', slow=False)
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                tts.save(temp_file.name)
                temp_file.close()
                
                with open(temp_file.name, "rb") as f:
                    audio_bytes = f.read()
                
                st.audio(audio_bytes, format='audio/mp3')
                st.success("✅ Text-to-speech: Working")
                
                # Clean up
                try:
                    os.unlink(temp_file.name)
                except:
                    pass
                    
            except Exception as e:
                st.error(f"❌ Text-to-speech test failed: {e}")
        
        # Test translation
        if st.button("Test Translation"):
            test_texts = {
                "English": "How to grow rice?",
                "Hindi": "धान कैसे उगाएं?",
                "Marathi": "भात कसे पिकवावे?"
            }
            
            for lang, text in test_texts.items():
                try:
                    detected = st.session_state.chatbot.translation_service.detect_language(text)
                    translated = st.session_state.chatbot.translation_service.translate_to_english(text)
                    st.write(f"**{lang}**: {text} → Detected: {detected} → English: {translated}")
                except Exception as e:
                    st.error(f"Translation test failed for {lang}: {e}")
        
        # Test LLM
        if st.button("Test AI Response"):
            test_query = "What is the best season for planting wheat?"
            test_location = "Punjab, India"
            test_weather = {"temperature": 20, "description": "Clear sky", "humidity": 60}
            
            try:
                response = st.session_state.chatbot.llm_service.generate_response(
                    test_query, test_location, test_weather
                )
                st.success("✅ AI Response: Working")
                st.write(f"Sample response: {response[:200]}...")
            except Exception as e:
                st.error(f"❌ AI Response test failed: {e}")
        
        # Enhanced system status
        st.markdown("### 📊 Detailed System Status")
        
        status_data = {}
        
        # Check each component
        try:
            import speech_recognition as sr
            status_data["SpeechRecognition"] = "✅ Installed"
        except ImportError:
            status_data["SpeechRecognition"] = "❌ Missing"
        
        try:
            import pyaudio
            status_data["PyAudio"] = "✅ Installed"
        except ImportError:
            status_data["PyAudio"] = "❌ Missing"
        
        try:
            import pygame
            status_data["Pygame"] = "✅ Installed"
        except ImportError:
            status_data["Pygame"] = "❌ Missing"
        
        try:
            from gtts import gTTS
            status_data["gTTS"] = "✅ Installed"
        except ImportError:
            status_data["gTTS"] = "❌ Missing"
        
        for component, status in status_data.items():
            st.write(f"**{component}**: {status}")

if __name__ == "__main__":
    main()