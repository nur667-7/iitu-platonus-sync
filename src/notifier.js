/**
 * Notification Layer (Telegram Dispatcher & Formatter)
 * Pure presentation: consumes discrete events and produces clean briefings without spam.
 */

const config = require('./config');

class Notifier {
  constructor(options = {}) {
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
  }

  async sendTelegram(text) {
    if (!text || text.trim().length === 0) {
      console.log('[Notifier] Empty message, skipping Telegram dispatch.');
      return false;
    }

    if (!this.botToken || !this.chatId) {
      console.log('[Notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured, skipping.');
      return false;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'Markdown'
        })
      });

      const resData = await res.json();
      if (resData.ok) {
        console.log('[Notifier] Telegram notification sent successfully.');
        return true;
      } else {
        console.error('[Notifier] Telegram error:', resData.description);
        return false;
      }
    } catch (e) {
      console.error('[Notifier] Telegram dispatch failed:', e.message);
      return false;
    }
  }

  /**
   * 08:30 Morning Daily Briefing (with Focus & Task Planning)
   */
  buildMorningBriefing(analyzer, attendanceList, assignments = [], teamsEvents = [], focus = null, todayTasks = []) {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: config.SYNC.TIMEZONE
    });

    const todayLessons = analyzer.getLessonsForDate(now);
    const dangerList = attendanceList.filter(s => s.riskLevel === 'DANGER');
    const warningList = attendanceList.filter(s => s.riskLevel === 'WARNING');

    let text = `☀️ *Доброе утро, Нурбек!*\n📅 *${dateFormatted.toUpperCase()}*\n\n`;

    // 1. Timetable
    text += `📚 *Расписание на сегодня (${todayLessons.length} пар):*\n`;
    if (todayLessons.length === 0) {
      text += `_Пар нет. Выходной день._\n\n`;
    } else {
      todayLessons.forEach((l, idx) => {
        const badge = l.isOnline ? '🌐 Онлайн' : '🏫 Очно';
        text += `${idx + 1}. *${l.startTime}–${l.endTime}* | \`${l.type}\`\n` +
                `   ${l.subject}\n` +
                `   📍 ${l.roomLabel} (${badge}) | 👨‍🏫 ${l.tutor}\n`;
      });
      text += '\n';
    }

    // 2. Retake Guard
    text += `🛡️ *Посещаемость (порог 20%):*\n`;
    if (dangerList.length > 0) {
      dangerList.forEach(s => {
        text += `🚨 *${s.subjectName}*: ${s.missedSessions} пропусков (${s.currentAbsencePct}%) — РЕТЕЙК!\n`;
      });
    } else if (warningList.length > 0) {
      warningList.forEach(s => {
        text += `⚠️ *${s.subjectName}*: осталось ${s.remainingAllowed} допустимых пропусков.\n`;
      });
    } else {
      text += `🟢 Все предметы в норме. Пропусков нет.\n`;
    }

    // 3. Recommended Focus
    if (focus && focus.task) {
      text += `\n🎯 *Рекомендуемый фокус на сегодня:*\n` +
              `👉 *${focus.task.title}*${focus.task.estimate ? ` (${focus.task.estimate} мин)` : ''}\n`;
      if (focus.contextNote) text += `_${focus.contextNote}_\n`;
    }

    // 4. Tasks for Today
    if (todayTasks && todayTasks.length > 0) {
      text += `\n📝 *Задачи на сегодня (${todayTasks.length}):*\n`;
      todayTasks.forEach((t, idx) => {
        const badge = t.priority === 'Критический' ? '🔥' : (t.priority === 'Высокий' ? '⚠️' : '▫️');
        text += `${badge} ${idx + 1}. *${t.title}*\n`;
      });
    } else if (assignments.length > 0) {
      text += `\n📝 *Дедлайны / Задания Platonus (${assignments.length}):*\n`;
      assignments.forEach(a => {
        text += `• [${a.deadline || '—'}] ${a.title} (${a.subject})\n`;
      });
    }

    // 5. Teams events
    if (teamsEvents.length > 0) {
      text += `\n💬 *События Microsoft Teams (${teamsEvents.length}):*\n`;
      teamsEvents.forEach(t => {
        const timeTag = t.deadline ? `⏰ До ${t.deadline}` : '📌';
        text += `• ${timeTag} [${t.eventType}] *${t.title}* (${t.subject})\n`;
      });
    }

    return text;
  }

  /**
   * 18:30 Evening Changes Report (ONLY sent if events exist)
   */
  buildEveningChanges(events = [], attendanceList = [], teamsEvents = []) {
    const hasAcademicChanges = events && events.length > 0;
    const hasTeamsChanges = teamsEvents && teamsEvents.length > 0;

    if (!hasAcademicChanges && !hasTeamsChanges) {
      // Zero changes = Zero messages (No spam!)
      return null;
    }

    let text = `🌙 *Nurbek OS: Обновления за день*\n\n`;

    const gradeEvents = (events || []).filter(e => e.type === 'NEW_GRADE');
    const absenceEvents = (events || []).filter(e => e.type === 'NEW_ABSENCE');
    const dangerEvents = (events || []).filter(e => e.type === 'RETAKE_DANGER');
    const taskEvents = (events || []).filter(e => e.type === 'NEW_ASSIGNMENT');

    if (dangerEvents.length > 0) {
      text += `🚨 *КРИТИЧЕСКИЕ АЛЕРТЫ:*\n`;
      dangerEvents.forEach(e => {
        text += `• *${e.subject}*: превышен порог 20%! Пропусков: ${e.missed}/${e.held} (${e.pct}%)\n`;
      });
      text += '\n';
    }

    if (absenceEvents.length > 0) {
      text += `⚠️ *Новые пропуски (НБ):*\n`;
      absenceEvents.forEach(e => {
        text += `• *${e.subject}* (${e.date})\n`;
      });
      text += '\n';
    }

    if (gradeEvents.length > 0) {
      text += `📊 *Новые оценки:*\n`;
      gradeEvents.forEach(e => {
        text += `• *${e.subject}*: +${e.grade} баллов (${e.date})\n`;
      });
      text += '\n';
    }

    if (taskEvents.length > 0) {
      text += `📝 *Новые задания / дедлайны Platonus:*\n`;
      taskEvents.forEach(e => {
        text += `• [Дедлайн: ${e.deadline || '—'}] ${e.title} (${e.subject})\n`;
      });
      text += '\n';
    }

    if (hasTeamsChanges) {
      text += `💬 *События из Microsoft Teams (${teamsEvents.length}):*\n`;
      teamsEvents.forEach(t => {
        const dLine = t.deadline ? ` (Дедлайн: ${t.deadline})` : '';
        text += `• [${t.eventType}] *${t.subject}*: ${t.title}${dLine}\n  _${t.senderName} (${t.chatName})_\n`;
      });
      text += '\n';
    }

    return text;
  }

  /**
   * Immediate urgent alert for high-priority Teams events (rescheduled classes, exams, urgent deadlines)
   */
  buildTeamsUrgentAlert(event) {
    const icon = event.eventType === 'SCHEDULE_CHANGE' ? '⚠️' : (event.eventType === 'EXAM' ? '🚨' : '⚡');
    let text = `${icon} *MICROSOFT TEAMS АЛЕРТ: ${event.eventType}*\n\n` +
      `📚 *Предмет:* ${event.subject}\n` +
      `📌 *Тема:* ${event.title}\n` +
      `👤 *От:* ${event.senderName} (${event.chatName})\n`;
    if (event.deadline) {
      text += `⏰ *Срок/Дедлайн:* ${event.deadline}\n`;
    }
    text += `\n📝 *Детали:*\n${event.description}\n`;
    if (event.url) {
      text += `\n🔗 [Открыть в Teams](${event.url})`;
    }
    return text;
  }
}

module.exports = { Notifier };
