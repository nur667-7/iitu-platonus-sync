/**
 * Nurbek OS — Telegram Serverless Webhook Handler (Vercel / Cloud Functions)
 * Stateless, secure, 100% cloud 24/7 instant responder for Telegram updates.
 */

const { TelegramInput } = require('../src/sources/telegramInput');
const { TaskEngine } = require('../src/tasks/taskEngine');
const { TaskClassifier } = require('../src/ai/taskClassifier');
const { TaskPlanner } = require('../src/tasks/taskPlanner');
const { StateManager } = require('../src/state');

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

  // 3. Security: Validate Telegram Secret Token header if configured
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== configuredSecret) {
      console.warn('[Webhook] Unauthorized: invalid or missing secret token');
      return res.status(401).json({ error: 'Unauthorized: invalid secret token' });
    }
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

  try {
    console.log(`[Webhook] Update ${update.update_id} received from chat ID ${chatId}`);

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
    console.error('[Webhook Error]', err.message);
    // Always return HTTP 200 so Telegram does not aggressively retry failed user messages
    return res.status(200).json({ ok: false, error: err.message });
  }
};
