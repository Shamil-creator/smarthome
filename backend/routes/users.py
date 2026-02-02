from flask import Blueprint, jsonify, request, g
from database import db, User
from auth import require_auth, require_admin, optional_auth, get_telegram_user_from_request

users_bp = Blueprint('users', __name__)


@users_bp.route('/user/me', methods=['GET'])
@require_auth
def get_current_user():
    """Get current user by Telegram ID from header"""
    # #region agent log
    from auth import _debug_log
    _debug_log("E", "backend/routes/users.py:get_current_user", "user_me_response", {
        "user_id": getattr(g.current_user, "id", None),
        "telegram_id": getattr(g.current_user, "telegram_id", None),
    })
    # #endregion
    return jsonify(g.current_user.to_dict())


@users_bp.route('/users', methods=['GET'])
@require_admin
def get_users():
    """Get all users (admin only)"""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])


@users_bp.route('/users', methods=['POST'])
@optional_auth
def create_user():
    """Create a new user (self-registration or admin can create)"""
    data = request.get_json(silent=True)
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    telegram_id = data.get('telegramId')
    name = data.get('name')
    role = data.get('role', 'installer')
    
    if not telegram_id or not name:
        return jsonify({'error': 'telegramId and name are required'}), 400
    
    # Validate telegram_id is a positive integer
    try:
        telegram_id = int(telegram_id)
        if telegram_id <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid telegramId'}), 400
    
    # Only admins can set role to anything other than installer
    if role != 'installer':
        if not g.current_user or g.current_user.role != 'admin':
            role = 'installer'  # Force installer role for non-admins
    
    # Check if user already exists
    existing = User.query.filter_by(telegram_id=telegram_id).first()
    if existing:
        return jsonify({'error': 'User already exists', 'user': existing.to_dict()}), 409
    
    user = User(telegram_id=telegram_id, name=name, role=role)
    db.session.add(user)
    db.session.commit()
    
    return jsonify(user.to_dict()), 201


@users_bp.route('/users/<int:user_id>', methods=['PUT'])
@require_admin
def update_user(user_id):
    """Update user role (admin only)"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate role if provided
    if 'role' in data:
        if data['role'] not in ['admin', 'installer']:
            return jsonify({'error': 'Invalid role. Must be admin or installer'}), 400
        user.role = data['role']
    
    if 'name' in data:
        if not data['name'] or len(data['name'].strip()) == 0:
            return jsonify({'error': 'Name cannot be empty'}), 400
        user.name = data['name'].strip()
    
    db.session.commit()
    return jsonify(user.to_dict())


@users_bp.route('/users/set-admin', methods=['POST'])
@optional_auth
def set_admin():
    """Set user as admin"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    telegram_id = data.get('telegramId')
    
    if not telegram_id:
        return jsonify({'error': 'telegramId is required'}), 400
    
    # Validate telegram_id
    try:
        telegram_id = int(telegram_id)
        if telegram_id <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid telegramId'}), 400
    
    user = User.query.filter_by(telegram_id=telegram_id).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    user.role = 'admin'
    db.session.commit()
    
    return jsonify(user.to_dict())


@users_bp.route('/users/check-admin', methods=['GET'])
def check_admin():
    """Check if any admin exists - public endpoint for initial setup"""
    admin_exists = User.query.filter_by(role='admin').first() is not None
    return jsonify({'adminExists': admin_exists})
