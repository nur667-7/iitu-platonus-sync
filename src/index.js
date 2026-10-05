/**
 * IITU Platonus & Microsoft Teams Orchestrator (Nurbek OS)
 * Deterministic, idempotent automation pipeline with state coordination,
 * multi-source support, and isolated execution.
 */

require('./env');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { PlatonusClient } = require('./platonus');
const { AcademicAnalyzer } = require('./analyzer');
const { NotionSync } = require('./notion');
const { Notifier } = require('./notifier');
const { StateManager } = require('./state');
const { TeamsClient } = require('./teams');
const { TeamsAnalyzer } = require('./teamsAnalyzer');
const { TaskEngine } = require('./tasks/taskEngine');
const { TaskPlanner } = require('./tasks/taskPlanner');
const { TelegramInput } = require('./sources/telegramInput');

/**
 * Synthetic Teams messages for verification and testing
 */
function getSyntheticTeamsMessages() {
  return [
    {
      source: 'teams',
      sourceMessageId: 'mock-msg-001',
      chatId: 'chat-spring-1220',
      chatName: 'Разработка Web приложений на Java Spring (1220)',
      senderId: 'tutor-menlibay',
      senderName: 'Меңлібай И.Е.',
      createdAt: '2026-10-01T10:15:00+05:00',
      updatedAt: '2026-10-01T10:15:00+05:00',
      subject: 'Лабораторная работа №3',
      text: 'Уважаемые студенты группы 1220! Лабораторная работа №3 по теме Spring Data JPA и REST контроллеры открыта. Дедлайн сдачи: 5 октября 23:59. Загружать ссылку на GitHub репозиторий в Platonus.',
      webUrl: 'https://teams.microsoft.com/l/message/chat-spring-1220/mock-msg-001',
      attachments: [{ id: 'att-1', name: 'Lab3_Spring_Guide.pdf', contentType: 'application/pdf', contentUrl: 'https://...' }],
      mentions: [],
      importance: 'high',
      sourceStatus: 'created'
    },
    {
      source: 'teams',
      sourceMessageId: 'mock-msg-002',
      chatId: 'chat-iot-1220',
      chatName: 'Программирование Internet of Things (IOT)',
      senderId: 'tutor-daurenbaeva',
      senderName: 'Дауренбаева Н.А.',
      createdAt: '2026-10-01T11:30:00+05:00',
      updatedAt: '2026-10-01T11:30:00+05:00',
      subject: 'Перенос пары',
      text: 'Внимание! Завтра 2 октября занятие по IoT переносится с 10:00 на 12:00 в онлайн формат в Teams. В аудитории 405 занятий не будет.',
      webUrl: 'https://teams.microsoft.com/l/message/chat-iot-1220/mock-msg-002',
      attachments: [],
      mentions: [],
      importance: 'urgent',
      sourceStatus: 'created'
    },
    {
      source: 'teams',
      sourceMessageId: 'mock-msg-003',
      chatId: 'chat-eng-1220',
      chatName: 'Профессионально-ориентированный иностранный язык',
      senderId: 'tutor-kaldarova',
      senderName: 'Калдарова Айсулу Конисовна',
      createdAt: '2026-10-01T12:00:00+05:00',
      updatedAt: '2026-10-01T12:00:00+05:00',
      subject: 'Рубежный контроль 1',
      text: 'Студенты, на 8 неделе (15 октября в 14:00) пройдет РК1 (экзамен/рубежный контроль). Подготовьте доклады и словарь терминов по темам 1-4.',
      webUrl: 'https://teams.microsoft.com/l/message/chat-eng-1220/mock-msg-003',
      attachments: [],
      mentions: [],
      importance: 'high',
      sourceStatus: 'created'
    },
    {
      source: 'teams',
      sourceMessageId: 'mock-msg-004',
      chatId: 'chat-general-1220',
      chatName: 'Общий чат группы 1220 IITU',
      senderId: 'student-alisher',
      senderName: 'Алишер',
      createdAt: '2026-10-01T12:05:00+05:00',
      updatedAt: '2026-10-01T12:05:00+05:00',
      subject: null,
      text: 'Ребята, кто знает, на какой паре сегодня отмечали?',
      webUrl: null,
      attachments: [],
      mentions: [],
      importance: 'normal',
      sourceStatus: 'created'
    },
    {
      source: 'teams',
      sourceMessageId: 'mock-msg-005',
      chatId: 'chat-general-1220',
      chatName: 'Общий чат группы 1220 IITU',
      senderId: 'student-erlan',
      senderName: 'Ерлан',
      createdAt: '2026-10-01T12:06:00+05:00',
      updatedAt: '2026-10-01T12:06:00+05:00',
      subject: null,
      text: 'спс',
      webUrl: null,
      attachments: [],
      mentions: [],
      importance: 'normal',
      sourceStatus: 'created'
    }
  ];
}

