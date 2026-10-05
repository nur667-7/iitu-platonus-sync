# Nurbek OS project guidance

- Preserve the existing Node.js 20 CommonJS architecture and Vercel webhook contract.
- Treat Telegram, Platonus, Teams, Notion and Groq inputs as untrusted.
- Public webhook authentication and the configured Telegram chat allowlist must fail closed.
- Never log secrets, raw Telegram text, chat IDs, Platonus person IDs, grades or attendance details in cloud mode.
- Interpret calendar dates with `src/shared/clock.js` and `Asia/Almaty`; do not derive local dates from `toISOString()`.
- New LifeOS modules enter through a durable Inbox action contract. Domain services must not parse Telegram payloads directly.
- Keep external calls mockable. Tests must not load live credentials or call real services.
- Run `npm run test:ci` after changes. Add focused regression tests for webhook security, idempotency and time boundaries.
