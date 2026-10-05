/**
 * Centralized Configuration for IITU Platonus & Microsoft Teams Automation (Nurbek OS)
 */

require('./env');
const path = require('path');

module.exports = {
  // Academic thresholds (IITU Academic Policy)
  ACADEMIC: {
    RETAKE_THRESHOLD: 0.20,      // 20% absence rate = retake
    WARNING_THRESHOLD: 0.10,     // 10% absence rate = early warning
    MIN_REMAINING_WARNING: 2,    // <= 2 remaining absences = warning
    SEMESTER_YEAR: 2026,
    SEMESTER_TERM: 1,
    START_DATE: '2026-09-01',
    FINISH_DATE: '2026-12-12'
  },

  // Scheduling & Resilience
  SYNC: {
    TIMEZONE: 'Asia/Almaty',
    FALLBACK_WINDOW_MINUTES: 35, // If primary synced < 35 min ago, fallback skips
    STATE_FILE: path.resolve(__dirname, '../state.json')
  },

  LOGGING: {
    SENSITIVE_DIAGNOSTICS: process.env.DEBUG_SENSITIVE_LOGS === 'true'
  },

  // Microsoft Teams Integration
  TEAMS: {
    ENABLED: process.env.TEAMS_ENABLED === 'true',
    SYNC_MODE: process.env.TEAMS_SYNC_MODE || 'polling',
    LOOKBACK_MINUTES: parseInt(process.env.TEAMS_LOOKBACK_MINUTES || '180', 10),
    MAX_MESSAGES_PER_RUN: parseInt(process.env.TEAMS_MAX_MESSAGES_PER_RUN || '200', 10),
    AI_ENABLED: process.env.TEAMS_AI_ENABLED !== 'false',
    RETENTION_DAYS: parseInt(process.env.TEAMS_RETENTION_DAYS || '30', 10),

    // Auth credentials
    TENANT_ID: process.env.TEAMS_TENANT_ID || '',
    CLIENT_ID: process.env.TEAMS_CLIENT_ID || '',
    CLIENT_SECRET: process.env.TEAMS_CLIENT_SECRET || '',
    ACCESS_TOKEN: process.env.TEAMS_ACCESS_TOKEN || process.env.MS_GRAPH_TOKEN || '',

    // Graph API endpoints
    GRAPH_API_BASE: 'https://graph.microsoft.com/v1.0',

    // Ignored chats (old courses, non-academic groups)
    IGNORED_CHATS: [
      'Professional English 2nd year INTER'
    ],

    // Subject aliases dictionary for accurate mapping
    SUBJECTS: [
      {
        name: 'Разработка Web приложений на Java Spring',
        tutors: ['Меңлібай И.Е.', 'Меңлібай Ислам Ерденұлы'],
        aliases: ['spring', 'java spring', 'веб', 'web java', 'spring boot', 'web-приложений']
      },
      {
        name: 'Программирование Internet of Things (IOT)',
        tutors: ['Дауренбаева Н.А.', 'Нұрланұлы А.'],
        aliases: ['iot', 'интернет вещей', 'arduino', 'ардуино', 'датчик', 'esp32', 'сенсор']
      },
      {
        name: 'Профессионально-ориентированный иностранный язык',
        tutors: ['Кабдргалинова С.Б.', 'Калдарова А.К.', 'Калдарова Айсулу Конисовна'],
        aliases: ['english', 'английский', 'иностранный', 'инглиш', 'ielts', 'foreign language']
      },
      {
        name: 'Делопроизводство на государственном языке',
        tutors: ['Заурбекова Г.О.', 'Аязбекова К.А.', 'Аязбекова Карлыгаш Абилкасымовна'],
        aliases: ['делопроизводство', 'гос язык', 'қазақ тілі', 'құжат', 'іс жүргізу']
      },
      {
        name: 'Управление IT-продуктами',
        tutors: ['Гайдабрус Б.'],
        aliases: ['product', 'it product', 'продакт', 'управление продуктом', 'scrum', 'agile', 'product management']
      },
      {
        name: 'Методология исследования',
        tutors: ['Мухаммад Я.', 'Абдуллаева Г.О.'],
        aliases: ['методология', 'исследование', 'research', 'научная', 'методология исследования']
      }
    ]
  },

  // AI & LLM Provider Settings (used exclusively for semantic classification)
  AI: {
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    MODEL: process.env.AI_MODEL || 'openai/gpt-oss-120b',
    TIMEOUT_MS: 10000
  },

  // Notion Database & Page IDs (from Nurbek OS)
  NOTION: {
    UNIVERSITY_PAGE_ID: process.env.NOTION_UNIVERSITY_PAGE_ID || '3ebd4221-a166-81ac-b96e-fba23c9b928c',
    TASKS_DB_ID: process.env.NOTION_TASKS_DB_ID || '3ebd4221-a166-813d-8c12-e4bed5dbda72',
    INBOX_DB_ID: process.env.NOTION_INBOX_DB_ID || '3ebd4221-a166-811f-bb50-d3d7110a377f',
    KNOWLEDGE_DB_ID: process.env.NOTION_KNOWLEDGE_DB_ID || '3ebd4221-a166-81e0-97b3-f9a5c9e82a20'
  }
};
