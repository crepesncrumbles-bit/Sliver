// Where accounts and leaderboards are saved.
//
// • On Render, set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (free Upstash Redis
//   database) and everything is saved there. Render's free disk is wiped whenever the
//   server sleeps, so without a database accounts would disappear.
// • Anywhere else (your laptop), it saves to data/sliver-db.json next to the game.
//
// Both speak the same small set of Redis commands, so the rest of the code doesn't care.

const fs = require('fs');
const path = require('path');

// ---------- a tiny in-memory Redis (just the commands Sliver uses) ----------
class MiniRedis {
  constructor(file = null) {
    this.file = file;
    this.data = new Map(); // key -> { t: 'str'|'hash'|'zset'|'list', v, exp }
    this.saveTimer = null;
    if (file) this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [k, e] of Object.entries(raw)) {
        const v = e.t === 'hash' || e.t === 'zset' ? new Map(Object.entries(e.v)) : e.v;
        this.data.set(k, { t: e.t, v, exp: e.exp || null });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('  Couldn\'t read saved accounts:', err.message);
    }
  }

  scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const out = {};
      for (const [k, e] of this.data) {
        if (e.exp && e.exp < Date.now()) continue;
        out[k] = { t: e.t, v: e.v instanceof Map ? Object.fromEntries(e.v) : e.v, exp: e.exp };
      }
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file + '.tmp', JSON.stringify(out));
        fs.renameSync(this.file + '.tmp', this.file);
      } catch (err) { console.warn('  Couldn\'t save accounts:', err.message); }
    }, 300);
    this.saveTimer.unref?.();
  }

  entry(key, type, create) {
    let e = this.data.get(key);
    if (e && e.exp && e.exp < Date.now()) { this.data.delete(key); e = null; }
    if (!e) {
      if (!create) return null;
      e = { t: type, v: type === 'str' ? '' : type === 'list' ? [] : new Map(), exp: null };
      this.data.set(key, e);
    }
    if (e.t !== type) throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    return e;
  }

  zsorted(e) {
    return [...e.v.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }

  exec(args) {
    const [rawCmd, ...a] = args.map((x) => (typeof x === 'number' ? String(x) : x));
    const cmd = String(rawCmd).toUpperCase();
    const write = () => { this.scheduleSave(); };
    switch (cmd) {
      case 'PING': return 'PONG';
      case 'GET': { const e = this.entry(a[0], 'str'); return e ? e.v : null; }
      case 'SET': {
        const [key, val, ...opts] = a;
        const up = opts.map((o) => String(o).toUpperCase());
        const exists = !!this.entry(key, 'str');
        if (up.includes('NX') && exists) return null;
        let exp = null;
        const ex = up.indexOf('EX');
        if (ex >= 0) exp = Date.now() + Number(opts[ex + 1]) * 1000;
        this.data.set(key, { t: 'str', v: String(val), exp });
        write();
        return 'OK';
      }
      case 'DEL': { let n = 0; for (const k of a) if (this.data.delete(k)) n++; write(); return n; }
      case 'HSET': {
        const e = this.entry(a[0], 'hash', true);
        let n = 0;
        for (let i = 1; i < a.length; i += 2) { if (!e.v.has(a[i])) n++; e.v.set(a[i], String(a[i + 1])); }
        write();
        return n;
      }
      case 'HGET': { const e = this.entry(a[0], 'hash'); return e && e.v.has(a[1]) ? e.v.get(a[1]) : null; }
      case 'HMGET': { const e = this.entry(a[0], 'hash'); return a.slice(1).map((f) => (e && e.v.has(f) ? e.v.get(f) : null)); }
      case 'HGETALL': { const e = this.entry(a[0], 'hash'); return e ? [...e.v.entries()].flat() : []; }
      case 'HINCRBY': {
        const e = this.entry(a[0], 'hash', true);
        const n = (parseInt(e.v.get(a[1]) || '0', 10) || 0) + parseInt(a[2], 10);
        e.v.set(a[1], String(n));
        write();
        return n;
      }
      case 'ZADD': {
        const e = this.entry(a[0], 'zset', true);
        let i = 1;
        const flags = new Set();
        while (['GT', 'LT', 'NX', 'XX'].includes(String(a[i]).toUpperCase())) flags.add(String(a[i++]).toUpperCase());
        let n = 0;
        for (; i < a.length; i += 2) {
          const score = Number(a[i]), member = a[i + 1];
          const had = e.v.has(member);
          if (flags.has('NX') && had) continue;
          if (flags.has('XX') && !had) continue;
          if (had && flags.has('GT') && !(score > e.v.get(member))) continue;
          if (had && flags.has('LT') && !(score < e.v.get(member))) continue;
          if (!had) n++;
          e.v.set(member, score);
        }
        write();
        return n;
      }
      case 'ZSCORE': { const e = this.entry(a[0], 'zset'); return e && e.v.has(a[1]) ? String(e.v.get(a[1])) : null; }
      case 'ZCARD': { const e = this.entry(a[0], 'zset'); return e ? e.v.size : 0; }
      case 'ZREVRANK': {
        const e = this.entry(a[0], 'zset');
        if (!e || !e.v.has(a[1])) return null;
        return this.zsorted(e).findIndex(([m]) => m === a[1]);
      }
      case 'ZREVRANGE': {
        const e = this.entry(a[0], 'zset');
        if (!e) return [];
        const list = this.zsorted(e);
        let start = Number(a[1]), stop = Number(a[2]);
        if (stop < 0) stop = list.length + stop;
        const slice = list.slice(start, stop + 1);
        return String(a[3] || '').toUpperCase() === 'WITHSCORES' ? slice.flatMap(([m, s]) => [m, String(s)]) : slice.map(([m]) => m);
      }
      case 'LPUSH': { const e = this.entry(a[0], 'list', true); for (const v of a.slice(1)) e.v.unshift(String(v)); write(); return e.v.length; }
      case 'LTRIM': {
        const e = this.entry(a[0], 'list');
        if (!e) return 'OK';
        let stop = Number(a[2]);
        if (stop < 0) stop = e.v.length + stop;
        e.v = e.v.slice(Number(a[1]), stop + 1);
        write();
        return 'OK';
      }
      case 'LRANGE': {
        const e = this.entry(a[0], 'list');
        if (!e) return [];
        let stop = Number(a[2]);
        if (stop < 0) stop = e.v.length + stop;
        return e.v.slice(Number(a[1]), stop + 1);
      }
      case 'INCR': {
        const e = this.entry(a[0], 'str', true);
        e.v = String((parseInt(e.v || '0', 10) || 0) + 1);
        write();
        return Number(e.v);
      }
      case 'EXPIRE': {
        const e = this.data.get(a[0]);
        if (!e) return 0;
        e.exp = Date.now() + Number(a[1]) * 1000;
        write();
        return 1;
      }
      default: throw new Error(`MiniRedis: ${cmd} not supported`);
    }
  }

  async cmd(...args) { return this.exec(args); }
  async pipeline(list) { return list.map((args) => this.exec(args)); }
}

