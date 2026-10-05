/**
 * Nurbek OS — Task & Intent Classifier
 * Hybrid intent parser: deterministic fast-path heuristics + Groq LLM semantic classification.
 */

const config = require('../config');
const { dateKeyInTimeZone } = require('../shared/clock');

class TaskClassifier {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || config.AI.GROQ_API_KEY || config.AI.OPENAI_API_KEY;
    this.model = options.model || process.env.AI_MODEL || config.AI.MODEL;
  }

  /**
   * Fast cheap rule-based heuristic parser
   */
  classifyFast(text) {
    const raw = text.trim();
    const tLower = raw.toLowerCase();

    // Noise check (allow /? and single letters if command)
    if ((tLower.length <= 2 && !tLower.startsWith('/')) || tLower === 'ок' || tLower === 'спс' || tLower === 'да' || tLower === 'нет') {
      return { intent: 'IGNORE' };
    }

    // 0. System & Help commands
    if (tLower === '/start' || tLower === 'start' || tLower === '/help' || tLower === 'help' || tLower === 'помощь' || tLower === 'меню' || tLower === 'команды') {
      return { intent: 'HELP' };
    }
    if (tLower === '/sync' || tLower === 'sync' || tLower === 'обнови' || tLower === 'синхронизируй' || tLower === 'проверь платонус') {
      return { intent: 'SYNC' };
    }
    if (tLower === '/health' || tLower === 'health' || tLower === 'статус' || tLower === 'диагностика' || tLower === 'healthcheck' || tLower === 'проверка') {
      return { intent: 'HEALTH' };
    }

    // 1. Academic Queries (Deterministic fast response from local cache)
    if (tLower === '/attendance' || tLower === 'attendance' || tLower === '/retake' || tLower === 'retake' || /посещаемост|пропуск|ретейк|сколько нб|мои нб|\bнб\b/i.test(tLower)) {
      return { intent: 'QUERY', queryType: 'attendance' };
    }
    if (tLower === '/grades' || tLower === 'grades' || /оценк|балл|успеваемост|аттестаци|журнал/i.test(tLower)) {
      return { intent: 'QUERY', queryType: 'grades' };
    }
    if (tLower === '/assignments' || tLower === 'assignments' || /задания\s+платонус|платонус\s+задания|домашка|задания/i.test(tLower)) {
      return { intent: 'QUERY', queryType: 'assignments' };
    }

    // 2. Schedule, Timeline & Task Queries
    if (/что\s+(на|в)\s+(эту\s+)?недел|расписание\s+(на\s+)?недел|пары\s+(на\s+)?недел|на\s+эту\s+неделю|план\s+на\s+неделю|до\s+воскресен/i.test(tLower)) {
      return { intent: 'QUERY', queryType: 'week' };
    }
    if (/что\s+у\s+меня(\s+на\s+день)?|по\s+минутам|таймлайн|распиши\s+день|растав\b|хронологи/i.test(tLower)) {
      return { intent: 'QUERY', queryType: 'timeline' };
    }
    if (/что\s+(было\s+)?(сделано|выполнено|закрыто)|(выполненные|завершенные)\s+задачи|история\s+задач|что\s+я\s+сделал/i.test(tLower)) {
      const isYesterday = tLower.includes('вчера');
      return { intent: 'QUERY', queryType: 'completed', period: isYesterday ? 'yesterday' : 'all' };
    }

    if (/^(что|какие)\s+(сегодня|на сегодня|завтра|на завтра|делать|сделать)/i.test(tLower) ||
        tLower === '/today' || tLower === 'today' || tLower === 'что сегодня' || tLower === 'что на сегодня' ||
        tLower === 'пары сегодня' || tLower === 'пары на сегодня' || tLower === 'расписание' ||
        tLower === 'расписание на сегодня' || tLower === 'какие пары' || tLower === 'какие пары сегодня') {
      if (tLower.includes('завтра')) {
        return { intent: 'QUERY', queryType: 'tomorrow' };
      }
      if (tLower.includes('делать') || tLower.includes('сделать')) {
        return { intent: 'QUERY', queryType: 'focus' };
      }
      return { intent: 'QUERY', queryType: 'today' };
    }
    if (tLower === '/tomorrow' || tLower === 'tomorrow' || tLower === 'что завтра' || tLower === 'что на завтра' ||
        tLower === 'пары завтра' || tLower === 'пары на завтра' || tLower === 'расписание на завтра') {
      return { intent: 'QUERY', queryType: 'tomorrow' };
    }
    if (tLower === '/overdue' || tLower === 'overdue' || tLower === 'что горит' || tLower === 'просрочено' || tLower === 'дедлайны' || tLower === 'горящие дедлайны') {
      return { intent: 'QUERY', queryType: 'overdue' };
    }
    if (tLower === '/important' || tLower === 'important' || tLower === 'важные' || tLower === 'что важно') {
      return { intent: 'QUERY', queryType: 'important' };
    }
    if (tLower === '/tasks' || tLower === 'tasks' || tLower === 'все задачи' || tLower === 'список задач' || tLower === 'задачи') {
      return { intent: 'QUERY', queryType: 'all' };
    }
    if (tLower === '/focus' || tLower === 'focus' || tLower === 'что делать сейчас' || tLower === 'что сейчас делать' || tLower === 'фокус' || tLower === 'что делать') {
      return { intent: 'QUERY', queryType: 'focus' };
    }

    // 2. Complete Task
    const donePrefixes = ['/done', 'сделал', 'выполнил', 'закрыл', 'готово'];
    for (const dp of donePrefixes) {
      if (tLower.startsWith(dp + ' ')) {
        const target = raw.slice(dp.length + 1).trim();
        return { intent: 'COMPLETE_TASK', target };
      }
    }

    // 3. Knowledge / Note
    if (tLower.startsWith('запомни:') || tLower.startsWith('запомни ') || tLower.startsWith('сохрани мысль') || tLower.startsWith('заметка:')) {
      const content = raw.replace(/^(запомни:?|сохрани мысль:?|заметка:?)\s*/i, '').trim();
      const firstLine = content.split('\n')[0].slice(0, 50);
      return {
        intent: 'CREATE_NOTE',
        title: firstLine,
        content: content,
        category: 'Идеи'
      };
    }

    // 4. Someday task
    if (tLower.includes('на долгосрок') || tLower.includes('когда-нибудь')) {
      const cleanTitle = raw
        .replace(/(запиши на долгосрок:?|на долгосрок поставит[ь]? задачу|когда-нибудь)\s*/i, '')
        .trim();
      return {
        intent: 'CREATE_TASK',
        title: cleanTitle || raw,
        status: 'Когда-нибудь',
        priority: 'Низкий',
        plannedDate: null,
        deadline: null,
        subject: 'Другое'
      };
    }

    return null; // Delegate to LLM
  }

  /**
   * AI semantic intent classifier using Groq JSON mode
   */
  async classifyWithAI(text, now = new Date()) {
    if (!this.apiKey) {
      // Basic fallback
      return {
        intent: 'CREATE_TASK',
        title: text,
        priority: 'Обычный',
        status: 'Входящая',
        plannedDate: null,
        deadline: null,
        subject: 'Другое'
      };
    }

    const todayStr = dateKeyInTimeZone(now);
    const systemPrompt = `You are the Task Intelligence Engine for Nurbek OS (IITU University student).
Today's Date: ${todayStr} (Asia/Almaty, UTC+5).

Classify the user's message into ONE of these intents:
1. CREATE_TASK: user wants to plan or record a NEW task/homework/work item.
   - plannedDate: date user intends to DO it (e.g. "сегодня" = "${todayStr}").
   - deadline: hard due date (e.g. "до пятницы" or "сдать до 5 октября").
   - priority: "Критический" | "Высокий" | "Обычный" | "Низкий".
   - status: "Входящая" | "Следующая" | "Когда-нибудь".
   - subject: "Java Spring" | "IoT" | "English" | "Гос язык" | "IT-продукты" | "Методология" | "Другое".
   - project: e.g. "Freedom Bank" if mentioned, else null.
   - estimateMinutes: number in minutes (e.g. 30, 60, 90) or null.
2. COMPLETE_TASK: user finished something ("сделал lab 4"). "target" field = task title/keyword.
3. UPDATE_TASK: user rescheduling or updating ("перенеси spring lab на субботу").
4. CREATE_NOTE: thoughts, ideas, information to remember ("запомни", "сохрани мысль").
5. QUERY: questions asking about tasks, schedule, or what was done ("что у меня сегодня?", "что на эту неделю?", "что было сделано вчера?", "что горит?", "распиши день по минутам").
   - queryType: "today" | "tomorrow" | "week" | "timeline" | "completed" | "overdue" | "important" | "all" | "focus" | "attendance" | "grades".
   - CRITICAL: If message asks a question or asks about history/schedule, NEVER classify as CREATE_TASK. Classify as QUERY.

Respond ONLY in raw JSON matching this schema:
{
  "intent": "CREATE_TASK" | "COMPLETE_TASK" | "UPDATE_TASK" | "CREATE_NOTE" | "QUERY",
  "queryType": "today" | "tomorrow" | "week" | "timeline" | "completed" | "overdue" | "important" | "all" | "focus" | "attendance" | "grades" | null,
  "title": "Clean, concise Russian title (or target to complete)",
  "target": "String if complete/update" | null,
  "content": "Full note body if CREATE_NOTE" | null,
  "plannedDate": "YYYY-MM-DD" | null,
  "deadline": "YYYY-MM-DD" | null,
  "priority": "Критический" | "Высокий" | "Обычный" | "Низкий",
  "status": "Входящая" | "Следующая" | "Когда-нибудь",
  "subject": "Java Spring" | "IoT" | "English" | "Гос язык" | "IT-продукты" | "Методология" | "Другое",
  "project": string | null,
  "estimateMinutes": number | null,
  "category": "Идеи" | "Учёба" | "Разработка" | null
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(config.AI.TIMEOUT_MS)
      });

      if (!res.ok) {
        throw new Error(`LLM API status ${res.status}`);
      }

      const resData = await res.json();
      const content = resData.choices?.[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (err) {
      console.warn(`[TaskClassifier] AI classification fallback (${err.message}). Using rule defaults.`);
      const isQuestion = /^(что|какие|когда|где|куда|почему|зачем|сколько|как)\b/i.test(text.trim()) || text.trim().endsWith('?');
      if (isQuestion) {
        return {
          intent: 'QUERY',
          queryType: text.toLowerCase().includes('недел') ? 'week' : (text.toLowerCase().includes('завтра') ? 'tomorrow' : 'today'),
          title: text
        };
      }
      return {
        intent: 'CREATE_TASK',
        title: text,
        priority: 'Обычный',
        status: 'Входящая',
        plannedDate: text.toLowerCase().includes('сегодня') ? todayStr : null,
        deadline: null,
        subject: 'Другое'
      };
    }
  }

  /**
   * Main entry point
   */
  async classify(text) {
    const fast = this.classifyFast(text);
    if (fast) return fast;
    return await this.classifyWithAI(text);
  }
}

module.exports = { TaskClassifier };
