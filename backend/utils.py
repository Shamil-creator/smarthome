"""File handling utilities for the smarthome backend."""
import os
import uuid
import re
from pathlib import Path
from werkzeug.utils import secure_filename

# Configuration
UPLOAD_FOLDER = Path(__file__).parent / 'uploads'
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'docx'}
ALLOWED_MIME_TYPES = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',  # For old .doc files, but we only allow .docx
}

# Magic bytes (file signatures) for validating actual file content
# This prevents attackers from renaming malicious files to allowed extensions
# DOCX files are ZIP archives, so they start with PK (ZIP signature)
FILE_SIGNATURES = {
    'pdf': [b'%PDF'],
    'png': [b'\x89PNG\r\n\x1a\n'],
    'jpg': [b'\xff\xd8\xff'],
    'jpeg': [b'\xff\xd8\xff'],
    'gif': [b'GIF87a', b'GIF89a'],
    'docx': [b'PK\x03\x04'],  # DOCX is a ZIP archive, starts with PK
}

# Dangerous file extensions that should never be uploaded
DANGEROUS_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'js', 'jse',
    'wsf', 'wsh', 'msc', 'jar', 'py', 'pyw', 'rb', 'pl', 'php',
    'php3', 'php4', 'php5', 'phtml', 'asp', 'aspx', 'jsp', 'cgi',
    'htaccess', 'htpasswd', 'ini', 'conf', 'config', 'sql', 'bak',
    'dll', 'so', 'dylib', 'com', 'scr', 'pif', 'application', 'gadget',
    'msi', 'msp', 'hta', 'cpl', 'msc', 'inf', 'reg', 'scf', 'lnk', 'svg'
}


def get_file_extension(filename: str) -> str:
    """Get file extension from filename."""
    if '.' in filename:
        return filename.rsplit('.', 1)[1].lower()
    return ''


def get_all_extensions(filename: str) -> list[str]:
    """Get all extensions from filename (for detecting double extensions like file.php.jpg)."""
    parts = filename.lower().split('.')
    if len(parts) > 1:
        return parts[1:]  # All parts after the first dot
    return []


def has_dangerous_extension(filename: str) -> bool:
    """Check if filename contains any dangerous extension (including hidden ones)."""
    all_exts = get_all_extensions(filename)
    return any(ext in DANGEROUS_EXTENSIONS for ext in all_exts)


def has_null_bytes(filename: str) -> bool:
    """Check if filename contains null bytes (used in null byte injection attacks)."""
    return '\x00' in filename or '%00' in filename


def is_valid_filename(filename: str) -> bool:
    """
    Validate filename for security.
    Returns False if filename contains suspicious patterns.
    """
    if not filename:
        return False
    
    # Check for null bytes
    if has_null_bytes(filename):
        return False
    
    # Check for path traversal attempts
    if '..' in filename or '/' in filename or '\\' in filename:
        return False
    
    # Check for dangerous extensions anywhere in filename
    if has_dangerous_extension(filename):
        return False
    
    # Check for suspicious patterns
    suspicious_patterns = [
        r'<\s*script',  # Script tags
        r'javascript:',  # JavaScript protocol
        r'data:',  # Data URIs
        r'vbscript:',  # VBScript
        r'on\w+\s*=',  # Event handlers
    ]
    for pattern in suspicious_patterns:
        if re.search(pattern, filename, re.IGNORECASE):
            return False
    
    return True


def is_allowed_file(filename: str) -> bool:
    """Check if file extension is allowed and filename is safe."""
    if not is_valid_filename(filename):
        return False
    return get_file_extension(filename) in ALLOWED_EXTENSIONS


def is_allowed_mime_type(mime_type: str) -> bool:
    """Check if MIME type is allowed."""
    if not mime_type:
        return False
    # Normalize mime type (remove charset and other parameters)
    mime_type = mime_type.split(';')[0].strip().lower()
    return mime_type in ALLOWED_MIME_TYPES


def validate_file_signature(file_content: bytes, expected_extension: str) -> bool:
    """
    Validate file content matches expected type by checking magic bytes.
    This prevents uploading malicious files disguised with fake extensions.
    """
    if expected_extension not in FILE_SIGNATURES:
        return False
    
    signatures = FILE_SIGNATURES[expected_extension]
    for signature in signatures:
        if file_content.startswith(signature):
            # For DOCX files, verify it's actually a Word document (not just any ZIP)
            if expected_extension == 'docx':
                # DOCX files should contain "word/" directory in ZIP structure
                # Check first 30KB for word/document.xml or [Content_Types].xml
                if b'word/' in file_content[:30720] or b'[Content_Types].xml' in file_content[:30720]:
                    return True
            else:
                return True
    
    return False


