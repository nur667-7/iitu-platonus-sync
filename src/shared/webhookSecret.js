const crypto = require('crypto');

function resolveWebhookSecret(explicitSecret, botToken) {
  const configured = String(explicitSecret || '').trim();
  if (configured) return configured;

  const token = String(botToken || '').trim();
  if (!token) return '';

  return crypto
    .createHmac('sha256', token)
    .update('nurbek-os:telegram-webhook:v1')
    .digest('hex');
}

module.exports = { resolveWebhookSecret };
