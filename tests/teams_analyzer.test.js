const test = require('node:test');
const assert = require('node:assert');
const { TeamsAnalyzer } = require('../src/teamsAnalyzer');

test('TeamsAnalyzer.matchSubject matches course by name, alias, and tutor', () => {
  const analyzer = new TeamsAnalyzer();

  // Match by alias in text
  const msg1 = { text: 'Сдайте задание по spring boot до субботы', chatName: 'Общий', senderName: 'Студент' };
  assert.strictEqual(analyzer.matchSubject(msg1), 'Разработка Web приложений на Java Spring');

  // Match by tutor name
  const msg2 = { text: 'Приглашение на лекцию', chatName: 'Канал 1', senderName: 'Дауренбаева Н.А.' };
  assert.strictEqual(analyzer.matchSubject(msg2), 'Программирование Internet of Things (IOT)');

  // Match by chat name
  const msg3 = { text: 'Всем добрый день', chatName: 'Профессионально-ориентированный иностранный язык', senderName: 'Староста' };
  assert.strictEqual(analyzer.matchSubject(msg3), 'Профессионально-ориентированный иностранный язык');

  // Unknown subject
  const msg4 = { text: 'Кто пойдет в столовую?', chatName: 'Флудилка', senderName: 'Нурбек' };
  assert.strictEqual(analyzer.matchSubject(msg4), 'Не определено');
});

test('TeamsAnalyzer.isPotentiallyRelevant filters out noise and catches academic signals', () => {
  const analyzer = new TeamsAnalyzer();

  // Noise: short message
  const noise1 = { text: 'спс', attachments: [] };
  assert.strictEqual(analyzer.isPotentiallyRelevant(noise1).relevant, false);

  // Noise: casual chat
  const noise2 = { text: 'Привет всем как дела', attachments: [] };
  assert.strictEqual(analyzer.isPotentiallyRelevant(noise2).relevant, false);

  // Signal: deadline keyword
  const academic1 = { text: 'Дедлайн лабораторной работы переносится на понедельник', attachments: [] };
  assert.strictEqual(analyzer.isPotentiallyRelevant(academic1).relevant, true);

  // Signal: attachment present
  const academic2 = { text: 'Файл', attachments: [{ name: 'Syllabus.pdf' }] };
  assert.strictEqual(analyzer.isPotentiallyRelevant(academic2).relevant, true);

  // Signal: date detected
  const academic3 = { text: 'Встречаемся 15 октября в 14:00', attachments: [] };
  assert.strictEqual(analyzer.isPotentiallyRelevant(academic3).relevant, true);
});

test('TeamsAnalyzer.classifyRuleBased assigns correct event types and priorities', () => {
  const analyzer = new TeamsAnalyzer();

  // Schedule change
  const sc = analyzer.classifyRuleBased(
    { text: 'Занятие переносится в онлайн Teams' },
    'Программирование Internet of Things (IOT)'
  );
  assert.strictEqual(sc.type, 'SCHEDULE_CHANGE');
  assert.strictEqual(sc.requiresTelegramAlert, true);

  // Exam
  const exam = analyzer.classifyRuleBased(
    { text: 'Во вторник пишем РК1 и рубежный контроль' },
    'Профессионально-ориентированный иностранный язык'
  );
  assert.strictEqual(exam.type, 'EXAM');
  assert.strictEqual(exam.requiresCalendarEvent, true);
  assert.strictEqual(exam.requiresTelegramAlert, true);

  // Task / Lab
  const task = analyzer.classifyRuleBased(
    { text: 'Новая лабораторная работа по JPA' },
    'Разработка Web приложений на Java Spring'
  );
  assert.strictEqual(task.type, 'TASK');
});

test('TeamsAnalyzer ignores specified chats (e.g. Professional English 2nd year INTER)', () => {
  const analyzer = new TeamsAnalyzer();

  const msg = {
    chatName: 'Professional English 2nd year INTER',
    senderName: 'Преподаватель',
    text: 'Дедлайн сдачи финального эссе 10 октября',
    attachments: []
  };

  const relevance = analyzer.isPotentiallyRelevant(msg);
  assert.strictEqual(relevance.relevant, false);
  assert.ok(relevance.signals.some(s => s.includes('ignored_chat')));

  const subject = analyzer.matchSubject(msg);
  assert.strictEqual(subject, 'Не определено');
});
