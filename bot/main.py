import asyncio
import io
import logging
import os
import aiohttp
from pathlib import Path
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, BufferedInputFile
from aiohttp import web
from openpyxl import Workbook

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    # Load .env from parent directory (project root)
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)
        logger_temp = logging.getLogger(__name__)
        logger_temp.info(f"Loaded .env from {env_path}")
    else:
        # Try current directory
        env_path = Path('.env')
        if env_path.exists():
            load_dotenv(env_path, override=True)
            logger_temp = logging.getLogger(__name__)
            logger_temp.info(f"Loaded .env from {env_path}")
except ImportError:
    # python-dotenv not installed, try manual parsing
    try:
        env_path = Path(__file__).parent.parent / '.env'
        if not env_path.exists():
            env_path = Path('.env')
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()
            logger_temp = logging.getLogger(__name__)
            logger_temp.info(f"Loaded .env manually from {env_path}")
    except Exception:
        pass

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot configuration from environment variables (REQUIRED)
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
API_URL = os.getenv("API_URL", "http://localhost:5001/api")
REPORT_BOT_SECRET = os.getenv("REPORT_BOT_SECRET")
BOT_INTERNAL_PORT = int(os.getenv("BOT_INTERNAL_PORT", "8081"))

# Validate required environment variables
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN environment variable is required. Please set it in .env file or environment.")
if not WEBAPP_URL:
    raise ValueError("WEBAPP_URL environment variable is required. Please set it in .env file or environment.")

logger.info(f"WEBAPP_URL: {WEBAPP_URL}")
logger.info(f"API_URL: {API_URL}")
logger.info(f"BOT_INTERNAL_PORT: {BOT_INTERNAL_PORT}")

# Initialize bot and dispatcher
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

def generate_user_report_xlsx(payload: dict) -> bytes:
    user = payload.get("user", {})
    summary = payload.get("summary", {})
    days = payload.get("days", [])

    wb = Workbook()
    ws_summary = wb.active
    ws_summary.title = "Summary"
    ws_summary.append(["Поле", "Значение"])
    ws_summary.append(["Пользователь", user.get("name") or ""])
    ws_summary.append(["Роль", user.get("role") or ""])
    ws_summary.append(["Период", "Все время"])
    ws_summary.append(["Кол-во дней", summary.get("totalDays", 0)])
    ws_summary.append(["Сумма", summary.get("totalEarnings", 0)])
    ws_summary.append(["Сформирован", payload.get("generatedAt") or ""])

    ws_history = wb.create_sheet("History")
    ws_history.append(["Дата", "Объект", "Адрес", "Статус", "Заработок", "Работы", "Комментарий"])

    if days:
        for day in days:
            obj = day.get("object") or {}
            work_log = day.get("workLog") or []
            works = "; ".join([f"{item.get('name', '')} x{item.get('quantity', 0)}" for item in work_log if item]) or "Нет данных"
            ws_history.append([
                day.get("date") or "",
                obj.get("name") or "-",
                obj.get("address") or "-",
                day.get("status") or "",
                day.get("earnings") or 0,
                works,
                day.get("installerComment") or "-",
            ])
    else:
        ws_history.append(["Нет данных", "", "", "", "", "", ""])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()


async def handle_user_report_request(request: web.Request) -> web.Response:
    secret = request.headers.get("X-Report-Secret")
    if not REPORT_BOT_SECRET or secret != REPORT_BOT_SECRET:
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    admin_id = payload.get("adminTelegramId")
    if not admin_id:
        return web.json_response({"error": "adminTelegramId is required"}, status=400)

    try:
        report_bytes = generate_user_report_xlsx(payload)
        user_name = (payload.get("user") or {}).get("name", "user")
        filename = f"report_{user_name}.xlsx".replace(" ", "_")
        document = BufferedInputFile(report_bytes, filename=filename)
        await bot.send_document(
            chat_id=int(admin_id),
            document=document,
            caption="Отчет о пользователе",
        )
    except Exception as exc:
        logger.exception(f"Failed to generate/send report: {exc}")
        return web.json_response({"error": "Failed to send report"}, status=500)

    return web.json_response({"success": True})


async def start_internal_server() -> web.AppRunner:
    app = web.Application()
    app.router.add_post("/internal/report/user", handle_user_report_request)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=BOT_INTERNAL_PORT)
    await site.start()
    logger.info("Internal report server started")
    return runner


async def api_request(method: str, endpoint: str, data: dict = None, telegram_id: int = None):
    """Make API request to backend"""
    headers = {"Content-Type": "application/json"}
    if telegram_id:
        headers["X-Telegram-User-Id"] = str(telegram_id)
    
    url = f"{API_URL}{endpoint}"
    
    async with aiohttp.ClientSession() as session:
        try:
            if method == "GET":
                async with session.get(url, headers=headers) as response:
                    return await response.json(), response.status
            elif method == "POST":
                async with session.post(url, headers=headers, json=data) as response:
                    return await response.json(), response.status
            elif method == "PUT":
                async with session.put(url, headers=headers, json=data) as response:
                    return await response.json(), response.status
        except aiohttp.ClientError as e:
            logger.error(f"API request error: {e}")
            return {"error": str(e)}, 500
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return {"error": str(e)}, 500


