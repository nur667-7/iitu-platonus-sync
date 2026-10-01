/**
 * Microsoft Teams Provider via Microsoft Graph API
 * Handles authentication, fetching chats, listing messages, pagination,
 * HTML text stripping, and normalized message transformation.
 */

const config = require('./config');

class TeamsClient {
  constructor(options = {}) {
    this.token = options.token || config.TEAMS.ACCESS_TOKEN;
    this.tenantId = options.tenantId || config.TEAMS.TENANT_ID;
    this.clientId = options.clientId || config.TEAMS.CLIENT_ID;
    this.clientSecret = options.clientSecret || config.TEAMS.CLIENT_SECRET;
    this.apiBase = options.apiBase || config.TEAMS.GRAPH_API_BASE;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  /**
   * Resolve Bearer access token
   */
  async authenticate() {
    if (this.token) {
      return this.token;
    }

    // If client credentials are provided, request application/delegated token via Azure AD OAuth2
    if (this.tenantId && this.clientId && this.clientSecret) {
      console.log('[Teams] Authenticating via Microsoft Entra ID (Client Credentials)...');
      const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
      const bodyParams = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
      });

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Azure AD auth failed (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      this.token = data.access_token;
      console.log('[Teams] Successfully obtained Graph API token from Azure AD.');
      return this.token;
    }

    throw new Error('No Teams credentials provided. Set TEAMS_ACCESS_TOKEN or TEAMS_CLIENT_ID + TEAMS_CLIENT_SECRET + TEAMS_TENANT_ID.');
  }

  /**
   * Resilient HTTP fetch with rate-limit backoff and timeout
   */
  async _fetchGraph(url, options = {}, retries = 3) {
    const token = await this.authenticate();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        const res = await fetch(url, {
          ...options,
          headers,
          signal: AbortSignal.timeout(this.timeoutMs)
        });

        if (res.status === 429) {
          // Rate-limited: read Retry-After header or exponential backoff
          const retryAfterSec = parseInt(res.headers.get('Retry-After') || '2', 10);
          console.warn(`[Teams] Rate-limited (429). Retrying after ${retryAfterSec}s (Attempt ${attempt}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, retryAfterSec * 1000));
          continue;
        }

        if (res.status >= 500 && attempt < retries) {
          console.warn(`[Teams] Graph API server error (${res.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Graph API error ${res.status} on ${url}: ${errText.slice(0, 300)}`);
        }

        return await res.json();
      } catch (err) {
        if (attempt >= retries) throw err;
        console.warn(`[Teams] Fetch attempt ${attempt} failed: ${err.message}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * List all accessible Teams chats
   */
  async listChats() {
    console.log('[Teams] Fetching user chats from Microsoft Graph...');
    const url = `${this.apiBase}/me/chats?$top=50&$expand=lastMessagePreview`;
    try {
      const data = await this._fetchGraph(url);
      const chats = (data?.value || []).map(c => ({
        id: c.id,
        topic: c.topic || 'Без темы',
        chatType: c.chatType,
        createdDateTime: c.createdDateTime,
        lastUpdatedDateTime: c.lastUpdatedDateTime,
        webUrl: c.webUrl
      }));
      console.log(`[Teams] Found ${chats.length} active chats.`);
      return chats;
    } catch (e) {
      console.warn(`[Teams] listChats warning: ${e.message}`);
      return [];
    }
  }

  /**
   * Get messages from a specific chat with lookback window
   */
  async getChatMessages(chatId, options = {}) {
    const lookbackMinutes = options.lookbackMinutes || config.TEAMS.LOOKBACK_MINUTES;
    const maxMessages = options.maxMessages || config.TEAMS.MAX_MESSAGES_PER_RUN;
    const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

    const url = `${this.apiBase}/chats/${chatId}/messages?$top=50&$orderby=createdDateTime desc`;
    const messages = [];

    try {
      let nextUrl = url;
      while (nextUrl && messages.length < maxMessages) {
        const data = await this._fetchGraph(nextUrl);
        const batch = data?.value || [];
        if (batch.length === 0) break;

        for (const msg of batch) {
          // Check if message is older than lookback window
          if (msg.createdDateTime && msg.createdDateTime < cutoffTime) {
            nextUrl = null; // stop paginating further into past
            break;
          }
          messages.push(msg);
          if (messages.length >= maxMessages) break;
        }

        nextUrl = data['@odata.nextLink'] || null;
      }
    } catch (e) {
      console.warn(`[Teams] Failed to fetch messages for chat ${chatId}: ${e.message}`);
    }

    return messages;
  }

  /**
   * Strip HTML tags and decode HTML entities from message body
   */
  cleanHtmlText(html) {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();
  }

  /**
   * Convert raw Graph API message into unified normalized structure
   */
  normalizeMessage(rawMsg, chatInfo = {}) {
    const rawText = rawMsg.body?.content || '';
    const text = this.cleanHtmlText(rawText);

    let sourceStatus = 'created';
    if (rawMsg.deletedDateTime) {
      sourceStatus = 'deleted';
    } else if (rawMsg.lastModifiedDateTime && rawMsg.lastModifiedDateTime !== rawMsg.createdDateTime) {
      sourceStatus = 'updated';
    }

    return {
      source: 'teams',
      sourceMessageId: String(rawMsg.id || ''),
      chatId: String(chatInfo.id || rawMsg.chatId || ''),
      chatName: chatInfo.topic || 'Общий чат',
      senderId: rawMsg.from?.user?.id || rawMsg.from?.application?.id || 'unknown',
      senderName: rawMsg.from?.user?.displayName || 'Участник Teams',
      createdAt: rawMsg.createdDateTime || new Date().toISOString(),
      updatedAt: rawMsg.lastModifiedDateTime || rawMsg.createdDateTime || new Date().toISOString(),
      subject: rawMsg.subject || null,
      text: text,
      webUrl: rawMsg.webUrl || null,
      attachments: (rawMsg.attachments || []).map(a => ({
        id: a.id,
        name: a.name,
        contentType: a.contentType,
        contentUrl: a.contentUrl
      })),
      mentions: (rawMsg.mentions || []).map(m => ({
        id: m.id,
        mentionText: m.mentionText,
        mentioned: m.mentioned?.user?.displayName
      })),
      importance: rawMsg.importance || 'normal',
      sourceStatus: sourceStatus
    };
  }

  /**
   * Fetch and normalize all recent messages across all chats
   */
  async harvestAllMessages(options = {}) {
    const chats = await this.listChats();
    const allNormalized = [];
    const ignoredChats = (config.TEAMS.IGNORED_CHATS || []).map(c => c.toLowerCase());

    for (const chat of chats) {
      const topicLower = (chat.topic || '').toLowerCase();
      const isIgnored = ignoredChats.some(ig => topicLower.includes(ig));
      if (isIgnored) {
        console.log(`[Teams] Skipping ignored chat: "${chat.topic}"`);
        continue;
      }

      const rawMessages = await this.getChatMessages(chat.id, options);
      for (const m of rawMessages) {
        allNormalized.push(this.normalizeMessage(m, chat));
      }
    }

    console.log(`[Teams] Harvested ${allNormalized.length} messages across ${chats.length} chats.`);
    return allNormalized;
  }
}

module.exports = { TeamsClient };