// ---------- Upstash Redis over HTTPS (no driver needed) ----------
class UpstashStore {
  constructor(url, token) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url; // pasted without https://
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.kind = 'upstash';
  }

  async request(pathname, body) {
    const res = await fetch(this.url + pathname, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Upstash rejected the token (HTTP ${res.status}). Check UPSTASH_REDIS_REST_TOKEN in Render: paste only the long token, and use the normal token, not the read-only one.`);
    }
    if (!res.ok && !Array.isArray(json)) throw new Error(`Database error (HTTP ${res.status}) ${json && json.error ? json.error : ''}`.trim());
    return json;
  }

  async cmd(...args) {
    const json = await this.request('', args.map(String));
    if (json && json.error) throw new Error(`Database error: ${json.error}`);
    return json ? json.result : null;
  }

  async pipeline(list) {
    if (!list.length) return [];
    const json = await this.request('/pipeline', list.map((args) => args.map(String)));
    return json.map((r) => {
      if (r && r.error) throw new Error(`Database error: ${r.error}`);
      return r ? r.result : null;
    });
  }
}

// Forgiving about how the values were pasted: surrounding quotes, a leading
// "UPSTASH_REDIS_REST_URL=" copied along with the value, or stray spaces/newlines.
function cleanEnv(value, name) {
  let v = String(value || '').trim();
  if (name && v.toUpperCase().startsWith(name + '=')) v = v.slice(name.length + 1).trim();
  v = v.replace(/^["'`]+|["'`]+$/g, '').trim();
  return v;
}

function createStore({ dir } = {}) {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL, 'UPSTASH_REDIS_REST_URL');
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN, 'UPSTASH_REDIS_REST_TOKEN');
  if (url && token) return new UpstashStore(url, token);
  const file = path.join(dir || path.join(__dirname, '..', 'data'), 'sliver-db.json');
  const store = new MiniRedis(file);
  store.kind = 'file';
  store.file = file;
  return store;
}

module.exports = { MiniRedis, UpstashStore, createStore, cleanEnv };
