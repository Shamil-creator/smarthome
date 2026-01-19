# Инструкция по локальной настройке

## Вариант 1: Использование Vite Proxy (Рекомендуется для локальной разработки)

Это самый простой способ для локального тестирования.

### Шаги:

1. **Запустите Backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
   Backend будет работать на `http://localhost:5000`

2. **Запустите Frontend:**
   ```bash
   npm run dev
   ```
   Frontend будет работать на `http://localhost:3000`

3. **Настройте ngrok для Telegram WebApp:**
   ```bash
   ngrok http 3000
   ```
   Скопируйте HTTPS URL (например: `https://abc123.ngrok.io`)

4. **Создайте `.env` файл:**
   ```bash
   cp .env.example .env
   ```
   
   В `.env` укажите:
   ```env
   BOT_TOKEN=8398766916:AAHehxRLqfa_xumrAXr3ibStjXpWEZF5kB8
   WEBAPP_URL=https://abc123.ngrok.io  # Ваш ngrok URL
   # VITE_API_URL не нужен - будет использован Vite proxy
   GEMINI_API_KEY=your_key_here
   ```

5. **Запустите бота:**
   ```bash
   cd bot
   pip install -r requirements.txt
   python main.py
   ```

### Как это работает:

- Vite автоматически проксирует все запросы к `/api` на `http://localhost:5000`
- Frontend работает через ngrok (HTTPS для Telegram)
- Backend остается на localhost (не нужен ngrok для него)
- Telegram бот использует ngrok URL для WebApp

---

## Вариант 2: Backend через ngrok (Если нужен прямой доступ к API)

Если вы хотите, чтобы API был доступен напрямую через HTTPS:

1. **Запустите Backend:**
   ```bash
   cd backend
   python app.py
   ```

2. **Создайте ngrok туннель для Backend:**
   ```bash
   ngrok http 5000
   ```
   Скопируйте HTTPS URL (например: `https://xyz789.ngrok.io`)

3. **Создайте ngrok туннель для Frontend:**
   ```bash
   ngrok http 3000
   ```
   Скопируйте HTTPS URL (например: `https://abc123.ngrok.io`)

4. **В `.env` укажите:**
   ```env
   BOT_TOKEN=8398766916:AAHehxRLqfa_xumrAXr3ibStjXpWEZF5kB8
   WEBAPP_URL=https://abc123.ngrok.io  # Frontend URL
   VITE_API_URL=https://xyz789.ngrok.io/api  # Backend URL
   GEMINI_API_KEY=your_key_here
   ```

5. **Запустите Frontend и бота** как в варианте 1

---

## Рекомендация

**Используйте Вариант 1** - он проще и не требует два ngrok туннеля. Vite proxy отлично работает для локальной разработки.
