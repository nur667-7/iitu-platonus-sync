/**
 * Telegram Webhook CLI Manager
 * Commands:
 *   node src/scripts/manageWebhook.js info
 *   node src/scripts/manageWebhook.js set https://your-project.vercel.app/api/webhook
 *   node src/scripts/manageWebhook.js delete
 */

const fs = require('fs');
const path = require('path');
const { resolveWebhookSecret } = require('../shared/webhookSecret');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing in environment.');
  process.exit(1);
}

const action = process.argv[2] || 'info';
const webhookUrl = process.argv[3];

async function main() {
  if (action === 'info') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    console.log('[Webhook Info]:\n', JSON.stringify(data.result, null, 2));
    return;
  }

  if (action === 'set') {
    if (!webhookUrl) {
      console.error('Usage: node src/scripts/manageWebhook.js set <HTTPS_URL>');
      process.exit(1);
    }
    const secret = resolveWebhookSecret(
      process.env.TELEGRAM_WEBHOOK_SECRET,
      process.env.TELEGRAM_BOT_TOKEN
    );
    let endpoint = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=false`;
    if (secret) {
      endpoint += `&secret_token=${encodeURIComponent(secret)}`;
    }
    const res = await fetch(endpoint);
    const data = await res.json();
    console.log('[Set Webhook Result]:', data);
    return;
  }

  if (action === 'delete') {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const data = await res.json();
    console.log('[Delete Webhook Result]:', data);
    return;
  }

  console.log('Unknown action. Use "info", "set <URL>", or "delete".');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
