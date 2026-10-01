/**
 * Microsoft Teams Message Analyzer & AI Classifier
 * Performs deterministic subject matching, heuristic relevance pre-filtering,
 * and semantic AI classification for academic task/deadline extraction.
 */

const config = require('./config');

class TeamsAnalyzer {
  constructor(options = {}) {
    this.subjects = options.subjects || config.TEAMS.SUBJECTS;
    this.ignoredChats = (options.ignoredChats || config.TEAMS.IGNORED_CHATS || []).map(c => c.toLowerCase());
    this.aiEnabled = options.aiEnabled !== undefined ? options.aiEnabled : config.TEAMS.AI_ENABLED;
    this.apiKey = options.apiKey || config.AI.GROQ_API_KEY || config.AI.OPENAI_API_KEY;
    this.model = options.model || config.AI.MODEL;
  }

  /**
   * Deterministic subject matching via chat name, tutor, and keyword aliases
   */
  matchSubject(message) {
    const textLower = (message.text || '').toLowerCase();
    const chatLower = (message.chatName || '').toLowerCase();
    const senderLower = (message.senderName || '').toLowerCase();

    // Check if chat is explicitly ignored
    for (const ignored of this.ignoredChats) {
      if (chatLower.includes(ignored)) return 'Не определено';
    }

    for (const sub of this.subjects) {
      // 1. Match by chat name
      if (chatLower.includes(sub.name.toLowerCase())) return sub.name;
      for (const alias of sub.aliases) {
        if (chatLower.includes(alias)) return sub.name;
      }

      // 2. Match by tutor name
      for (const tutor of sub.tutors) {
        if (senderLower.includes(tutor.toLowerCase()) || textLower.includes(tutor.toLowerCase())) {
          return sub.name;
        }
      }

      // 3. Match by text content keywords
      for (const alias of sub.aliases) {
        const regex = new RegExp(`\\b${alias}\\b`, 'i');
        if (regex.test(textLower)) return sub.name;
      }
    }

    return 'Не определено';
  }

  /**
   * Cheap rule-based heuristic filter to prevent calling LLM on casual banter/spam
   */
  isPotentiallyRelevant(message) {
    const chatLower = (message.chatName || '').toLowerCase();
    const text = (message.text || '').toLowerCase();
    const signals = [];

    // Ignored chats (e.g. past academic years or non-academic groups)
    for (const ignored of this.ignoredChats) {
      if (chatLower.includes(ignored)) {
        return { relevant: false, signals: [`ignored_chat:${ignored}`] };
      }
    }

    // Ignored patterns (casual noise)
    if (text.length < 5 && message.attachments.length === 0) {
      return { relevant: false, signals: ['too_short'] };
    }

    // 1. Academic keywords
    const keywords = [
      'lab', 'лаба', 'лабораторн', 'assignment', 'task', 'задани', 'дедлайн', 'deadline',
      'submit', 'сдать', 'сдач', 'test', 'тест', 'quiz', 'exam', 'экзамен', 'контрольн',
      'перенос', 'отмен', 'rescheduled', 'cancelled', 'due', 'сегодня', 'завтра', 'балл',
      'силлабус', 'рк1', 'рк2', 'рубежк', 'практик', 'лекци', 'срсп', 'github', 'репозитор'
    ];

    for (const kw of keywords) {
      if (text.includes(kw)) {
        signals.push(`keyword:${kw}`);
      }
    }

    // 2. Date and time patterns
    const datePattern = /(\d{1,2}[\.\/-]\d{1,2}|\d{1,2}\s+(январ|феврал|март|апрел|ма|июн|июл|август|сентябр|октябр|ноябр|декабр)|до\s+(понедельник|вторник|сред|четверг|пятниц|суббот|воскресень))/i;
    const timePattern = /\b\d{1,2}:\d{2}\b/;

    if (datePattern.test(text)) signals.push('signal:date_detected');
    if (timePattern.test(text)) signals.push('signal:time_detected');

    // 3. Attachments or links
    if (message.attachments && message.attachments.length > 0) signals.push('signal:attachment');
    if (text.includes('http://') || text.includes('https://')) signals.push('signal:link');

    // 4. Urgency
    if (message.importance === 'urgent' || message.importance === 'high') signals.push('signal:urgent');

    // 5. Subject matched
    const subject = this.matchSubject(message);
    if (subject !== 'Не определено') signals.push(`signal:subject_matched:${subject}`);

    const isRelevant = signals.length > 0;
    return { relevant: isRelevant, signals };
  }

