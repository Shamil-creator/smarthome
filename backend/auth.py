"""
Authentication and authorization utilities for Telegram WebApp.
Implements secure validation of Telegram WebApp initData.
"""
import hashlib
import hmac
import os
import time
import json
import logging
from functools import wraps
from urllib.parse import parse_qs, unquote
from flask import request, jsonify, g
from database import User

logger = logging.getLogger(__name__)

# Bot token for validating Telegram WebApp data
# MUST be set via environment variable in production
BOT_TOKEN = os.getenv("BOT_TOKEN")


def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == '':
        return default
    try:
        parsed = int(value)
        if parsed < 0:
            raise ValueError()
        return parsed
    except ValueError:
        logger.warning("AUTH: Invalid %s=%r, falling back to %s", name, value, default)
        return default


# Maximum age of initData in seconds (default: 1 day)
MAX_INIT_DATA_AGE = _get_int_env("INIT_DATA_MAX_AGE", 86400)

# Debug log path (NDJSON)
DEBUG_LOG_PATH = "/tmp/debug.log"


def _debug_log(hypothesis_id: str, location: str, message: str, data: dict | None = None) -> None:
    payload = {
        "sessionId": "debug-session",
        "runId": "pre-fix",
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data or {},
        "timestamp": int(time.time() * 1000),
    }
    try:
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass

# Skip validation in development mode (set to "true" to skip)
# Automatically enabled if FLASK_ENV is not "production" and BOT_TOKEN is not set
FLASK_ENV = os.getenv("FLASK_ENV", "development")
_skip_env = os.getenv("SKIP_AUTH_VALIDATION", "").lower()
if _skip_env:
    SKIP_AUTH_VALIDATION = _skip_env == "true"
else:
    # Auto-enable in development if no BOT_TOKEN
    SKIP_AUTH_VALIDATION = FLASK_ENV != "production" and not BOT_TOKEN

# Log authentication mode on startup
if SKIP_AUTH_VALIDATION:
    logger.warning("AUTH: Running with SKIP_AUTH_VALIDATION=true - Telegram signature validation is DISABLED")
else:
    logger.info("AUTH: Telegram signature validation is ENABLED")


