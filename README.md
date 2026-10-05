<div align="center">

# 🎓 Nurbek OS — Autonomous IITU Student Life Orchestrator
### *Unified Task Engine, 20% Retake Guard, MS Teams Analyzer & 24/7 Serverless Telegram Assistant*

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless%20Live-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://iitu-platonus-sync.vercel.app/api/webhook)
[![Telegram](https://img.shields.io/badge/Telegram-@Brifcdbot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/Brifcdbot)
[![Notion](https://img.shields.io/badge/Notion-Task_Control_UI-000000?style=for-the-badge&logo=notion&logoColor=white)](https://notion.so)
[![Groq AI](https://img.shields.io/badge/Groq%20LLM-gpt--oss--120b-F55036?style=for-the-badge&logo=fastapi&logoColor=white)](https://groq.com)
[![Tests](https://img.shields.io/badge/Tests-17%2F17%20Passed-brightgreen?style=for-the-badge)](tests/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

**Nurbek OS** — персональная операционная система для студента Международного Университета Информационных Технологий (IITU).
Автономно парсит закрытый API Platonus IITU, фильтрует учебные чаты Microsoft Teams Graph API, предотвращает ретейки (лимит 20% пропусков), управляет задачами в Notion и отвечает в Telegram **за < 100 мс в режиме 24/7**.

</div>

<div align="center">

📚 **Документация:** &nbsp; [Архитектура](docs/ARCHITECTURE.md) &nbsp;•&nbsp; [Telegram UX](docs/TELEGRAM.md) &nbsp;•&nbsp; [Развертывание](docs/DEPLOYMENT.md) &nbsp;•&nbsp; [Безопасность](docs/SECURITY.md)

</div>

---

## 📑 Содержание

- [Проблемы, которые решает Nurbek OS](#-проблемы-которые-решает-nurbek-os)
- [Архитектура системы](#️-архитектура-системы)
- [Ключевые возможности](#-ключевые-возможности)
  - [1. 🛡️ Математический контроль 20% ретейка IITU](#1-️-математический-контроль-20-ретейка-iitu)
  - [2. ⚡ Быстрый академический кэш (< 100 мс)](#2--быстрый-академический-кэш--100-мс)
  - [3. 🤖 Гибридный роутер (Regex + Groq AI)](#3--гибридный-роутер-regex--groq-ai)
  - [4. 🔄 Единый Task Engine и дедупликация](#4--единый-task-engine-и-дедупликация)
  - [5. ☁️ Отказоустойчивое облако 24/7 (Vercel + GitHub Actions + Windows)](#5-️-отказоустойчивое-облако-247-vercel--github-actions--windows)
- [📱 Шпаргалка команд Telegram-бота (@Brifcdbot)](#-шпаргалка-команд-telegram-бота-brifcdbot)
- [📁 Структура проекта](#-структура-проекта)
- [🚀 Быстрый старт](#-быстрый-старт)
- [⚙️ Конфигурация (.env)](#️-конфигурация-env)
- [🧪 Тестирование](#-тестирование)
- [📄 Лицензия](#-лицензия)

---

## 🎯 Проблемы, которые решает Nurbek OS

| Проблема | Как решает Nurbek OS |
| :--- | :--- |
| **Платонус медленный и часто падает** | Данные расписания, журнала и оценок кэшируются локально. Ответ на вопрос о парах или баллах дается за **< 100 мс**. |
| **Риск ретейка из-за пропусков (НБ)** | Точный расчет по академической политике IITU: считает остаток пар до 20% порога и заранее предупреждает об опасности. |
| **Хаос в Microsoft Teams** | Эвристический фильтр сообщений вычищает спам и флуд, вытягивает только реальные дедлайны лаб и переносы пар. |
| **Задачи теряются в разных источниках** | Единый `Task Engine`: лабы из Platonus, дедлайны из Teams и голосовые заметки из Telegram сливаются в Notion без дублей. |
| **Нужно держать компьютер включенным** | Stateless Vercel Serverless Webhook обеспечивает мгновенный ответ в Telegram 24 часа в сутки с любого устройства. |

---

## 🏗️ Архитектура системы

```text
                                SOURCES
┌───────────────────┬──────────────────────┬────────────────────┬─────────────────┐
│   Platonus IITU   │   Microsoft Teams    │  Telegram Bot      │  Notion (Tasks) │
│ (Расписание, НБ,  │ (Объявления, дедлайны│ (Голос/текст ввод, │ (Ручной ввод и  │
│  баллы, задания)  │  переносы пар, чаты) │  запросы, команды) │  статусы задач) │
└─────────┬─────────┴──────────┬───────────┴─────────┬──────────┴────────┬────────┘
          │                    │                     │                   │
          ▼                    ▼                     ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            INGESTION & CACHE LAYER                              │
│  • state.json / In-Memory Cache: расписание, посещаемость, оценки (< 100 мс)   │
│  • Смещение очереди telegramLastUpdateId + хеширование дедупликации             │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      TASK CLASSIFIER & QUERY ROUTER                             │
│  • Fast Regex (< 1 мс): /today, /tomorrow, неделя, таймлайн, посещаемость, /done│
│  • Groq LLM (gpt-oss-120b): семантический разбор сложных задач и заметок        │
│  • Question Guard: вопросы о расписании/истории НИКОГДА не создают мусорных дел │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TASK ENGINE & RESOLVER                                 │
│  • Единая точка правды для задач: слияние дублей Platonus + Teams + Telegram    │
│  • Извлечение фингерпринтов (lab:4, rk:1), нормализация предметов               │
│  • TaskPlanner: расчет срочности (<24ч 🔥, <3д ⚠️), поиск свободных окон        │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌─────────────────────────┐
│    Notion `Задачи`   │    │    Notion `Знания`   │    │  Telegram (@Brifcdbot)  │
│  (Главная база задач,│    │  (Заметки, мысли,    │    │  • Мгновенные ответы    │
│   приоритет, дедлайн,│    │   правила сдачи,     │    │  • Поминутный таймлайн  │
│   статус, время)     │    │   конспекты)         │    │  • 24/7 Vercel Webhook  │
└──────────┬───────────┘    └──────────────────────┘    └─────────────────────────┘
           │
           ▼
┌──────────────────────┐
│   Notion Calendar    │
│  (Таймлайн и сетка)  │
└──────────────────────┘
```

---

## ⚡ Ключевые возможности

### 1. 🛡️ Математический контроль 20% ретейка IITU

Академическая политика IITU строго регламентирует: превышение **20% пропусков** от общего объема часов дисциплины влечет автоматический недопуск к экзамену и платный ретейк.

Nurbek OS рассчитывает статус детерминированно:

$$\text{Absence \%} = \frac{\text{Missed Sessions}}{\text{Held Sessions}} \times 100\%$$

$$\text{Remaining Allowed} = \lfloor 0.20 \times \text{Planned Sessions} \rfloor - \text{Missed Sessions}$$

- **🟢 SAFE (Норма):** пропусков $< 10\%$, запас $> 2$ пар.
- **⚠️ WARNING (Внимание):** пропусков $\ge 10\%$ либо до вылета осталось $\le 2$ пары.
- **🚨 DANGER (Ретейк):** лимит исчерпан или превышен ($0$ пар в запасе).

---

### 2. ⚡ Быстрый академический кэш (< 100 мс)

- Полное расписание недели, списки аудиторий (Главный корпус / Байзак центр / Онлайн), ссылки на Teams и имена преподавателей хранятся в оптимизированном локальном кэше.
- При запросе «Какие пары сегодня» бот не делает тяжелых веб-запросов к Платонусу, а мгновенно отдает ответ из оперативной памяти.

---

### 3. 🤖 Гибридный роутер (Regex + Groq AI)

- **Fast Regex Router (< 1 мс):** 90% типовых команд (`/today`, `/tomorrow`, `/week`, `/attendance`, `/grades`, `/focus`, `/done`, `поминутный таймлайн`) отрабатывают без обращения к внешним LLM.
- **Groq LLM (`openai/gpt-oss-120b`):** разбирает свободную речь («*напомни в четверг вечером сесть за 4 лабу по спрингу на 40 минут*») и извлекает:
  - `subject`: нормализованный предмет (`Java Spring`).
  - `plannedDate`: дату когда делать.
  - `deadline`: крайний срок сдачи.
  - `estimateMinutes`: оценку времени.
- **Question Guard:** регулярные выражения и системный промпт исключают ошибку превращения вопроса в задачу.

---

### 4. 🔄 Единый Task Engine и дедупликация

- Если преподаватель выложил задание в Platonus, а затем написал дедлайн в чат Teams — система распознает общий фингерпринт (например, `lab:4` по предмету `Java Spring`) и обновляет существующую задачу в Notion, не плодя дубликатов.
- Двусторонняя синхронизация: закрытие задачи через Telegram (`/done lab 4`) моментально ставит статус «Выполнена» в базе Notion.

---

### 5. ☁️ Отказоустойчивое облако 24/7 (Vercel + GitHub Actions + Windows)

- **Vercel Serverless Webhook ([`api/webhook.js`](api/webhook.js)):** обрабатывает апдейты Telegram в облаке за 1–2 секунды без необходимости держать ноутбук включенным.
- **GitHub Actions Workflows:** регулярная синхронизация Platonus и Teams по расписанию (08:30 и 18:30 Almaty Time).
- **Windows Local Fallback Daemon:** фоновая служба на базе PowerShell с автоматическим перезапуском при сбое сети.
- **Умное переключение:** система проверяет статус вебхука и автоматически отключает polling при активном Vercel, исключая ошибку `Telegram HTTP 409 Conflict`.

---

## 📱 Шпаргалка команд Telegram-бота (@Brifcdbot)

| Что написать боту | Что сделает бот | Скорость |
| :--- | :--- | :--- |
| `Что на сегодня` / `/today` | Пары на сегодня с аудиториями + запланированные задачи | **< 100 мс** |
| `Что на эту неделю` / `/week` | Полное расписание с пн по сб по часам и задачи недели | **< 100 мс** |
| `Что у меня на день, по минутам раставь` | Поминутный таймлайн дня и окна между парами | **< 100 мс** |
| `Что на завтра` / `/tomorrow` | Расписание и список задач на завтрашний день | **< 100 мс** |
| `Посещаемость` / `/attendance` | Таблица пропусков по всем предметам и остаток до 20% | **< 100 мс** |
| `Оценки` / `/grades` | Текущие баллы в электронном журнале IITU и средний балл | **< 100 мс** |
| `Задания` / `/assignments` | Активные домашние задания из Platonus | **< 100 мс** |
| `Что делать сейчас` / `/focus` | Подберет идеальную задачу под текущее свободное окно | **< 100 мс** |
| `Что было сделано вчера` | Список закрытых задач из Notion | **~ 500 мс** |
| `сделал lab 4` / `/done lab 4` | Переведет задачу в статус «Выполнена» в Notion | **~ 600 мс** |
| `Запомни: формулу сдачи лабы` | Сохранит мысль или конспект в базу «Знания» | **~ 600 мс** |
| `Лаба 3 Spring до пятницы 40 минут` | Создаст задачу с правильным предметом и дедлайном | **~ 800 мс** |
| `/sync` | В локальном polling-режиме обновляет Platonus сразу; в Vercel показывает расписание облачной синхронизации | **зависит от режима** |

---

## 📁 Структура проекта

```text
iitu-platonus-sync/
├── api/
│   └── webhook.js              # Serverless Webhook для Vercel (stateless 24/7)
├── src/
│   ├── env.js                  # Первоочередная загрузка .env переменных
│   ├── config.js               # Централизованная конфигурация и справочник дисциплин
│   ├── index.js                # CLI диспетчер, синхронизатор и polling-сервер
│   ├── platonus.js             # Клиент REST API Platonus IITU (авторизация, сессия, журнал)
│   ├── analyzer.js             # Детерминированный математический расчет 20% порога
│   ├── teams.js                # Интеграция с Microsoft Graph API
│   ├── teamsAnalyzer.js        # Фильтр шума и классификатор академических сообщений Teams
│   ├── state.js                # Idempotency layer, кэш academic и хеширование
│   ├── notion.js               # Синхронизация Dashboard и расписания в Notion
│   ├── notifier.js             # Формирование утренних и вечерних дайджестов
│   ├── ai/
│   │   └── taskClassifier.js   # Fast-regex роутер + Groq AI gpt-oss-120b классификатор
│   ├── tasks/
│   │   ├── taskEngine.js       # CRUD задач в базе Notion, фильтрация активных/выполненных
│   │   ├── taskResolver.js     # Фингерпринты (lab:4) и слияние кросс-источников
│   │   └── taskPlanner.js      # Расчет срочности, окон между парами и умного фокуса
│   ├── sources/
│   │   └── telegramInput.js    # Интерактивный Telegram контроллер
│   └── scripts/
│       └── manageWebhook.js    # CLI инструмент переключения Webhook / Polling
├── scripts/
│   ├── run_telegram_bot.ps1    # Фоновый демон с авто-восстановлением
│   ├── start_bot_silent.vbs    # Скрытый запуск процесса в Windows
│   └── run_platonus_sync.ps1   # Резервный скрипт для Windows Task Scheduler
├── tests/
│   ├── telegram_input.test.js  # Тесты быстрых команд, недельного плана и выполненных дел
│   ├── task_engine.test.js     # Тесты фингерпринтов, дедупликации и планировщика
│   ├── teams_parser.test.js    # Тесты очистки HTML и структуры сообщений Graph API
│   ├── teams_analyzer.test.js  # Тесты классификации и черного списка Teams
│   ├── state_dedup.test.js     # Тесты дедупликации и 30-дневного ретеншна
│   ├── webhook.test.js         # Тесты serverless вебхука (200, 401 token, 405 methods)
│   └── integration.test.js     # Сквозной тест пайплайна
├── vercel.json                 # Конфигурация маршрутизации Vercel Serverless
├── package.json
└── README.md
```

---

## 🚀 Быстрый старт

### 1. Клонирование и установка зависимостей

```bash
git clone https://github.com/nur667-7/iitu-platonus-sync.git
cd iitu-platonus-sync
npm install
```

### 2. Настройка переменных окружения

Скопируйте пример файла конфигурации:
```bash
cp .env.example .env
```
Заполните свои учетные данные в `.env` (см. раздел [Конфигурация](#️-конфигурация-env)).

### 3. Запуск тестов

```bash
npm test
```
*(Все 17 модульных и интеграционных тестов проходят за ~180 мс)*.

### 4. Доступные команды

```bash
# Однократная синхронизация Platonus + Teams + Notion
npm start

# Утренний брифинг (пары на сегодня, задачи, статус пропусков)
npm run morning

# Вечерний отчет изменений
npm run evening

# Локальный запуск интерактивного Telegram-бота (long-polling)
npm run bot

# Проверить статус Webhook в Telegram
npm run webhook:info

# Привязать Telegram к облачному вебхуку Vercel
npm run webhook:set https://your-project.vercel.app/api/webhook

# Отключить вебхук и вернуться на локальный polling
npm run webhook:delete
```

---

## ⚙️ Конфигурация (.env)

| Переменная | Описание | Обязательно |
| :--- | :--- | :---: |
| `PLATONUS_LOGIN` | Логин студента IITU (например, `student_id@iitu.edu.kz`) | Да |
| `PLATONUS_PASSWORD` | Пароль от личного кабинета Platonus | Да |
| `NOTION_TOKEN` | Интеграционный токен Notion (`ntn_...`) | Да |
| `NOTION_TASKS_DB_ID` | ID базы данных «Задачи» в Notion | Да |
| `NOTION_UNIVERSITY_PAGE_ID`| ID родительской страницы Университета | Да |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота от `@BotFather` | Да |
| `TELEGRAM_CHAT_ID` | Ваш цифровой Telegram ID для отправки сообщений | Да |
| `TELEGRAM_WEBHOOK_SECRET` | Секретный токен для верификации запросов вебхука | Опционально |
| `GROQ_API_KEY` | API-ключ Groq для семантического классификатора | Да |
| `AI_MODEL` | Модель LLM (по умолчанию: `openai/gpt-oss-120b`) | Опционально |
| `TEAMS_ENABLED` | Включение синхронизации Teams (`true`/`false`) | Опционально |
| `TEAMS_ACCESS_TOKEN` | Токен доступа Microsoft Graph API | Опционально |

---

## 🧪 Тестирование

Проект покрыт автоматическими тестами через встроенный раннер Node.js (`node --test`):

```bash
cmd /c npm test
```

```text
✔ Integration: Pipeline end-to-end processing with mock Notion sync
✔ StateManager deduplication and message change detection
✔ StateManager.pruneOldTeamsMessages removes messages past retention days
✔ TaskResolver normalizes subjects and extracts fingerprints
✔ TaskResolver merges matching tasks without duplicates
✔ TaskPlanner computes dynamic urgency correctly
✔ TaskClassifier fast parser handles commands, queries and notes
✔ TeamsAnalyzer.matchSubject matches course by name, alias, and tutor
✔ TeamsAnalyzer.isPotentiallyRelevant filters out noise and catches academic signals
✔ TeamsAnalyzer.classifyRuleBased assigns correct event types and priorities
✔ TeamsAnalyzer ignores specified chats (e.g. Professional English 2nd year INTER)
✔ TeamsClient.cleanHtmlText removes HTML tags and decodes entities
✔ TeamsClient.normalizeMessage converts raw Graph API message to standard schema
✔ TelegramInput handles queries, completion, and notes without errors
✔ Vercel Webhook: GET returns health check status 200
✔ Vercel Webhook: rejects wrong secret token with 401 when TELEGRAM_WEBHOOK_SECRET is set
✔ Vercel Webhook: method not allowed for PUT/DELETE with 405

ℹ tests 17 | pass 17 | fail 0 | duration_ms ~180ms
```

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE).
Разработано для личного использования и студентов Международного Университета Информационных Технологий (IITU).
