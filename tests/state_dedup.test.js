const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { StateManager } = require('../src/state');

test('StateManager deduplication and message change detection', () => {
  const tempStatePath = path.resolve(__dirname, 'test_state.json');
  if (fs.existsSync(tempStatePath)) fs.unlinkSync(tempStatePath);

  const state = new StateManager(tempStatePath);

  // 1. Initial state check
  assert.strictEqual(state.isTeamsMessageProcessed('msg-1'), false);
  assert.strictEqual(state.hasTeamsMessageChanged('msg-1', '2026-10-01T10:00:00Z', 'hashA'), true);

  // 2. Record processed message
  state.recordTeamsMessage('msg-1', {
    hash: 'hashA',
    updatedAt: '2026-10-01T10:00:00Z',
    eventType: 'TASK',
    notionTaskId: 'notion-page-123',
    chatId: 'chat-abc'
  });

  assert.strictEqual(state.isTeamsMessageProcessed('msg-1'), true);

  // 3. Same message (no change)
  assert.strictEqual(state.hasTeamsMessageChanged('msg-1', '2026-10-01T10:00:00Z', 'hashA'), false);

  // 4. Modified message (hash changed)
  assert.strictEqual(state.hasTeamsMessageChanged('msg-1', '2026-10-01T10:00:00Z', 'hashB'), true);

  // 5. Modified message (timestamp changed)
  assert.strictEqual(state.hasTeamsMessageChanged('msg-1', '2026-10-01T10:05:00Z', 'hashA'), true);

  // 6. Reset state
  state.resetTeamsState();
  assert.strictEqual(state.isTeamsMessageProcessed('msg-1'), false);

  if (fs.existsSync(tempStatePath)) fs.unlinkSync(tempStatePath);
});

test('StateManager.pruneOldTeamsMessages removes messages past retention days', () => {
  const state = new StateManager();

  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
  const freshDate = new Date().toISOString();

  state.data.teams.processedMessages['old-msg'] = { processedAt: oldDate };
  state.data.teams.processedMessages['new-msg'] = { processedAt: freshDate };

  state.pruneOldTeamsMessages(30); // 30 days retention

  assert.strictEqual(Boolean(state.data.teams.processedMessages['old-msg']), false);
  assert.strictEqual(Boolean(state.data.teams.processedMessages['new-msg']), true);
});
