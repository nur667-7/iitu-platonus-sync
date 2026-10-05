const test = require('node:test');
const assert = require('node:assert');
const { TelegramInput } = require('../src/sources/telegramInput');

test('TelegramInput handles queries, completion, and notes without errors', async () => {
  const createdTasks = [];
  const completedTasks = [];
  const createdNotes = [];

  const mockTaskEngine = {
    getActiveTasks: async () => [
      { id: 't1', title: 'Spring Lab 4', status: 'Входящая', priority: 'Высокий', deadline: '2026-10-05', plannedDate: '2026-10-01' }
    ],
    getTodayTasks: async () => [
      { id: 't1', title: 'Spring Lab 4', priority: 'Высокий' }
    ],
    getOverdueTasks: async () => [],
    getImportantTasks: async () => [
      { id: 't1', title: 'Spring Lab 4', priority: 'Высокий', deadline: '2026-10-05' }
    ],
    createTask: async (data) => {
      createdTasks.push(data);
      return { id: 't-new', ...data };
    },
    completeTask: async (target) => {
      completedTasks.push(target);
      return { id: 't1', title: 'Spring Lab 4', status: 'Выполнена' };
    },
    createKnowledgeNote: async (data) => {
      createdNotes.push(data);
      return { id: 'k-new', ...data };
    }
  };

  const telegramInput = new TelegramInput({
    botToken: 'mock-bot-token',
    chatId: '123456789',
    taskEngine: mockTaskEngine
  });

  // Mock sendReply to avoid real network call
  telegramInput.sendReply = async () => true;

  // 1. Noise check
  const rNoise = await telegramInput.handleIncomingMessage('лл', '123456789');
  assert.strictEqual(rNoise, null);

  // 2. Query today
  const rToday = await telegramInput.handleIncomingMessage('что сегодня', '123456789');
  assert.ok(rToday.reply.includes('План на сегодня'));
  assert.ok(rToday.reply.includes('Spring Lab 4'));

  // 3. Query focus
  const rFocus = await telegramInput.handleIncomingMessage('что делать сейчас', '123456789');
  assert.ok(rFocus.reply.includes('Рекомендуемый фокус'));

  // 4. Complete task
  const rDone = await telegramInput.handleIncomingMessage('сделал spring lab 4', '123456789');
  assert.strictEqual(completedTasks.length, 1);
  assert.ok(rDone.reply.includes('Задача выполнена'));

  // 5. Create note
  const rNote = await telegramInput.handleIncomingMessage('запомни: сдавать в PDF', '123456789');
  assert.strictEqual(createdNotes.length, 1);
  assert.ok(rNote.reply.includes('Заметка сохранена'));

  // 6. Help command
  const rHelp = await telegramInput.handleIncomingMessage('/help', '123456789');
  assert.ok(rHelp.reply.includes('Nurbek OS — Команды & Быстрый доступ'));

  const rWeek = await telegramInput.handleIncomingMessage('/week', '123456789');
  assert.strictEqual(rWeek.classification.queryType, 'week');
  assert.ok(rWeek.reply.includes('Расписание и задачи на неделю'));

  const cloudSyncInput = new TelegramInput({
    botToken: 'mock-bot-token',
    chatId: '123456789',
    taskEngine: mockTaskEngine,
    onSyncRequest: async () => '☁️ Синхронизация выполняется по расписанию.'
  });
  cloudSyncInput.sendReply = async () => true;
  const rCloudSync = await cloudSyncInput.handleIncomingMessage('/sync', '123456789');
  assert.strictEqual(rCloudSync.reply, '☁️ Синхронизация выполняется по расписанию.');

  // 7. Academic Attendance & Grades from Cache
  const mockState = {
    data: { telegramLastUpdateId: 100 },
    getAcademicCache: () => ({
      weeklySchedule: {
        'Пятница': [
          { startTime: '10:00', endTime: '11:15', subject: 'Java Spring', roomLabel: '405' }
        ]
      },
      attendanceList: [
        { subjectName: 'Java Spring', riskLevel: 'SAFE', missedSessions: 1, heldSessions: 10, currentAbsencePct: 10, remainingAllowed: 2, avgGrade: 85, gradesList: [80, 90] }
      ],
      assignments: [
        { subjectName: 'Java Spring', taskName: 'Lab 4 JPA', deadline: '2026-10-05' }
      ]
    })
  };

  const academicTelegramInput = new TelegramInput({
    botToken: 'mock-bot-token',
    chatId: '123456789',
    taskEngine: mockTaskEngine,
    state: mockState
  });
  academicTelegramInput.sendReply = async () => true;

  const rAttendance = await academicTelegramInput.handleIncomingMessage('посещаемость', '123456789');
  assert.ok(rAttendance.reply.includes('Посещаемость и лимит 20%'));
  assert.ok(rAttendance.reply.includes('Java Spring'));
  assert.ok(rAttendance.reply.includes('До ретейка осталось: *2* пар'));

  const rGrades = await academicTelegramInput.handleIncomingMessage('оценки', '123456789');
  assert.ok(rGrades.reply.includes('Текущие оценки в журнале IITU'));
  assert.ok(rGrades.reply.includes('85'));

  const rAssignments = await academicTelegramInput.handleIncomingMessage('задания', '123456789');
  assert.ok(rAssignments.reply.includes('Задания из Platonus'));
  assert.ok(rAssignments.reply.includes('Lab 4 JPA'));

  // 8. Timeline / By minutes query
  const rTimeline = await academicTelegramInput.handleIncomingMessage('Что у меня на день , по минутам растав', '123456789');
  assert.strictEqual(rTimeline.classification.intent, 'QUERY');
  assert.strictEqual(rTimeline.classification.queryType, 'timeline');
  assert.ok(rTimeline.reply.includes('Поминутный таймлайн на день'));

  // 9. Completed tasks query
  mockTaskEngine.getCompletedTasks = async () => [
    { id: 'c1', title: 'Сделал отчет по IoT', subject: 'IoT', status: 'Выполнена' }
  ];
  const rCompleted = await academicTelegramInput.handleIncomingMessage('Что было сделано вчера', '123456789');
  assert.strictEqual(rCompleted.classification.intent, 'QUERY');
  assert.strictEqual(rCompleted.classification.queryType, 'completed');
  assert.ok(rCompleted.reply.includes('Выполненные задачи'));
  assert.ok(rCompleted.reply.includes('Сделал отчет по IoT'));
});
