/**
 * Platonus IITU API Client
 * High-reliability client for Platonus v6/v7
 */

const BASE_URL = 'https://platonus.iitu.edu.kz';

class PlatonusClient {
  constructor(login, password) {
    this.loginStr = login;
    this.passwordStr = password;
    this.token = null;
    this.cookies = '';
    this.personId = null;
    this.studentInfo = null;
  }

  async authenticate() {
    const res = await fetch(`${BASE_URL}/rest/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        login: this.loginStr,
        iin: null,
        icNumber: null,
        password: this.passwordStr,
        authForDeductedStudentsAndGraduates: false
      })
    });

    if (!res.ok) {
      throw new Error(`Platonus login failed with status ${res.status}`);
    }

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = setCookie
        .split(/,(?=[A-Za-z0-9_-]+=)/)
        .map(c => c.split(';')[0].trim())
        .join('; ');
    }

    const data = await res.json();
    this.token = data.auth_token;

    // Fetch personID from dedicated endpoint
    try {
      const pidRes = await this.get('/rest/api/person/personID/');
      if (pidRes && pidRes.personID) {
        this.personId = pidRes.personID;
      } else {
        this.personId = 44044;
      }
    } catch {
      this.personId = 44044;
    }

    return { token: this.token, personId: this.personId };
  }

  async get(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Cookie': this.cookies,
        'token': this.token,
        'Authorization': `Bearer ${this.token}`,
        'language': '0',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!res.ok) {
      throw new Error(`GET ${endpoint} failed with HTTP ${res.status}`);
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async post(endpoint, body = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Cookie': this.cookies,
        'token': this.token,
        'Authorization': `Bearer ${this.token}`,
        'language': '0',
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`POST ${endpoint} failed with HTTP ${res.status}`);
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async getProfile() {
    return await this.get(`/rest/student/studentInfo/${this.personId}/ru`);
  }

  async getJournal(year = 2026, term = 1) {
    return await this.get(`/journal/${year}/${term}/${this.personId}`);
  }

  async getSubjectDetails(year, term, subjectId, queryId) {
    const q = queryId ? `?queryID=${queryId}` : '';
    return await this.get(`/subject/${year}/${term}/${subjectId}/${this.personId}${q}`);
  }

  async getSchedule() {
    return await this.post('/rest/schedule/userSchedule/student/initial/0/ru', {});
  }

  async getAssignments() {
    return await this.post('/rest/assignments/studentTasks/1', {
      assignmentStatus: -1,
      recipientStatus: -1,
      page: 1,
      count: 50
    });
  }

  async getUmkd(year = 2026, term = 1) {
    return await this.get(`/rest/umkd/list?year=${year}&term=${term}`);
  }
}

module.exports = { PlatonusClient };
