from flask import Blueprint, jsonify, request, g
from database import db, DocItem, User
from auth import require_auth, require_admin
from utils import (
    save_uploaded_file, 
    delete_uploaded_file, 
    get_doc_type_from_extension,
    get_file_extension,
    is_allowed_file,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE
)

docs_bp = Blueprint('docs', __name__)

# Valid document types
VALID_DOC_TYPES = {'pdf', 'img', 'text', 'link', 'docx', 'file'}


@docs_bp.route('/docs', methods=['GET'])
@require_auth
def get_docs():
    """Get documents, optionally filtered by objectId or general docs only"""
    object_id = request.args.get('objectId', type=int)
    general_only = request.args.get('generalOnly', type=bool, default=False)
    
    query = DocItem.query
    
    if general_only:
        query = query.filter_by(object_id=None)
    elif object_id:
        # Validate object_id is positive
        if object_id <= 0:
            return jsonify({'error': 'Invalid objectId'}), 400
        query = query.filter_by(object_id=object_id)
    
    docs = query.all()
    return jsonify([doc.to_dict() for doc in docs])


@docs_bp.route('/docs/general', methods=['GET'])
@require_auth
def get_general_docs():
    """Get all general documents (not attached to any object)"""
    docs = DocItem.query.filter_by(object_id=None).all()
    return jsonify([doc.to_dict() for doc in docs])


@docs_bp.route('/docs/upload', methods=['POST'])
@require_admin
def upload_doc():
    """Upload a file and create a document (admin only)"""
    # Check if file is in request
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Validate file type by extension
    if not is_allowed_file(file.filename):
        return jsonify({
            'error': f'Тип файла не разрешен. Разрешены: {", ".join(ALLOWED_EXTENSIONS)}'
        }), 400
    
    try:
        # Save file with comprehensive security checks
        # Pass MIME type for additional validation
        filename, file_url = save_uploaded_file(
            file, 
            file.filename, 
            mime_type=file.content_type
        )
        
        # Get document type and title
        ext = get_file_extension(file.filename)
        doc_type = get_doc_type_from_extension(ext)
        title = request.form.get('title', file.filename)
        object_id = request.form.get('objectId')
        
        # Validate and sanitize title
        if title:
            title = title.strip()[:255]  # Limit title length
        if not title:
            title = file.filename
        
        # Validate object_id if provided
        if object_id:
            try:
                object_id = int(object_id)
                if object_id <= 0:
                    return jsonify({'error': 'Invalid objectId'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid objectId'}), 400
        
        # Create document in database
        doc = DocItem(
            title=title,
            type=doc_type,
            url=file_url,
            object_id=object_id
        )
        db.session.add(doc)
        db.session.commit()
        
        return jsonify(doc.to_dict()), 201
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        # Don't expose internal error details
        return jsonify({'error': 'Upload failed'}), 500


@docs_bp.route('/docs/<int:doc_id>', methods=['GET'])
@require_auth
def get_doc(doc_id):
    """Get single document"""
    doc = DocItem.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    return jsonify(doc.to_dict())


@docs_bp.route('/docs', methods=['POST'])
@require_admin
def create_doc():
    """Create a new document (admin only)"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    title = data.get('title', '').strip() if data.get('title') else ''
    doc_type = data.get('type', '').strip() if data.get('type') else ''
    
    if not title or not doc_type:
        return jsonify({'error': 'title and type are required'}), 400
    
    # Validate document type
    if doc_type not in VALID_DOC_TYPES:
        return jsonify({'error': f'Invalid type. Must be one of: {", ".join(VALID_DOC_TYPES)}'}), 400
    
    # Limit title length
    title = title[:255]
    
    # Validate and parse object_id
    object_id = data.get('objectId')
    if object_id:
        try:
            object_id = int(object_id)
            if object_id <= 0:
                return jsonify({'error': 'Invalid objectId'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid objectId'}), 400
    
    # Validate URL if provided (basic check)
    url = data.get('url', '').strip() if data.get('url') else None
    if url and not (url.startswith('http://') or url.startswith('https://') or url.startswith('/api/files/')):
        return jsonify({'error': 'Invalid URL format'}), 400
    
    # Limit content length
    content = data.get('content')
    if content and len(content) > 50000:  # 50KB limit for text content
        return jsonify({'error': 'Content too large'}), 400
    
    doc = DocItem(
        title=title,
        type=doc_type,
        url=url,
        content=content,
        object_id=object_id
    )
    db.session.add(doc)
    db.session.commit()
    
    return jsonify(doc.to_dict()), 201


@docs_bp.route('/docs/<int:doc_id>', methods=['PUT'])
@require_admin
def update_doc(doc_id):
    """Update document (admin only)"""
    doc = DocItem.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if 'title' in data:
        title = data['title'].strip() if data['title'] else ''
        if not title:
            return jsonify({'error': 'Title cannot be empty'}), 400
        doc.title = title[:255]
    
    if 'type' in data:
        if data['type'] not in VALID_DOC_TYPES:
            return jsonify({'error': f'Invalid type. Must be one of: {", ".join(VALID_DOC_TYPES)}'}), 400
        doc.type = data['type']
    
    if 'url' in data:
        url = data['url'].strip() if data['url'] else None
        if url and not (url.startswith('http://') or url.startswith('https://') or url.startswith('/api/files/')):
            return jsonify({'error': 'Invalid URL format'}), 400
        doc.url = url
    
    if 'content' in data:
        content = data['content']
        if content and len(content) > 50000:
            return jsonify({'error': 'Content too large'}), 400
        doc.content = content
    
    if 'objectId' in data:
        object_id = data['objectId']
        if object_id:
            try:
                object_id = int(object_id)
                if object_id <= 0:
                    return jsonify({'error': 'Invalid objectId'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid objectId'}), 400
        doc.object_id = object_id
    
    db.session.commit()
    return jsonify(doc.to_dict())


@docs_bp.route('/docs/<int:doc_id>', methods=['DELETE'])
@require_admin
def delete_doc(doc_id):
    """Delete document and associated file (admin only)"""
    doc = DocItem.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    
    # Delete associated file if it exists
    if doc.url and doc.url.startswith('/api/files/'):
        delete_uploaded_file(doc.url)
    
    db.session.delete(doc)
    db.session.commit()
    
    return jsonify({'success': True})
