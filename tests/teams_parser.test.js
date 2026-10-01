const test = require('node:test');
const assert = require('node:assert');
const { TeamsClient } = require('../src/teams');

test('TeamsClient.cleanHtmlText removes HTML tags and decodes entities', () => {
  const client = new TeamsClient();

  const rawHtml = '<p>Привет,&nbsp;студенты!<br/>Сдайте <b>лабу №2</b> &amp; отчет &lt;до 5 октября&gt;.</p><style>body{color:red;}</style>';
  const cleaned = client.cleanHtmlText(rawHtml);

  assert.ok(!cleaned.includes('<p>'));
  assert.ok(!cleaned.includes('</p>'));
  assert.ok(!cleaned.includes('<style>'));
  assert.ok(!cleaned.includes('&nbsp;'));
  assert.ok(cleaned.includes('Привет, студенты!'));
  assert.ok(cleaned.includes('Сдайте лабу №2 & отчет <до 5 октября>.'));
});

test('TeamsClient.normalizeMessage converts raw Graph API message to standard schema', () => {
  const client = new TeamsClient();

  const rawMsg = {
    id: 'msg-999',
    chatId: 'chat-123',
    createdDateTime: '2026-10-01T12:00:00Z',
    lastModifiedDateTime: '2026-10-01T12:05:00Z',
    importance: 'urgent',
    from: {
      user: { id: 'usr-1', displayName: 'Меңлібай И.Е.' }
    },
    body: {
      contentType: 'html',
      content: '<p>Дедлайн по Spring Boot перенесен</p>'
    },
    attachments: [
      { id: 'att-1', name: 'guide.pdf', contentType: 'application/pdf', contentUrl: 'https://sharepoint.com/guide.pdf' }
    ],
    mentions: [
      { id: 'men-1', mentionText: '1220', mentioned: { user: { displayName: 'Группа 1220' } } }
    ],
    webUrl: 'https://teams.microsoft.com/l/message/123/999'
  };

  const chatInfo = { id: 'chat-123', topic: 'Разработка Web приложений на Java Spring' };
  const normalized = client.normalizeMessage(rawMsg, chatInfo);

  assert.strictEqual(normalized.source, 'teams');
  assert.strictEqual(normalized.sourceMessageId, 'msg-999');
  assert.strictEqual(normalized.chatId, 'chat-123');
  assert.strictEqual(normalized.chatName, 'Разработка Web приложений на Java Spring');
  assert.strictEqual(normalized.senderName, 'Меңлібай И.Е.');
  assert.strictEqual(normalized.text, 'Дедлайн по Spring Boot перенесен');
  assert.strictEqual(normalized.importance, 'urgent');
  assert.strictEqual(normalized.sourceStatus, 'updated');
  assert.strictEqual(normalized.attachments.length, 1);
  assert.strictEqual(normalized.attachments[0].name, 'guide.pdf');
});