  /**
   * Deterministic rule-based fallback classification when LLM is offline
   */
  classifyRuleBased(message, subject) {
    const textLower = (message.text || '').toLowerCase();

    let type = 'IGNORE';
    let priority = 'low';
    let requiresCalendar = false;
    let requiresAlert = false;
    let deadline = null;

    if (textLower.includes('отмен') || textLower.includes('перенос') || textLower.includes('cancelled') || textLower.includes('rescheduled')) {
      type = 'SCHEDULE_CHANGE';
      priority = 'high';
      requiresAlert = true;
    } else if (textLower.includes('экзамен') || textLower.includes('exam') || textLower.includes('рубежк') || textLower.includes('рк1') || textLower.includes('рк2')) {
      type = 'EXAM';
      priority = 'high';
      requiresCalendar = true;
      requiresAlert = true;
    } else if (textLower.includes('тест') || textLower.includes('test') || textLower.includes('quiz') || textLower.includes('контрольн')) {
      type = 'TEST';
      priority = 'high';
      requiresCalendar = true;
      requiresAlert = true;
    } else if (textLower.includes('лаба') || textLower.includes('лабораторн') || textLower.includes('дедлайн') || textLower.includes('deadline') || textLower.includes('задани') || textLower.includes('task')) {
      type = 'TASK';
      priority = textLower.includes('дедлайн') || textLower.includes('deadline') ? 'high' : 'medium';
      requiresCalendar = Boolean(textLower.includes('дедлайн') || textLower.includes('deadline') || textLower.includes('до '));
      requiresAlert = priority === 'high';
    } else if (message.attachments && message.attachments.length > 0) {
      type = 'RESOURCE';
      priority = 'low';
    } else if (textLower.includes('внимание') || textLower.includes('объявление') || textLower.includes('важно')) {
      type = 'IMPORTANT';
      priority = 'medium';
      requiresAlert = true;
    }

    const titleSnippet = message.text ? message.text.slice(0, 60).replace(/\n/g, ' ') : 'Сообщение Teams';

    return {
      relevant: type !== 'IGNORE',
      type: type,
      confidence: 0.85,
      title: `${type === 'TASK' ? 'Задание' : 'Teams'}: ${titleSnippet}...`,
      description: message.text,
      subject: subject,
      deadline: deadline,
      priority: priority,
      requiresCalendarEvent: requiresCalendar,
      requiresTelegramAlert: requiresAlert
    };
  }

  /**
   * AI-powered semantic classification via Groq/OpenAI compatible LLM
   */
  async classifyWithAI(message, subject) {
    if (!this.aiEnabled || !this.apiKey) {
      return this.classifyRuleBased(message, subject);
    }

    const systemPrompt = `You are an AI assistant in Nurbek OS, analyzing Microsoft Teams messages from IITU university.
Analyze the message and classify it into strictly ONE category:
[TASK, DEADLINE, EXAM, TEST, SCHEDULE_CHANGE, IMPORTANT, RESOURCE, IGNORE].

Rules:
- TASK: Lab work, homework, practical task that requires student action.
- DEADLINE: An explicit due date or deadline for submission.
- EXAM: Midterm, final exam, RK1, RK2.
- TEST: Quiz, online test.
- SCHEDULE_CHANGE: Class rescheduled, cancelled, auditorium changed, online/offline swap.
- IMPORTANT: General critical announcement with no specific action.
- RESOURCE: Shared study file, link, slides, syllabus.
- IGNORE: Casual chatting, student greetings, thank you, spam.

Extract explicit deadline in ISO 8601 if mentioned (Asia/Almaty UTC+5).
Respond ONLY with raw JSON matching this schema:
{
  "relevant": boolean,
  "type": "TASK" | "DEADLINE" | "EXAM" | "TEST" | "SCHEDULE_CHANGE" | "IMPORTANT" | "RESOURCE" | "IGNORE",
  "confidence": number,
  "title": "Short concise Russian title (max 50 chars)",
  "description": "Summary of requirements or details in Russian",
  "deadline": "YYYY-MM-DDTHH:mm:00+05:00" | null,
  "priority": "low" | "medium" | "high",
  "requiresCalendarEvent": boolean,
  "requiresTelegramAlert": boolean
}`;

    const userPrompt = `Chat: ${message.chatName}
Sender: ${message.senderName}
Subject inferred: ${subject}
Date: ${message.createdAt}
Message Text:
${message.text}`;

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
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(config.AI.TIMEOUT_MS)
      });

      if (!res.ok) {
        throw new Error(`LLM API returned status ${res.status}`);
      }

      const resData = await res.json();
      const content = resData.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        subject: parsed.subject || subject
      };
    } catch (e) {
      console.warn(`[TeamsAnalyzer] AI classification failed (${e.message}), falling back to deterministic rules.`);
      return this.classifyRuleBased(message, subject);
    }
  }

  /**
   * Full pipeline: filter -> classify -> generate unified event
   */
  async processMessage(message) {
    const filter = this.isPotentiallyRelevant(message);
    if (!filter.relevant) {
      return null; // Ignored before LLM
    }

    const matchedSubject = this.matchSubject(message);
    const classification = await this.classifyWithAI(message, matchedSubject);

    if (!classification.relevant || classification.type === 'IGNORE') {
      return null;
    }

    return {
      id: `teams:${message.chatId}:${message.sourceMessageId}`,
      source: 'teams',
      sourceId: message.sourceMessageId,
      chatId: message.chatId,
      chatName: message.chatName,
      senderName: message.senderName,
      eventType: classification.type,
      title: classification.title || 'Задание Teams',
      description: classification.description || message.text,
      subject: matchedSubject,
      deadline: classification.deadline || null,
      priority: classification.priority || 'medium',
      confidence: classification.confidence || 0.9,
      url: message.webUrl,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sourceStatus: message.sourceStatus,
      requiresCalendarEvent: Boolean(classification.requiresCalendarEvent),
      requiresTelegramAlert: Boolean(classification.requiresTelegramAlert)
    };
  }
}

module.exports = { TeamsAnalyzer };