/**
 * Microsoft Teams Pipeline
 */
async function syncTeams({ mode = 'sync', state, notifier, notion }) {
  console.log('\n[Teams Pipeline] Starting Microsoft Teams synchronization...');

  const isTest = mode === 'teams-test';
  const isDryRun = mode === 'teams-dry-run';
  const teamsAnalyzer = new TeamsAnalyzer();

  let messages = [];

  const hasTeamsCredentials = Boolean(
    config.TEAMS.ACCESS_TOKEN ||
    (config.TEAMS.TENANT_ID && config.TEAMS.CLIENT_ID && config.TEAMS.CLIENT_SECRET)
  );

  if (isTest || (isDryRun && !hasTeamsCredentials)) {
    console.log('[Teams] Running verification with synthetic dataset (5 messages)...');
    messages = getSyntheticTeamsMessages();
  } else {
    const teamsClient = new TeamsClient();
    try {
      messages = await teamsClient.harvestAllMessages();
    } catch (err) {
      if (isDryRun || !config.TEAMS.ACCESS_TOKEN) {
        console.warn(`[Teams] Graph API fetch unavailable (${err.message}). Using synthetic dataset for dry-run verification.`);
        messages = getSyntheticTeamsMessages();
      } else {
        throw err;
      }
    }
  }

  console.log(`[Teams] Processing ${messages.length} incoming messages...`);
  const detectedEvents = [];

  for (const msg of messages) {
    const contentHash = state.hash(msg.text);
    const hasChanged = state.hasTeamsMessageChanged(msg.sourceMessageId, msg.updatedAt, contentHash);

    if (!hasChanged && !isTest && !isDryRun) {
      continue; // Skip already processed unmodified messages
    }

    const event = await teamsAnalyzer.processMessage(msg);
    if (!event) continue;

    detectedEvents.push(event);
    console.log(`• [${event.eventType}] [${event.subject}] ${event.title} (Приоритет: ${event.priority})`);

    // Immediate Telegram alert for critical schedule changes or urgent deadlines
    if (event.requiresTelegramAlert && !isDryRun && notifier) {
      const alertKey = `teams:${event.sourceId}:${event.eventType}`;
      if (!state.isAlertSent(alertKey)) {
        console.log(`[Notifier] Sending instant alert for Teams event: ${event.title}`);
        const alertMsg = notifier.buildTeamsUrgentAlert(event);
        await notifier.sendTelegram(alertMsg);
        state.recordAlert(alertKey);
      }
    }
  }

  console.log(`[Teams] Detected ${detectedEvents.length} actionable academic events.`);

  if (isDryRun || isTest) {
    console.log('[Teams] DRY-RUN / TEST complete. Parsed events:');
    console.log(JSON.stringify(detectedEvents.map(e => ({
      eventType: e.eventType,
      subject: e.subject,
      title: e.title,
      deadline: e.deadline,
      priority: e.priority,
      confidence: e.confidence,
      requiresCalendar: e.requiresCalendarEvent,
      requiresAlert: e.requiresTelegramAlert
    })), null, 2));
    return detectedEvents;
  }

  // Sync to Notion Tasks & Calendar
  if (notion && detectedEvents.length > 0) {
    await notion.syncTeamsEvents(detectedEvents, state);
  }

  // Record processed state
  for (const msg of messages) {
    const ev = detectedEvents.find(e => e.sourceId === msg.sourceMessageId);
    state.recordTeamsMessage(msg.sourceMessageId, {
      hash: state.hash(msg.text),
      updatedAt: msg.updatedAt,
      eventType: ev ? ev.eventType : 'IGNORE',
      chatId: msg.chatId
    });
  }

  state.data.teams.lastSyncAt = new Date().toISOString();
  return detectedEvents;
}

