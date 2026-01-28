from flask import Blueprint, jsonify, request, g
from database import db, PriceItem, User
from auth import require_auth, require_admin

prices_bp = Blueprint('prices', __name__)


@prices_bp.route('/prices', methods=['GET'])
@require_auth
def get_prices():
    """Get all price items"""
    prices = PriceItem.query.all()
    return jsonify([price.to_dict() for price in prices])


@prices_bp.route('/prices/<int:price_id>', methods=['GET'])
@require_auth
def get_price(price_id):
    """Get single price item"""
    price = PriceItem.query.get(price_id)
    if not price:
        return jsonify({'error': 'Price item not found'}), 404
    return jsonify(price.to_dict())


@prices_bp.route('/prices', methods=['POST'])
@require_admin
def create_price():
    """Create a new price item (admin only)"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    category = data.get('category', '').strip() if data.get('category') else ''
    name = data.get('name', '').strip() if data.get('name') else ''
    price = data.get('price', 0)
    coefficient = data.get('coefficient', 1.0)
    
    if not category or not name:
        return jsonify({'error': 'category and name are required'}), 400
    
    # Validate price is a non-negative integer
    try:
        price = int(price)
        if price < 0:
            return jsonify({'error': 'Price cannot be negative'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'Price must be a valid integer'}), 400

    # Validate coefficient is a positive number
    try:
        coefficient = float(coefficient)
        if coefficient <= 0:
            return jsonify({'error': 'Coefficient must be greater than 0'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'Coefficient must be a valid number'}), 400
    
    price_item = PriceItem(category=category, name=name, price=price, coefficient=coefficient)
    db.session.add(price_item)
    db.session.commit()
    
    return jsonify(price_item.to_dict()), 201


@prices_bp.route('/prices/<int:price_id>', methods=['PUT'])
@require_admin
def update_price(price_id):
    """Update price item (admin only)"""
    price_item = PriceItem.query.get(price_id)
    if not price_item:
        return jsonify({'error': 'Price item not found'}), 404
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if 'category' in data:
        category = data['category'].strip() if data['category'] else ''
        if not category:
            return jsonify({'error': 'Category cannot be empty'}), 400
        price_item.category = category
    
    if 'name' in data:
        name = data['name'].strip() if data['name'] else ''
        if not name:
            return jsonify({'error': 'Name cannot be empty'}), 400
        price_item.name = name
    
    if 'price' in data:
        try:
            price = int(data['price'])
            if price < 0:
                return jsonify({'error': 'Price cannot be negative'}), 400
            price_item.price = price
        except (ValueError, TypeError):
            return jsonify({'error': 'Price must be a valid integer'}), 400

    if 'coefficient' in data:
        try:
            coefficient = float(data['coefficient'])
            if coefficient <= 0:
                return jsonify({'error': 'Coefficient must be greater than 0'}), 400
            price_item.coefficient = coefficient
        except (ValueError, TypeError):
            return jsonify({'error': 'Coefficient must be a valid number'}), 400
    
    db.session.commit()
    return jsonify(price_item.to_dict())


@prices_bp.route('/prices/<int:price_id>', methods=['DELETE'])
@require_admin
def delete_price(price_id):
    """Delete price item (admin only)"""
    price_item = PriceItem.query.get(price_id)
    if not price_item:
        return jsonify({'error': 'Price item not found'}), 404
    
    db.session.delete(price_item)
    db.session.commit()
    
    return jsonify({'success': True})
