import re
from flask import Blueprint, jsonify, request, g
from sqlalchemy.orm import joinedload
from database import db, ScheduledDay, WorkLogItem, User, PriceItem
from auth import require_auth, require_admin, optional_auth

schedule_bp = Blueprint('schedule', __name__)

# Valid status values
VALID_STATUSES = {'draft', 'pending_approval', 'approved_waiting_payment', 'paid_waiting_confirmation', 'completed'}

# Date format regex (YYYY-MM-DD)
DATE_REGEX = re.compile(r'^\d{4}-\d{2}-\d{2}$')


# ==================== Helper Functions ====================

def can_edit_report(scheduled_day, current_user):
    """Check if user can edit this report
    
    Rules:
    - Admin can always edit any report
    - Installer can only edit their own reports
    - Installer can only edit reports with status 'draft' or 'pending_approval'
    """
    if not current_user:
        return False
    if current_user.role == 'admin':
        return True  # Admin can always edit
    if scheduled_day.user_id != current_user.id:
        return False  # Can only edit own reports
    # Installer can edit only if status is draft or pending_approval
    return scheduled_day.status in ['draft', 'pending_approval', None]


def validate_and_parse_item_ids(work_log):
    """Validate and parse work log item IDs. Returns list of valid int IDs or None if invalid."""
    if not work_log:
        return []
    
    item_ids = []
    for item in work_log:
        item_id = item.get('itemId')
        try:
            if isinstance(item_id, str):
                item_id = int(item_id)
            if not isinstance(item_id, int) or item_id <= 0:
                return None
            item_ids.append(item_id)
        except (ValueError, TypeError):
            return None
    return item_ids


def calculate_earnings(work_log):
    """Calculate total earnings from work log items using single query"""
    if not work_log:
        return 0
    
    # Validate and extract item IDs
    item_ids = validate_and_parse_item_ids(work_log)
    if item_ids is None:
        return 0
    
    if not item_ids:
        return 0
    
    # Fetch all prices in one query
    prices = {
        p.id: {'price': p.price, 'coefficient': p.coefficient}
        for p in PriceItem.query.filter(PriceItem.id.in_(item_ids)).all()
    }
    
    # Calculate total
    total = 0
    for item in work_log:
        item_id = item.get('itemId')
        if isinstance(item_id, str):
            item_id = int(item_id)
        price_data = prices.get(item_id, {'price': 0, 'coefficient': 1.0})
        price = price_data['price']
        coefficient = price_data['coefficient']
        quantity = item.get('quantity', 1)
        # Validate quantity
        if not isinstance(quantity, int) or quantity < 1:
            quantity = 1
        total += price * coefficient * quantity

    return int(round(total))


def update_work_log(scheduled_day, work_log):
    """Update work log items for a scheduled day and recalculate earnings"""
    # Validate work log items first
    item_ids = validate_and_parse_item_ids(work_log)
    if item_ids is None:
        return False
    
    # Clear existing work log
    WorkLogItem.query.filter_by(scheduled_day_id=scheduled_day.id).delete()
    
    # Add new work log items
    for item in work_log:
        item_id = item.get('itemId')
        if isinstance(item_id, str):
            item_id = int(item_id)
        quantity = item.get('quantity', 1)
        if not isinstance(quantity, int) or quantity < 1:
            quantity = 1
        work_item = WorkLogItem(
            scheduled_day_id=scheduled_day.id,
            price_item_id=item_id,
            quantity=quantity
        )
        db.session.add(work_item)
    
    # Recalculate earnings
    scheduled_day.earnings = calculate_earnings(work_log)
    return True


def validate_date(date_str):
    """Validate date string format (YYYY-MM-DD)"""
    if not date_str or not isinstance(date_str, str):
        return False
    return DATE_REGEX.match(date_str) is not None


def parse_object_id(object_id):
    """Parse and validate object_id. Returns int or None."""
    if object_id is None:
        return None
    try:
        if isinstance(object_id, str):
            object_id = int(object_id)
        if not isinstance(object_id, int) or object_id <= 0:
            return None
        return object_id
    except (ValueError, TypeError):
        return None


