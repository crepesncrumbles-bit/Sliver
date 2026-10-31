// Counters for the admin page: games, songs, sign-ups and peak players, per day and all-time.
// Kept in the same database as accounts (Upstash on Render), a couple of commands per game.

const DAY_KEEP = 120 * 86400; // keep daily counters ~4 months
const dayKey = (d = new Date()) => `stat:day:${d.toISOString().slice(0, 10)}`;
const TOTAL = 'stat:total';

class Stats {
  constructor(store) {
    this.store = store;
    this.peakToday = { day: null, n: 0, saved: 0 };
    this.peakAll = { n: 0, saved: 0, loaded: false };
    this.lastPeakWrite = 0;
  }

  // name: games | ranked | songs | signups
  async bump(name, by = 1) {
    const day = dayKey();
    const ops = [['HINCRBY', TOTAL, name, by], ['HINCRBY', day, name, by], ['EXPIRE', day, DAY_KEEP]];
    if (name === 'signups') ops.push(['HINCRBY', TOTAL, 'accounts', by]);
    try { await this.store.pipeline(ops); } catch (err) { console.warn('  stats:', err.message); }
  }

  // Called whenever the number of connected players changes. Writes at most once a minute.
  notePlayers(n) {
    const today = dayKey();
    if (this.peakToday.day !== today) this.peakToday = { day: today, n: 0, saved: 0 };
    if (n > this.peakToday.n) this.peakToday.n = n;
    if (n > this.peakAll.n) this.peakAll.n = n;
    if (Date.now() - this.lastPeakWrite < 60 * 1000) return;
    if (this.peakToday.n <= this.peakToday.saved && this.peakAll.n <= this.peakAll.saved) return;
    this.lastPeakWrite = Date.now();
    this.flushPeaks().catch(() => {});
  }

  async flushPeaks() {
    const t = this.peakToday;
    const [dayPeak, allPeak] = await this.store.pipeline([['HGET', t.day || dayKey(), 'peak'], ['HGET', TOTAL, 'peak']]);
    const ops = [];
    if (t.day && t.n > (parseInt(dayPeak, 10) || 0)) ops.push(['HSET', t.day, 'peak', t.n], ['EXPIRE', t.day, DAY_KEEP]);
    if (this.peakAll.n > (parseInt(allPeak, 10) || 0)) ops.push(['HSET', TOTAL, 'peak', this.peakAll.n]);
    if (ops.length) await this.store.pipeline(ops);
    t.saved = t.n;
    this.peakAll.saved = this.peakAll.n;
  }

  // Accounts made before these counters existed: count them once (SCAN user:*).
  async countAccounts() {
    let cursor = '0', n = 0;
    for (let i = 0; i < 200; i++) {
      const [next, keys] = await this.store.cmd('SCAN', cursor, 'MATCH', 'user:*', 'COUNT', 500);
      n += (keys || []).length;
      cursor = String(next);
      if (cursor === '0') break;
    }
    await this.store.cmd('HSET', TOTAL, 'accounts', n);
    return n;
  }

  async read() {
    await this.flushPeaks().catch(() => {});
    const days = [];
    for (let i = 0; i < 7; i++) days.push(new Date(Date.now() - i * 86400000));
    const res = await this.store.pipeline([['HGETALL', TOTAL], ...days.map((d) => ['HGETALL', dayKey(d)]), ['ZCARD', 'lb:overall']]);
    const obj = (flat) => {
      if (!flat) return {};
      if (!Array.isArray(flat)) return flat;
      const o = {};
      for (let i = 0; i < flat.length; i += 2) o[flat[i]] = parseInt(flat[i + 1], 10) || 0;
      return o;
    };
    const total = obj(res[0]);
    if (total.accounts === undefined) total.accounts = await this.countAccounts().catch(() => null);
    const pick = (o) => ({ games: o.games || 0, ranked: o.ranked || 0, songs: o.songs || 0, signups: o.signups || 0, peak: o.peak || 0 });
    return {
      total: { ...pick(total), accounts: total.accounts, rankedPlayers: parseInt(res[res.length - 1], 10) || 0 },
      days: days.map((d, i) => ({ date: d.toISOString().slice(0, 10), ...pick(obj(res[i + 1])) })),
    };
  }
}

module.exports = { Stats, dayKey };
