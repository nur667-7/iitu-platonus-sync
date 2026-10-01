/**
 * Nurbek OS — Task Resolver & Deduplicator
 * Cross-source deduplication and intelligent merge engine (Platonus + Teams + Telegram).
 */

class TaskResolver {
  constructor(options = {}) {
    this.subjects = options.subjects || [
      { name: 'Java Spring', aliases: ['spring', 'java spring', 'спринг'] },
      { name: 'IoT', aliases: ['iot', 'интернет вещей', 'arduino', 'ардуино'] },
      { name: 'English', aliases: ['english', 'английский', 'инглиш', 'иностранный', 'foreign', 'foreign language', 'иностранный язык'] },
      { name: 'Гос язык', aliases: ['гос язык', 'делопроизводство', 'қазақ тілі'] },
      { name: 'IT-продукты', aliases: ['product', 'it product', 'продакт', 'управление продуктом', 'продукт', 'it-продукт'] },
      { name: 'Методология', aliases: ['методология', 'исследование', 'research'] }
    ];
  }

  /**
   * Standardize subject name to Notion select option
   */
  normalizeSubject(rawSubject) {
    if (!rawSubject) return 'Другое';
    const subLower = rawSubject.toLowerCase();

    for (const s of this.subjects) {
      if (subLower.includes(s.name.toLowerCase())) return s.name;
      for (const a of s.aliases) {
        if (subLower.includes(a)) return s.name;
      }
    }

    return 'Другое';
  }

  /**
   * Extract standardized task fingerprint: e.g. "lab:4" or "rk:1" or "exam"
   */
  extractFingerprint(title = '') {
    const tLower = title.toLowerCase();

    // Lab number
    const labMatch = tLower.match(/(?:лабораторн[а-яё]*\s*(?:работа|работы)?|лаба|лаб|lab|лр)[\s№#]*(\d+)/i);
    if (labMatch) return `lab:${labMatch[1]}`;

    // Practical number
    const practMatch = tLower.match(/(?:практическ[а-яё]*\s*(?:работа|работы)?|практика|пр)[\s№#]*(\d+)/i);
    if (practMatch) return `pract:${practMatch[1]}`;

    // RK / Midterm / Exam
    if (tLower.includes('рк1') || tLower.includes('рк 1')) return 'rk:1';
    if (tLower.includes('рк2') || tLower.includes('рк 2')) return 'rk:2';
    if (tLower.includes('midterm') || tLower.includes('мидтерм')) return 'midterm';
    if (tLower.includes('экзамен') || tLower.includes('exam') || tLower.includes('финал')) return 'exam';

    return null;
  }

  /**
   * Decide whether incoming event matches an existing task
   */
  findMatchingTask(incomingEvent, existingTasks = []) {
    const incomingSub = this.normalizeSubject(incomingEvent.subject);
    const incomingFp = this.extractFingerprint(incomingEvent.title);

    for (const task of existingTasks) {
      const taskSub = this.normalizeSubject(task.subject || task.title);
      const taskFp = this.extractFingerprint(task.title);

      // 1. Same subject AND same academic fingerprint (e.g. both are Java Spring Lab 4)
      if (incomingFp && taskFp && incomingFp === taskFp) {
        if (incomingSub === taskSub || incomingSub === 'Другое' || taskSub === 'Другое') {
          return task;
        }
      }

      // 2. Direct string similarity if no fingerprint
      const inTitleLower = (incomingEvent.title || '').toLowerCase().trim();
      const taskTitleLower = (task.title || '').toLowerCase().trim();

      if (taskTitleLower.includes(inTitleLower) || inTitleLower.includes(taskTitleLower)) {
        if (incomingSub === taskSub) {
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Merge new event data into existing task with conflict resolution rules
   */
  resolveMerge(existingTask, incomingEvent) {
    const updates = {};

    // 0. Manual Override: if user manually set task properties, respect it
    if (existingTask.manualOverride) {
      console.log(`[TaskResolver] Skipping merge for "${existingTask.title}": protected by manualOverride`);
      return null;
    }

    // 1. Deadlines: Teacher/Platonus update takes precedence if new deadline is explicit
    if (incomingEvent.deadline && incomingEvent.deadline !== existingTask.deadline) {
      updates.deadline = incomingEvent.deadline;
      console.log(`[TaskResolver] Merged new deadline for "${existingTask.title}": ${incomingEvent.deadline}`);
    }

    // 2. Planned Date: Never overwrite user's planned date with automatic sync
    if (!existingTask.plannedDate && incomingEvent.plannedDate) {
      updates.plannedDate = incomingEvent.plannedDate;
    }

    // 3. Priority: User override protected; otherwise escalate to higher priority
    const priorityRanks = { 'Критический': 4, 'Высокий': 3, 'Обычный': 2, 'Низкий': 1 };
    const incomingPriority = incomingEvent.priority || 'Обычный';
    const existingRank = priorityRanks[existingTask.priority] || 2;
    const incomingRank = priorityRanks[incomingPriority] || 2;

    if (incomingRank > existingRank) {
      updates.priority = incomingPriority;
    }

    // 4. Source URL
    if (incomingEvent.url && !existingTask.sourceUrl) {
      updates.sourceUrl = incomingEvent.url;
    }

    // 5. Subject
    if ((!existingTask.subject || existingTask.subject === 'Другое') && incomingEvent.subject) {
      updates.subject = this.normalizeSubject(incomingEvent.subject);
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }
}

module.exports = { TaskResolver };
