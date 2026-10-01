/**
 * Nurbek OS — Task Engine
 * Central business logic layer for task lifecycle, querying, and Notion sync.
 * All sources (Platonus, Teams, Telegram, Manual) pass through this engine.
 */

const config = require('../config');

class TaskEngine {
  constructor(options = {}) {
    this.token = options.token || process.env.NOTION_TOKEN;
    this.tasksDbId = options.tasksDbId || config.NOTION.TASKS_DB_ID;
    this.inboxDbId = options.inboxDbId || config.NOTION.INBOX_DB_ID;
    this.knowledgeDbId = options.knowledgeDbId || config.NOTION.KNOWLEDGE_DB_ID;
    this.universityPageId = options.universityPageId || config.NOTION.UNIVERSITY_PAGE_ID;
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

  /**
   * Parse Notion task page object into clean domain entity
   */
  _mapPageToTask(page) {
    const props = page.properties || {};
    const title = props['Название']?.title?.[0]?.plain_text || 'Без названия';
    const status = props['Статус']?.select?.name || 'Входящая';
    const priority = props['Приоритет']?.select?.name || 'Обычный';
    const deadline = props['Срок']?.date?.start || null;
    const plannedDate = props['Запланировано']?.date?.start || null;
    const completedAt = props['Дата выполнения']?.date?.start || null;
    const subject = props['Предмет']?.select?.name || null;
    const taskType = props['Тип задачи']?.select?.name || 'Учёба';
    const source = props['Источник']?.select?.name || 'Notion';
    const sourceUrl = props['URL источника']?.url || null;
    const estimate = props['Оценка времени']?.number || null;

    return {
      id: page.id,
      title,
      status,
      priority,
      deadline,
      plannedDate,
      completedAt,
      subject,
      taskType,
      source,
      sourceUrl,
      estimate,
      url: page.url,
      raw: page
    };
  }

  /**
   * Create a new Task in Notion
   */
  async createTask(taskData) {
    console.log(`[TaskEngine] Creating task: "${taskData.title}"`);

    const properties = {
      'Название': {
        title: [{ text: { content: taskData.title } }]
      },
      'Статус': {
        select: { name: taskData.status || 'Входящая' }
      },
      'Приоритет': {
        select: { name: taskData.priority || 'Обычный' }
      }
    };

    if (taskData.deadline) {
      properties['Срок'] = { date: { start: taskData.deadline } };
    }
    if (taskData.plannedDate) {
      properties['Запланировано'] = { date: { start: taskData.plannedDate } };
    }
    if (taskData.subject) {
      properties['Предмет'] = { select: { name: taskData.subject } };
    }
    if (taskData.taskType) {
      properties['Тип задачи'] = { select: { name: taskData.taskType } };
    }
    if (taskData.source) {
      properties['Источник'] = { select: { name: taskData.source } };
    }
    if (taskData.sourceUrl) {
      properties['URL источника'] = { url: taskData.sourceUrl };
    }
    if (taskData.estimate) {
      properties['Оценка времени'] = { number: Number(taskData.estimate) };
    }
    if (taskData.areaId || this.universityPageId) {
      properties['Область'] = { relation: [{ id: taskData.areaId || this.universityPageId }] };
    }

    const children = [];
    if (taskData.description) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: taskData.description } }]
        }
      });
    }

    const payload = {
      parent: { database_id: this.tasksDbId },
      properties,
      children: children.length > 0 ? children : undefined
    };

    const res = await this._request('/pages', 'POST', payload);
    return this._mapPageToTask(res);
  }

  /**
   * Update an existing Task in Notion
   */
  async updateTask(pageId, updates) {
    console.log(`[TaskEngine] Updating task ${pageId}...`);
    const properties = {};

    if (updates.title) {
      properties['Название'] = { title: [{ text: { content: updates.title } }] };
    }
    if (updates.status) {
      properties['Статус'] = { select: { name: updates.status } };
      if (updates.status === 'Выполнена') {
        const todayStr = new Date().toISOString().split('T')[0];
        properties['Дата выполнения'] = { date: { start: todayStr } };
      }
    }
    if (updates.priority) {
      properties['Приоритет'] = { select: { name: updates.priority } };
    }
    if (updates.deadline !== undefined) {
      properties['Срок'] = updates.deadline ? { date: { start: updates.deadline } } : null;
    }
    if (updates.plannedDate !== undefined) {
      properties['Запланировано'] = updates.plannedDate ? { date: { start: updates.plannedDate } } : null;
    }
    if (updates.subject) {
      properties['Предмет'] = { select: { name: updates.subject } };
    }
    if (updates.source) {
      properties['Источник'] = { select: { name: updates.source } };
    }
    if (updates.sourceUrl) {
      properties['URL источника'] = { url: updates.sourceUrl };
    }
    if (updates.estimate !== undefined) {
      properties['Оценка времени'] = updates.estimate ? { number: Number(updates.estimate) } : null;
    }

    const res = await this._request(`/pages/${pageId}`, 'PATCH', { properties });
    return this._mapPageToTask(res);
  }

  /**
   * Mark a task as Done by ID or Title search
   */
  async completeTask(identifier) {
    let task = null;
    if (identifier.length === 36 && identifier.includes('-')) {
      // Looks like a Notion UUID
      task = await this.getTaskById(identifier);
    } else {
      task = await this.findTask(identifier);
    }

    if (!task) {
      return null;
    }

    return await this.updateTask(task.id, {
      status: 'Выполнена'
    });
  }

  /**
   * Get task by Notion Page ID
   */
  async getTaskById(pageId) {
    try {
      const page = await this._request(`/pages/${pageId}`);
      return this._mapPageToTask(page);
    } catch (e) {
      return null;
    }
  }

  /**
   * Search for an active task by title fuzzy/substring
   */
  async findTask(queryText) {
    const qLower = queryText.toLowerCase().trim();
    const activeTasks = await this.getActiveTasks();

    // 1. Exact match
    const exact = activeTasks.find(t => t.title.toLowerCase() === qLower);
    if (exact) return exact;

    // 2. Substring match
    const sub = activeTasks.find(t => t.title.toLowerCase().includes(qLower));
    if (sub) return sub;

    // 3. Keyword / token intersection
    const tokens = qLower.split(/\s+/).filter(t => t.length > 2);
    if (tokens.length > 0) {
      const scored = activeTasks.map(t => {
        const titleLower = t.title.toLowerCase();
        const score = tokens.filter(tok => titleLower.includes(tok)).length;
        return { task: t, score };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        return scored[0].task;
      }
    }

    return null;
  }

  /**
   * Fetch all active (not Done / Cancelled) tasks
   */
  async getActiveTasks() {
    const res = await this._request(`/databases/${this.tasksDbId}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Статус', select: { does_not_equal: 'Выполнена' } },
          { property: 'Статус', select: { does_not_equal: 'Отменена' } }
        ]
      }
    });

    return (res.results || []).map(p => this._mapPageToTask(p));
  }

  /**
   * Fetch recently completed tasks
   */
  async getCompletedTasks(limit = 15) {
    try {
      const res = await this._request(`/databases/${this.tasksDbId}/query`, 'POST', {
        filter: {
          property: 'Статус', select: { equals: 'Выполнена' }
        },
        sorts: [
          { timestamp: 'last_edited_time', direction: 'descending' }
        ],
        page_size: limit
      });
      return (res.results || []).map(p => this._mapPageToTask(p));
    } catch (err) {
      console.warn('[TaskEngine] getCompletedTasks error:', err.message);
      return [];
    }
  }

  /**
   * Tasks planned for Today or with Deadline Today
   */
  async getTodayTasks() {
    const todayStr = new Date().toISOString().split('T')[0];
    const all = await this.getActiveTasks();

    return all.filter(t => {
      const isPlannedToday = t.plannedDate && t.plannedDate.startsWith(todayStr);
      const isDueToday = t.deadline && t.deadline.startsWith(todayStr);
      return isPlannedToday || isDueToday;
    });
  }

  /**
   * Overdue tasks (Deadline in past, not completed)
   */
  async getOverdueTasks() {
    const todayStr = new Date().toISOString().split('T')[0];
    const all = await this.getActiveTasks();

    return all.filter(t => {
      if (!t.deadline) return false;
      const dateOnly = t.deadline.split('T')[0];
      return dateOnly < todayStr;
    });
  }

  /**
   * High & Critical priority tasks
   */
  async getImportantTasks() {
    const all = await this.getActiveTasks();
    return all.filter(t => t.priority === 'Критический' || t.priority === 'Высокий');
  }

  /**
   * Create Note in Knowledge Base («Знания»)
   */
  async createKnowledgeNote(noteData) {
    console.log(`[TaskEngine] Saving knowledge note: "${noteData.title}"`);

    const properties = {
      'Название': {
        title: [{ text: { content: noteData.title } }]
      }
    };

    if (noteData.category) {
      properties['Категория'] = { select: { name: noteData.category } };
    }
    if (noteData.source) {
      properties['Источник'] = {
        rich_text: [{ type: 'text', text: { content: noteData.source } }]
      };
    }
    if (this.universityPageId) {
      properties['Область'] = { relation: [{ id: this.universityPageId }] };
    }

    const children = [];
    if (noteData.content) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: noteData.content } }]
        }
      });
    }

    return await this._request('/pages', 'POST', {
      parent: { database_id: this.knowledgeDbId },
      properties,
      children: children.length > 0 ? children : undefined
    });
  }
}

module.exports = { TaskEngine };
