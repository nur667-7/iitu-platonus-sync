const test = require('node:test');
const assert = require('node:assert');
const { resolveWebhookSecret } = require('../src/shared/webhookSecret');

test('resolveWebhookSecret prefers an explicitly configured secret', () => {
  assert.strictEqual(resolveWebhookSecret('explicit-secret', 'bot-token'), 'explicit-secret');
});

test('resolveWebhookSecret derives a stable Telegram-compatible secret from bot token', () => {
  const first = resolveWebhookSecret('', '123:bot-token');
  const second = resolveWebhookSecret(undefined, '123:bot-token');
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.strictEqual(first, second);
});

test('resolveWebhookSecret fails closed without either secret source', () => {
  assert.strictEqual(resolveWebhookSecret('', ''), '');
});
