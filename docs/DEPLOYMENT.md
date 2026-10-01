# 🚀 Руководство по развертыванию

> Инструкция по настройке облачного Serverless Webhook на Vercel, GitHub Actions и локального демона Windows.

---

## 1. Облачный Serverless Webhook (Vercel)

Vercel обеспечивает работу Telegram-бота в режиме 24/7 без необходимости держать локальный компьютер включенным.

### Шаг 1: Развертывание проекта
1. Подключите репозиторий на [vercel.com/new](https://vercel.com/new).
2. Задайте переменные окружения:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `NOTION_TOKEN`
   - `NOTION_TASKS_DB_ID`
   - `GROQ_API_KEY`
   - `TELEGRAM_WEBHOOK_SECRET` (опционально, любая секретная строка)
3. Нажмите **Deploy**.

### Шаг 2: Привязка Webhook
В локальном терминале выполните:
```bash
cmd /c npm run webhook:set https://your-project.vercel.app/api/webhook
```

### Шаг 3: Проверка статуса
```bash
cmd /c npm run webhook:info
```
Вывод должен содержать:
```json
{
  "url": "https://your-project.vercel.app/api/webhook",
  "pending_update_count": 0
}
```

---

## 2. GitHub Actions (Плановая синхронизация)

Файл `.github/workflows/platonus_sync.yml` запускает синхронизацию Platonus и Teams дважды в день (в 08:30 и 18:30 по времени Алматы).

Секреты настраиваются в **Settings $\to$ Secrets and variables $\to$ Actions**:
- `PLATONUS_LOGIN`
- `PLATONUS_PASSWORD`
- `NOTION_TOKEN`
- `NOTION_TASKS_DB_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

---

## 3. Локальный фоновый демон Windows (Development / Fallback)

Для локальной разработки или работы без облака:
1. Запуск в ручном режиме:
   ```bash
   cmd /c npm run bot
   ```
2. Скрытый автозапуск при старте Windows через службу авто-восстановления:
   - Скрипт `scripts/run_telegram_bot.ps1` автоматически перезапускает процесс при сбоях сети через 5 секунд.
   - Запуск без всплывающих окон: `scripts/start_bot_silent.vbs`.

> **Важно:** при активном Vercel Webhook локальный бот автоматически переходит в режим ожидания и не вызывает конфликт `Telegram 409 Conflict`.