async def get_or_create_user(telegram_user: types.User) -> dict:
    """Get existing user or create new one"""
    # Try to get existing user
    result, status = await api_request("GET", "/user/me", telegram_id=telegram_user.id)
    
    if status == 200:
        return result
    
    # Create new user
    name = telegram_user.first_name
    if telegram_user.last_name:
        name += f" {telegram_user.last_name}"
    
    user_data = {
        "telegramId": telegram_user.id,
        "name": name,
        "role": "installer"
    }
    
    result, status = await api_request("POST", "/users", user_data)
    
    if status in [200, 201]:
        return result
    elif status == 409:  # User already exists
        # Try to get again
        result, status = await api_request("GET", "/user/me", telegram_id=telegram_user.id)
        if status == 200:
            return result
    
    return None


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    """Handle /start command"""
    user = await get_or_create_user(message.from_user)
    
    if not user:
        await message.answer(
            "❌ Произошла ошибка при регистрации. Пожалуйста, попробуйте позже."
        )
        return
    
    # Create keyboard with WebApp button
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🏠 Открыть приложение",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )]
    ])
    
    role_text = "администратор" if user.get("role") == "admin" else "монтажник"
    
    await message.answer(
        f"👋 Привет, {user.get('name', 'пользователь')}!\n\n"
        f"🔑 Ваша роль: {role_text}\n\n"
        f"Это приложение для монтажников умного дома. "
        f"Здесь вы можете:\n\n"
        f"📅 Смотреть расписание\n"
        f"📝 Заполнять отчеты о работе\n"
        f"📚 Пользоваться базой знаний\n\n"
        f"Нажмите кнопку ниже, чтобы открыть приложение:",
        reply_markup=keyboard
    )


@dp.message(Command("set_admin_Asdvcxa13r1"))
async def cmd_set_admin(message: types.Message):
    """Handle /set_admin_Asdvcxa13r1 command - set user as admin"""
    
    # First, ensure user is registered
    user = await get_or_create_user(message.from_user)
    
    if not user:
        await message.answer("❌ Ошибка регистрации. Попробуйте сначала /start")
        return
    
    # Set user as admin
    result, status = await api_request(
        "POST", 
        "/users/set-admin",
        {"telegramId": message.from_user.id}
    )
    
    if status == 200:
        await message.answer(
            "✅ Поздравляем! Вы назначены администратором.\n\n"
            "Теперь вам доступны:\n"
            "👥 Управление пользователями\n"
            "🏢 Управление объектами\n"
            "💰 Редактирование прайс-листа\n"
            "📄 Управление документами\n\n"
            "Используйте /start чтобы открыть приложение."
        )
    else:
        error_msg = result.get("error", "Неизвестная ошибка")
        await message.answer(f"❌ Ошибка: {error_msg}")


@dp.message(Command("help"))
async def cmd_help(message: types.Message):
    """Handle /help command"""
    await message.answer(
        "📖 Справка по боту\n\n"
        "Доступные команды:\n\n"
        "/start - Начать работу и открыть приложение\n"
        "/help - Показать эту справку\n"
        "/status - Проверить статус вашего аккаунта\n\n"
        "Если у вас возникли проблемы, обратитесь к администратору."
    )


@dp.message(Command("status"))
async def cmd_status(message: types.Message):
    """Handle /status command"""
    result, status = await api_request("GET", "/user/me", telegram_id=message.from_user.id)
    
    if status == 200:
        role_text = "👑 Администратор" if result.get("role") == "admin" else "🔧 Монтажник"
        await message.answer(
            f"📊 Статус аккаунта\n\n"
            f"👤 Имя: {result.get('name')}\n"
            f"🔑 Роль: {role_text}\n"
            f"🆔 ID: {result.get('id')}"
        )
    else:
        await message.answer(
            "❌ Вы не зарегистрированы.\n\n"
            "Используйте /start для регистрации."
        )


@dp.message()
async def handle_unknown(message: types.Message):
    """Handle unknown messages"""
    await message.answer(
        "🤔 Не понимаю эту команду.\n\n"
        "Используйте /help для просмотра доступных команд\n"
        "или /start чтобы открыть приложение."
    )


async def main():
    """Start the bot"""
    logger.info("Starting bot...")
    
    # Delete webhook before polling
    await bot.delete_webhook(drop_pending_updates=True)

    runner = await start_internal_server()
    try:
        # Start polling
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
