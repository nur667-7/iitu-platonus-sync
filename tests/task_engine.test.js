const test = require('node:test');
const assert = require('node:assert');
const { TaskResolver } = require('../src/tasks/taskResolver');
const { TaskPlanner } = require('../src/tasks/taskPlanner');
const { TaskClassifier } = require('../src/ai/taskClassifier');

test('TaskResolver normalizes subjects and extracts fingerprints', () => {
  const resolver = new TaskResolver();

  // Subject normalization
  assert.strictEqual(resolver.normalizeSubject('Веб-приложения на Spring Boot'), 'Java Spring');
  assert.strictEqual(resolver.normalizeSubject('Интернет вещей (IoT)'), 'IoT');
  assert.strictEqual(resolver.normalizeSubject('Foreign Language'), 'English');
  assert.strictEqual(resolver.normalizeSubject('Делопроизводство'), 'Гос язык');
  assert.strictEqual(resolver.normalizeSubject('Управление IT-продуктом'), 'IT-продукты');
  assert.strictEqual(resolver.normalizeSubject('Неизвестный предмет'), 'Другое');

  // Fingerprint extraction
  assert.strictEqual(resolver.extractFingerprint('Лабораторная работа №4: Spring Data JPA'), 'lab:4');
  assert.strictEqual(resolver.extractFingerprint('ЛР 2 IoT сенсоры'), 'lab:2');
  assert.strictEqual(resolver.extractFingerprint('Практика 3'), 'pract:3');
  assert.strictEqual(resolver.extractFingerprint('Рубежный контроль 1 (РК1)'), 'rk:1');
  assert.strictEqual(resolver.extractFingerprint('Финальный экзамен'), 'exam');
  assert.strictEqual(resolver.extractFingerprint('Просто задача без номера'), null);
});

test('TaskResolver merges matching tasks without duplicates', () => {
  const resolver = new TaskResolver();

  const existingTasks = [
    {
      id: 'task-101',
      title: 'Лабораторная работа 4 (Spring JPA)',
      subject: 'Java Spring',
      deadline: '2026-10-04',
      plannedDate: '2026-10-01',
      priority: 'Обычный',
      sourceUrl: null
    }
  ];

  // Incoming from Teams mentioning the same lab
  const teamsEvent = {
    title: 'Don\'t forget Lab 4 deadline extended to Sunday',
    subject: 'Java Spring',
    deadline: '2026-10-05',
    priority: 'Высокий',
    url: 'https://teams.microsoft.com/msg123'
  };

  const matched = resolver.findMatchingTask(teamsEvent, existingTasks);
  assert.ok(matched);
  assert.strictEqual(matched.id, 'task-101');

  const updates = resolver.resolveMerge(matched, teamsEvent);
  assert.strictEqual(updates.deadline, '2026-10-05');
  assert.strictEqual(updates.priority, 'Высокий');
  assert.strictEqual(updates.sourceUrl, 'https://teams.microsoft.com/msg123');
  // Planned date is protected and not overwritten
  assert.strictEqual(updates.plannedDate, undefined);
});

test('TaskPlanner computes dynamic urgency correctly', () => {
  const planner = new TaskPlanner();
  const now = new Date('2026-10-01T12:00:00Z');

  // Overdue
  const past = planner.calculateUrgency('2026-09-30T10:00:00Z', now);
  assert.strictEqual(past.level, 'overdue');

  // Critical (< 24h)
  const critical = planner.calculateUrgency('2026-10-01T18:00:00Z', now);
  assert.strictEqual(critical.level, 'critical');

  // High (< 72h)
  const high = planner.calculateUrgency('2026-10-03T10:00:00Z', now);
  assert.strictEqual(high.level, 'high');

  // Medium (< 7d)
  const med = planner.calculateUrgency('2026-10-06T12:00:00Z', now);
  assert.strictEqual(med.level, 'medium');

  // Low
  const low = planner.calculateUrgency('2026-10-20T12:00:00Z', now);
  assert.strictEqual(low.level, 'low');
});

test('TaskClassifier fast parser handles commands, queries and notes', () => {
  const classifier = new TaskClassifier();

  // Query today
  const q1 = classifier.classifyFast('что сегодня');
  assert.strictEqual(q1.intent, 'QUERY');
  assert.strictEqual(q1.queryType, 'today');

  // Query overdue
  const q2 = classifier.classifyFast('/overdue');
  assert.strictEqual(q2.intent, 'QUERY');
  assert.strictEqual(q2.queryType, 'overdue');

  // Complete task
  const c1 = classifier.classifyFast('сделал spring lab 4');
  assert.strictEqual(c1.intent, 'COMPLETE_TASK');
  assert.strictEqual(c1.target, 'spring lab 4');

  // Knowledge Note
  const n1 = classifier.classifyFast('запомни: препод по Spring любит PDF отчеты');
  assert.strictEqual(n1.intent, 'CREATE_NOTE');
  assert.ok(n1.content.includes('препод по Spring'));

  // Someday task
  const s1 = classifier.classifyFast('запиши на долгосрок: сделать личный SaaS');
  assert.strictEqual(s1.intent, 'CREATE_TASK');
  assert.strictEqual(s1.status, 'Когда-нибудь');
  assert.strictEqual(s1.priority, 'Низкий');

  // Health command
  const h1 = classifier.classifyFast('/health');
  assert.strictEqual(h1.intent, 'HEALTH');
});

test('TaskResolver respects manualOverride and protects user edits', () => {
  const resolver = new TaskResolver();
  const userTask = {
    id: 'task-user-custom',
    title: 'Лабораторная работа 4 (Spring JPA)',
    subject: 'Java Spring',
    deadline: '2026-10-10', // User manually set a custom deadline
    manualOverride: true
  };

  const incomingTeamsUpdate = {
    title: 'Lab 4 deadline is 2026-10-05',
    subject: 'Java Spring',
    deadline: '2026-10-05'
  };

  const mergeResult = resolver.resolveMerge(userTask, incomingTeamsUpdate);
  assert.strictEqual(mergeResult, null, 'Should not overwrite task when manualOverride is true');
});
