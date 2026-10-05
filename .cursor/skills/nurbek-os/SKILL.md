---
name: nurbek-os
description: Extends and maintains Nurbek OS integrations for Telegram, Notion, Platonus, Teams, Groq, Vercel and GitHub Actions. Use when changing this repository's inbox, task engine, academic sync, notifications or future LifeOS modules.
---

# Nurbek OS workflow

1. Read `AGENTS.md`, `README.md`, `src/config.js` and the affected entry point.
2. Preserve existing Telegram commands and the Platonus/Teams task pipeline.
3. Put new free-form inputs behind the shared Inbox contract: normalize, parse into typed actions, validate, execute idempotently, return a receipt, support compensation.
4. Keep domain logic separate from Telegram and Notion adapters.
5. Use `src/shared/clock.js` for all local date keys in `Asia/Almaty`.
6. Fail closed at public boundaries. Never print secret values or personal/academic message content.
7. Mock `fetch` and environment configuration in tests; do not call live services.
8. Run focused tests, then `npm run test:ci`, and inspect `git diff` before handoff.

## Release order

Build in this order: secure foundations, durable Inbox, multi-action tasks plus KZT finance, MIT, voice input, habits/iman, gym, study/FSRS, Mini App, then PC control and shorts automation.
