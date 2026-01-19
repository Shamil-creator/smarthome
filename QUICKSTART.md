b# SmartHome - Быстрый старт

## 🚀 Самый простой способ запуска

```bash
./start-dev.sh
```

Это запустит:
- Backend на `http://localhost:5001`
- Frontend на `http://localhost:5173`

## 📋 Требования

- Python 3.11+
- Node.js 18+
- npm или yarn

## 🛠️ Ручной запуск (пошагово)

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # или venv\Scripts\activate на Windows
pip install -r requirements.txt
python app.py
```

### 2. Frontend (в новом терминале)

```bash
npm install
npm run dev
```

## 🔧 Первый запуск

После запуска откройте в браузере: `http://localhost:5173`

### Создание администратора

Если вы используете приложение без Telegram бота:

1. Откройте DevTools (F12) в браузере
2. В консоли выполните:

```javascript
// Установите свой Telegram ID (любое число для тестирования)
localStorage.setItem('dev_telegram_id', '123456789');
```

3. Обновите страницу

## 🐳 Запуск через Docker

```bash
# Создайте .env файл
cp env.example .env
# Отредактируйте .env и добавьте BOT_TOKEN и WEBAPP_URL

# Запустите
docker-compose up --build
```

Для разработки без бота:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

## 🔑 Переменные окружения для разработки

Файл `.env` уже создан с настройками для разработки:

```env
SKIP_AUTH_VALIDATION=true  # Отключает проверку Telegram подписи
FLASK_ENV=development      # Режим разработки
FLASK_DEBUG=true          # Включает отладку
```

## 📝 Тестирование API

### Health Check
```bash
curl http://localhost:5001/api/health
```

### Создать пользователя
```bash
curl -X POST http://localhost:5001/api/users \
  -H "Content-Type: application/json" \
  -H "X-Telegram-User-Id: 123456789" \
  -d '{"telegramId": 123456789, "name": "Test User"}'
```

### Получить текущего пользователя
```bash
curl http://localhost:5001/api/user/me \
  -H "X-Telegram-User-Id: 123456789"
```

### Стать администратором
```bash
curl -X POST http://localhost:5001/api/users/set-admin \
  -H "Content-Type: application/json" \
  -H "X-Telegram-User-Id: 123456789" \
  -d '{"telegramId": 123456789}'
```

## 🐛 Отладка

### Backend не запускается

1. Проверьте, что установлены все зависимости:
```bash
cd backend
pip install -r requirements.txt
```

2. Проверьте, что порт 5001 свободен:
```bash
lsof -ti:5001
# Если занят, убейте процесс:
kill -9 $(lsof -ti:5001)
```

### Frontend не запускается

1. Очистите node_modules и переустановите:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Проверьте, что порт 5173 свободен:
```bash
lsof -ti:5173
```

### Ошибка 401 Authentication required

Убедитесь, что:
1. В `.env` установлено `SKIP_AUTH_VALIDATION=true`
2. Backend перезапущен после изменения .env
3. В запросах передается заголовок `X-Telegram-User-Id`

В логах backend должно быть:
```
AUTH: Running with SKIP_AUTH_VALIDATION=true - Telegram signature validation is DISABLED
```

## 📱 Интеграция с Telegram (опционально)

Для полной интеграции с Telegram ботом:

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Получите токен бота
3. Обновите `.env`:
```env
BOT_TOKEN=your_bot_token_here
WEBAPP_URL=http://localhost:5173
SKIP_AUTH_VALIDATION=false
```
4. Запустите бота:
```bash
cd bot
pip install -r requirements.txt
python main.py
```

Для доступа из Telegram используйте [ngrok](https://ngrok.com):
```bash
ngrok http 5173
# Используйте предоставленный HTTPS URL как WEBAPP_URL
```

## 📚 Дополнительная информация

- [LOCAL_SETUP.md](LOCAL_SETUP.md) - Подробная инструкция по локальной настройке
- [env.example](env.example) - Все доступные переменные окружения
- [Security Audit Plan](.cursor/plans/) - План безопасности проекта

## 🆘 Помощь

Если возникли проблемы:
1. Проверьте логи backend и frontend
2. Убедитесь, что все порты свободны
3. Перезапустите все сервисы
