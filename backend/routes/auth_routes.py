from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from datetime import datetime
import logging

from extensions import db
from models import User

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['login_id', 'email', 'name', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Check if user already exists
        if User.query.filter_by(login_id=data['login_id']).first():
            return jsonify({'error': 'Login ID already exists'}), 409
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already registered'}), 409
        
        # Create new user
        user = User(
            login_id=data['login_id'],
            email=data['email'],
            name=data['name'],
            phone_number=data.get('phone_number'),
            preferred_language=data.get('preferred_language', 'en'),
            location=data.get('location')
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        # Create access token with user ID as string
        access_token = create_access_token(identity=str(user.id))
        
        logger.info(f"User registered successfully: {user.login_id}, ID: {user.id}")
        
        return jsonify({
            'message': 'User registered successfully',
            'access_token': access_token,
            'user': user.to_dict()
        }), 201
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        db.session.rollback()
        return jsonify({'error': 'Registration failed'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()
        
        if not data.get('login_id') or not data.get('password'):
            return jsonify({'error': 'Login ID and password required'}), 400
        
        user = User.query.filter_by(login_id=data['login_id']).first()
        
        if not user or not user.check_password(data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        if not user.is_active:
            return jsonify({'error': 'Account is deactivated'}), 401
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Create access token with user ID as string
        access_token = create_access_token(identity=str(user.id))
        
        logger.info(f"User logged in successfully: {user.login_id}, ID: {user.id}")
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get user profile"""
    try:
        # Get user ID from JWT token
        user_id_str = get_jwt_identity()
        logger.info(f"Getting profile for user ID: {user_id_str}")
        
        # Convert to integer
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid user ID format: {user_id_str}, error: {e}")
            return jsonify({'error': 'Invalid token format'}), 401
        
        # Fetch user from database
        user = User.query.get(user_id)
        
        if not user:
            logger.warning(f"User not found for ID: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        if not user.is_active:
            logger.warning(f"Inactive user attempted profile access: {user_id}")
            return jsonify({'error': 'Account is deactivated'}), 401
        
        logger.info(f"Profile fetched successfully for user: {user.login_id}")
        return jsonify({'user': user.to_dict()}), 200
        
    except Exception as e:
        logger.error(f"Profile fetch error: {e}")
        return jsonify({'error': 'Failed to fetch profile'}), 500

@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Update user profile"""
    try:
        # Get user ID from JWT token
        user_id_str = get_jwt_identity()
        logger.info(f"Updating profile for user ID: {user_id_str}")
        
        # Convert to integer - this was the main bug in your original code
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid user ID format: {user_id_str}, error: {e}")
            return jsonify({'error': 'Invalid token format'}), 401
        
        # Fetch user from database
        user = User.query.get(user_id)
        
        if not user:
            logger.warning(f"User not found for ID: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        if not user.is_active:
            logger.warning(f"Inactive user attempted profile update: {user_id}")
            return jsonify({'error': 'Account is deactivated'}), 401
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Update allowed fields
        updatable_fields = ['name', 'phone_number', 'preferred_language', 'location']
        updated_fields = []
        
        for field in updatable_fields:
            if field in data:
                old_value = getattr(user, field)
                new_value = data[field]
                if old_value != new_value:
                    setattr(user, field, new_value)
                    updated_fields.append(field)
        
        if updated_fields:
            db.session.commit()
            logger.info(f"Profile updated successfully for user: {user.login_id}, fields: {updated_fields}")
        else:
            logger.info(f"No changes made to profile for user: {user.login_id}")
        
        return jsonify({
            'message': 'Profile updated successfully',
            'user': user.to_dict(),
            'updated_fields': updated_fields
        }), 200
        
    except Exception as e:
        logger.error(f"Profile update error: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to update profile'}), 500

@auth_bp.route('/validate-token', methods=['GET'])
@jwt_required()
def validate_token():
    """Validate JWT token and return user info"""
    try:
        user_id_str = get_jwt_identity()
        logger.info(f"Validating token for user ID: {user_id_str}")
        
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid user ID format: {user_id_str}, error: {e}")
            return jsonify({'error': 'Invalid token format'}), 401
        
        user = User.query.get(user_id)
        
        if not user:
            logger.warning(f"User not found for ID: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        if not user.is_active:
            logger.warning(f"Inactive user token validation: {user_id}")
            return jsonify({'error': 'Account is deactivated'}), 401
        
        return jsonify({
            'valid': True,
            'user_id': user.id,
            'login_id': user.login_id
        }), 200
        
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        return jsonify({'error': 'Token validation failed', 'valid': False}), 500