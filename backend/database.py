from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    telegram_id = db.Column(db.BigInteger, unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), default='installer')  # 'admin' or 'installer'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships - use selectin for efficient batch loading
    scheduled_days = db.relationship('ScheduledDay', backref='user', lazy='selectin')
    
    def to_dict(self):
        return {
            'id': self.id,
            'telegramId': self.telegram_id,
            'name': self.name,
            'role': self.role,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class ClientObject(db.Model):
    __tablename__ = 'client_objects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    address = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(50), default='active', index=True)  # 'active', 'completed', 'maintenance'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships - use selectin for efficient batch loading (fixes N+1)
    docs = db.relationship('DocItem', backref='object', lazy='selectin', foreign_keys='DocItem.object_id')
    scheduled_days = db.relationship('ScheduledDay', backref='object', lazy='selectin')
    
    def to_dict(self, include_docs=True):
        result = {
            'id': str(self.id),
            'name': self.name,
            'address': self.address,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }
        if include_docs:
            result['docs'] = [doc.to_dict() for doc in self.docs]
        return result


class PriceItem(db.Model):
    __tablename__ = 'price_items'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    price = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'category': self.category,
            'name': self.name,
            'price': self.price
        }


class ScheduledDay(db.Model):
    __tablename__ = 'scheduled_days'
    __table_args__ = (
        db.Index('idx_schedule_user_date', 'user_id', 'date'),  # Composite index for common queries
    )
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    date = db.Column(db.String(10), nullable=False, index=True)  # YYYY-MM-DD format
    object_id = db.Column(db.Integer, db.ForeignKey('client_objects.id'), nullable=True, index=True)
    completed = db.Column(db.Boolean, default=False)
    # Status: draft, pending_approval, approved_waiting_payment, paid_waiting_confirmation, completed
    status = db.Column(db.String(50), default='draft', index=True)
    earnings = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships - use selectin for efficient batch loading (fixes N+1)
    work_log = db.relationship('WorkLogItem', backref='scheduled_day', lazy='selectin', cascade='all, delete-orphan')
    
    def to_dict(self):
        # Sync status with completed for backward compatibility
        effective_status = self.status or ('completed' if self.completed else 'draft')
        return {
            'id': self.id,
            'userId': self.user_id,
            'date': self.date,
            'objectId': str(self.object_id) if self.object_id else None,
            'completed': self.completed,
            'status': effective_status,
            'earnings': self.earnings,
            'workLog': [item.to_dict() for item in self.work_log]
        }


class WorkLogItem(db.Model):
    __tablename__ = 'work_log_items'
    
    id = db.Column(db.Integer, primary_key=True)
    scheduled_day_id = db.Column(db.Integer, db.ForeignKey('scheduled_days.id'), nullable=False, index=True)
    price_item_id = db.Column(db.Integer, db.ForeignKey('price_items.id'), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    coefficient = db.Column(db.Float, nullable=False, default=1.0)  # Set by admin during approval
    
    # Relationship to get price info - use selectin for batch loading
    price_item = db.relationship('PriceItem', lazy='selectin')
    
    def to_dict(self):
        return {
            'itemId': str(self.price_item_id),
            'quantity': self.quantity,
            'coefficient': self.coefficient
        }


class DocItem(db.Model):
    __tablename__ = 'doc_items'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # 'pdf', 'img', 'text', 'link'
    url = db.Column(db.String(500), nullable=True)
    content = db.Column(db.Text, nullable=True)
    object_id = db.Column(db.Integer, db.ForeignKey('client_objects.id'), nullable=True, index=True)  # NULL = general doc
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        result = {
            'id': str(self.id),
            'title': self.title,
            'type': self.type
        }
        if self.url:
            result['url'] = self.url
        if self.content:
            result['content'] = self.content
        if self.object_id:
            result['objectId'] = str(self.object_id)
        return result


def init_db(app):
    """Initialize database with sample data if empty"""
    with app.app_context():
        db.create_all()

        # Lightweight migration for existing SQLite DBs (add coefficient column to work_log_items)
        try:
            columns = db.session.execute(text("PRAGMA table_info(work_log_items)")).fetchall()
            column_names = {row[1] for row in columns}
            if 'coefficient' not in column_names:
                db.session.execute(text(
                    "ALTER TABLE work_log_items ADD COLUMN coefficient FLOAT NOT NULL DEFAULT 1.0"
                ))
                db.session.commit()
        except Exception:
            db.session.rollback()
        
        # Check if we need to seed data
        if PriceItem.query.count() == 0:
            # Seed price items (coefficient is now set per work log item, not per price)
            prices = [
                PriceItem(category='Датчики', name='Монтаж датчика протечки', price=500),
                PriceItem(category='Датчики', name='Монтаж датчика движения', price=600),
                PriceItem(category='Датчики', name='Настройка датчика открытия', price=450),
                PriceItem(category='Инфраструктура', name='Установка и настройка Хаба', price=1500),
                PriceItem(category='Инфраструктура', name='Расключение реле в щите', price=1200),
                PriceItem(category='Инфраструктура', name='Укладка кабеля (за м)', price=100),
                PriceItem(category='Освещение', name='Установка умного выключателя', price=800),
                PriceItem(category='Освещение', name='Контроллер RGB ленты', price=950),
                PriceItem(category='Пусконаладка', name='Программирование сценариев', price=2000),
                PriceItem(category='Пусконаладка', name='Настройка приложения клиента', price=1000),
            ]
            db.session.add_all(prices)
            
        if ClientObject.query.count() == 0:
            # Seed client objects
            obj1 = ClientObject(name='Вилла "Барвиха"', address='Рублево-Успенское ш., 42', status='active')
            obj2 = ClientObject(name='ЖК "Небо"', address='Мичуринский проспект, 56, кв 102', status='maintenance')
            obj3 = ClientObject(name='Офис "TechCorp"', address='Тверская 12, 4 этаж', status='completed')
            db.session.add_all([obj1, obj2, obj3])
            db.session.flush()
            
            # Add docs to objects
            docs = [
                DocItem(title='Схема проводки v2.0', type='pdf', object_id=obj1.id),
                DocItem(title='Фото размещения хаба', type='img', object_id=obj1.id),
                DocItem(title='Код и Wi-Fi', type='text', content='Код: 4589, WiFi: SmartHome_Guest / Пароль: instal123', object_id=obj1.id),
                DocItem(title='Список датчиков', type='text', content='Кухня: 2 протечки, Холл: 1 движение', object_id=obj2.id),
                DocItem(title='Пропуск на въезд', type='img', object_id=obj2.id),
            ]
            db.session.add_all(docs)
            
        if DocItem.query.filter_by(object_id=None).count() == 0:
            # Seed general docs
            general_docs = [
                DocItem(title='Регламент работ 2025', type='pdf'),
                DocItem(title='Настройка роутера Mikrotik', type='link', url='https://wiki.mikrotik.com/wiki/Manual:TOC'),
                DocItem(title='Пароли от сервисов', type='text', content='CRM: admin/admin123'),
            ]
            db.session.add_all(general_docs)
            
        db.session.commit()
