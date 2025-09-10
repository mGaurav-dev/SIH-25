import requests
from geopy.geocoders import Nominatim
import logging

class LocationService:
    def __init__(self, api_key):
        self.api_key = api_key
        self.geocoder = Nominatim(user_agent="agricultural_chatbot", timeout= 10)
        
    def get_coordinates(self, location_name):
        """Get latitude and longitude from location name"""
        try:
            # Using free Nominatim geocoder
            location = self.geocoder.geocode(location_name)
            if location:
                return location.latitude, location.longitude
            else:
                raise Exception(f"Location not found: {location_name}")
        except Exception as e:
            logging.error(f"Geocoding failed: {e}")
            return None, None
    
    def reverse_geocode(self, lat, lon):
        """Get location name from coordinates"""
        try:
            location = self.geocoder.reverse(f"{lat}, {lon}")
            return location.address if location else None
        except Exception as e:
            logging.error(f"Reverse geocoding failed: {e}")
            return None