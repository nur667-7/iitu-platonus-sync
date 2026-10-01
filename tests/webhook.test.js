const test = require('node:test');
const assert = require('node:assert');
const webhookHandler = require('../api/webhook');

test('Vercel Webhook: GET returns health check status 200', async () => {
  let responseStatus = null;
  let responseData = null;

  const mockReq = { method: 'GET' };
  const mockRes = {
    status: (code) => {
      responseStatus = code;
      return {
        json: (data) => {
          responseData = data;
          return data;
        }
      };
    }
  };

  await webhookHandler(mockReq, mockRes);
  assert.strictEqual(responseStatus, 200);
  assert.strictEqual(responseData.status, 'ok');
  assert.strictEqual(responseData.service, 'Nurbek OS Telegram Webhook');
});

test('Vercel Webhook: rejects wrong secret token with 401 when TELEGRAM_WEBHOOK_SECRET is set', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123';

  let responseStatus = null;
  let responseData = null;

  const mockReq = {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': 'wrong-secret'
    },
    body: { update_id: 1, message: { text: 'test', chat: { id: 123 } } }
  };
  const mockRes = {
    status: (code) => {
      responseStatus = code;
      return {
        json: (data) => {
          responseData = data;
          return data;
        }
      };
    }
  };

  await webhookHandler(mockReq, mockRes);
  assert.strictEqual(responseStatus, 401);
  assert.strictEqual(responseData.error, 'Unauthorized: invalid secret token');

  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test('Vercel Webhook: method not allowed for PUT/DELETE with 405', async () => {
  let responseStatus = null;
  const mockReq = { method: 'DELETE' };
  const mockRes = {
    status: (code) => {
      responseStatus = code;
      return { json: (d) => d };
    }
  };

  await webhookHandler(mockReq, mockRes);
  assert.strictEqual(responseStatus, 405);
});
