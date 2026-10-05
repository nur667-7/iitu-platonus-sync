/**
 * Nurbek OS — Telegram Serverless Webhook Handler (Vercel / Cloud Functions)
 * Stateless, secure, 100% cloud 24/7 instant responder for Telegram updates.
 */

const { TelegramInput } = require('../src/sources/telegramInput');
const { TaskEngine } = require('../src/tasks/taskEngine');
const { TaskClassifier } = require('../src/ai/taskClassifier');
const { TaskPlanner } = require('../src/tasks/taskPlanner');
const { StateManager } = require('../src/state');
const { resolveWebhookSecret } = require('../src/shared/webhookSecret');

module.exports = async function handler(req, res) {
  // 1. Health check & verification (GET)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Nurbek OS Telegram Webhook',
      mode: 'stateless-serverless',
      timestamp: new Date().toISOString()
    });
  }

  // 2. Only allow POST requests from Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3. Security: production webhook configuration is mandatory and fail-closed.
  const configuredSecret = resolveWebhookSecret(
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.TELEGRAM_BOT_TOKEN
  );
  const allowedChatId = String(process.env.TELEGRAM_CHAT_ID || '');
  if (!configuredSecret || !allowedChatId) {
    console.error('[Webhook] Required security configuration is missing');
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (incomingSecret !== configuredSecret) {
    console.warn('[Webhook] Unauthorized request rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true, note: 'No message in update' });
  }

  const msg = update.message;
  const chatId = msg.chat?.id;
  const text = msg.text;

  if (!chatId || !text) {
    return res.status(200).json({ ok: true });
  }

  if (String(chatId) !== allowedChatId) {
    console.warn('[Webhook] Request from unauthorized chat rejected');
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    console.log(`[Webhook] Update ${update.update_id} received`);

    // Stateless state manager: loads bundled or environment cache without requiring disk writes
    const state = new StateManager();
    state.loadLocal();

    const taskEngine = new TaskEngine();
    const classifier = new TaskClassifier();
    const planner = new TaskPlanner();

    const telegramInput = new TelegramInput({
      taskEngine,
      classifier,
      planner,
      state,
      chatId: allowedChatId,
      onSyncRequest: async () => {
        // Fast reply in serverless context without heavy blocking
        return 'Облачная синхронизация Platonus запускается автоматически по расписанию GitHub Actions (08:30 и 18:30).';
      }
    });

    // Process message and send reply directly via Telegram Bot API
    const result = await telegramInput.handleIncomingMessage(text, chatId);

    console.log(`[Webhook] Update ${update.update_id} processed successfully. Intent: ${result?.classification?.intent || 'HANDLED'}`);

    return res.status(200).json({
      ok: true,
      processed: true,
      intent: result?.classification?.intent || 'HANDLED'
    });
  } catch (err) {
    const correlationId = `tg-${update.update_id || 'unknown'}-${Date.now()}`;
    console.error(`[Webhook Error] ${correlationId}: processing failed`);
    // A retryable status lets Telegram redeliver transient failures. Durable
    // update_id idempotency is the next Inbox milestone.
    return res.status(500).json({ ok: false, error: 'Processing failed', correlationId });
  }
};