/**
 * Platonus Pipeline
 */
async function syncPlatonus({ mode = 'sync', source = 'primary', state, notifier, notion, teamsEvents = [] }) {
  const login = process.env.PLATONUS_LOGIN;
  const password = process.env.PLATONUS_PASSWORD;

  if (!login || !password) {
    console.error('[Platonus Orchestrator] Error: PLATONUS_LOGIN and PLATONUS_PASSWORD required.');
    return null;
  }

  const client = new PlatonusClient(login, password);
  console.log('[Platonus Orchestrator] Authenticating with Platonus API...');
  await client.authenticate();
  console.log('[Platonus Orchestrator] Authenticated successfully.');

  // Special mode: UMKD inspection (standalone on-demand)
  if (mode === 'umkd') {
    console.log('[UMKD] Fetching educational materials for semester...');
    const umkdData = await client.getUmkd(config.ACADEMIC.SEMESTER_YEAR, config.ACADEMIC.SEMESTER_TERM);
    console.log(`[UMKD] Found ${umkdData?.result?.length || 0} files.`);
    for (const item of (umkdData?.result || [])) {
      console.log(`• [${item.subjectName}] Файл: ${item.fileID} | Преп: ${item.tutorName}`);
    }
    return null;
  }

  // Fetch academic data concurrently
  console.log('[Platonus Orchestrator] Fetching profile, journal, schedule and assignments...');
  const [profile, journal, scheduleData, assignmentsData] = await Promise.all([
    client.getProfile().catch(e => { console.warn('[Platonus] Profile fetch warning:', e.message); return null; }),
    client.getJournal(config.ACADEMIC.SEMESTER_YEAR, config.ACADEMIC.SEMESTER_TERM).catch(e => { console.warn('[Platonus] Journal fetch warning:', e.message); return []; }),
    client.getSchedule().catch(e => { console.warn('[Platonus] Schedule fetch warning:', e.message); return null; }),
    client.getAssignments().catch(e => { console.warn('[Platonus] Assignments fetch warning:', e.message); return { studentTasks: [] }; })
  ]);

  // Fetch subject details (marks and absences)
  const subjectDetailsMap = {};
  for (const s of (journal || [])) {
    const sId = s.subjectID || s.SubjectID;
    const qId = s.queryID || s.QueryID;
    try {
      subjectDetailsMap[sId] = await client.getSubjectDetails(config.ACADEMIC.SEMESTER_YEAR, config.ACADEMIC.SEMESTER_TERM, sId, qId);
    } catch (e) {
      console.warn(`[Platonus] Subject ${s.subjectName} details warning:`, e.message);
    }
  }

  // Deterministic Analyzer Execution
  const analyzer = new AcademicAnalyzer(scheduleData, journal, subjectDetailsMap, state.data);
  const { attendanceList, events: initialEvents, weeklySchedule } = analyzer.analyze();
  const assignments = assignmentsData?.studentTasks || [];

  // Update Academic Cache in State (for instant < 100ms Telegram bot replies)
  state.setAcademicCache(weeklySchedule, attendanceList, assignments);

  // Compute state hashes
  const allGrades = attendanceList.map(s => ({ id: s.subjectId, grades: s.gradesList }));
  const allAbsences = attendanceList.map(s => ({ id: s.subjectId, missed: s.missedSessions }));
  const currentGradesHash = state.hash(allGrades);
  const currentAttendanceHash = state.hash(allAbsences);
  const currentAssignmentsHash = state.hash(assignments);

  // Detect state transitions
  const events = [...initialEvents];

  if (state.data.lastGradesHash && state.data.lastGradesHash !== currentGradesHash) {
    events.push({ type: 'NEW_GRADE', details: 'Обнаружены новые оценки в журнале' });
  }

  if (state.data.lastAttendanceHash && state.data.lastAttendanceHash !== currentAttendanceHash) {
    events.push({ type: 'NEW_ABSENCE', details: 'Обнаружены изменения в посещаемости' });
  }

  if (state.data.lastAssignmentsHash && state.data.lastAssignmentsHash !== currentAssignmentsHash) {
    events.push({ type: 'NEW_ASSIGNMENT', details: 'Обнаружены новые задания в Platonus' });
  }

  if (config.LOGGING.SENSITIVE_DIAGNOSTICS) {
    console.log('\n================ АКАДЕМИЧЕСКИЙ СТАТУС IITU ================');
    for (const s of attendanceList) {
      console.log(`${s.statusLabel} | ${s.subjectName}`);
      console.log(`  Пропусков: ${s.missedSessions}/${s.heldSessions} (${s.currentAbsencePct}%) | Допустимо до 20%: ${s.remainingAllowed} пар | Ср. балл: ${s.avgGrade || '—'}`);
    }
    console.log('===========================================================\n');
  } else {
    const dangerCount = attendanceList.filter(s => s.riskLevel === 'DANGER').length;
    const warningCount = attendanceList.filter(s => s.riskLevel === 'WARNING').length;
    console.log(`[Academic] Processed ${attendanceList.length} subjects (${dangerCount} danger, ${warningCount} warning).`);
  }

  // Notion Synchronization (Dashboard + Real Assignments)
  if (notion) {
    await notion.updateUniversityDashboard(profile, attendanceList, weeklySchedule, assignments, teamsEvents);
    await notion.syncAssignments(assignments);
  }

  // Telegram Notifications (Zero spam policy)
  if (notifier) {
    if (mode === 'morning') {
      const todayTasks = notion ? await notion.taskEngine.getTodayTasks() : [];
      const planner = new TaskPlanner();
      const focus = planner.recommendFocus(todayTasks, analyzer.getLessonsForDate(new Date()));
      const briefing = notifier.buildMorningBriefing(analyzer, attendanceList, assignments, teamsEvents, focus, todayTasks);
      console.log('\n[Briefing] Sending morning daily briefing with task focus...');
      await notifier.sendTelegram(briefing);
    } else if (mode === 'evening') {
      const changesReport = notifier.buildEveningChanges(events, attendanceList, teamsEvents);
      if (changesReport) {
        console.log('\n[Changes] Sending evening changes report...');
        await notifier.sendTelegram(changesReport);
      } else {
        console.log('[Notifier] Zero changes detected today. Evening message skipped (no spam).');
      }
    } else {
      // Sync mode: handle critical immediate alerts only
      const dangerEvents = events.filter(e => e.type === 'RETAKE_DANGER');
      for (const d of dangerEvents) {
        const alertKey = `danger:${d.subject}:${d.missed}`;
        if (!state.isAlertSent(alertKey)) {
          await notifier.sendTelegram(`🚨 *КРИТИЧЕСКИЙ АЛЕРТ*: Превышен порог 20% по предмету *${d.subject}*! Пропусков: ${d.missed}/${d.held}.`);
          state.recordAlert(alertKey);
        }
      }
    }
  }

  // Update State Metadata
  state.updateSyncMetadata(source, currentGradesHash, currentAttendanceHash, currentAssignmentsHash);
  return { attendanceList, assignments, events };
}

