#!/bin/bash
# start-with-ngrok.sh - Полностью автоматизированный запуск с ngrok
# Использование: ./start-with-ngrok.sh
#
# Этот скрипт:
# 1. Запускает ngrok для туннелирования
# 2. Получает публичный HTTPS URL
# 3. Обновляет .env файл
# 4. Запускает Docker Compose с правильным URL

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   🏠 SmartHome - Автоматический запуск с ngrok${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Проверяем наличие необходимых инструментов
check_dependencies() {
    local missing=()
    
    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing+=("docker-compose")
    fi
    
    if ! command -v ngrok &> /dev/null; then
        missing+=("ngrok")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing+=("curl")
    fi
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}❌ Отсутствуют необходимые инструменты: ${missing[*]}${NC}"
        echo ""
        echo "Установите их и попробуйте снова:"
        echo "  - Docker: https://docs.docker.com/get-docker/"
        echo "  - ngrok: https://ngrok.com/download"
        exit 1
    fi
}

# Проверяем BOT_TOKEN
check_bot_token() {
    if [ -f .env ]; then
        source .env 2>/dev/null || true
    fi
    
    if [ -z "$BOT_TOKEN" ] || [ "$BOT_TOKEN" = "your_bot_token_here" ]; then
        echo -e "${YELLOW}⚠️  BOT_TOKEN не настроен!${NC}"
        echo ""
        echo "Введите токен вашего Telegram бота (получите у @BotFather):"
        read -r BOT_TOKEN
        
        if [ -z "$BOT_TOKEN" ]; then
            echo -e "${RED}❌ BOT_TOKEN обязателен для работы${NC}"
            exit 1
        fi
        
        # Сохраняем токен в .env
        if [ -f .env ]; then
            if grep -q "^BOT_TOKEN=" .env; then
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sed -i '' "s|^BOT_TOKEN=.*|BOT_TOKEN=$BOT_TOKEN|" .env
                else
                    sed -i "s|^BOT_TOKEN=.*|BOT_TOKEN=$BOT_TOKEN|" .env
                fi
            else
                echo "BOT_TOKEN=$BOT_TOKEN" >> .env
            fi
        else
            cp env.example .env 2>/dev/null || echo "BOT_TOKEN=$BOT_TOKEN" > .env
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^BOT_TOKEN=.*|BOT_TOKEN=$BOT_TOKEN|" .env
            else
                sed -i "s|^BOT_TOKEN=.*|BOT_TOKEN=$BOT_TOKEN|" .env
            fi
        fi
        echo -e "${GREEN}✅ BOT_TOKEN сохранен${NC}"
    fi
}

# Останавливаем предыдущие контейнеры
cleanup_previous() {
    echo -e "${YELLOW}🧹 Остановка предыдущих контейнеров...${NC}"
    docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true
    
    # Проверяем, запущен ли ngrok и останавливаем
    pkill -f "ngrok http" 2>/dev/null || true
    sleep 2
}

# Запускаем ngrok
start_ngrok() {
    echo -e "${BLUE}📡 Запуск ngrok...${NC}"
    
    # Запускаем ngrok в фоне
    ngrok http 8080 > /dev/null 2>&1 &
    NGROK_PID=$!
    
    # Сохраняем PID для последующей остановки
    echo $NGROK_PID > .ngrok.pid
    
    echo "   PID: $NGROK_PID"
    
    # Ждем запуска ngrok (до 30 секунд)
    echo -n "   Ожидание запуска"
    for i in {1..30}; do
        if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
            echo ""
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo ""
    echo -e "${RED}❌ ngrok не запустился за 30 секунд${NC}"
    kill $NGROK_PID 2>/dev/null || true
    exit 1
}

# Получаем URL из ngrok
get_ngrok_url() {
    echo -e "${BLUE}🔍 Получение публичного URL...${NC}"
    
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$NGROK_URL" ]; then
        echo -e "${RED}❌ Не удалось получить URL из ngrok${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ URL: $NGROK_URL${NC}"
}

# Обновляем .env файл
update_env() {
    echo -e "${BLUE}📝 Обновление конфигурации...${NC}"
    
    if [ -f .env ]; then
        if grep -q "^WEBAPP_URL=" .env; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" .env
            else
                sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" .env
            fi
        else
            echo "WEBAPP_URL=$NGROK_URL" >> .env
        fi
    else
        if [ -f env.example ]; then
            cp env.example .env
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" .env
            else
                sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" .env
            fi
        else
            echo "WEBAPP_URL=$NGROK_URL" > .env
        fi
    fi
    
    echo -e "${GREEN}✅ WEBAPP_URL обновлен${NC}"
}

# Запускаем Docker Compose
start_docker() {
    echo -e "${BLUE}🐳 Запуск Docker Compose...${NC}"
    echo ""
    
    # Определяем команду docker compose
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    $COMPOSE_CMD up --build -d
    
    echo ""
    echo -e "${GREEN}✅ Контейнеры запущены${NC}"
}

# Ждем готовности сервисов
wait_for_services() {
    echo -e "${BLUE}⏳ Ожидание готовности сервисов...${NC}"
    
    # Ждем backend
    echo -n "   Backend"
    for i in {1..60}; do
        if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        echo -n "."
        sleep 2
    done
    
    # Ждем frontend
    echo -n "   Frontend"
    for i in {1..30}; do
        if curl -s http://localhost:8080 > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        echo -n "."
        sleep 2
    done
}

# Показываем итоговую информацию
show_info() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}   🎉 Приложение успешно запущено!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "   ${BLUE}🌐 Telegram WebApp URL:${NC}"
    echo -e "      $NGROK_URL"
    echo ""
    echo -e "   ${BLUE}📊 Локальные адреса:${NC}"
    echo -e "      Frontend: http://localhost:8080"
    echo -e "      Backend:  http://localhost:5000"
    echo -e "      ngrok:    http://localhost:4040"
    echo ""
    echo -e "   ${BLUE}🤖 Telegram бот:${NC}"
    echo -e "      Откройте бота и отправьте /start"
    echo ""
    echo -e "   ${YELLOW}📝 Остановка:${NC}"
    echo -e "      ./stop-with-ngrok.sh"
    echo -e "      или: docker-compose down && kill \$(cat .ngrok.pid)"
    echo ""
}

# Основной процесс
main() {
    check_dependencies
    check_bot_token
    cleanup_previous
    start_ngrok
    get_ngrok_url
    update_env
    start_docker
    wait_for_services
    show_info
}

# Запуск
main
