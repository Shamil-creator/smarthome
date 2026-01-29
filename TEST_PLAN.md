# Test Plan: SmartHome Installer Pro

Цель: покрыть максимально возможные сценарии для фронтенда, backend API и Telegram-бота,
включая позитивные/негативные случаи, безопасность, роли, статусы, загрузку файлов
и устойчивость к ошибкам/тайм-аутам.

## 1) Общие проверки
- Запуск локально без Docker: frontend + backend + bot
- Запуск через Docker Compose
- Проверка .env (обязательные переменные, дефолты)
- Совместимость с dev-режимом (SKIP_AUTH_VALIDATION)
- Проверка health endpoint `/api/health`

## 2) Аутентификация/авторизация
- Валидация Telegram initData (валидная/невалидная подпись, просроченный auth_date)
- Поведение с SKIP_AUTH_VALIDATION=true
- Запрет доступа по X-Telegram-User-Id в production
- Отсутствие пользователя в БД -> 404 `User not found`
- Роли: admin vs installer
- Ограничения на admin-only endpoints

## 3) Users API
- GET `/user/me` (auth required)
- GET `/users` (admin only)
- POST `/users`:
  - валидный payload
  - отсутствуют telegramId/name
  - telegramId не int/<=0
  - попытка создать admin не-админом (role принудительно installer)
  - duplicate -> 409
- PUT `/users/:id` (admin only)
  - смена роли (валидная/невалидная)
  - пустое имя
- POST `/users/set-admin`
  - валидный telegramId
  - пользователь не найден
- GET `/users/check-admin`

## 4) Objects API
- GET `/objects` (auth)
- GET `/objects/:id` (auth)
- POST `/objects` (admin only)
  - валидные поля
  - отсутствует name/address
  - status не из списка
- PUT `/objects/:id` (admin only)
  - пустые name/address
  - status не из списка
- DELETE `/objects/:id` (admin only)

## 5) Prices API
- GET `/prices` (auth)
- GET `/prices/:id`
- POST `/prices` (admin only)
  - price int >=0
  - coefficient > 0
  - category/name обязательны
- PUT `/prices/:id` (admin only)
  - обновление полей
  - ошибки валидации
- DELETE `/prices/:id` (admin only)

## 6) Schedule API (workflow)
- GET `/schedule` (auth), фильтр userId (валид/невалид)
- POST `/schedule`:
  - создать новый
  - обновить существующий
  - роли (installer не может редактировать чужой)
  - status ограничения для installer
- PUT `/schedule/:id`
  - objectId, workLog
  - недопустимые workLog itemId/quantity
- POST `/schedule/complete`
  - расчет earnings (валидный workLog)
  - запрет чужих userId
  - статус draft/pending_approval
- PUT `/schedule/:id/edit`
  - статусные ограничения
- POST `/schedule/:id/approve`
  - только pending_approval
- POST `/schedule/:id/reject`
  - только pending_approval
- POST `/schedule/:id/mark-paid`
  - только approved_waiting_payment
- POST `/schedule/:id/confirm-payment`
  - только paid_waiting_confirmation
- GET `/schedule/pending` (admin only)

## 7) Docs API + Uploads
- GET `/docs`, `/docs/general`
- GET `/docs?objectId=...` (валидация id)
- POST `/docs` (admin)
  - title/type required
  - type ограничен
  - url формат (http/https или /api/files)
  - content size <= 50KB
- PUT `/docs/:id`
  - обновление полей и валидации
- POST `/docs/upload`
  - валидный файл (pdf/png/jpg/gif/docx)
  - неправильный mime/extension
  - неверная сигнатура файла
  - имя файла с опасными паттернами
  - max size > 10MB
- GET `/api/files/:filename` (path traversal, null byte, not found)
- DELETE `/docs/:id` удаляет file при /api/files/...

## 8) Utils (file handling)
- is_allowed_file / is_valid_filename (null bytes, path traversal, double ext)
- validate_file_signature (pdf/png/jpg/gif/docx)
- validate_file_content (опасные паттерны в header)
- generate_unique_filename

## 9) Frontend (UI/Logic)
- Инициализация с Telegram WebApp (tg ready/expand)
- Dev-режим без Telegram: создание dev пользователя
- Loaders/ошибки: отсутствие API, timeout
- Ленивая загрузка данных при переходе по tabs
- Dashboard:
  - подсчет weeklyTotal
  - статусы и бейджи
- ScheduleView:
  - отображение задач
  - фильтрация по пользователю
- WorkReport:
  - создание отчета, подсчет заработка
  - ограничения по статусу
- KnowledgeBase:
  - общие/объектные документы
  - загрузка файла
- AdminView:
  - управление пользователями
  - объекты, прайс, документы

## 10) Bot
- /start создает пользователя, присылает WebApp кнопку
- /status для зарегистрированного/незарегистрированного
- /help
- неизвестные команды
- /set_admin_Asdvcxa13r1 (успех/ошибка)

## 11) Нагрузочные и устойчивость
- Rate limiting (429)
- Таймауты API (frontend helper)
- Поведение при 500 (backend errorhandler)

## 12) Безопасность
- Security headers
- CORS
- Ограничение размеров upload
- Запрет path traversal

