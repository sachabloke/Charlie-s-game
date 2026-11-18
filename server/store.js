'use strict';
// Where the learning results are kept.
//  - With DATABASE_URL set: a Postgres database (results survive restarts and redeploys).
//  - Otherwise: a JSON file in DATA_DIR (default ./data). Fine at home; on a free host the
//    file is wiped whenever the server restarts, so use a database there.
// Everything is also held in memory, so reading for the dashboard never waits on the database.
const fs = require('fs');
const path = require('path');

class MemoryStore {
  constructor() { this.kind = 'memory'; this.durable = false; }
  async load() { return { sessions: [], answers: [], settings: {} }; }
  saveSession() {} saveAnswer() {} saveSetting() {} deleteSession() {}
  async flush() {}
  async close() {}
}

class FileStore {
  constructor(dir) {
    this.kind = 'file';
    this.file = path.join(dir, 'learning.json');
    // A file on a free cloud host disappears on restart; a mounted disk (DATA_DIR) or a home computer keeps it.
    this.durable = !!process.env.DATA_DIR || !process.env.RENDER;
    this.data = { sessions: {}, answers: {}, settings: {} };
    this.timer = null; this.writing = Promise.resolve();
  }
  async load() {
    try {
      const raw = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
      this.data = { sessions: raw.sessions || {}, answers: raw.answers || {}, settings: raw.settings || {} };
    } catch (e) { if (e.code !== 'ENOENT') console.error('Could not read saved results, starting empty:', e.message); }
    return { sessions: Object.values(this.data.sessions), answers: Object.values(this.data.answers), settings: this.data.settings };
  }
  saveSession(s) { this.data.sessions[s.id] = s; this.schedule(); }
  saveAnswer(a) { this.data.answers[a.id] = a; this.schedule(); }
  saveSetting(k, v) { this.data.settings[k] = v; this.schedule(); }
  deleteSession(id, answerIds) {
    delete this.data.sessions[id];
    for (const a of answerIds) delete this.data.answers[a];
    this.schedule();
  }
  schedule() { if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.write(); }, 400); }
  write() {
    const json = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await fs.promises.writeFile(tmp, json);
      await fs.promises.rename(tmp, this.file);
    }).catch((e) => console.error('Could not save results:', e.message));
    return this.writing;
  }
  async flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.write(); } await this.writing; }
  async close() { await this.flush(); }
}

class PgStore {
  constructor(url) {
    this.kind = 'postgres'; this.durable = true;
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url) || /host=%2F|host=\//.test(url);
    // Hosted databases need an encrypted connection; an "sslmode=..." in the link overrides this default.
    this.pool = new Pool({ connectionString: url, max: 3, ssl: !local });
    this.pool.on('error', (e) => console.error('Database connection problem:', e.message));
    this.pending = new Map(); // key -> { sql, params }; newest write for a row wins
    this.timer = null; this.busy = Promise.resolve();
  }
  async load() {
    await this.pool.query(`
      create table if not exists edu_sessions (id text primary key, child text not null, started_at bigint not null, data jsonb not null);
      create table if not exists edu_answers (id text primary key, child text not null, at bigint not null, data jsonb not null);
      create table if not exists edu_settings (key text primary key, value jsonb not null);
      create index if not exists edu_answers_child_at on edu_answers (child, at);`);
    const [s, a, st] = await Promise.all([
      this.pool.query('select data from edu_sessions'),
      this.pool.query('select data from edu_answers'),
      this.pool.query('select key, value from edu_settings'),
    ]);
    const settings = {}; for (const r of st.rows) settings[r.key] = r.value;
    return { sessions: s.rows.map((r) => r.data), answers: a.rows.map((r) => r.data), settings };
  }
  queue(key, sql, params) { this.pending.set(key, { sql, params }); if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.drain(); }, 250); }
  saveSession(s) { this.queue('s:' + s.id, 'insert into edu_sessions (id, child, started_at, data) values ($1,$2,$3,$4) on conflict (id) do update set data = excluded.data', [s.id, s.child, s.start, JSON.stringify(s)]); }
  saveAnswer(a) { this.queue('a:' + a.id, 'insert into edu_answers (id, child, at, data) values ($1,$2,$3,$4) on conflict (id) do update set data = excluded.data, at = excluded.at', [a.id, a.child, a.at, JSON.stringify(a)]); }
  saveSetting(k, v) { this.queue('k:' + k, 'insert into edu_settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value', [k, JSON.stringify(v)]); }
  deleteSession(id, answerIds) {
    this.pending.delete('s:' + id); for (const a of answerIds) this.pending.delete('a:' + a);
    this.queue('ds:' + id, 'delete from edu_sessions where id = $1', [id]);
    if (answerIds.length) this.queue('da:' + id, 'delete from edu_answers where id = any($1)', [answerIds]);
  }
  drain() {
    const batch = [...this.pending.entries()]; this.pending.clear();
    this.busy = this.busy.then(async () => {
      for (const [key, w] of batch) {
        try { await this.pool.query(w.sql, w.params); }
        catch (e) {
          console.error('Could not save to the database (will retry):', e.message);
          if (!this.pending.has(key)) this.pending.set(key, w); // keep it unless a newer write replaced it
        }
      }
      if (this.pending.size && !this.timer && !this.closing) this.timer = setTimeout(() => { this.timer = null; this.drain(); }, 5000);
    });
    return this.busy;
  }
  async flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } if (this.pending.size) this.drain(); await this.busy; }
  async close() { this.closing = true; await this.flush(); await this.pool.end(); }
}

function createStore(opts = {}) {
  if (opts.memory) return new MemoryStore();
  const url = opts.databaseUrl !== undefined ? opts.databaseUrl : process.env.DATABASE_URL;
  if (url) return new PgStore(url);
  return new FileStore(opts.dir || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
}

module.exports = { createStore, MemoryStore, FileStore, PgStore };