def validate_telegram_init_data(init_data: str, bot_token: str = None) -> dict | None:
    """
    Validate Telegram WebApp initData and extract user information.
    
    The validation follows Telegram's official algorithm:
    1. Parse the init data string
    2. Create data-check-string by sorting and joining key=value pairs
    3. Compute HMAC-SHA256 of the data-check-string using secret key
    4. Compare with the provided hash
    
    Args:
        init_data: The initData string from Telegram WebApp
        bot_token: Bot token (uses env var if not provided)
    
    Returns:
        Parsed user data dict if valid, None if invalid
    """
    # #region agent log
    _debug_log("A", "backend/auth.py:validate_telegram_init_data", "enter", {
        "has_init_data": bool(init_data),
        "init_data_len": len(init_data) if init_data else 0,
        "max_age": MAX_INIT_DATA_AGE,
        "has_bot_token": bool(bot_token or BOT_TOKEN),
    })
    # #endregion
    if not init_data:
        # #region agent log
        _debug_log("A", "backend/auth.py:validate_telegram_init_data", "missing_init_data")
        # #endregion
        logger.warning("AUTH: Missing initData")
        return None
    
    token = bot_token or BOT_TOKEN
    if not token:
        # In development without token, allow bypass if SKIP_AUTH_VALIDATION is set
        if SKIP_AUTH_VALIDATION:
            return _parse_init_data_unsafe(init_data)
        return None
    
    try:
        # Parse the init data
        parsed = parse_qs(init_data, keep_blank_values=True)
        
        # Extract hash
        received_hash = parsed.get('hash', [None])[0]
        if not received_hash:
            # #region agent log
            _debug_log("B", "backend/auth.py:validate_telegram_init_data", "missing_hash")
            # #endregion
            logger.warning("AUTH: Missing hash in initData")
            return None
        
        # Check auth_date is not too old
        auth_date_str = parsed.get('auth_date', [None])[0]
        if not auth_date_str:
            # #region agent log
            _debug_log("A", "backend/auth.py:validate_telegram_init_data", "missing_auth_date")
            # #endregion
            logger.warning("AUTH: Missing auth_date in initData")
            return None
        
        try:
            auth_date = int(auth_date_str)
            age_seconds = time.time() - auth_date
            if MAX_INIT_DATA_AGE > 0 and age_seconds > MAX_INIT_DATA_AGE:
                # #region agent log
                _debug_log("A", "backend/auth.py:validate_telegram_init_data", "expired_auth_date", {
                    "age_seconds": int(age_seconds),
                })
                # #endregion
                logger.warning("AUTH: initData expired (age=%ss, max=%ss)", int(age_seconds), MAX_INIT_DATA_AGE)
                return None
        except ValueError:
            # #region agent log
            _debug_log("A", "backend/auth.py:validate_telegram_init_data", "invalid_auth_date")
            # #endregion
            logger.warning("AUTH: Invalid auth_date in initData")
            return None
        
        # Build data-check-string (all params except hash, sorted alphabetically)
        data_check_items = []
        for key, values in sorted(parsed.items()):
            if key != 'hash':
                # Values are lists, take first item
                value = values[0] if values else ''
                data_check_items.append(f"{key}={value}")
        
        data_check_string = '\n'.join(data_check_items)
        
        # Compute secret key: HMAC-SHA256 of bot token with "WebAppData" as key
        secret_key = hmac.new(
            b"WebAppData",
            token.encode(),
            hashlib.sha256
        ).digest()
        
        # Compute hash of data-check-string
        computed_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(computed_hash, received_hash):
            # #region agent log
            _debug_log("B", "backend/auth.py:validate_telegram_init_data", "invalid_signature")
            # #endregion
            logger.warning("AUTH: Invalid initData signature")
            return None
        
        # Parse user data
        user_str = parsed.get('user', [None])[0]
        if not user_str:
            # #region agent log
            _debug_log("A", "backend/auth.py:validate_telegram_init_data", "missing_user")
            # #endregion
            logger.warning("AUTH: Missing user in initData")
            return None
        
        user_data = json.loads(unquote(user_str))
        # #region agent log
        _debug_log("A", "backend/auth.py:validate_telegram_init_data", "validated_ok")
        # #endregion
        return {
            'user': user_data,
            'auth_date': auth_date,
            'query_id': parsed.get('query_id', [None])[0],
            'chat_type': parsed.get('chat_type', [None])[0],
            'chat_instance': parsed.get('chat_instance', [None])[0],
        }
        
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        # #region agent log
        _debug_log("A", "backend/auth.py:validate_telegram_init_data", "parse_error")
        # #endregion
        logger.warning("AUTH: Failed to parse initData")
        return None


