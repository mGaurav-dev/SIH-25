import requests
import json
import os
import uuid

BASE_URL = "http://127.0.0.1:5000/api"
ACCESS_TOKEN = ""
SESSION_ID = None

def print_divider(title):
    print("\n" + "=" * 50)
    print(f"  {title}")
    print("=" * 50)

def test_health_check():
    print_divider("Testing Health Check Endpoint")
    try:
        response = requests.get(f"{BASE_URL}/health")
        response.raise_for_status()
        data = response.json()
        print("Health Check Successful!")
        print(json.dumps(data, indent=2))
        return True
    except Exception as e:
        print(f"Health Check Failed: {e}")
        return False

def test_register_and_login():
    global ACCESS_TOKEN
    print_divider("Testing User Registration and Login")
    
    # Register User
    try:
        register_data = {
            "login_id": f"testuser_{uuid.uuid4().hex[:8]}",
            "email": f"{uuid.uuid4().hex[:8]}@test.com",
            "name": "Test User",
            "password": "Password123"
        }
        response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        response.raise_for_status()
        data = response.json()
        ACCESS_TOKEN = data['access_token']
        print(f"Registration Successful! Access Token: {ACCESS_TOKEN[:10]}...")
    except Exception as e:
        print(f"Registration Failed: {e}")
        return False

    # Login User
    try:
        login_data = {
            "login_id": register_data["login_id"],
            "password": "Password123"
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        response.raise_for_status()
        data = response.json()
        ACCESS_TOKEN = data['access_token']
        print(f"Login Successful! Access Token: {ACCESS_TOKEN[:10]}...")
        return True
    except Exception as e:
        print(f"Login Failed: {e}")
        return False

def test_profile_endpoints():
    print_divider("Testing Profile Endpoints")
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    
    # Get Profile
    try:
        response = requests.get(f"{BASE_URL}/auth/profile", headers=headers)
        response.raise_for_status()
        data = response.json()
        print("Get Profile Successful!")
        print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Get Profile Failed: {e}")
        return False
        
    # Update Profile
    try:
        update_data = {"location": "Mumbai", "preferred_language": "en"}
        response = requests.put(f"{BASE_URL}/auth/profile", headers=headers, json=update_data)
        response.raise_for_status()
        data = response.json()
        print("Update Profile Successful!")
        print(json.dumps(data, indent=2))
        return True
    except Exception as e:
        print(f"Update Profile Failed: {e}")
        return False

def test_chat_endpoints():
    global SESSION_ID
    print_divider("Testing Chat Endpoints")
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}
    
    # Create Chat Session
    try:
        response = requests.post(f"{BASE_URL}/chat/sessions", headers=headers, json={"title": "Test Chat"})
        response.raise_for_status()
        data = response.json()
        SESSION_ID = data['session']['id']
        print(f"Chat Session Created! ID: {SESSION_ID}")
    except Exception as e:
        print(f"Create Chat Session Failed: {e}")
        return False

    # Process Query
    try:
        query_data = {
            "query": "What are the best crops for the monsoon season in Mumbai?",
            "location": "Mumbai",
            "session_id": SESSION_ID
        }
        response = requests.post(f"{BASE_URL}/chat/query", headers=headers, json=query_data)
        response.raise_for_status()
        data = response.json()
        print("Chat Query Processed Successfully!")
        print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Process Query Failed: {e}")
        return False

    # Get Chat Messages
    try:
        response = requests.get(f"{BASE_URL}/chat/sessions/{SESSION_ID}/messages", headers=headers)
        response.raise_for_status()
        data = response.json()
        print(f"Messages for session {SESSION_ID} fetched successfully!")
        print(json.dumps(data, indent=2))
        return True
    except Exception as e:
        print(f"Get Chat Messages Failed: {e}")
        return False

def test_audio_endpoints():
    print_divider("Testing Audio Endpoints")
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    
    # Create a dummy audio file for testing
    dummy_file_path = "dummy_audio.wav"
    try:
        from pydub import AudioSegment
        AudioSegment.silent(duration=1000).export(dummy_file_path, format="wav")
        print("Dummy audio file created.")
    except ImportError:
        print("pydub not installed. Skipping voice query test.")
        return True # Continue with other tests

    # Upload Audio
    try:
        with open(dummy_file_path, 'rb') as f:
            files = {'audio': f}
            data = {'language': 'en-US'}
            response = requests.post(f"{BASE_URL}/audio/upload", headers=headers, files=files, data=data)
            response.raise_for_status()
            data = response.json()
            print("Audio Upload Successful!")
            print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Audio Upload Failed: {e}")
        return False

    # Process Voice Query
    try:
        with open(dummy_file_path, 'rb') as f:
            files = {'audio': f}
            data = {'location': 'Mumbai', 'session_id': SESSION_ID}
            response = requests.post(f"{BASE_URL}/audio/voice-query", headers=headers, files=files, data=data)
            response.raise_for_status()
            data = response.json()
            print("Voice Query Processed Successfully!")
            print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Voice Query Failed: {e}")
        return False
    finally:
        if os.path.exists(dummy_file_path):
            os.remove(dummy_file_path)

    # Generate Audio from Text
    try:
        headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}
        response = requests.post(f"{BASE_URL}/audio/generate", headers=headers, json={"text": "Hello, how can I help you today?"})
        response.raise_for_status()
        data = response.json()
        audio_id = data['audio_file_id']
        download_url = f"{BASE_URL}{data['download_url']}"
        print(f"Audio Generation Successful! Download URL: {download_url}")
        
        # Test Download
        download_response = requests.get(download_url, headers=headers)
        download_response.raise_for_status()
        with open(f"downloaded_audio_{audio_id}.mp3", "wb") as f:
            f.write(download_response.content)
        print(f"Audio Download Successful! Saved as downloaded_audio_{audio_id}.mp3")
        return True
    except Exception as e:
        print(f"Audio Generation or Download Failed: {e}")
        return False

def main():
    if not test_health_check():
        print("Tests aborted due to health check failure.")
        return
        
    if not test_register_and_login():
        return
        
    if not test_profile_endpoints():
        return
        
    if not test_chat_endpoints():
        return
        
    if not test_audio_endpoints():
        return
        
    print("\n\nAll API tests completed successfully! 🎉")

if __name__ == "__main__":
    main()