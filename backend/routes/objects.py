from flask import Blueprint, jsonify, request, g
from sqlalchemy.orm import joinedload
from database import db, ClientObject, User
from auth import require_auth, require_admin

objects_bp = Blueprint('objects', __name__)

# Valid status values for objects
VALID_STATUSES = {'active', 'completed', 'maintenance'}


@objects_bp.route('/objects', methods=['GET'])
@require_auth
def get_objects():
    """Get all client objects with docs eagerly loaded"""
    # Use joinedload for efficient single-query loading of related docs
    objects = ClientObject.query.options(joinedload(ClientObject.docs)).all()
    return jsonify([obj.to_dict() for obj in objects])


@objects_bp.route('/objects/<int:object_id>', methods=['GET'])
@require_auth
def get_object(object_id):
    """Get single object by ID"""
    obj = ClientObject.query.get(object_id)
    if not obj:
        return jsonify({'error': 'Object not found'}), 404
    return jsonify(obj.to_dict())


@objects_bp.route('/objects', methods=['POST'])
@require_admin
def create_object():
    """Create a new client object (admin only)"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    name = data.get('name', '').strip() if data.get('name') else ''
    address = data.get('address', '').strip() if data.get('address') else ''
    status = data.get('status', 'active')
    
    if not name or not address:
        return jsonify({'error': 'name and address are required'}), 400
    
    # Validate status
    if status not in VALID_STATUSES:
        return jsonify({'error': f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'}), 400
    
    obj = ClientObject(name=name, address=address, status=status)
    db.session.add(obj)
    db.session.commit()
    
    return jsonify(obj.to_dict()), 201


@objects_bp.route('/objects/<int:object_id>', methods=['PUT'])
@require_admin
def update_object(object_id):
    """Update client object (admin only)"""
    obj = ClientObject.query.get(object_id)
    if not obj:
        return jsonify({'error': 'Object not found'}), 404
    
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if 'name' in data:
        name = data['name'].strip() if data['name'] else ''
        if not name:
            return jsonify({'error': 'Name cannot be empty'}), 400
        obj.name = name
    
    if 'address' in data:
        address = data['address'].strip() if data['address'] else ''
        if not address:
            return jsonify({'error': 'Address cannot be empty'}), 400
        obj.address = address
    
    if 'status' in data:
        if data['status'] not in VALID_STATUSES:
            return jsonify({'error': f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'}), 400
        obj.status = data['status']
    
    db.session.commit()
    return jsonify(obj.to_dict())


@objects_bp.route('/objects/<int:object_id>', methods=['DELETE'])
@require_admin
def delete_object(object_id):
    """Delete client object (admin only)"""
    obj = ClientObject.query.get(object_id)
    if not obj:
        return jsonify({'error': 'Object not found'}), 404
    
    db.session.delete(obj)
    db.session.commit()
    
    return jsonify({'success': True})