def _parse_init_data_unsafe(init_data: str) -> dict | None:
    """
    Parse init data without validation (ONLY for development).
    This is unsafe and should never be used in production!
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        user_str = parsed.get('user', [None])[0]
        if not user_str:
            return None
        user_data = json.loads(unquote(user_str))
        return {
            'user': user_data,
            'auth_date': int(parsed.get('auth_date', ['0'])[0]),
            'query_id': parsed.get('query_id', [None])[0],
            'chat_type': parsed.get('chat_type', [None])[0],
            'chat_instance': parsed.get('chat_instance', [None])[0],
        }
    except Exception:
        return None


def get_telegram_user_from_request() -> tuple[dict | None, User | None]:
    """
    Extract and validate Telegram user from request.
    
    Checks for initData in X-Telegram-Init-Data header first,
    falls back to X-Telegram-User-Id for backward compatibility.
    
    Returns:
        Tuple of (telegram_user_data, db_user)
    """
    # Try new secure method first (X-Telegram-Init-Data with signature)
    init_data = request.headers.get('X-Telegram-Init-Data')
    # #region agent log
    _debug_log("C", "backend/auth.py:get_telegram_user_from_request", "headers_received", {
        "has_init_data_header": bool(init_data),
        "has_user_id_header": bool(request.headers.get('X-Telegram-User-Id')),
        "path": request.path,
        "method": request.method,
    })
    # #endregion
    if init_data:
        validated = validate_telegram_init_data(init_data)
        if validated and validated.get('user'):
            telegram_user = validated['user']
            telegram_id = telegram_user.get('id')
            if telegram_id:
                db_user = User.query.filter_by(telegram_id=telegram_id).first()
                return telegram_user, db_user
    
    # Fallback to X-Telegram-User-Id header
    # This is used in development or when SKIP_AUTH_VALIDATION is enabled
    telegram_id_header = request.headers.get('X-Telegram-User-Id')
    if telegram_id_header:
        # In production without SKIP_AUTH_VALIDATION, reject this method
        if not SKIP_AUTH_VALIDATION:
            return None, None
        
        try:
            telegram_id = int(telegram_id_header)
            if telegram_id > 0:
                db_user = User.query.filter_by(telegram_id=telegram_id).first()
                if db_user:
                    return {'id': telegram_id, 'first_name': db_user.name}, db_user
        except (ValueError, TypeError):
            pass
    
    return None, None


def require_auth(f):
    """
    Decorator that requires valid Telegram authentication.
    Sets g.telegram_user and g.current_user if authentication succeeds.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        telegram_user, db_user = get_telegram_user_from_request()
        
        if not telegram_user:
            # #region agent log
            _debug_log("C", "backend/auth.py:require_auth", "auth_failed_no_telegram_user", {
                "path": request.path,
                "method": request.method,
            })
            # #endregion
            return jsonify({'error': 'Authentication required'}), 401
        
        if not db_user:
            # #region agent log
            _debug_log("D", "backend/auth.py:require_auth", "auth_failed_user_not_found", {
                "telegram_id": telegram_user.get("id") if isinstance(telegram_user, dict) else None,
                "path": request.path,
                "method": request.method,
            })
            # #endregion
            return jsonify({'error': 'User not found. Please register first.'}), 404
        
        # Store in Flask's g object for use in the route
        g.telegram_user = telegram_user
        g.current_user = db_user
        # #region agent log
        _debug_log("D", "backend/auth.py:require_auth", "auth_success", {
            "telegram_id": telegram_user.get("id") if isinstance(telegram_user, dict) else None,
            "user_id": getattr(db_user, "id", None),
            "path": request.path,
            "method": request.method,
        })
        # #endregion
        
        return f(*args, **kwargs)
    return decorated_function


def require_admin(f):
    """
    Decorator that requires admin role.
    Must be used after @require_auth or will check auth itself.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if auth was already done
        if not hasattr(g, 'current_user') or g.current_user is None:
            telegram_user, db_user = get_telegram_user_from_request()
            
            if not telegram_user:
                return jsonify({'error': 'Authentication required'}), 401
            
            if not db_user:
                return jsonify({'error': 'User not found'}), 404
            
            g.telegram_user = telegram_user
            g.current_user = db_user
        
        if g.current_user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        return f(*args, **kwargs)
    return decorated_function


def optional_auth(f):
    """
    Decorator that optionally authenticates the user.
    Sets g.telegram_user and g.current_user if authentication succeeds,
    but doesn't fail if authentication is missing.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        telegram_user, db_user = get_telegram_user_from_request()
        
        g.telegram_user = telegram_user
        g.current_user = db_user
        
        return f(*args, **kwargs)
    return decorated_function


def get_current_user() -> User | None:
    """Helper to get current user from g or request."""
    if hasattr(g, 'current_user'):
        return g.current_user
    
    _, db_user = get_telegram_user_from_request()
    return db_user
