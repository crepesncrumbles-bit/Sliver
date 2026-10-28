// Accounts, ranked scores, leaderboards and player stats.
//
// Accounts: username (doesn't have to be unique), email (unique), password (scrypt-hashed).
// Ranked: every 5-song ranked game is a "play" on one genre. Your best play on each genre
// goes on that genre's leaderboard. Your rating works like osu!'s pp: each genre best is
// worth score ÷ 100, and your bests are added up with each one after the first counting
// a little less (×0.95, ×0.95², …), so playing well across many genres raises it most.

const crypto = require('crypto');
const packs = require('./packs');

const SESSION_DAYS = 60;
const TOP_N = 25;
const WEIGHT = 0.95;

const K = {
  user: (id) => `user:${id}`,
  email: (e) => `email:${e}`,
  sess: (t) => `sess:${t}`,
  best: (id) => `ubest:${id}`,
  plays: (id) => `plays:${id}`,
  board: (b) => `lb:${b}`,
};

const ppFor = (score) => Math.round(Number(score || 0) / 100);
const toObj = (flat) => {
  if (!flat) return {};
  if (!Array.isArray(flat)) return flat; // some clients return objects already
  const o = {};
  for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};
const int = (v) => parseInt(v || '0', 10) || 0;
const tagFor = (id) => String(parseInt(crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 8), 16) % 10000).padStart(4, '0');

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function ratingFrom(bestMap) {
  const pps = Object.values(bestMap).map((s) => ppFor(s)).sort((a, b) => b - a);
  return Math.round(pps.reduce((sum, pp, i) => sum + pp * Math.pow(WEIGHT, i), 0));
}

class AccountError extends Error {}

class Accounts {
  constructor(store) {
    this.store = store;
  }

  publicUser(u) {
    if (!u || !u.id) return null;
    return { id: u.id, name: u.name, tag: tagFor(u.id), rating: int(u.rating), games: int(u.games) };
  }

  async getUser(id) {
    if (!id || !/^[\w-]{6,40}$/.test(String(id))) return null;
    const u = toObj(await this.store.cmd('HGETALL', K.user(id)));
    return u.id ? u : null;
  }

