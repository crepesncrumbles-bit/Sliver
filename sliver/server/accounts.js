// Accounts, ranked scores, leaderboards and player stats.
//
// Accounts: username (doesn't have to be unique), email (unique), password (scrypt-hashed).
// Ranked: every 5-song ranked game is a "play" on one genre. Your best play on each genre
// goes on that genre's leaderboard. Your rating works like osu!'s pp: each genre best is
// worth score ÷ 100, and your bests are added up with each one after the first counting
// a little less (×0.95, ×0.95², …), so playing well across many genres raises it most.

const crypto = require('crypto');
const packs = require('./packs');
const ICONS = require('../public/icons.js');
const cleanIcon = (i) => (ICONS.includes(i) ? i : '');

const SESSION_DAYS = 60;
const CODE_MINUTES = 15;
const CODE_TRIES = 5;
const RESEND_SECONDS = 45;
const TOP_N = 25;
const WEIGHT = 0.95;

const K = {
  user: (id) => `user:${id}`,
  email: (e) => `email:${e}`,
  sess: (t) => `sess:${t}`,
  pend: (e) => `pend:${e}`,     // sign-up waiting for its email code
  reset: (e) => `reset:${e}`,   // password reset waiting for its email code
  sent: (e, why = 'signup') => `sent:${why}:${e}`,     // "just sent a code" (stops spamming someone's inbox)
  best: (id) => `ubest:${id}`,
  plays: (id) => `plays:${id}`,
  board: (b) => `lb:${b}`,
  fr: (id) => `fr:${id}`,       // hash: otherId -> "friend" | "in" (they asked me) | "out" (I asked them)
  blk: (id) => `blk:${id}`,     // hash: otherId -> when I blocked them
  fcode: (c) => `fcode:${c}`,   // friend code -> userId
};

const MAX_FRIENDS = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const cleanFriendCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

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

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const cleanCode = (c) => String(c || '').replace(/\D/g, '').slice(0, 6);

function checkName(name) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) throw new AccountError('Username needs 2 to 20 characters');
  return name;
}
function checkEmail(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new AccountError('That email doesn\'t look right');
  return email;
}
function checkPassword(password) {
  password = String(password || '');
  if (password.length < 6) throw new AccountError('Password needs at least 6 characters');
  if (password.length > 200) throw new AccountError('That password is too long');
  return password;
}

class Accounts {
  // mailer: optional. When set, sign-ups need a 6-digit code from their email,
  // and "Forgot password?" works.
  constructor(store, mailer = null) {
    this.store = store;
    this.mailer = mailer;
  }

  get emailCodes() { return !!this.mailer; }

  publicUser(u) {
    if (!u || !u.id) return null;
    return { id: u.id, name: u.name, tag: tagFor(u.id), rating: int(u.rating), games: int(u.games), icon: cleanIcon(u.icon) };
  }

  // Your own account settings: icon (one of ICONS, or '' for your initial) and
  // hidden (others can't see your stats, leaderboard name or account in rooms; friends still can).
  async updateSettings(userId, { icon, hidden } = {}) {
    const ops = [];
    if (icon !== undefined) {
      if (icon && !ICONS.includes(icon)) throw new AccountError('Pick one of the icons');
      ops.push(['HSET', K.user(userId), 'icon', icon || '']);
    }
    if (hidden !== undefined) ops.push(['HSET', K.user(userId), 'hidden', hidden ? 1 : 0]);
    if (ops.length) await this.store.pipeline(ops);
    const u = await this.getUser(userId);
    return { user: { ...this.publicUser(u), email: u.email, hidden: !!int(u.hidden) } };
  }

  async friendIds(userId) {
    if (!userId) return new Set();
    const fr = toObj(await this.store.cmd('HGETALL', K.fr(userId)));
    return new Set(Object.keys(fr).filter((k) => fr[k] === 'friend'));
  }

  async getUser(id) {
    if (!id || !/^[\w-]{6,40}$/.test(String(id))) return null;
    const u = toObj(await this.store.cmd('HGETALL', K.user(id)));
    return u.id ? u : null;
  }