def validate_file_content(file, filename: str) -> tuple[bool, str]:
    """
    Comprehensive file content validation.
    
    Args:
        file: File object from request.files
        filename: Original filename
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Read first 8KB for signature checking
    file.seek(0)
    header = file.read(8192)
    file.seek(0)  # Reset file pointer
    
    ext = get_file_extension(filename)
    
    # Check file signature matches extension
    if not validate_file_signature(header, ext):
        return False, f"Содержимое файла не соответствует расширению .{ext}"
    
    # Check for embedded scripts/code in content
    dangerous_patterns = [
        b'<script',
        b'<?php',
        b'<%',
        b'#!/',
        b'eval(',
        b'exec(',
        b'system(',
        b'passthru(',
        b'shell_exec(',
    ]
    
    header_lower = header.lower()
    for pattern in dangerous_patterns:
        if pattern in header_lower:
            return False, "Файл содержит потенциально опасный код"
    
    return True, ""


def get_doc_type_from_extension(extension: str) -> str:
    """Get document type (pdf/docx/img) from file extension."""
    if extension == 'pdf':
        return 'pdf'
    elif extension == 'docx':
        return 'docx'
    elif extension in {'png', 'jpg', 'jpeg', 'gif'}:
        return 'img'
    return 'file'


def generate_unique_filename(original_filename: str) -> str:
    """Generate a unique filename using UUID while preserving extension."""
    ext = get_file_extension(original_filename)
    unique_name = f"{uuid.uuid4().hex}"
    if ext:
        unique_name = f"{unique_name}.{ext}"
    return unique_name


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage."""
    return secure_filename(filename)


def get_file_url(filename: str) -> str:
    """Get the URL for accessing an uploaded file."""
    return f"/api/files/{filename}"


def save_uploaded_file(file, original_filename: str, mime_type: str = None) -> tuple[str, str]:
    """
    Save an uploaded file to the uploads directory with comprehensive security checks.
    
    Args:
        file: File object from request.files
        original_filename: Original filename
        mime_type: MIME type from request (optional, for additional validation)
    
    Returns:
        Tuple of (unique_filename, file_url)
    
    Raises:
        ValueError: If file type is not allowed, content is invalid, or file is too large
    """
    # Sanitize filename first
    safe_filename = secure_filename(original_filename)
    if not safe_filename:
        raise ValueError("Некорректное имя файла")
    
    # Validate filename (extension, dangerous patterns, etc.)
    if not is_allowed_file(safe_filename):
        raise ValueError(f"Тип файла не разрешен. Разрешены: {', '.join(ALLOWED_EXTENSIONS)}")
    
    # Validate MIME type if provided
    if mime_type and not is_allowed_mime_type(mime_type):
        raise ValueError(f"MIME тип не разрешен: {mime_type}")
    
    # Validate file content (magic bytes and dangerous patterns)
    is_valid, error_msg = validate_file_content(file, safe_filename)
    if not is_valid:
        raise ValueError(error_msg)
    
    # Generate unique filename with only the final extension
    ext = get_file_extension(safe_filename)
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    
    # Ensure uploads directory exists
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    
    # Save file
    file_path = UPLOAD_FOLDER / unique_filename
    file.save(str(file_path))
    
    # Check file size after saving
    if file_path.stat().st_size > MAX_FILE_SIZE:
        # Remove file if too large
        file_path.unlink()
        raise ValueError(f"Файл слишком большой. Максимум: {MAX_FILE_SIZE // (1024 * 1024)} МБ")
    
    # Double-check file size is not zero
    if file_path.stat().st_size == 0:
        file_path.unlink()
        raise ValueError("Файл пустой")
    
    return unique_filename, get_file_url(unique_filename)


def delete_uploaded_file(filename: str) -> bool:
    """
    Delete an uploaded file from the uploads directory.
    
    Args:
        filename: Name of the file to delete
    
    Returns:
        True if file was deleted, False if file didn't exist
    """
    if not filename:
        return False
    
    # Extract just the filename if it's a URL
    if filename.startswith('/api/files/'):
        filename = filename.replace('/api/files/', '')
    
    file_path = UPLOAD_FOLDER / filename
    
    try:
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
            return True
    except Exception as e:
        print(f"Error deleting file {filename}: {e}")
    
    return False


def get_file_path(filename: str) -> Path | None:
    """
    Get the full path to an uploaded file.
    
    Args:
        filename: Name of the file
    
    Returns:
        Path object if file exists, None otherwise
    """
    if not filename:
        return None
    
    # Extract just the filename if it's a URL
    if filename.startswith('/api/files/'):
        filename = filename.replace('/api/files/', '')
    
    file_path = UPLOAD_FOLDER / filename
    
    if file_path.exists() and file_path.is_file():
        return file_path
    
    return None