@schedule_bp.route('/schedule', methods=['GET'])
@require_auth
def get_schedule():
    """Get schedule, optionally filtered by user_id, with work_log eagerly loaded"""
    user_id = request.args.get('userId', type=int)
    
    # Use joinedload for efficient single-query loading of work_log
    query = ScheduledDay.query.options(joinedload(ScheduledDay.work_log))
    
    if user_id:
        # Validate user_id is positive
        if user_id <= 0:
            return jsonify({'error': 'Invalid userId'}), 400
        query = query.filter_by(user_id=user_id)
    
    schedule = query.all()
    return jsonify([day.to_dict() for day in schedule])


@schedule_bp.route('/schedule', methods=['POST'])
@require_auth
def create_or_update_schedule():
    """Create or update a scheduled day"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    user_id = data.get('userId')
    date = data.get('date')
    object_id = data.get('objectId')
    
    # Validate required fields
    if not user_id:
        return jsonify({'error': 'userId is required'}), 400
    if not validate_date(date):
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # Validate user_id
    try:
        user_id = int(user_id)
        if user_id <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid userId'}), 400
    
    # Non-admin users can only modify their own schedule
    if g.current_user.role != 'admin' and g.current_user.id != user_id:
        return jsonify({'error': 'Access denied'}), 403
    
    # Parse object_id
    object_id = parse_object_id(object_id)
    
    # Check if entry exists for this user and date
    existing = ScheduledDay.query.filter_by(user_id=user_id, date=date).first()
    
    if existing:
        # Check if user can edit
        if not can_edit_report(existing, g.current_user):
            return jsonify({'error': 'Access denied. Cannot edit this report.'}), 403
        
        # Update existing
        if 'objectId' in data:
            existing.object_id = object_id
        if 'completed' in data and g.current_user.role == 'admin':
            existing.completed = bool(data['completed'])
        if 'status' in data:
            status = data['status']
            if status not in VALID_STATUSES:
                return jsonify({'error': f'Invalid status'}), 400
            # Non-admin can only set draft or pending_approval
            if g.current_user.role != 'admin' and status not in ['draft', 'pending_approval']:
                return jsonify({'error': 'Invalid status for non-admin'}), 400
            existing.status = status
        if 'earnings' in data and g.current_user.role == 'admin':
            try:
                existing.earnings = int(data['earnings'])
            except (ValueError, TypeError):
                pass
        
        # Handle work log if provided
        if 'workLog' in data:
            if not update_work_log(existing, data['workLog']):
                return jsonify({'error': 'Invalid work log items'}), 400
        
        db.session.commit()
        return jsonify(existing.to_dict())
    else:
        # Create new
        status = data.get('status', 'draft')
        if status not in VALID_STATUSES:
            status = 'draft'
        
        # Non-admin can only create with draft or pending_approval
        if g.current_user.role != 'admin' and status not in ['draft', 'pending_approval']:
            status = 'draft'
        
        scheduled_day = ScheduledDay(
            user_id=user_id,
            date=date,
            object_id=object_id,
            completed=False,
            status=status,
            earnings=0
        )
        db.session.add(scheduled_day)
        db.session.flush()  # Get the ID
        
        # Handle work log if provided
        if 'workLog' in data:
            if not update_work_log(scheduled_day, data['workLog']):
                return jsonify({'error': 'Invalid work log items'}), 400
        
        db.session.commit()
        return jsonify(scheduled_day.to_dict()), 201


@schedule_bp.route('/schedule/<int:schedule_id>', methods=['PUT'])
@require_auth
def update_schedule(schedule_id):
    """Update a specific scheduled day (basic update, mainly for object assignment)"""
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Schedule entry not found'}), 404
    
    # Check permissions
    if not can_edit_report(scheduled_day, g.current_user):
        return jsonify({'error': 'Access denied. Cannot edit this report.'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if 'objectId' in data:
        scheduled_day.object_id = parse_object_id(data['objectId'])
    
    # Only admin can directly set completed/status/earnings
    if g.current_user.role == 'admin':
        if 'completed' in data:
            scheduled_day.completed = bool(data['completed'])
        if 'status' in data:
            if data['status'] in VALID_STATUSES:
                scheduled_day.status = data['status']
        if 'earnings' in data:
            try:
                scheduled_day.earnings = int(data['earnings'])
            except (ValueError, TypeError):
                pass
    
    # Handle work log if provided
    if 'workLog' in data:
        if not update_work_log(scheduled_day, data['workLog']):
            return jsonify({'error': 'Invalid work log items'}), 400
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/complete', methods=['POST'])
@require_auth
def complete_work():
    """Submit/update a work report with earnings and work log
    
    Workflow:
    - Creates new report with status 'draft' or 'pending_approval'
    - If report exists and is editable, updates it
    - Recalculates earnings based on work log
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    user_id = data.get('userId')
    date = data.get('date')
    object_id = data.get('objectId')
    work_log = data.get('workLog', [])
    status = data.get('status', 'pending_approval')
    
    # Validate required fields
    if not user_id:
        return jsonify({'error': 'userId is required'}), 400
    if not validate_date(date):
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # Validate user_id
    try:
        user_id = int(user_id)
        if user_id <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid userId'}), 400
    
    # Non-admin users can only modify their own schedule
    if g.current_user.role != 'admin' and g.current_user.id != user_id:
        return jsonify({'error': 'Access denied'}), 403
    
    # Validate status
    if status not in ['draft', 'pending_approval']:
        if g.current_user.role != 'admin':
            status = 'pending_approval'
    
    object_id = parse_object_id(object_id)
    
    # Calculate earnings from work log
    total_earnings = calculate_earnings(work_log)
    
    # Find existing scheduled day
    scheduled_day = ScheduledDay.query.filter_by(user_id=user_id, date=date).first()
    
    if scheduled_day:
        # Check if user can edit this report
        if not can_edit_report(scheduled_day, g.current_user):
            return jsonify({'error': 'Access denied. Cannot edit this report.'}), 403
        
        scheduled_day.object_id = object_id
        scheduled_day.status = status
        scheduled_day.earnings = total_earnings
        scheduled_day.completed = (status == 'completed')
        
        # Update work log
        if not update_work_log(scheduled_day, work_log):
            return jsonify({'error': 'Invalid work log items'}), 400
    else:
        scheduled_day = ScheduledDay(
            user_id=user_id,
            date=date,
            object_id=object_id,
            completed=False,
            status=status,
            earnings=total_earnings
        )
        db.session.add(scheduled_day)
        db.session.flush()
        
        # Add work log items
        if not update_work_log(scheduled_day, work_log):
            return jsonify({'error': 'Invalid work log items'}), 400
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


