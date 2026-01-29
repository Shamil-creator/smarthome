import os
from datetime import datetime

import requests
from flask import Blueprint, jsonify, g
from sqlalchemy.orm import joinedload

from auth import require_admin
from database import ScheduledDay, User, WorkLogItem

reports_bp = Blueprint('reports', __name__)


def build_user_report_payload(user: User, days: list[ScheduledDay], admin_telegram_id: int) -> dict:
    history = []
    total_earnings = 0

    for day in days:
        total_earnings += day.earnings or 0
        work_items = []
        for item in (day.work_log or []):
            name = item.price_item.name if item.price_item else 'Услуга удалена'
            work_items.append({
                'name': name,
                'quantity': item.quantity,
            })

        history.append({
            'date': day.date,
            'status': day.status,
            'earnings': day.earnings,
            'object': {
                'name': day.object.name if day.object else None,
                'address': day.object.address if day.object else None,
            },
            'workLog': work_items,
        })

    return {
        'generatedAt': datetime.utcnow().isoformat(),
        'adminTelegramId': admin_telegram_id,
        'user': {
            'id': user.id,
            'name': user.name,
            'role': user.role,
        },
        'summary': {
            'totalDays': len(history),
            'totalEarnings': total_earnings,
        },
        'days': history,
    }


@reports_bp.route('/reports/users/<int:user_id>/request', methods=['POST'])
@require_admin
def request_user_report(user_id: int):
    """Request XLSX report for user and send it to admin via bot."""
    if user_id <= 0:
        return jsonify({'error': 'Invalid userId'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    days = ScheduledDay.query.options(
        joinedload(ScheduledDay.work_log).joinedload(WorkLogItem.price_item),
        joinedload(ScheduledDay.object),
    ).filter_by(user_id=user_id).order_by(ScheduledDay.date.asc()).all()

    admin_telegram_id = g.current_user.telegram_id
    payload = build_user_report_payload(user, days, admin_telegram_id)

    bot_internal_url = os.getenv('BOT_INTERNAL_URL', 'http://bot:8081')
    report_secret = os.getenv('REPORT_BOT_SECRET')
    if not report_secret:
        return jsonify({'error': 'REPORT_BOT_SECRET is not configured'}), 500

    try:
        response = requests.post(
            f"{bot_internal_url}/internal/report/user",
            json=payload,
            headers={'X-Report-Secret': report_secret},
            timeout=10,
        )
    except requests.RequestException as exc:
        return jsonify({'error': 'Bot is unavailable', 'details': str(exc)}), 502

    if response.status_code >= 400:
        return jsonify({'error': 'Bot error', 'details': response.text}), 502

    return jsonify({'success': True}), 202
