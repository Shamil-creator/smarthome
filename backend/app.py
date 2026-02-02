import os
import re
import logging
from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from flask_compress import Compress
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from database import db, init_db, User
from pathlib import Path

# Load .env file if it exists (project root or current directory)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)
    else:
        env_path = Path('.env')
        if env_path.exists():
            load_dotenv(env_path, override=True)
except ImportError:
    # python-dotenv not installed, try manual parsing
    try:
        env_path = Path(__file__).parent.parent / '.env'
        if not env_path.exists():
            env_path = Path('.env')
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()
    except Exception:
        pass

# Configure logging
logging.basicConfig(
    level=logging.INFO if os.getenv('FLASK_ENV') == 'production' else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration from environment
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
IS_PRODUCTION = FLASK_ENV == 'production'

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URI', 'sqlite:///smarthome.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB max file size

# Compression settings for faster responses
app.config['COMPRESS_MIMETYPES'] = ['application/json', 'text/html', 'text/css', 'application/javascript']
app.config['COMPRESS_LEVEL'] = 6
app.config['COMPRESS_MIN_SIZE'] = 500

# Upload folder path (resolved to absolute path)
UPLOAD_FOLDER = Path(__file__).parent.resolve() / 'uploads'

# CORS configuration
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '')
if ALLOWED_ORIGINS:
    cors_origins = [origin.strip() for origin in ALLOWED_ORIGINS.split(',') if origin.strip()]
else:
    # In production, require explicit origins; in development, allow all
    cors_origins = "*" if not IS_PRODUCTION else []

# Initialize extensions
db.init_app(app)
CORS(app, resources={r"/api/*": {"origins": cors_origins}})
Compress(app)  # Enable gzip compression for API responses

# Rate limiting configuration
# Normalize rate limit strings to ensure proper format
def normalize_rate_limit(limit_str):
    """Normalize rate limit string to ensure proper format"""
    if not limit_str:
        return '60 per minute'
    # If it's just a number, add 'per minute'
    if limit_str.strip().isdigit():
        return f"{limit_str.strip()} per minute"
    # If it already has format, return as is
    return limit_str.strip()

RATE_LIMIT_DEFAULT = normalize_rate_limit(os.getenv('RATE_LIMIT_DEFAULT', '60 per minute'))
RATE_LIMIT_AUTH = normalize_rate_limit(os.getenv('RATE_LIMIT_AUTH', '10 per minute'))

def get_rate_limit_key():
    """Get rate limit key - prefer Telegram user ID over IP"""
    # Try to get Telegram user ID for more accurate rate limiting
    telegram_id = request.headers.get('X-Telegram-User-Id')
    if telegram_id:
        return f"telegram:{telegram_id}"
    # Fall back to IP address
    return get_remote_address()

limiter = Limiter(
    app=app,
    key_func=get_rate_limit_key,
    default_limits=[RATE_LIMIT_DEFAULT],
    storage_uri="memory://",  # Use Redis in production: "redis://localhost:6379"
    strategy="fixed-window",
)

# Import and register blueprints
from routes.users import users_bp
from routes.objects import objects_bp
from routes.prices import prices_bp
from routes.schedule import schedule_bp
from routes.docs import docs_bp
from routes.reports import reports_bp

app.register_blueprint(users_bp, url_prefix='/api')
app.register_blueprint(objects_bp, url_prefix='/api')
app.register_blueprint(prices_bp, url_prefix='/api')
app.register_blueprint(schedule_bp, url_prefix='/api')
app.register_blueprint(docs_bp, url_prefix='/api')
app.register_blueprint(reports_bp, url_prefix='/api')


def get_current_user():
    """Helper to get current user from Telegram ID header"""
    telegram_id = request.headers.get('X-Telegram-User-Id')
    if telegram_id:
        return User.query.filter_by(telegram_id=int(telegram_id)).first()
    return None


# Security headers middleware
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    # Prevent clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    # Prevent MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Enable XSS filter
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Referrer policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Content Security Policy (adjust as needed for your frontend)
    if IS_PRODUCTION:
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    # HSTS - only in production with HTTPS
    if IS_PRODUCTION:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # Prevent stale cached API responses in embedded WebViews (Android)
    if request.method == 'GET' and request.path.startswith('/api/') and not request.path.startswith('/api/files/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.route('/api/health', methods=['GET'])
@limiter.exempt  # Health check should not be rate limited
def health_check():
    return jsonify({'status': 'ok'})


@app.route('/api/files/<path:filename>', methods=['GET'])
def serve_uploaded_file(filename):
    """Serve uploaded files from the uploads directory with path traversal protection."""
    # Security: Validate filename to prevent path traversal attacks
    
    # Check for null bytes (used in null byte injection attacks)
    if '\x00' in filename or '%00' in filename:
        abort(400, description='Invalid filename')
    
    # Check for path traversal sequences
    if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        abort(400, description='Invalid filename')
    
    # Only allow alphanumeric, dots, hyphens, and underscores
    # This matches UUID-based filenames like "abc123def456.pdf"
    if not re.match(r'^[a-zA-Z0-9._-]+$', filename):
        abort(400, description='Invalid filename')
    
    # Resolve the full path and verify it's within UPLOAD_FOLDER
    try:
        requested_path = (UPLOAD_FOLDER / filename).resolve()
        
        # Ensure the resolved path is within the upload folder
        if not str(requested_path).startswith(str(UPLOAD_FOLDER)):
            abort(403, description='Access denied')
        
        # Check if file exists
        if not requested_path.exists() or not requested_path.is_file():
            abort(404, description='File not found')
        
    except (ValueError, OSError):
        abort(400, description='Invalid filename')
    
    return send_from_directory(str(UPLOAD_FOLDER), filename)


@app.errorhandler(400)
def bad_request(error):
    """Handle bad request errors."""
    return jsonify({'error': 'Bad request'}), 400


@app.errorhandler(401)
def unauthorized(error):
    """Handle unauthorized errors."""
    return jsonify({'error': 'Authentication required'}), 401


@app.errorhandler(403)
def forbidden(error):
    """Handle forbidden errors."""
    return jsonify({'error': 'Access denied'}), 403


@app.errorhandler(404)
def not_found(error):
    """Handle not found errors."""
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(429)
def rate_limit_exceeded(error):
    """Handle rate limit errors."""
    return jsonify({'error': 'Too many requests. Please try again later.'}), 429


@app.errorhandler(500)
def internal_error(error):
    """Handle internal server errors - don't expose details in production."""
    logger.error(f"Internal server error: {error}")
    if IS_PRODUCTION:
        return jsonify({'error': 'Internal server error'}), 500
    else:
        # In development, include error details for debugging
        return jsonify({'error': 'Internal server error', 'details': str(error)}), 500


@app.errorhandler(Exception)
def handle_exception(error):
    """Handle all uncaught exceptions."""
    # Log the full exception for debugging
    logger.exception(f"Unhandled exception: {error}")
    
    # Don't expose internal details in production
    if IS_PRODUCTION:
        return jsonify({'error': 'An unexpected error occurred'}), 500
    else:
        return jsonify({
            'error': 'An unexpected error occurred',
            'type': type(error).__name__,
            'details': str(error)
        }), 500


# Initialize database
with app.app_context():
    init_db(app)


if __name__ == '__main__':
    # Get configuration from environment
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.getenv('PORT', 5001))
    
    # NEVER run debug mode in production
    if IS_PRODUCTION and debug_mode:
        print("WARNING: Debug mode is disabled in production for security.")
        debug_mode = False
    
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
