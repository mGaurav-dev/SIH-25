import requests
import logging
from config import Config

class WeatherService:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = Config.WEATHER_BASE_URL
    
    def get_weather(self, lat, lon):
        """Get current weather for given coordinates"""
        try:
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'units': 'metric'
            }
            
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            
            data = response.json()
            
            weather_info = {
                'temperature': data['main']['temp'],
                'humidity': data['main']['humidity'],
                'pressure': data['main']['pressure'],
                'description': data['weather'][0]['description'],
                'main': data['weather'][0]['main'],
                'wind_speed': data['wind']['speed'],
                'location': data['name']
            }
            
            return weather_info
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Weather API request failed: {e}")
            return None
        except KeyError as e:
            logging.error(f"Weather data parsing failed: {e}")
            return None