  // Session value is "userId.passwordVersion", so changing the password logs out old devices.
  async newSession(userId, pv = 0) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.store.cmd('SET', K.sess(token), `${userId}.${pv}`, 'EX', SESSION_DAYS * 86400);
    return token;
  }

  async hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('base64');
    const hash = (await scrypt(password, salt)).toString('base64');
    return { salt, hash };
  }

  async createUser(name, email, salt, hash) {
    const id = crypto.randomBytes(9).toString('base64url');
    const claimed = await this.store.cmd('SET', K.email(email), id, 'NX');
    if (!claimed) throw new AccountError('That email already has an account. Log in instead.');
    await this.store.cmd('HSET', K.user(id),
      'id', id, 'name', name, 'email', email, 'salt', salt, 'hash', hash, 'created', Date.now(), 'pv', 0,
      'games', 0, 'songs', 0, 'correct', 0, 'firstTry', 0, 'heard10', 0, 'points', 0, 'best', 0, 'bestPack', '', 'rating', 0);
    const token = await this.newSession(id, 0);
    return { token, user: { ...this.publicUser({ id, name, rating: 0, games: 0 }), email, hidden: false } };
  }

  // Throttle: one code per email every RESEND_SECONDS.
  async throttle(email, why = 'signup') {
    const ok = await this.store.cmd('SET', K.sent(email, why), '1', 'NX', 'EX', RESEND_SECONDS);
    if (!ok) throw new AccountError('A code was just sent. Wait a few seconds before asking for another.');
  }

  async sendCode(email, code, purpose) {
    try {
      await this.mailer.sendCode(email, code, purpose);
    } catch (err) {
      console.error('email send failed:', err.message);
      await this.store.cmd('DEL', K.sent(email, purpose));
      throw new AccountError('Couldn\'t send the email right now. Try again in a minute.');
    }
  }

  // Step 1 of sign-up. Without email set up, the account is created right away.
  async signup({ name, email, password } = {}) {
    name = checkName(name);
    email = checkEmail(email);
    password = checkPassword(password);
    if (await this.store.cmd('GET', K.email(email))) throw new AccountError('That email already has an account. Log in instead.');
    const { salt, hash } = await this.hashPassword(password);
    if (!this.mailer) return this.createUser(name, email, salt, hash);
    await this.throttle(email);
    const code = newCode();
    await this.store.cmd('HSET', K.pend(email), 'name', name, 'salt', salt, 'hash', hash, 'code', sha(code), 'tries', 0);
    await this.store.cmd('EXPIRE', K.pend(email), CODE_MINUTES * 60);
    await this.sendCode(email, code, 'signup');
    return { pending: true, email };
  }

  // Step 2 of sign-up: the code from the email.
  async verifySignup({ email, code } = {}) {
    email = checkEmail(email);
    const p = toObj(await this.store.cmd('HGETALL', K.pend(email)));
    if (!p.code) throw new AccountError('That code expired. Sign up again to get a new one.');
    await this.checkCode(K.pend(email), p, code);
    await this.store.cmd('DEL', K.pend(email));
    return this.createUser(p.name, email, p.salt, p.hash);
  }

  async resendSignup({ email } = {}) {
    email = checkEmail(email);
    if (!this.mailer) throw new AccountError('Email codes aren\'t set up on this server');
    const p = toObj(await this.store.cmd('HGETALL', K.pend(email)));
    if (!p.code) throw new AccountError('That sign-up expired. Fill in the form again.');
    await this.throttle(email);
    const code = newCode();
    await this.store.cmd('HSET', K.pend(email), 'code', sha(code), 'tries', 0);
    await this.store.cmd('EXPIRE', K.pend(email), CODE_MINUTES * 60);
    await this.sendCode(email, code, 'signup');
    return { pending: true, email };
  }

  async checkCode(key, rec, code) {
    const c = cleanCode(code);
    if (c.length !== 6) throw new AccountError('Enter the 6-digit code from the email');
    if (int(rec.tries) >= CODE_TRIES) {
      await this.store.cmd('DEL', key);
      throw new AccountError('Too many wrong codes. Start again to get a new one.');
    }
    const a = Buffer.from(sha(c)), b = Buffer.from(rec.code);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      const tries = await this.store.cmd('HINCRBY', key, 'tries', 1);
      const left = CODE_TRIES - int(tries);
      if (left <= 0) { await this.store.cmd('DEL', key); throw new AccountError('Too many wrong codes. Start again to get a new one.'); }
      throw new AccountError(`That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
    }
  }

  // Forgot password, step 1. Same answer whether or not the email has an account.
  async startReset({ email } = {}) {
    if (!this.mailer) throw new AccountError('Password reset isn\'t set up on this server');
    email = checkEmail(email);
    const id = await this.store.cmd('GET', K.email(email));
    await this.throttle(email, 'reset');
    if (id) {
      const code = newCode();
      await this.store.cmd('HSET', K.reset(email), 'code', sha(code), 'tries', 0);
      await this.store.cmd('EXPIRE', K.reset(email), CODE_MINUTES * 60);
      await this.sendCode(email, code, 'reset');
    }
    return { pending: true, email };
  }

  // Forgot password, step 2: code + new password. Logs out every other device.
  async finishReset({ email, code, password } = {}) {
    email = checkEmail(email);
    password = checkPassword(password);
    const r = toObj(await this.store.cmd('HGETALL', K.reset(email)));
    if (!r.code) throw new AccountError('That code expired. Ask for a new one.');
    await this.checkCode(K.reset(email), r, code);
    const id = await this.store.cmd('GET', K.email(email));
    const u = id ? await this.getUser(id) : null;
    if (!u) throw new AccountError('Account not found');
    const { salt, hash } = await this.hashPassword(password);
    const pv = int(u.pv) + 1;
    await this.store.pipeline([['HSET', K.user(id), 'salt', salt, 'hash', hash, 'pv', pv], ['DEL', K.reset(email)]]);
    const token = await this.newSession(id, pv);
    return { token, user: { ...this.publicUser(u), email: u.email, hidden: !!int(u.hidden) } };
  }

  async login({ email, password } = {}) {
    email = String(email || '').trim().toLowerCase();
    const id = await this.store.cmd('GET', K.email(email));
    const u = id ? await this.getUser(id) : null;
    // Same work and message either way, so nobody can find out which emails have accounts.
    const salt = u ? u.salt : 'no-such-user-salt';
    const got = await scrypt(password || '', salt);
    const want = u ? Buffer.from(u.hash, 'base64') : Buffer.alloc(64);
    if (!u || !crypto.timingSafeEqual(got, want)) {
      if (!u && this.mailer && await this.store.cmd('HGET', K.pend(email), 'code')) {
        throw new AccountError('That sign-up isn\'t finished. Enter the code from your email, or sign up again.');
      }
      throw new AccountError('Wrong email or password');
    }
    const token = await this.newSession(u.id, int(u.pv));
    return { token, user: { ...this.publicUser(u), email: u.email, hidden: !!int(u.hidden) } };
  }

  async session(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const val = await this.store.cmd('GET', K.sess(token));
    if (!val) return null;
    const [id, pv] = String(val).split('.');
    const u = await this.getUser(id);
    if (!u) return null;
    if (int(pv) !== int(u.pv)) return null; // password changed since this login
    return { ...this.publicUser(u), email: u.email, hidden: !!int(u.hidden) };
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
    const names = rows.length ? await this.store.pipeline(rows.map((r) => ['HMGET', K.user(r.id), 'name', 'rating', 'icon', 'hidden'])) : [];
    const friends = await this.friendIds(meId);
    const entries = rows.map((r, i) => {
      const [name, rating, icon, hidden] = names[i] || [];
      const masked = int(hidden) && r.id !== meId && !friends.has(r.id); // hidden account: no name, no link
      return {
        rank: i + 1, id: masked ? null : r.id, name: masked ? 'Hidden player' : name || 'Player', tag: masked ? '' : tagFor(r.id),
        icon: masked ? '' : cleanIcon(icon), hidden: !!masked,
        value: r.value, pp: board === 'overall' ? r.value : ppFor(r.value), rating: int(rating),
      };
    });
    let me = null;
    if (meId) {
      const [rank, value] = await this.store.pipeline([['ZREVRANK', K.board(board), meId], ['ZSCORE', K.board(board), meId]]);
      if (rank !== null && rank !== undefined) me = { rank: int(rank) + 1, value: Number(value) };
    }
    const total = int(await this.store.cmd('ZCARD', K.board(board)));
    const info = board === 'overall' ? { id: 'overall', name: 'Overall rating' } : { id: board, name: packs.byId.get(board).name };
    return { board: info, entries, me, total, boards: this.boards() };
  }

  async profile(id, viewerId = null) {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player with that id');
    if (int(u.hidden) && viewerId !== id && !(await this.areFriends(viewerId, id))) {
      throw new AccountError(`${u.name} keeps their stats private`);
    }
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
      id: u.id, name: u.name, tag: tagFor(u.id), icon: cleanIcon(u.icon), hidden: !!int(u.hidden), created: int(u.created),
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

  // ---------- friends ----------
  // Each account gets a short, unique friend code (e.g. "K7QM2X") to share.
  async friendCode(id) {
    const have = await this.store.cmd('HGET', K.user(id), 'fcode');
    if (have) return have;
    for (let i = 0; i < 8; i++) {
      const code = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)]).join('');
      if (await this.store.cmd('SET', K.fcode(code), id, 'NX')) {
        await this.store.cmd('HSET', K.user(id), 'fcode', code);
        return code;
      }
    }
    throw new Error('Couldn\'t make a friend code');
  }

  async relation(me, other) {
    const [fr, iBlocked, theyBlocked] = await this.store.pipeline([
      ['HGET', K.fr(me), other], ['HGET', K.blk(me), other], ['HGET', K.blk(other), me],
    ]);
    return { fr: fr || null, iBlocked: !!iBlocked, theyBlocked: !!theyBlocked };
  }

  async isBlockedEitherWay(a, b) {
    if (!a || !b) return false;
    const r = await this.relation(a, b);
    return r.iBlocked || r.theyBlocked;
  }

  async areFriends(a, b) {
    if (!a || !b) return false;
    return (await this.store.cmd('HGET', K.fr(a), b)) === 'friend';
  }

  // Send a request by friend code or account id. If they already asked you, you're now friends.
  async requestFriend(me, { code, id } = {}) {
    let other = id ? String(id) : null;
    if (!other) {
      const c = cleanFriendCode(code);
      if (c.length < 4) throw new AccountError('Enter your friend\'s code (6 letters/numbers)');
      other = await this.store.cmd('GET', K.fcode(c));
      if (!other) throw new AccountError(`No player has the code ${c}`);
    }
    if (other === me) throw new AccountError('That\'s your own code');
    const them = await this.getUser(other);
    if (!them) throw new AccountError('No player found');
    const r = await this.relation(me, other);
    if (r.iBlocked) throw new AccountError(`You blocked ${them.name}. Unblock them first.`);
    if (r.theyBlocked) throw new AccountError(`${them.name} isn't accepting friend requests`);
    if (r.fr === 'friend') throw new AccountError(`You're already friends with ${them.name}`);
    if (r.fr === 'out') throw new AccountError(`You already asked ${them.name}. Waiting for them to accept.`);
    if (r.fr === 'in') return this.acceptFriend(me, other);
    const count = int(await this.store.cmd('HLEN', K.fr(me)));
    if (count >= MAX_FRIENDS) throw new AccountError(`You can have up to ${MAX_FRIENDS} friends and requests`);
    await this.store.pipeline([['HSET', K.fr(me), other, 'out'], ['HSET', K.fr(other), me, 'in']]);
    return { status: 'sent', other, name: them.name };
  }

  async acceptFriend(me, other) {
    if ((await this.store.cmd('HGET', K.fr(me), other)) !== 'in') throw new AccountError('No friend request from that player');
    await this.store.pipeline([['HSET', K.fr(me), other, 'friend'], ['HSET', K.fr(other), me, 'friend']]);
    const them = await this.getUser(other);
    return { status: 'friends', other, name: them ? them.name : 'Player' };
  }

  // Decline a request, cancel your own, or unfriend: all just remove the link both ways.
  async removeFriend(me, other) {
    await this.store.pipeline([['HDEL', K.fr(me), String(other)], ['HDEL', K.fr(String(other)), me]]);
    return { status: 'removed', other };
  }

  async block(me, other) {
    other = String(other);
    if (other === me) throw new AccountError('You can\'t block yourself');
    if (!(await this.getUser(other))) throw new AccountError('No player found');
    await this.store.pipeline([
      ['HDEL', K.fr(me), other], ['HDEL', K.fr(other), me], ['HSET', K.blk(me), other, Date.now()],
    ]);
    return { status: 'blocked', other };
  }

  async unblock(me, other) {
    await this.store.cmd('HDEL', K.blk(me), String(other));
    return { status: 'unblocked', other };
  }

  // Everything for the Friends screen. online(id) -> { online, room } is filled in by the server.
  async friends(me, online = () => ({ online: false })) {
    const [frFlat, blkFlat] = await this.store.pipeline([['HGETALL', K.fr(me)], ['HGETALL', K.blk(me)]]);
    const fr = toObj(frFlat), blk = toObj(blkFlat);
    const ids = [...new Set([...Object.keys(fr), ...Object.keys(blk)])];
    const info = ids.length ? await this.store.pipeline(ids.map((x) => ['HMGET', K.user(x), 'name', 'rating', 'icon'])) : [];
    const who = new Map(ids.map((x, i) => [x, { id: x, name: (info[i] && info[i][0]) || null, tag: tagFor(x), rating: int(info[i] && info[i][1]), icon: cleanIcon(info[i] && info[i][2]) }]));
    const pick = (state) => Object.keys(fr).filter((x) => fr[x] === state && who.get(x).name).map((x) => who.get(x));
    const friends = pick('friend').map((f) => ({ ...f, ...online(f.id) }))
      .sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    return {
      code: await this.friendCode(me),
      friends,
      incoming: pick('in'),
      outgoing: pick('out'),
      blocked: Object.keys(blk).filter((x) => who.get(x).name).map((x) => who.get(x)),
    };
  }
}

module.exports = { Accounts, AccountError, ppFor, ratingFrom, tagFor, ICONS };
