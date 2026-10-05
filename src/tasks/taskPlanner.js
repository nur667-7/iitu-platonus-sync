/**
 * Nurbek OS — Task Planner & Focus Agent
 * Calculates dynamic task urgency, time-window availability against timetable,
 * and generates actionable daily focus recommendations.
 */

const { dateKeyInTimeZone } = require('../shared/clock');

class TaskPlanner {
  constructor(options = {}) {
    this.timezone = options.timezone || 'Asia/Almaty';
  }

  /**
   * Calculate dynamic urgency from deadline
   */
  calculateUrgency(deadlineStr, now = new Date()) {
    if (!deadlineStr) return { level: 'low', badge: '⚪', label: 'Без срока', hoursLeft: null };

    const due = new Date(deadlineStr).getTime();
    const current = now.getTime();
    const diffHours = (due - current) / (1000 * 60 * 60);

    if (diffHours < 0) {
      return { level: 'overdue', badge: '⏰', label: 'Просрочено', hoursLeft: Math.round(diffHours) };
    }
    if (diffHours <= 24) {
      return { level: 'critical', badge: '🔥', label: '< 24 ч', hoursLeft: Math.round(diffHours) };
    }
    if (diffHours <= 72) {
      return { level: 'high', badge: '⚠️', label: '< 3 дней', hoursLeft: Math.round(diffHours) };
    }
    if (diffHours <= 168) {
      return { level: 'medium', badge: '🟡', label: '< 7 дней', hoursLeft: Math.round(diffHours) };
    }
    return { level: 'low', badge: '⚪', label: '> 7 дней', hoursLeft: Math.round(diffHours) };
  }

  _toMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  /**
   * Recommend what to do right now based on free time window and priority
   */
  recommendFocus(tasks = [], todayLessons = [], now = new Date()) {
    const activeTasks = tasks.filter(t => t.status !== 'Выполнена' && t.status !== 'Отменена');
    if (activeTasks.length === 0) {
      return {
        task: null,
        message: 'Все задачи закрыты! Свободное время.'
      };
    }

    // 1. Check if user is currently inside a class
    const currentHourMin = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: this.timezone });
    const currentLesson = todayLessons.find(l => {
      return l.startTime <= currentHourMin && currentHourMin <= l.endTime;
    });

    let contextNote = '';
    if (currentLesson) {
      contextNote = `Сейчас идёт пара: ${currentLesson.subject} (${currentLesson.startTime}–${currentLesson.endTime}).`;
    }

    // 2. Calculate next upcoming lesson & free window
    const currentMins = this._toMinutes(currentHourMin);
    const upcomingLessons = todayLessons
      .filter(l => this._toMinutes(l.startTime) > currentMins)
      .sort((a, b) => this._toMinutes(a.startTime) - this._toMinutes(b.startTime));

    const nextLesson = upcomingLessons[0] || null;
    let windowMinutes = null;
    let windowNote = '';

    if (nextLesson) {
      windowMinutes = Math.max(0, this._toMinutes(nextLesson.startTime) - currentMins);
      windowNote = `Свободное окно до следующей пары: ${windowMinutes} мин (до ${nextLesson.startTime} – ${nextLesson.subject})`;
    } else if (todayLessons.length > 0) {
      windowNote = `Все пары на сегодня завершены. Время для фокуса.`;
    }

    // 3. Score candidate tasks
    const scored = activeTasks.map(t => {
      let score = 0;
      const urgency = this.calculateUrgency(t.deadline, now);

      if (urgency.level === 'overdue') score += 100;
      if (urgency.level === 'critical') score += 80;
      if (urgency.level === 'high') score += 50;

      if (t.priority === 'Критический') score += 60;
      if (t.priority === 'Высокий') score += 40;

      const todayStr = dateKeyInTimeZone(now);
      if (t.plannedDate && t.plannedDate.startsWith(todayStr)) score += 30;

      // Window fit bonus
      if (windowMinutes && t.estimate) {
        if (t.estimate <= windowMinutes) {
          score += 25; // task fits into available time window
        } else if (t.estimate > windowMinutes * 1.5) {
          score -= 15; // task significantly exceeds window
        }
      }

      return { task: t, score, urgency };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];

    const estimateText = top.task.estimate ? ` (${top.task.estimate} мин)` : '';
    const subjectText = top.task.subject && top.task.subject !== 'Другое' ? `[${top.task.subject}] ` : '';
    const reason = top.urgency.hoursLeft !== null && top.urgency.hoursLeft < 48
      ? `Дедлайн через ${Math.max(1, top.urgency.hoursLeft)} ч.`
      : (top.task.priority === 'Критический' ? 'Критический приоритет.' : 'Запланировано на сегодня.');

    const windowPart = windowNote ? `\n🕐 _${windowNote}_` : '';

    return {
      task: top.task,
      contextNote,
      message: `🎯 *Рекомендуемый фокус прямо сейчас:*\n` +
               `👉 *${subjectText}${top.task.title}*${estimateText}\n` +
               `ℹ️ _Причина: ${reason}_${windowPart}`
    };
  }
}

module.exports = { TaskPlanner };