  async newSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.store.cmd('SET', K.sess(token), userId, 'EX', SESSION_DAYS * 86400);
    return token;
  }

  async signup({ name, email, password } = {}) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (name.length < 2 || name.length > 20) throw new AccountError('Username needs 2 to 20 characters');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new AccountError('That email doesn\'t look right');
    if (password.length < 6) throw new AccountError('Password needs at least 6 characters');
    if (password.length > 200) throw new AccountError('That password is too long');
    const id = crypto.randomBytes(9).toString('base64url');
    const claimed = await this.store.cmd('SET', K.email(email), id, 'NX');
    if (!claimed) throw new AccountError('That email already has an account. Log in instead.');
    const salt = crypto.randomBytes(16).toString('base64');
    const hash = (await scrypt(password, salt)).toString('base64');
    await this.store.cmd('HSET', K.user(id),
      'id', id, 'name', name, 'email', email, 'salt', salt, 'hash', hash, 'created', Date.now(),
      'games', 0, 'songs', 0, 'correct', 0, 'firstTry', 0, 'heard10', 0, 'points', 0, 'best', 0, 'bestPack', '', 'rating', 0);
    const token = await this.newSession(id);
    return { token, user: { ...this.publicUser({ id, name, rating: 0, games: 0 }), email } };
  }

  async login({ email, password } = {}) {
    email = String(email || '').trim().toLowerCase();
    const id = await this.store.cmd('GET', K.email(email));
    const u = id ? await this.getUser(id) : null;
    // Same work and message either way, so nobody can find out which emails have accounts.
    const salt = u ? u.salt : 'no-such-user-salt';
    const got = await scrypt(password || '', salt);
    const want = u ? Buffer.from(u.hash, 'base64') : Buffer.alloc(64);
    if (!u || !crypto.timingSafeEqual(got, want)) throw new AccountError('Wrong email or password');
    const token = await this.newSession(u.id);
    return { token, user: { ...this.publicUser(u), email: u.email } };
  }

  async session(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const id = await this.store.cmd('GET', K.sess(token));
    if (!id) return null;
    const u = await this.getUser(id);
    return u ? { ...this.publicUser(u), email: u.email } : null;
  }

  async logout(token) {
    if (token) await this.store.cmd('DEL', K.sess(token));
  }

  // One finished ranked game for one player.
  async submitRanked(userId, play) {
    const u = await this.getUser(userId);
    if (!u) throw new AccountError('Account not found');
    const pack = packs.byId.get(play.packId);
    if (!pack || !pack.ranked) throw new AccountError('Not a ranked genre');
    const score = Math.max(0, Math.round(Number(play.score) || 0));
    const bests = toObj(await this.store.cmd('HGETALL', K.best(userId)));
    const prevBest = int(bests[pack.id]);
    const improved = score > prevBest;
    const ratingBefore = int(u.rating);
    if (improved) bests[pack.id] = String(score);
    const rating = ratingFrom(bests);

    const record = JSON.stringify({
      packId: pack.id, score, pp: ppFor(score), correct: play.correct, songs: play.songs,
      hard: !!play.hard, chaos: !!play.chaos, at: Date.now(),
    });
    const ops = [
      ['HINCRBY', K.user(userId), 'games', 1],
      ['HINCRBY', K.user(userId), 'songs', int(play.songs)],
      ['HINCRBY', K.user(userId), 'correct', int(play.correct)],
      ['HINCRBY', K.user(userId), 'firstTry', int(play.firstTry)],
      ['HINCRBY', K.user(userId), 'heard10', Math.round((Number(play.heard) || 0) * 10)],
      ['HINCRBY', K.user(userId), 'points', score],
      ['HSET', K.user(userId), 'rating', rating],
      ['ZADD', K.board('overall'), rating, userId],
      ['LPUSH', K.plays(userId), record],
      ['LTRIM', K.plays(userId), 0, 19],
    ];
    if (score > int(u.best)) ops.push(['HSET', K.user(userId), 'best', score, 'bestPack', pack.id]);
    if (improved) {
      ops.push(['HSET', K.best(userId), pack.id, score]);
      ops.push(['ZADD', K.board(pack.id), 'GT', score, userId]);
    }
    await this.store.pipeline(ops);
    const [packRank, globalRank, packPlayers] = await this.store.pipeline([
      ['ZREVRANK', K.board(pack.id), userId],
      ['ZREVRANK', K.board('overall'), userId],
      ['ZCARD', K.board(pack.id)],
    ]);
    return {
      packId: pack.id, packName: pack.name, score, pp: ppFor(score), prevBest, improved,
      packRank: packRank === null ? null : int(packRank) + 1, packPlayers: int(packPlayers),
      rating, ratingBefore, globalRank: globalRank === null ? null : int(globalRank) + 1,
    };
  }

  boards() {
    return [{ id: 'overall', name: 'Overall rating', cat: 'Overall' }]
      .concat(packs.RANKED.map((p) => ({ id: p.id, name: p.name, cat: p.cat })));
  }

  async leaderboard(board = 'overall', meId = null) {
    if (board !== 'overall' && !(packs.byId.get(board) || {}).ranked) throw new AccountError('Unknown leaderboard');
    const flat = await this.store.cmd('ZREVRANGE', K.board(board), 0, TOP_N - 1, 'WITHSCORES');
    const rows = [];
    for (let i = 0; i < flat.length; i += 2) rows.push({ id: flat[i], value: Number(flat[i + 1]) });
    const names = rows.length ? await this.store.pipeline(rows.map((r) => ['HMGET', K.user(r.id), 'name', 'rating'])) : [];
    const entries = rows.map((r, i) => ({
      rank: i + 1, id: r.id, name: (names[i] && names[i][0]) || 'Player', tag: tagFor(r.id),
      value: r.value, pp: board === 'overall' ? r.value : ppFor(r.value), rating: int(names[i] && names[i][1]),
    }));
    let me = null;
    if (meId) {
      const [rank, value] = await this.store.pipeline([['ZREVRANK', K.board(board), meId], ['ZSCORE', K.board(board), meId]]);
      if (rank !== null && rank !== undefined) me = { rank: int(rank) + 1, value: Number(value) };
    }
    const total = int(await this.store.cmd('ZCARD', K.board(board)));
    const info = board === 'overall' ? { id: 'overall', name: 'Overall rating' } : { id: board, name: packs.byId.get(board).name };
    return { board: info, entries, me, total, boards: this.boards() };
  }

  async profile(id) {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player with that id');
    const bests = toObj(await this.store.cmd('HGETALL', K.best(id)));
    const packIds = Object.keys(bests).filter((p) => packs.byId.has(p));
    const ranks = await this.store.pipeline([
      ['ZREVRANK', K.board('overall'), id],
      ['ZCARD', K.board('overall')],
      ['LRANGE', K.plays(id), 0, 9],
      ...packIds.flatMap((p) => [['ZREVRANK', K.board(p), id], ['ZCARD', K.board(p)]]),
    ]);
    const [gRank, gTotal, recentRaw] = ranks;
    const genres = packIds.map((p, i) => ({
      packId: p, name: packs.byId.get(p).name, best: int(bests[p]), pp: ppFor(bests[p]),
      rank: ranks[3 + i * 2] === null ? null : int(ranks[3 + i * 2]) + 1, of: int(ranks[4 + i * 2]),
    })).sort((a, b) => b.best - a.best);
    const recent = (recentRaw || []).map((s) => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean).map((r) => ({ ...r, packName: (packs.byId.get(r.packId) || {}).name || r.packId }));
    const games = int(u.games), songs = int(u.songs), correct = int(u.correct);
    return {
      id: u.id, name: u.name, tag: tagFor(u.id), created: int(u.created),
      rating: int(u.rating), globalRank: gRank === null ? null : int(gRank) + 1, players: int(gTotal),
      stats: {
        games, songs, correct,
        accuracy: songs ? correct / songs : 0,
        firstTry: correct ? int(u.firstTry) / correct : 0,
        avgHeard: correct ? int(u.heard10) / 10 / correct : 0,
        avgScore: games ? Math.round(int(u.points) / games) : 0,
        best: int(u.best),
        bestPack: (packs.byId.get(u.bestPack) || {}).name || null,
      },
      genres,
      recent,
    };
  }
}

module.exports = { Accounts, AccountError, ppFor, ratingFrom, tagFor };
