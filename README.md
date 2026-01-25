# 🏠 SmartHome Installer Pro

Telegram Mini App для управления монтажниками умного дома.

## 🚀 Быстрый старт (с ngrok)

```bash
# Одна команда для запуска всего
./start-with-ngrok.sh
```

Скрипт автоматически:
1. ✅ Запустит ngrok для HTTPS-туннеля
2. ✅ Получит публичный URL
3. ✅ Настроит конфигурацию
4. ✅ Соберет и запустит Docker контейнеры
5. ✅ Запросит BOT_TOKEN если нужно

## 📋 Требования

### Для локальной разработки
- Python 3.11+
- Node.js 18+
- npm

### Для Docker
- Docker 20+
- Docker Compose 2+
- ngrok (для Telegram WebApp)

## 🖥️ Требования к серверу

### Минимальные
| Параметр | Значение |
|----------|----------|
| CPU | 1-2 ядра |
| RAM | 1-2 GB |
| Диск | 5-10 GB |
| ОС | Ubuntu 20.04+ / Debian 11+ |

### Рекомендуемые
| Параметр | Значение |
|----------|----------|
| CPU | 2-4 ядра |
| RAM | 2-4 GB |
| Диск | 20 GB SSD |
| ОС | Ubuntu 22.04 LTS |

### Потребление ресурсов
- **Frontend (nginx)**: ~64-256 MB RAM
- **Backend (Flask)**: ~128-512 MB RAM
- **Bot (Python)**: ~64-256 MB RAM
- **Docker overhead**: ~200-500 MB RAM

## 🔧 Установка

### 1. Клонирование репозитория

```bash
git clone <repo-url>
cd smarthome
```

### 2. Создание Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Сохраните полученный токен

### 3. Установка ngrok

```bash
# macOS
brew install ngrok

# Linux
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && \
  echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | \
  sudo tee /etc/apt/sources.list.d/ngrok.list && \
  sudo apt update && sudo apt install ngrok

# Авторизация (бесплатный аккаунт на ngrok.com)
ngrok config add-authtoken <YOUR_AUTH_TOKEN>
```

### 4. Запуск

```bash
./start-with-ngrok.sh
```

## 🛠️ Ручной запуск

### Вариант 1: Docker Compose

```bash
# 1. Создайте .env
cp env.example .env

# 2. Заполните BOT_TOKEN

# 3. Запустите ngrok
ngrok http 8080

# 4. Скопируйте HTTPS URL в .env как WEBAPP_URL

# 5. Запустите
docker-compose up --build
```

### Вариант 2: Без Docker

```bash
# Backend (терминал 1)
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py

# Frontend (терминал 2)
npm install
npm run dev

# Bot (терминал 3)
cd bot
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## 📁 Структура проекта

```
smarthome/
├── App.tsx                 # Главный React компонент
├── components/            # React компоненты
│   ├── AdminView.tsx      # Панель администратора
│   ├── Dashboard.tsx      # Главная страница
│   ├── KnowledgeBase.tsx  # База знаний
│   ├── ScheduleView.tsx   # Расписание
│   └── WorkReport.tsx     # Отчеты о работе
├── backend/               # Flask API
│   ├── app.py            # Точка входа
│   ├── database.py       # Модели БД
│   ├── auth.py           # Авторизация
│   └── routes/           # API endpoints
├── bot/                   # Telegram бот
│   └── main.py           # Aiogram бот
├── docker-compose.yml     # Docker конфигурация
├── Dockerfile            # Frontend Dockerfile
├── start-with-ngrok.sh   # Авто-запуск с ngrok
└── stop-with-ngrok.sh    # Остановка
```

## 🔒 Безопасность

- ✅ Все контейнеры работают от non-root пользователей
- ✅ Ограничение ресурсов для защиты от DoS
- ✅ Rate limiting на API endpoints
- ✅ Валидация Telegram WebApp данных
- ✅ HTTPS через ngrok
- ✅ Security headers в nginx

## 🌐 Переменные окружения

| Переменная | Обязательная | Описание |
|------------|--------------|----------|
| `BOT_TOKEN` | ✅ | Токен Telegram бота |
| `WEBAPP_URL` | ✅ | HTTPS URL приложения |
| `FLASK_ENV` | ❌ | `production` или `development` |
| `SKIP_AUTH_VALIDATION` | ❌ | `true` для отключения проверки подписи |
| `ALLOWED_ORIGINS` | ❌ | CORS origins через запятую |

## 📝 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Открыть приложение |
| `/set_admin` | Стать администратором (если нет других) |
| `/status` | Проверить статус аккаунта |
| `/help` | Показать справку |

## 🐛 Устранение неполадок

### ngrok не запускается

```bash
# Проверьте авторизацию
ngrok config check

# Убейте предыдущие процессы
pkill -f ngrok
```

### Docker ошибки

```bash
# Очистите все
docker-compose down -v
docker system prune -f

# Пересоберите
docker-compose up --build
```

### Порты заняты

```bash
# Найдите процессы
lsof -i :8080
lsof -i :5000

# Убейте их
kill -9 <PID>
```

## 📞 Остановка

```bash
./stop-with-ngrok.sh
```

Или вручную:

```bash
docker-compose down
pkill -f ngrok
```

## 📚 Дополнительно

- [QUICKSTART.md](QUICKSTART.md) - Краткое руководство
- [LOCAL_SETUP.md](LOCAL_SETUP.md) - Локальная настройка
- [env.example](env.example) - Все переменные окружения

## 📄 Лицензия

MIT