/**
 * Main Application Orchestrator
 */
async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode=')) || '--mode=sync';
  const sourceArg = args.find(a => a.startsWith('--source=')) || '--source=primary';

  const mode = modeArg.split('=')[1];
  const source = sourceArg.split('=')[1];

  console.log(`[Nurbek OS Orchestrator] Mode: ${mode} | Source: ${source}`);

  // 1. Idempotency & State Initialization
  const state = new StateManager();
  state.loadLocal();

  if (mode === 'teams-reset-state') {
    state.resetTeamsState();
    state.saveLocal();
    console.log('[State] Microsoft Teams processed state reset successfully.');
    return;
  }

  if (source === 'fallback' && state.isFallbackRedundant()) {
    console.log(`[State] Redundant fallback run. Primary sync occurred recently (${state.data.lastSyncAt}). Exiting cleanly.`);
    process.exit(0);
  }

  const notionToken = process.env.NOTION_TOKEN;
  const notion = notionToken ? new NotionSync({ token: notionToken }) : null;
  const taskEngine = notion ? notion.taskEngine : new TaskEngine();
  const planner = new TaskPlanner();
  const notifier = new Notifier();
  const telegramInput = new TelegramInput({
    taskEngine,
    planner,
    state,
    onSyncRequest: async () => {
      await syncPlatonus({ mode: 'sync', source: 'telegram-cmd', state, notifier, notion });
      state.saveLocal();
    }
  });

  // Interactive Telegram Bot modes
  if (mode === 'telegram-bot') {
    const telegramMode = process.env.TELEGRAM_MODE || 'polling';
    if (telegramMode === 'webhook') {
      console.log('[Telegram Bot] TELEGRAM_MODE is set to "webhook". Long polling daemon is disabled to prevent conflicts with Webhook.');
      return;
    }

    // Safety check: verify that no active Telegram Webhook exists before polling
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const info = await res.json();
        if (info.ok && info.result?.url) {
          console.warn(`[Telegram Bot] Active Webhook detected (${info.result.url}). Long polling paused to avoid Telegram Bot API 409 Conflict. Run "npm run webhook:delete" to return to polling.`);
          return;
        }
      }
    } catch (e) {
      console.warn('[Telegram Bot] Webhook conflict check warning:', e.message);
    }

    console.log('[Telegram Bot] Starting interactive long-polling listener (Ctrl+C to stop)...');
    console.log(`[Telegram Bot] Academic cache last updated: ${state.data.academic?.lastFetchedAt || 'never'}`);

    // If cache is empty, perform initial Platonus sync to populate cache immediately
    if (!state.data.academic?.lastFetchedAt) {
      console.log('[Telegram Bot] Academic cache is empty. Initiating initial Platonus fetch...');
      try {
        await syncPlatonus({ mode: 'sync', source: 'bot-init', state, notifier, notion });
        state.saveLocal();
        console.log('[Telegram Bot] Initial Platonus cache populated successfully.');
      } catch (err) {
        console.warn('[Telegram Bot] Initial Platonus fetch warning:', err.message);
      }
    }

    while (true) {
      try {
        await telegramInput.processPendingUpdates();
      } catch (err) {
        console.warn('[Telegram Bot] Update processing warning:', err.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (mode === 'telegram-process') {
    console.log('[Telegram Bot] Processing pending incoming Telegram messages...');
    const results = await telegramInput.processPendingUpdates();
    console.log(`[Telegram Bot] Processed ${results.length} incoming messages.`);
    return;
  }

  if (mode === 'focus') {
    const activeTasks = await taskEngine.getActiveTasks();
    const focus = planner.recommendFocus(activeTasks, []);
    console.log('\n' + focus.message + '\n');
    return;
  }

  // Check for any pending Telegram tasks before sync
  try {
    await telegramInput.processPendingUpdates();
  } catch (err) {
    // Non-blocking
  }

  // 2. Microsoft Teams execution (isolated)
  let teamsEvents = [];
  const shouldRunTeams = config.TEAMS.ENABLED || mode.startsWith('teams');

  if (shouldRunTeams) {
    try {
      teamsEvents = await syncTeams({ mode, state, notifier, notion });
    } catch (err) {
      console.error('[Teams Orchestrator] Teams execution failed:', err.message);
      if (mode.startsWith('teams') && mode !== 'teams') {
        throw err;
      }
    }
  }

  if (mode.startsWith('teams')) {
    state.saveLocal();
    console.log('[Nurbek OS Orchestrator] Teams task finished.');
    return;
  }

  // 3. Platonus execution (isolated)
  try {
    await syncPlatonus({ mode, source, state, notifier, notion, teamsEvents });
  } catch (err) {
    console.error('[Platonus Orchestrator] Platonus execution failed:', err.message);
    throw err;
  }

  // 4. Save coordinated state
  state.saveLocal();
  console.log('[Nurbek OS Orchestrator] Pipeline completed successfully. State saved.');
}

main().catch(err => {
  console.error('[Nurbek OS Orchestrator] Fatal error:', err);
  process.exit(1);
});
