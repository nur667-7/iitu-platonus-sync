const test = require('node:test');
const assert = require('node:assert');
const { TeamsAnalyzer } = require('../src/teamsAnalyzer');
const { StateManager } = require('../src/state');
const { NotionSync } = require('../src/notion');

test('Integration: Pipeline end-to-end processing with mock Notion sync', async () => {
  const state = new StateManager();
  const analyzer = new TeamsAnalyzer();

  const messages = [
    {
      source: 'teams',
      sourceMessageId: 'int-001',
      chatId: 'chat-spring',
      chatName: 'Разработка Web приложений на Java Spring',
      senderName: 'Меңлібай И.Е.',
      createdAt: '2026-10-01T10:00:00+05:00',
      updatedAt: '2026-10-01T10:00:00+05:00',
      text: 'Лабораторная работа 4: дедлайн 10 октября. Сдать в Platonus.',
      attachments: [],
      importance: 'high',
      sourceStatus: 'created'
    },
    {
      source: 'teams',
      sourceMessageId: 'int-002',
      chatId: 'chat-general',
      chatName: 'Флудилка',
      senderName: 'Студент',
      createdAt: '2026-10-01T10:01:00+05:00',
      updatedAt: '2026-10-01T10:01:00+05:00',
      text: 'ок спс',
      attachments: [],
      importance: 'normal',
      sourceStatus: 'created'
    }
  ];

  // 1. Process messages
  const events = [];
  for (const msg of messages) {
    const ev = await analyzer.processMessage(msg);
    if (ev) events.push(ev);
  }

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].subject, 'Разработка Web приложений на Java Spring');
  assert.ok(['TASK', 'DEADLINE'].includes(events[0].eventType));

  // 2. Mock NotionSync to verify payload generation
  let createdPages = [];
  const mockNotion = new NotionSync({ token: 'mock-token' });
  mockNotion._request = async (endpoint, method, body) => {
    if (endpoint.includes('/query')) {
      return { results: [] }; // No existing tasks
    }
    if (endpoint === '/pages' && method === 'POST') {
      createdPages.push(body);
      return { id: 'mock-page-id-999', properties: body.properties };
    }
    return {};
  };
  mockNotion.taskEngine._request = mockNotion._request;

  const synced = await mockNotion.syncTeamsEvents(events, state);
  assert.strictEqual(synced.length, 1);
  assert.strictEqual(createdPages.length, 1);
  assert.strictEqual(createdPages[0].properties['Тип задачи'].select.name, 'Учёба');
  assert.strictEqual(createdPages[0].properties['Источник'].select.name, 'Teams');

  // 3. Verify state recording
  assert.strictEqual(state.isTeamsMessageProcessed('int-001'), true);
  const meta = state.getTeamsMessageMeta('int-001');
  assert.strictEqual(meta.notionTaskId, 'mock-page-id-999');

  // 4. Second sync attempt should not create duplicate
  createdPages = [];
  const secondSynced = await mockNotion.syncTeamsEvents(events, state);
  assert.strictEqual(secondSynced.length, 0);
  assert.strictEqual(createdPages.length, 0);
});
