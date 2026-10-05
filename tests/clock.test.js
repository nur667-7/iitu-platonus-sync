const test = require('node:test');
const assert = require('node:assert');
const { dateKeyInTimeZone } = require('../src/shared/clock');

test('dateKeyInTimeZone uses the Almaty calendar day around UTC midnight', () => {
  const instant = new Date('2026-10-04T20:30:00.000Z');
  assert.strictEqual(dateKeyInTimeZone(instant), '2026-10-05');
});