# ==================== Workflow Endpoints ====================

@schedule_bp.route('/schedule/<int:schedule_id>/edit', methods=['PUT'])
@require_auth
def edit_report(schedule_id):
    """Edit a work report (for both installers and admins)
    
    Rules:
    - Installer can edit own reports with status 'draft' or 'pending_approval'
    - Admin can edit any report
    - Recalculates earnings when work log is updated
    """
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Report not found'}), 404
    
    if not can_edit_report(scheduled_day, g.current_user):
        return jsonify({'error': 'Access denied. Cannot edit this report.'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Update object if provided
    if 'objectId' in data:
        scheduled_day.object_id = parse_object_id(data['objectId'])
    
    # Update work log if provided (recalculates earnings)
    if 'workLog' in data:
        if not update_work_log(scheduled_day, data['workLog']):
            return jsonify({'error': 'Invalid work log items'}), 400
    
    # Only admin can directly set earnings (otherwise calculated from work log)
    if g.current_user.role == 'admin' and 'earnings' in data:
        try:
            scheduled_day.earnings = int(data['earnings'])
        except (ValueError, TypeError):
            pass
    
    # Handle status transitions based on role
    if 'status' in data:
        new_status = data['status']
        
        # Installer can only set to draft or pending_approval
        if g.current_user.role != 'admin':
            if new_status not in ['draft', 'pending_approval']:
                return jsonify({'error': 'Invalid status. Installer can only save draft or submit for approval.'}), 400
        elif new_status not in VALID_STATUSES:
            return jsonify({'error': 'Invalid status'}), 400
        
        scheduled_day.status = new_status
        scheduled_day.completed = (new_status == 'completed')
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/<int:schedule_id>/approve', methods=['POST'])
@require_admin
def approve_report(schedule_id):
    """Admin approves a pending report
    
    Transitions: pending_approval → approved_waiting_payment
    Optionally allows admin to modify work log before approving
    """
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Report not found'}), 404
    
    if scheduled_day.status != 'pending_approval':
        return jsonify({'error': f'Cannot approve report with status "{scheduled_day.status}". Must be "pending_approval".'}), 400
    
    data = request.get_json() or {}
    
    # Admin can optionally modify work log before approving
    if 'workLog' in data:
        if not update_work_log(scheduled_day, data['workLog']):
            return jsonify({'error': 'Invalid work log items'}), 400
    
    # Admin can optionally set final earnings
    if 'earnings' in data:
        try:
            scheduled_day.earnings = int(data['earnings'])
        except (ValueError, TypeError):
            pass
    
    # Transition to approved_waiting_payment
    scheduled_day.status = 'approved_waiting_payment'
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/<int:schedule_id>/reject', methods=['POST'])
@require_admin
def reject_report(schedule_id):
    """Admin rejects a pending report, sending it back to draft
    
    Transitions: pending_approval → draft
    """
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Report not found'}), 404
    
    if scheduled_day.status != 'pending_approval':
        return jsonify({'error': f'Cannot reject report with status "{scheduled_day.status}". Must be "pending_approval".'}), 400
    
    # Transition back to draft
    scheduled_day.status = 'draft'
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/<int:schedule_id>/mark-paid', methods=['POST'])
@require_admin
def mark_paid(schedule_id):
    """Admin marks a report as paid
    
    Transitions: approved_waiting_payment → paid_waiting_confirmation
    """
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Report not found'}), 404
    
    if scheduled_day.status != 'approved_waiting_payment':
        return jsonify({'error': f'Cannot mark as paid report with status "{scheduled_day.status}". Must be "approved_waiting_payment".'}), 400
    
    # Transition to paid_waiting_confirmation
    scheduled_day.status = 'paid_waiting_confirmation'
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/<int:schedule_id>/confirm-payment', methods=['POST'])
@require_auth
def confirm_payment(schedule_id):
    """Installer confirms they received payment
    
    Transitions: paid_waiting_confirmation → completed
    Only the report owner (installer) or admin can confirm
    """
    scheduled_day = ScheduledDay.query.get(schedule_id)
    if not scheduled_day:
        return jsonify({'error': 'Report not found'}), 404
    
    # Only the owner or admin can confirm payment
    if g.current_user.role != 'admin' and scheduled_day.user_id != g.current_user.id:
        return jsonify({'error': 'Access denied. Only report owner can confirm payment.'}), 403
    
    if scheduled_day.status != 'paid_waiting_confirmation':
        return jsonify({'error': f'Cannot confirm payment for report with status "{scheduled_day.status}". Must be "paid_waiting_confirmation".'}), 400
    
    # Transition to completed
    scheduled_day.status = 'completed'
    scheduled_day.completed = True
    
    db.session.commit()
    return jsonify(scheduled_day.to_dict())


@schedule_bp.route('/schedule/pending', methods=['GET'])
@require_admin
def get_pending_reports():
    """Get all reports pending approval (admin only)"""
    # Use joinedload for efficient single-query loading of work_log
    pending = ScheduledDay.query.options(
        joinedload(ScheduledDay.work_log)
    ).filter_by(status='pending_approval').all()
    return jsonify([day.to_dict() for day in pending])
