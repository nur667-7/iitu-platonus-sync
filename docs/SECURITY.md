# 🛡️ Руководство по безопасности (Security Guide)

> Политика управления учетными данными, изоляция секретов и защита от утечек в публичный доступ.

---

## 1. Архитектурная изоляция учетных данных

Система строго разделяет исполняемый код и секретные ключи:
- **Никаких захардкоженных секретов:** все токены передаются исключительно через переменные окружения (`process.env`).
- **Строгий `.gitignore`:**
  - Локальный файл `.env` исключен из индексации Git.
  - Локальные кэши и логи (`state.json`, `*.log`, `.vercel/`) никогда не коммитятся.
- **Безопасный `.env.example`:** содержит исключительно абстрактные плейсхолдеры (`student_id@iitu.edu.kz`, `ntn_your_notion_token_here`).

---

## 2. Авторизация и ограничение доступа в Telegram

В [src/sources/telegramInput.js](file:///C:/Users/NiTrOv15/.gemini/antigravity/scratch/iitu-platonus-sync/src/sources/telegramInput.js) реализована проверка входящего отправителя:
```javascript
if (this.allowedChatId && String(chatId) !== this.allowedChatId) {
  console.warn(`[TelegramInput] Ignored message from unauthorized chat ID: ${chatId}`);
  return null;
}
```
Любые посторонние пользователи, написавшие боту, игнорируются и не могут получить доступ к базе задач или академическому расписанию.

---

## 3. Регламент ротации секретов (Rotation Protocol)

При подозрении на компрометацию или перед публичными демонстрациями рекомендуется выполнить ротацию:

1. **Telegram Bot Token:**
   - В `@BotFather` вызвать `/mybots` $\to$ выбрать бота $\to$ `API Token` $\to$ `Revoke current token`.
   - Обновить токен в `.env` и в настройках переменных Vercel.
2. **Notion Integration Token:**
   - На странице [notion.so/my-integrations](https://www.notion.so/my-integrations) перевыпустить Internal Integration Secret.
3. **Platonus Password:**
   - Сменить пароль в личном кабинете студента IITU и обновить значение `PLATONUS_PASSWORD` в `.env`.
4. **Groq API Key:**
   - В консоли [console.groq.com/keys](https://console.groq.com/keys) удалить старый ключ и сгенерировать новый.
