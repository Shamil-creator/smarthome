#!/bin/bash
# stop-with-ngrok.sh - Остановка приложения и ngrok
# Использование: ./stop-with-ngrok.sh

set -e

# Добавляем стандартные пути в PATH
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/snap/bin:$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Остановка SmartHome..."

# Останавливаем Docker контейнеры
echo "   Остановка Docker контейнеров..."
if docker compose version &> /dev/null; then
    docker compose down 2>/dev/null || true
else
    docker-compose down 2>/dev/null || true
fi

# Останавливаем ngrok
echo "   Остановка ngrok..."
if [ -f .ngrok.pid ]; then
    kill $(cat .ngrok.pid) 2>/dev/null || true
    rm .ngrok.pid
fi
pkill -f "ngrok http" 2>/dev/null || true

echo ""
echo "✅ Все сервисы остановлены"
