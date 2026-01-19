import { GoogleGenAI } from "@google/genai";
import { PriceItem, WorkLogItem } from "../types";

// Lazy initialization - only create AI client when needed and if API key is available
let ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI | null => {
  if (ai) return ai;
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn('Gemini API key not found. AI report generation will be disabled.');
    return null;
  }
  
  try {
    ai = new GoogleGenAI({ apiKey });
    return ai;
  } catch (error) {
    console.error('Failed to initialize Gemini AI:', error);
    return null;
  }
};

export const generateShiftSummary = async (
  objectName: string,
  logItems: WorkLogItem[],
  priceList: PriceItem[],
  total: number
): Promise<string> => {
  const aiClient = getAI();
  
  // If AI is not available, generate a simple template report
  if (!aiClient) {
    const itemDetails = logItems.map(log => {
      const item = priceList.find(p => p.id === log.itemId);
      const itemPrice = item ? item.price * log.quantity : 0;
      return `- ${item?.name || 'Неизвестная работа'}: ${log.quantity} шт. (${itemPrice} ₽)`;
    }).join('\n');
    
    return `📋 Отчет о работе

🏢 Объект: ${objectName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

✅ Выполненные работы:
${itemDetails}

💰 Итого: ${total.toLocaleString()} ₽

📝 Замечания/Проблемы:
(заполните при необходимости)`;
  }

  try {
    const itemDetails = logItems.map(log => {
      const item = priceList.find(p => p.id === log.itemId);
      return `- ${item?.name || 'Неизвестная работа'}: ${log.quantity} шт.`;
    }).join('\n');

    const prompt = `
      Ты профессиональный помощник монтажника умного дома. 
      Сгенерируй краткий, вежливый и структурированный отчет о проделанной работе за день для отправки менеджеру в Telegram.
      Используй русский язык.
      
      Вводные данные:
      - Объект: ${objectName}
      - Дата: ${new Date().toLocaleDateString('ru-RU')}
      - Выполненные работы:
      ${itemDetails}
      - Итого заработано: ${total} руб.
      
      Структура сообщения должна быть чистой, используй подходящие эмодзи. 
      В конце добавь поле "Замечания/Проблемы:" (оставь пустым для заполнения).
    `;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Не удалось сгенерировать отчет.";
  } catch (error) {
    console.error("Gemini Error:", error);
    // Fallback to template if AI fails
    const itemDetails = logItems.map(log => {
      const item = priceList.find(p => p.id === log.itemId);
      const itemPrice = item ? item.price * log.quantity : 0;
      return `- ${item?.name || 'Неизвестная работа'}: ${log.quantity} шт. (${itemPrice} ₽)`;
    }).join('\n');
    
    return `📋 Отчет о работе

🏢 Объект: ${objectName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

✅ Выполненные работы:
${itemDetails}

💰 Итого: ${total.toLocaleString()} ₽

📝 Замечания/Проблемы:
(заполните при необходимости)`;
  }
};