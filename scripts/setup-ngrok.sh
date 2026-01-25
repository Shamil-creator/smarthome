#!/bin/bash
# setup-ngrok.sh - Автоматическая настройка ngrok URL для бота
# Использование: ./scripts/setup-ngrok.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

echo "🔍 Получение ngrok URL..."

# Получаем публичный URL из ngrok API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Ошибка: не удалось получить ngrok URL"
    echo ""
    echo "Убедитесь, что ngrok запущен:"
    echo "  ngrok http 8080"
    echo ""
    echo "Затем проверьте доступ к API:"
    echo "  curl http://localhost:4040/api/tunnels"
    exit 1
fi

echo "✅ Найден ngrok URL: $NGROK_URL"

# Создаем или обновляем .env файл
if [ -f "$ENV_FILE" ]; then
    # Проверяем, есть ли уже WEBAPP_URL
    if grep -q "^WEBAPP_URL=" "$ENV_FILE"; then
        # Обновляем существующее значение
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" "$ENV_FILE"
        else
            sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" "$ENV_FILE"
        fi
        echo "✅ Обновлен WEBAPP_URL в .env"
    else
        # Добавляем новую строку
        echo "WEBAPP_URL=$NGROK_URL" >> "$ENV_FILE"
        echo "✅ Добавлен WEBAPP_URL в .env"
    fi
else
    # Создаем новый .env файл из примера
    if [ -f "$PROJECT_DIR/env.example" ]; then
        cp "$PROJECT_DIR/env.example" "$ENV_FILE"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" "$ENV_FILE"
        else
            sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" "$ENV_FILE"
        fi
        echo "✅ Создан .env из env.example с WEBAPP_URL"
    else
        echo "WEBAPP_URL=$NGROK_URL" > "$ENV_FILE"
        echo "✅ Создан новый .env файл"
    fi
fi

echo ""
echo "📋 Текущие настройки в .env:"
grep -E "^(WEBAPP_URL|BOT_TOKEN)=" "$ENV_FILE" | sed 's/BOT_TOKEN=.*/BOT_TOKEN=***/'

echo ""
echo "🎉 Готово! Теперь можно запустить Docker:"
echo "  cd $PROJECT_DIR && docker-compose up --build"
