/**
 * State & Idempotency Layer
 * Prevents duplicate alerts and coordinates Cloud (GitHub) & Local (Windows) runs,
 * plus deduplication and retention tracking for Microsoft Teams messages.
 */

const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

class StateManager {
  constructor(stateFilePath = config.SYNC.STATE_FILE) {
    this.filePath = stateFilePath;
    this.data = {
      lastSyncAt: null,
      lastSyncSource: null,
      lastGradesHash: '',
      lastAttendanceHash: '',
      lastAssignmentsHash: '',
      sentAlerts: [], // Array of unique alert keys e.g. "nb:LAN6002PA:2026-09-30"
      telegramLastUpdateId: 0,
      academic: {
        lastFetchedAt: null,
        weeklySchedule: {},
        attendanceList: [],
        assignments: []
      },
      teams: {
        lastSyncAt: null,
        processedMessages: {}, // messageId -> { hash, updatedAt, eventType, notionTaskId, processedAt }
        lastMessageByChat: {}  // chatId -> lastMessageId
      }
    };
  }

  hash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj || '')).digest('hex').slice(0, 16);
  }

  loadLocal() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
          academic: {
            ...this.data.academic,
            ...(parsed.academic || {})
          },
          teams: {
            ...this.data.teams,
            ...(parsed.teams || {})
          }
        };
      }
    } catch (e) {
      console.warn('[State] Failed to read local state.json, using defaults:', e.message);
    }
  }

  setAcademicCache(weeklySchedule, attendanceList, assignments = []) {
    this.data.academic = {
      lastFetchedAt: new Date().toISOString(),
      weeklySchedule: weeklySchedule || {},
      attendanceList: attendanceList || [],
      assignments: assignments || []
    };
  }

  getAcademicCache() {
    return this.data.academic || { weeklySchedule: {}, attendanceList: [], assignments: [], lastFetchedAt: null };
  }

  saveLocal() {
    try {
      this.pruneOldTeamsMessages();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[State] Failed to write local state.json:', e.message);
    }
  }

  isFallbackRedundant() {
    if (!this.data.lastSyncAt) return false;
    const lastSyncTime = new Date(this.data.lastSyncAt).getTime();
    const elapsedMinutes = (Date.now() - lastSyncTime) / (60 * 1000);
    return elapsedMinutes < config.SYNC.FALLBACK_WINDOW_MINUTES;
  }

  isAlertSent(alertKey) {
    return this.data.sentAlerts.includes(alertKey);
  }

  recordAlert(alertKey) {
    if (!this.data.sentAlerts.includes(alertKey)) {
      this.data.sentAlerts.push(alertKey);
      if (this.data.sentAlerts.length > 200) {
        this.data.sentAlerts = this.data.sentAlerts.slice(-200);
      }
    }
  }

  updateSyncMetadata(source = 'primary', gradesHash = '', attendanceHash = '', assignmentsHash = '') {
    this.data.lastSyncAt = new Date().toISOString();
    this.data.lastSyncSource = source;
    if (gradesHash) this.data.lastGradesHash = gradesHash;
    if (attendanceHash) this.data.lastAttendanceHash = attendanceHash;
    if (assignmentsHash) this.data.lastAssignmentsHash = assignmentsHash;
  }

  // ================= Teams State & Deduplication =================

  isTeamsMessageProcessed(messageId) {
    return Boolean(this.data.teams.processedMessages[messageId]);
  }

  hasTeamsMessageChanged(messageId, updatedAt, contentHash) {
    const existing = this.data.teams.processedMessages[messageId];
    if (!existing) return true; // new message
    if (updatedAt && existing.updatedAt && updatedAt !== existing.updatedAt) return true;
    if (contentHash && existing.hash && contentHash !== existing.hash) return true;
    return false;
  }

  getTeamsMessageMeta(messageId) {
    return this.data.teams.processedMessages[messageId] || null;
  }

  recordTeamsMessage(messageId, meta = {}) {
    this.data.teams.processedMessages[messageId] = {
      hash: meta.hash || '',
      updatedAt: meta.updatedAt || null,
      eventType: meta.eventType || 'UNKNOWN',
      notionTaskId: meta.notionTaskId || null,
      processedAt: new Date().toISOString()
    };
    if (meta.chatId) {
      this.data.teams.lastMessageByChat[meta.chatId] = messageId;
    }
  }

  pruneOldTeamsMessages(retentionDays = config.TEAMS.RETENTION_DAYS) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const msgs = this.data.teams.processedMessages || {};
    let prunedCount = 0;

    for (const [id, record] of Object.entries(msgs)) {
      const processedTime = new Date(record.processedAt || 0).getTime();
      if (processedTime < cutoff) {
        delete msgs[id];
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      console.log(`[State] Pruned ${prunedCount} old Teams message IDs older than ${retentionDays} days.`);
    }
  }

  resetTeamsState() {
    this.data.teams = {
      lastSyncAt: null,
      processedMessages: {},
      lastMessageByChat: {}
    };
    this.saveLocal();
    console.log('[State] Teams state has been reset.');
  }
}

module.exports = { StateManager };
