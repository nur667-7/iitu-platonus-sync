/**
 * Notion Synchronizer
 * Updates the IITU University Dashboard and syncs real assignments/deadlines into Notion Tasks.
 * Never creates recurring schedule session clutter in Notion Calendar.
 */

const config = require('./config');
const { TaskEngine } = require('./tasks/taskEngine');
const { TaskResolver } = require('./tasks/taskResolver');

class NotionSync {
  constructor(options = {}) {
    this.token = options.token || process.env.NOTION_TOKEN;
    this.universityPageId = options.universityPageId || config.NOTION.UNIVERSITY_PAGE_ID;
    this.tasksDbId = options.tasksDbId || config.NOTION.TASKS_DB_ID;
    this.taskEngine = options.taskEngine || new TaskEngine({
      token: this.token,
      tasksDbId: this.tasksDbId,
      universityPageId: this.universityPageId
    });
    this.taskResolver = options.taskResolver || new TaskResolver();
  }

  async _request(endpoint, method = 'GET', body = null) {
    if (!this.token) {
      throw new Error('NOTION_TOKEN is not configured');
    }

    const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Notion API error ${res.status}: ${errText}`);
    }

    return await res.json();
  }

  async clearPageBlocks(pageId) {
    const list = await this._request(`/blocks/${pageId}/children?page_size=100`);
    for (const b of list.results || []) {
      try {
        await this._request(`/blocks/${b.id}`, 'DELETE');
      } catch (e) {
        // ignore delete failure on individual block
      }
    }
  }

  async updateUniversityDashboard(profile, attendanceList, weeklySchedule, assignments = [], teamsEvents = []) {
    console.log('[Notion] Refreshing Academic Dashboard blocks...');
    await this.clearPageBlocks(this.universityPageId);

    const dangerSubjects = attendanceList.filter(s => s.riskLevel === 'DANGER');
    const warningSubjects = attendanceList.filter(s => s.riskLevel === 'WARNING');
    const blocks = [];

    // 1. Profile Callout
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '🎓' },
        rich_text: [
          {
            type: 'text',
            text: {
              content: `IITU Platonus & Teams Tracker | Сайдуали Нурбек Жанибекұлы\nСпециальность: B057 Информационные технологии | 3 курс | Группа: 1220 | GPA: 2.80\nСеместр: Осенний 2026/2027 | Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: config.SYNC.TIMEZONE })}`
            }
          }
        ]
      }
    });

    // 2. Retake Risk Alert Callout
    if (dangerSubjects.length > 0) {
      const names = dangerSubjects.map(s => `${s.subjectName} (${s.missedSessions} пропусков)`).join(', ');
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '🚨' },
          color: 'red_background',
          rich_text: [
            {
              type: 'text',
              text: {
                content: `КРИТИЧЕСКИЙ РИСК РЕТЕЙКА (≥ 20% ПРОПУСКОВ):\nПо дисциплинам: ${names}. Немедленно обратитесь в деканат или к преподавателю!`
              }
            }
          ]
        }
      });
    } else if (warningSubjects.length > 0) {
      const names = warningSubjects.map(s => `${s.subjectName} (осталось ${s.remainingAllowed} пар)`).join(', ');
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '⚠️' },
          color: 'yellow_background',
          rich_text: [
            {
              type: 'text',
              text: {
                content: `ЗОНА РИСКА ПО ПОСЕЩАЕМОСТИ:\nПо дисциплинам: ${names}. Лимит пропусков почти исчерпан!`
              }
            }
          ]
        }
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '✅' },
          color: 'green_background',
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Все дисциплины в безопасной зоне. Пропусков нет. Рисков ретейка не обнаружено.`
              }
            }
          ]
        }
      });
    }

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // 3. Subjects & Retake 20% Breakdown
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📊 Академический статус и порог 20% ретейка' } }]
      }
    });

    for (const item of attendanceList) {
      const gradesStr = item.gradesList.length > 0 ? item.gradesList.join(', ') : 'нет оценок';
      const avgStr = item.avgGrade ? `${item.avgGrade} / 100` : '—';
      const detailText = `Преподаватель: ${item.tutor}\n` +
        `• Проведено занятий: ${item.heldSessions} (Запланировано на семестр: ~${item.plannedSessions})\n` +
        `• Пропущено занятий: ${item.missedSessions} (Текущий пропуск: ${item.currentAbsencePct}%)\n` +
        `• Допустимый порог (20%): max ${item.maxAllowedAbsences} пар (Осталось допустимо: ${item.remainingAllowed} пар)\n` +
        `• Оценки: [${gradesStr}] | Средний балл: ${avgStr}`;

      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [
            {
              type: 'text',
              text: { content: `${item.statusLabel} | ${item.subjectName}` },
              annotations: { bold: true }
            }
          ],
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: detailText } }]
              }
            }
          ]
        }
      });
    }

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // 4. Weekly Timetable Reference (Static view, not polluting Calendar)
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📅 Расписание занятий на неделю' } }]
      }
    });

    for (const [dayName, lessons] of Object.entries(weeklySchedule)) {
      if (lessons.length === 0) continue;

      const lessonLines = lessons.map(l => {
        const onlineTag = l.isOnline ? '🌐 Онлайн' : '🏫 Очно';
        return `• ${l.startTime}–${l.endTime} | [${l.type}] ${l.subject} (${onlineTag}, ауд. ${l.roomLabel}) — преп. ${l.tutor}`;
      }).join('\n');

      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [
            {
              type: 'text',
              text: { content: `📌 ${dayName} (${lessons.length} пар)` },
              annotations: { bold: true }
            }
          ],
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: lessonLines } }]
              }
            }
          ]
        }
      });
    }

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // 5. Active Assignments & Tasks (Platonus + Teams)
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📝 Задания и дедлайны (Platonus + Teams)' } }]
      }
    });

    const allTasks = [
      ...assignments.map(a => ({ source: 'Platonus', title: a.title, subject: a.subject, deadline: a.deadline })),
      ...teamsEvents.filter(e => ['TASK', 'DEADLINE', 'EXAM'].includes(e.eventType)).map(e => ({
        source: 'Teams',
        title: e.title,
        subject: e.subject,
        deadline: e.deadline
      }))
    ];

    if (allTasks.length === 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'На текущий момент активных заданий в Platonus и Teams нет.' } }]
        }
      });
    } else {
      for (const a of allTasks) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: { content: `[${a.source} | Дедлайн: ${a.deadline || '—'}] ${a.title} (${a.subject || ''})` }
              }
            ]
          }
        });
      }
    }

    // Append in chunks of 50
    for (let i = 0; i < blocks.length; i += 50) {
      const slice = blocks.slice(i, i + 50);
      await this._request(`/blocks/${this.universityPageId}/children`, 'PATCH', { children: slice });
    }
    console.log('[Notion] Dashboard updated successfully.');
  }

  /**
   * Syncs ONLY genuine Platonus assignments/homework with real deadlines into Notion Tasks DB.
   * Utilizes TaskResolver to merge with existing Teams/Telegram tasks without duplicates.
   */
  async syncAssignments(assignments = []) {
    if (!assignments || assignments.length === 0) return 0;
    console.log(`[Notion] Checking ${assignments.length} assignments for Tasks DB sync via TaskEngine...`);

    const existingTasks = await this.taskEngine.getActiveTasks();
    let count = 0;

    for (const a of assignments) {
      const incoming = {
        title: a.title || 'Лабораторная работа',
        subject: a.subject || 'Учёба',
        deadline: a.deadline || null,
        priority: 'Высокий',
        source: 'Platonus'
      };

      const matched = this.taskResolver.findMatchingTask(incoming, existingTasks);

      if (matched) {
        const updates = this.taskResolver.resolveMerge(matched, incoming);
        if (updates) {
          await this.taskEngine.updateTask(matched.id, updates);
          console.log(`[Notion] Merged Platonus update into existing task: "${matched.title}"`);
        }
      } else {
        const normalizedSub = this.taskResolver.normalizeSubject(a.subject);
        await this.taskEngine.createTask({
          title: `📝 [Platonus] ${a.title || 'Лабораторная работа'}`,
          subject: normalizedSub,
          deadline: a.deadline || null,
          priority: 'Высокий',
          source: 'Platonus',
          taskType: 'Учёба',
          status: 'Входящая',
          description: `Задание Platonus. Предмет: ${a.subject || '—'}`
        });
        count++;
      }
    }

    if (count > 0) {
      console.log(`[Notion] Created ${count} new assignment tasks in Notion Calendar.`);
    }
    return count;
  }

  /**
   * Syncs actionable Microsoft Teams events (TASK, DEADLINE, EXAM, TEST, SCHEDULE_CHANGE)
   * into Notion Tasks DB, merging with existing Platonus tasks if duplicate.
   */
  async syncTeamsEvents(events = [], state = null) {
    if (!events || events.length === 0) return [];
    const actionableTypes = ['TASK', 'DEADLINE', 'EXAM', 'TEST', 'SCHEDULE_CHANGE'];
    const actionable = events.filter(e => actionableTypes.includes(e.eventType));
    if (actionable.length === 0) return [];

    console.log(`[Notion] Processing ${actionable.length} Teams events through TaskEngine & TaskResolver...`);

    const existingTasks = await this.taskEngine.getActiveTasks();
    const priorityMap = {
      'critical': 'Критический',
      'high': 'Высокий',
      'medium': 'Обычный',
      'low': 'Низкий'
    };

    const synced = [];

    for (const e of actionable) {
      // Check state idempotency
      const meta = state ? state.getTeamsMessageMeta(e.sourceId) : null;
      if (meta && meta.notionTaskId) {
        continue;
      }

      const priorityName = priorityMap[e.priority] || 'Обычный';
      const incoming = {
        title: e.title,
        subject: e.subject,
        deadline: e.deadline || null,
        priority: priorityName,
        url: e.url,
        source: 'Teams'
      };

      const matched = this.taskResolver.findMatchingTask(incoming, existingTasks);

      if (matched) {
        const updates = this.taskResolver.resolveMerge(matched, incoming);
        if (updates) {
          await this.taskEngine.updateTask(matched.id, updates);
          console.log(`[Notion] Merged Teams event into existing task: "${matched.title}"`);
        }
        synced.push({ event: e, pageId: matched.id, merged: true });

        if (state) {
          state.recordTeamsMessage(e.sourceId, {
            hash: state.hash(e.description),
            updatedAt: e.updatedAt,
            eventType: e.eventType,
            notionTaskId: matched.id,
            chatId: e.chatId
          });
        }
      } else {
        const normalizedSub = this.taskResolver.normalizeSubject(e.subject);
        const icon = e.eventType === 'EXAM' ? '🚨' : (e.eventType === 'SCHEDULE_CHANGE' ? '⚠️' : '💬');
        const taskTitle = `${icon} [Teams | ${normalizedSub}] ${e.title}`;

        const created = await this.taskEngine.createTask({
          title: taskTitle,
          subject: normalizedSub,
          deadline: e.deadline || null,
          priority: priorityName,
          source: 'Teams',
          sourceUrl: e.url,
          taskType: 'Учёба',
          status: 'Входящая',
          description: `Источник: Microsoft Teams (${e.chatName || 'Чат'})\nОт: ${e.senderName || 'Преподаватель'}\nДетали: ${e.description || '—'}`
        });

        synced.push({ event: e, pageId: created.id, merged: false });

        if (state) {
          state.recordTeamsMessage(e.sourceId, {
            hash: state.hash(e.description),
            updatedAt: e.updatedAt,
            eventType: e.eventType,
            notionTaskId: created.id,
            chatId: e.chatId
          });
        }
      }
    }

    if (synced.length > 0) {
      console.log(`[Notion] Successfully processed ${synced.length} Teams events into Tasks DB.`);
    }
    return synced;
  }
}

module.exports = { NotionSync };
