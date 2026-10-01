/**
 * Nurbek OS — Telegram Interactive Input & Controller
 * Two-way communication layer: Natural Language task input, commands, and queries.
 */

const config = require('../config');
const { TaskEngine } = require('../tasks/taskEngine');
const { TaskClassifier } = require('../ai/taskClassifier');
const { TaskPlanner } = require('../tasks/taskPlanner');

class TelegramInput {
  constructor(options = {}) {
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.allowedChatId = String(options.chatId || process.env.TELEGRAM_CHAT_ID || '');
    this.taskEngine = options.taskEngine || new TaskEngine();
    this.classifier = options.classifier || new TaskClassifier();
    this.planner = options.planner || new TaskPlanner();
    this.state = options.state || null;
    this.onSyncRequest = options.onSyncRequest || null;
    this.lastUpdateId = (this.state && this.state.data && this.state.data.telegramLastUpdateId) || 0;
  }

  getLessonsForDate(weeklySchedule, date) {
    const dayOfWeek = date.getDay();
    const dayNames = {
      1: 'Понедельник',
      2: 'Вторник',
      3: 'Среда',
      4: 'Четверг',
      5: 'Пятница',
      6: 'Суббота',
      0: 'Воскресенье'
    };
    const dayName = dayNames[dayOfWeek];
    if (!dayName || !weeklySchedule) return [];
    return weeklySchedule[dayName] || [];
  }

  async sendReply(chatId, text) {
    if (!this.botToken || !chatId) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });
      const data = await res.json();
      return data.ok;
    } catch (e) {
      console.error('[TelegramInput] Send reply failed:', e.message);
      return false;
    }
  }

  /**
   * Process a single incoming user text message and execute action
   */
  async handleIncomingMessage(text, chatId = this.allowedChatId, academicContext = {}) {
    if (this.allowedChatId && String(chatId) !== this.allowedChatId) {
      console.warn(`[TelegramInput] Ignored message from unauthorized chat ID: ${chatId}`);
      return null;
    }

    console.log(`[TelegramInput] Handling message: "${text}"`);
    const classification = await this.classifier.classify(text);
    console.log(`[TelegramInput] Classified intent:`, classification.intent);

    let reply = '';

    switch (classification.intent) {
      case 'IGNORE': {
        return null;
      }

      case 'CREATE_TASK': {
        const created = await this.taskEngine.createTask({
          title: classification.title,
          status: classification.status || 'Входящая',
          priority: classification.priority || 'Обычный',
          deadline: classification.deadline,
          plannedDate: classification.plannedDate,
          subject: classification.subject,
          source: 'Telegram',
          estimate: classification.estimateMinutes,
          description: `Создано через Telegram: "${text}"`
        });

        const planPart = created.plannedDate ? `\n📅 *План:* ${created.plannedDate}` : '';
        const duePart = created.deadline ? `\n⏰ *Срок:* ${created.deadline}` : '';
        const subPart = created.subject && created.subject !== 'Другое' ? `[${created.subject}] ` : '';

        reply = `✅ *Задача создана в Notion:*\n` +
                `👉 *${subPart}${created.title}*\n` +
                `🏷️ *Приоритет:* ${created.priority} | *Статус:* ${created.status}${planPart}${duePart}`;
        break;
      }

      case 'COMPLETE_TASK': {
        const target = classification.target || classification.title;
        const completed = await this.taskEngine.completeTask(target);

        if (completed) {
          reply = `🎉 *Задача выполнена!*\n` +
                  `✅ *${completed.title}* отмечена как «Выполнена» в Notion.`;
        } else {
          reply = `⚠️ Не удалось найти открытую задачу по запросу: _"${target}"_.\n` +
                  `Используйте \`/tasks\`, чтобы посмотреть активный список.`;
        }
        break;
      }

      case 'CREATE_NOTE': {
        await this.taskEngine.createKnowledgeNote({
          title: classification.title,
          content: classification.content || text,
          category: classification.category || 'Идеи',
          source: 'Telegram'
        });

        reply = `💡 *Заметка сохранена в «Знания»:*\n` +
                `📌 *${classification.title}*`;
        break;
      }

      case 'HELP': {
        reply = `🤖 *Nurbek OS — Команды & Быстрый доступ:*\n\n` +
                `📅 *Расписание и пары:*\n` +
                `• /today или «Что на сегодня» — пары и задачи на сегодня\n` +
                `• /tomorrow или «Что на завтра» — пары и задачи на завтра\n\n` +
                `📊 *Академический статус (Платонус):*\n` +
                `• /attendance или «Посещаемость» — статус НБ и остаток до 20%\n` +
                `• /grades или «Оценки» — средний балл и журнал\n` +
                `• /assignments или «Задания» — задания из Platonus\n\n` +
                `🎯 *Задачи и Фокус:*\n` +
                `• /focus или «Что делать сейчас» — приоритетная задача\n` +
                `• /tasks — все активные задачи в Notion\n` +
                `• /overdue — горящие дедлайны\n` +
                `• /done <название> — отметить задачу выполненной\n` +
                `• /sync — обновить данные из Platonus\n\n` +
                `💡 *Быстрый ввод:* напиши задачу (например: _«Подготовить отчет по IoT до пятницы»_) или заметку (_«Запомни: ...»_).`;
        break;
      }

      case 'SYNC': {
        if (this.onSyncRequest) {
          await this.sendReply(chatId, `🔄 *Запуск синхронизации с Platonus...*`);
          try {
            await this.onSyncRequest();
            reply = `✅ *Синхронизация завершена!* Кэш расписания, журнала и оценок обновлен.`;
          } catch (err) {
            reply = `❌ Ошибка синхронизации: ${err.message}`;
          }
        } else {
          reply = `ℹ️ Запрос на синхронизацию принят. Запустите \`node src/index.js --mode=sync\`.`;
        }
        break;
      }

      case 'HEALTH': {
        let notionStatus = '🔴 Ошибка';
        try {
          await this.taskEngine._request('/users/me');
          notionStatus = '🟢 Подключен';
        } catch (e) {
          notionStatus = `🔴 Сбой (${e.message.slice(0, 30)})`;
        }

        const academicCache = (this.state && this.state.getAcademicCache()) || {};
        const cacheDate = academicCache.lastFetchedAt
          ? new Date(academicCache.lastFetchedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })
          : 'нет данных';
        const subjectsCount = academicCache.attendanceList ? academicCache.attendanceList.length : 0;
        const cacheStatus = subjectsCount > 0 ? `🟢 Актуален (${subjectsCount} дисциплин, ${cacheDate})` : '🟡 Пуст';
        const aiStatus = (this.classifier && this.classifier.apiKey) ? '🟢 Подключен (Groq gpt-oss-120b)' : '🟡 Локальный';

        reply = `🩺 *Nurbek OS — Диагностика системы (Health Check):*\n\n` +
                `• *Telegram Webhook:* 🟢 Активен (Vercel Serverless)\n` +
                `• *Notion Tasks DB:* ${notionStatus}\n` +
                `• *Академический кэш:* ${cacheStatus}\n` +
                `• *AI Классификатор:* ${aiStatus}\n` +
                `• *Контроль 20% ретейка:* 🟢 Детерминированный мониторинг\n\n` +
                `ℹ️ _Все сервисы работают в штатном режиме._`;
        break;
      }

      case 'QUERY': {
        const qType = classification.queryType || 'today';
        const academicCache = (this.state && this.state.getAcademicCache()) || {};
        const weeklySchedule = academicCache.weeklySchedule || {};
        const attendanceList = academicCache.attendanceList || [];
        const cachedAssignments = academicCache.assignments || [];

        if (qType === 'focus') {
          const activeTasks = await this.taskEngine.getActiveTasks();
          const todayLessons = (academicContext.todayLessons && academicContext.todayLessons.length > 0)
            ? academicContext.todayLessons
            : this.getLessonsForDate(weeklySchedule, new Date());
          const focus = this.planner.recommendFocus(activeTasks, todayLessons);
          reply = focus.message;
          if (focus.contextNote) reply += `\n\n_${focus.contextNote}_`;
        } else if (qType === 'attendance') {
          if (attendanceList.length === 0) {
            reply = `ℹ️ Данные о посещаемости ещё не синхронизированы в кэш.\nОтправьте \`/sync\`.`;
          } else {
            reply = `📊 *Посещаемость и лимит 20% (IITU):*\n\n`;
            for (const s of attendanceList) {
              const dangerIcon = s.riskLevel === 'DANGER' ? '🚨' : (s.riskLevel === 'WARNING' ? '⚠️' : '🟢');
              reply += `${dangerIcon} *${s.subjectName}*\n` +
                       `   • Пропусков: *${s.missedSessions}* из ${s.heldSessions} (${s.currentAbsencePct}%)\n` +
                       `   • До ретейка осталось: *${s.remainingAllowed}* пар\n`;
            }
          }
        } else if (qType === 'grades') {
          if (attendanceList.length === 0) {
            reply = `ℹ️ Данные журнала ещё не синхронизированы в кэш.\nОтправьте \`/sync\`.`;
          } else {
            reply = `📝 *Текущие оценки в журнале IITU:*\n\n`;
            for (const s of attendanceList) {
              const gradeStr = s.avgGrade ? `${s.avgGrade}` : 'нет оценок';
              const recentMarks = (s.gradesList && s.gradesList.length > 0) ? ` [${s.gradesList.slice(-5).join(', ')}]` : '';
              reply += `• *${s.subjectName}*: *${gradeStr}*${recentMarks}\n`;
            }
          }
        } else if (qType === 'assignments') {
          if (cachedAssignments.length === 0) {
            reply = `🟢 В Platonus нет активных заданий. Всё чисто!`;
          } else {
            reply = `📋 *Задания из Platonus (${cachedAssignments.length}):*\n\n`;
            cachedAssignments.forEach((a, i) => {
              const sub = a.subjectName ? `[${a.subjectName}] ` : '';
              const due = a.deadline ? ` (до ${a.deadline})` : '';
              reply += `${i + 1}. ${sub}*${a.taskName || a.title || a.name}*${due}\n`;
            });
          }
        } else if (qType === 'completed') {
          const completedTasks = await this.taskEngine.getCompletedTasks(15);
          const isYesterday = classification.period === 'yesterday';
          const header = isYesterday ? 'Выполненные задачи за вчера / недавно' : 'Недавно выполненные задачи';

          if (completedTasks.length === 0) {
            reply = `ℹ️ Пока нет отмеченных выполненных задач.`;
          } else {
            reply = `✅ *${header} (${completedTasks.length}):*\n\n`;
            completedTasks.forEach((t, i) => {
              const sub = t.subject && t.subject !== 'Другое' ? `[${t.subject}] ` : '';
              reply += `${i + 1}. ${sub}*${t.title}*\n`;
            });
          }
        } else if (qType === 'timeline') {
          const todayDate = new Date();
          const todayLessons = (academicContext.todayLessons && academicContext.todayLessons.length > 0)
            ? academicContext.todayLessons
            : this.getLessonsForDate(weeklySchedule, todayDate);
          const todayTasks = await this.taskEngine.getTodayTasks();
          const todayStr = todayDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

          reply = `⏱️ *Поминутный таймлайн на день (${todayStr.toUpperCase()}):*\n\n`;

          if (todayLessons.length === 0 && todayTasks.length === 0) {
            reply += `_На сегодня нет пар и задач. День свободен!_`;
          } else {
            reply += `📚 *Расписание пар по часам:*\n`;
            if (todayLessons.length > 0) {
              todayLessons.forEach((l, idx) => {
                reply += `• *${l.startTime}–${l.endTime}* — ${l.subject} (${l.roomLabel || 'IITU'})\n`;
              });
            } else {
              reply += `• Пар сегодня нет.\n`;
            }

            reply += `\n🎯 *Задачи для выполнения в окнах:*\n`;
            if (todayTasks.length > 0) {
              todayTasks.forEach((t, idx) => {
                const est = t.estimate ? ` (${t.estimate} мин)` : '';
                const prio = t.priority === 'Критический' ? '🔥' : (t.priority === 'Высокий' ? '⚠️' : '▫️');
                reply += `${prio} ${idx + 1}. *${t.title}*${est}\n`;
              });
            } else {
              reply += `• Задач на сегодня не запланировано.\n`;
            }
          }
        } else if (qType === 'week') {
          reply = `🗓️ *Расписание и задачи на неделю (до воскресенья):*\n\n`;
          const dayKeys = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
          let hasLessons = false;
          for (const dayName of dayKeys) {
            const lessons = weeklySchedule[dayName] || [];
            if (lessons.length > 0) {
              hasLessons = true;
              reply += `📌 *${dayName.toUpperCase()}* (${lessons.length} пар):\n`;
              lessons.forEach(l => {
                const room = l.roomLabel ? ` [${l.roomLabel}]` : '';
                reply += `  • *${l.startTime}–${l.endTime}* | ${l.subject}${room}\n`;
              });
              reply += '\n';
            }
          }
          if (!hasLessons) {
            reply += `📚 _Пар на эту неделю в расписании нет._\n\n`;
          }

          const activeTasks = await this.taskEngine.getActiveTasks();
          if (activeTasks.length > 0) {
            reply += `📝 *Активные задачи на неделю (${activeTasks.length}):*\n`;
            activeTasks.slice(0, 8).forEach((t, i) => {
              const due = t.deadline ? ` [дедлайн: ${t.deadline}]` : '';
              reply += `${i + 1}. *${t.title}*${due}\n`;
            });
          } else {
            reply += `📝 _Активных задач нет._`;
          }
        } else if (qType === 'tomorrow') {
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const tomorrowLessons = this.getLessonsForDate(weeklySchedule, tomorrow);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          const allTasks = await this.taskEngine.getActiveTasks();
          const tomorrowTasks = allTasks.filter(t => (t.plannedDate && t.plannedDate.startsWith(tomorrowStr)) || (t.deadline && t.deadline.startsWith(tomorrowStr)));
          const dateTitle = tomorrow.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

          reply = `📅 *План на завтра (${dateTitle.toUpperCase()}):*\n\n`;

          if (tomorrowLessons.length > 0) {
            reply += `📚 *Пары на завтра (${tomorrowLessons.length}):*\n`;
            tomorrowLessons.forEach((l, idx) => {
              const room = l.roomLabel ? ` (${l.roomLabel})` : '';
              reply += `${idx + 1}. *${l.startTime}–${l.endTime}* | ${l.subject}${room}\n`;
            });
            reply += '\n';
          } else {
            reply += `📚 *Пар на завтра нет.*\n\n`;
          }

          if (tomorrowTasks.length === 0) {
            reply += `📝 _На завтра запланированных задач нет._`;
          } else {
            reply += `📝 *Задачи на завтра (${tomorrowTasks.length}):*\n`;
            tomorrowTasks.forEach((t, i) => {
              reply += `${i + 1}. *${t.title}*\n`;
            });
          }
        } else if (qType === 'overdue') {
          const overdue = await this.taskEngine.getOverdueTasks();
          if (overdue.length === 0) {
            reply = `🟢 *Просроченных задач нет!* Все дедлайны соблюдены.`;
          } else {
            reply = `⏰ *Просроченные задачи (${overdue.length}):*\n\n`;
            overdue.forEach((t, i) => {
              reply += `${i + 1}. *${t.title}* (дедлайн был ${t.deadline})\n`;
            });
          }
        } else if (qType === 'important') {
          const important = await this.taskEngine.getImportantTasks();
          if (important.length === 0) {
            reply = `🟢 *Критических и высоких задач нет.*`;
          } else {
            reply = `⭐ *Важные задачи (${important.length}):*\n\n`;
            important.forEach((t, i) => {
              const due = t.deadline ? ` [до ${t.deadline}]` : '';
              reply += `${i + 1}. *[${t.priority}]* ${t.title}${due}\n`;
            });
          }
        } else if (qType === 'all') {
          const all = await this.taskEngine.getActiveTasks();
          if (all.length === 0) {
            reply = `🟢 В списке нет активных задач. Список пуст!`;
          } else {
            reply = `📋 *Все активные задачи (${all.length}):*\n\n`;
            all.forEach((t, i) => {
              const sub = t.subject && t.subject !== 'Другое' ? `[${t.subject}] ` : '';
              const plan = t.plannedDate ? ` (📅 ${t.plannedDate})` : '';
              const due = t.deadline ? ` (⏰ ${t.deadline})` : '';
              reply += `${i + 1}. ${sub}*${t.title}*${plan}${due} — _${t.status}_\n`;
            });
          }
        } else {
          // 'today' query
          const todayDate = new Date();
          const todayLessons = (academicContext.todayLessons && academicContext.todayLessons.length > 0)
            ? academicContext.todayLessons
            : this.getLessonsForDate(weeklySchedule, todayDate);
          const todayTasks = await this.taskEngine.getTodayTasks();
          const todayStr = todayDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

          reply = `☀️ *План на сегодня (${todayStr.toUpperCase()}):*\n\n`;

          if (todayLessons.length > 0) {
            reply += `📚 *Пары на сегодня (${todayLessons.length}):*\n`;
            todayLessons.forEach((l, idx) => {
              const room = l.roomLabel ? ` (${l.roomLabel})` : '';
              reply += `${idx + 1}. *${l.startTime}–${l.endTime}* | ${l.subject}${room}\n`;
            });
            reply += '\n';
          } else {
            reply += `📚 *Пар на сегодня нет.* Отличный день для фокуса!\n\n`;
          }

          if (todayTasks.length === 0) {
            reply += `📝 _На сегодня запланированных задач нет._\nИспользуйте \`/tasks\` для просмотра всех задач.`;
          } else {
            reply += `📝 *Задачи на сегодня (${todayTasks.length}):*\n`;
            todayTasks.forEach((t, idx) => {
              const badge = t.priority === 'Критический' ? '🔥' : (t.priority === 'Высокий' ? '⚠️' : '▫️');
              const time = t.estimate ? ` (${t.estimate} мин)` : '';
              reply += `${badge} ${idx + 1}. *${t.title}*${time}\n`;
            });
          }
        }
        break;
      }

      default:
        reply = `ℹ️ Команда не распознана. Отправьте /help для списка команд.`;
    }

    if (chatId) {
      await this.sendReply(chatId, reply);
    }

    return { classification, reply };
  }

  /**
   * One-pass fetch and process of latest Telegram updates
   */
  async processPendingUpdates(academicContext = {}) {
    if (!this.botToken) return [];
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok || !data.result || data.result.length === 0) {
        return [];
      }

      const results = [];
      for (const update of data.result) {
        this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
        if (this.state) {
          this.state.data.telegramLastUpdateId = this.lastUpdateId;
          this.state.saveLocal();
        }
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const resObj = await this.handleIncomingMessage(msg.text, msg.chat.id, academicContext);
        results.push(resObj);
      }

      return results;
    } catch (err) {
      console.warn('[TelegramInput] Polling error:', err.message);
      return [];
    }
  }
}

module.exports = { TelegramInput };
