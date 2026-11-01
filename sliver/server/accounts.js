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
const SHOP = require('../public/shop.js');
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
  own: (id) => `own:${id}`,         // hash: premium theme id -> how they got it
  pgrant: (e) => `pgrant:${e}`,     // list: themes bought with an email that has no account yet
  avatar: (id) => `avatar:${id}`,   // the account's photo (base64), served at /api/avatar/u/<id>
  bmc: (k) => `bmc:${k}`,           // Buy Me a Coffee events already handled
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
const avatarUrl = (u) => (u && u.avatarV ? `/api/avatar/u/${u.id}?v=${u.avatarV}` : '');
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

// A small square photo, already shrunk by the browser. data:image/(jpeg|png|webp);base64,…
const MAX_AVATAR_BYTES = 60 * 1024;
function parseImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new AccountError('That picture didn\'t upload. Try a JPG or PNG.');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) throw new AccountError('That picture is too big');
  const magic = { jpeg: [0xff, 0xd8], png: [0x89, 0x50], webp: [0x52, 0x49] }[m[1]];
  if (buffer[0] !== magic[0] || buffer[1] !== magic[1]) throw new AccountError('That file isn\'t a picture');
  return { type: `image/${m[1]}`, buffer, b64: m[2] };
}

class Accounts {
  // mailer: optional. When set, sign-ups need a 6-digit code from their email,
  // and "Forgot password?" works.
  // adminEmails: accounts with these emails can ban players and gift themes.
  constructor(store, mailer = null, { adminEmails = [] } = {}) {
    this.store = store;
    this.mailer = mailer;
    this.adminEmails = new Set((Array.isArray(adminEmails) ? adminEmails : String(adminEmails || '').split(','))
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  }

  isAdmin(u) { return !!(u && u.email && this.adminEmails.has(String(u.email).toLowerCase())); }

  // Everything your own device gets about your account.
  async selfUser(u) {
    const owned = Object.keys(toObj(await this.store.cmd('HGETALL', K.own(u.id))));
    return {
      ...this.publicUser(u), email: u.email, hidden: !!int(u.hidden),
      themes: this.isAdmin(u) ? SHOP.ids.slice() : owned.filter((t) => SHOP.ids.includes(t)), admin: this.isAdmin(u),
    };
  }

  get emailCodes() { return !!this.mailer; }

  publicUser(u) {
    if (!u || !u.id) return null;
    return { id: u.id, name: u.name, tag: tagFor(u.id), rating: int(u.rating), games: int(u.games), icon: cleanIcon(u.icon), avatar: avatarUrl(u) };
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
    return { user: await this.selfUser(u) };
  }

  // ---------- your photo, name, deleting your account ----------
  async setAvatar(userId, dataUrl) {
    const img = parseImage(dataUrl);
    const v = crypto.createHash('sha1').update(img.buffer).digest('hex').slice(0, 10);
    await this.store.pipeline([['SET', K.avatar(userId), `${img.type};${img.b64}`], ['HSET', K.user(userId), 'avatarV', v]]);
    return { user: await this.selfUser(await this.getUser(userId)) };
  }

  async clearAvatar(userId) {
    await this.store.pipeline([['DEL', K.avatar(userId)], ['HSET', K.user(userId), 'avatarV', '']]);
    const u = await this.getUser(userId);
    return u ? { user: await this.selfUser(u) } : {};
  }

  async getAvatar(userId) {
    if (!/^[\w-]{6,40}$/.test(String(userId))) return null;
    const v = await this.store.cmd('GET', K.avatar(userId));
    if (!v) return null;
    const [type, b64] = String(v).split(';');
    return { type, buffer: Buffer.from(b64, 'base64') };
  }

  async changeName(userId, name) {
    name = checkName(name);
    await this.store.cmd('HSET', K.user(userId), 'name', name);
    return { user: await this.selfUser(await this.getUser(userId)) };
  }

  async checkPasswordFor(u, password) {
    const got = await scrypt(password || '', u.salt);
    const want = Buffer.from(u.hash, 'base64');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw new AccountError('That password isn\'t right');
  }

  // Deletes the account and everything about it: stats, leaderboard places, friends, photo, themes.
  async deleteAccount(userId, password) {
    const u = await this.getUser(userId);
    if (!u) throw new AccountError('Account not found');
    await this.checkPasswordFor(u, password);
    const [bests, fr] = await this.store.pipeline([['HGETALL', K.best(userId)], ['HGETALL', K.fr(userId)]]);
    const ops = [
      ['DEL', K.user(userId)], ['DEL', K.email(u.email)], ['DEL', K.avatar(userId)], ['DEL', K.own(userId)],
      ['DEL', K.best(userId)], ['DEL', K.plays(userId)], ['DEL', K.fr(userId)], ['DEL', K.blk(userId)],
      ['DEL', K.pgrant(u.email)], ['ZREM', K.board('overall'), userId],
      ...Object.keys(toObj(bests)).map((p) => ['ZREM', K.board(p), userId]),
      ...Object.keys(toObj(fr)).map((other) => ['HDEL', K.fr(other), userId]),
    ];
    if (u.fcode) ops.push(['DEL', K.fcode(u.fcode)]);
    await this.store.pipeline(ops);
    return { deleted: true, email: u.email };
  }

  // ---------- premium themes ----------
  async ownedThemes(userId) {
    return Object.keys(toObj(await this.store.cmd('HGETALL', K.own(userId)))).filter((t) => SHOP.ids.includes(t));
  }

  // themeId: a premium theme, or 'random' (one they don't own yet). Returns the theme given, or
  // null if they already have it / have them all.
  async grantTheme(userId, themeId, from = 'gift') {
    const owned = await this.ownedThemes(userId);
    if (themeId === 'random') {
      const left = SHOP.ids.filter((t) => !owned.includes(t));
      if (!left.length) return null;
      themeId = left[crypto.randomInt(0, left.length)];
    }
    if (!SHOP.ids.includes(themeId)) throw new AccountError('No theme with that name');
    if (owned.includes(themeId)) return null;
    await this.store.cmd('HSET', K.own(userId), themeId, JSON.stringify({ from, at: Date.now() }));
    return themeId;
  }

  async revokeTheme(userId, themeId) {
    await this.store.cmd('HDEL', K.own(userId), themeId);
  }

  // Bought with an email: give it now if there's an account, else when that email signs up.
  async grantByEmail(email, themeId, from) {
    email = String(email || '').trim().toLowerCase();
    const id = await this.store.cmd('GET', K.email(email));
    if (id) return { userId: id, themeId: await this.grantTheme(id, themeId, from) };
    await this.store.pipeline([['RPUSH', K.pgrant(email), JSON.stringify({ themeId, from })], ['EXPIRE', K.pgrant(email), 400 * 86400]]);
    return { userId: null, themeId: null, pending: true };
  }

  async applyPendingGrants(userId, email) {
    const list = await this.store.cmd('LRANGE', K.pgrant(email), 0, -1);
    if (!list || !list.length) return [];
    await this.store.cmd('DEL', K.pgrant(email));
    const got = [];
    for (const raw of list) {
      try { const g = JSON.parse(raw); const t = await this.grantTheme(userId, g.themeId, g.from); if (t) got.push(t); } catch { /* skip bad entry */ }
    }
    return got;
  }

  // ---------- admin: ban / unban, find players ----------
  async findUser(query) {
    const q = String(query || '').trim();
    if (!q) throw new AccountError('Type an email, friend code or player id');
    let id = null;
    if (q.includes('@')) id = await this.store.cmd('GET', K.email(q.toLowerCase()));
    if (!id && /^[A-Za-z0-9]{6}$/.test(q)) id = await this.store.cmd('GET', K.fcode(q.toUpperCase()));
    if (!id && /^[\w-]{6,40}$/.test(q)) id = (await this.getUser(q)) ? q : null;
    if (!id) throw new AccountError('No player found');
    return id;
  }

  // Every account, for the admin's searchable list (newest first).
  async listUsers() {
    const ids = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.store.cmd('SCAN', cursor, 'MATCH', 'user:*', 'COUNT', 500);
      for (const k of keys || []) ids.push(String(k).slice(5));
      cursor = String(next);
    } while (cursor !== '0' && ids.length < 20000);
    const rows = ids.length ? await this.store.pipeline(ids.map((id) => ['HMGET', K.user(id), 'name', 'email', 'banned', 'hidden', 'created', 'icon', 'avatarV'])) : [];
    return ids.map((id, i) => {
      const [name, email, banned, hidden, created, icon, avatarV] = rows[i] || [];
      return { id, name: name || 'Player', tag: tagFor(id), email: email || '', banned: !!int(banned), hidden: !!int(hidden), created: int(created), icon: cleanIcon(icon), avatar: avatarUrl({ id, avatarV }) };
    }).filter((u) => u.email || u.name).sort((a, b) => b.created - a.created);
  }

  async adminView(id) {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player found');
    return {
      id, name: u.name, tag: tagFor(id), email: u.email, banned: !!int(u.banned), banReason: u.banReason || '',
      themes: await this.ownedThemes(id), created: int(u.created), avatar: avatarUrl(u), hidden: !!int(u.hidden),
    };
  }

  async ban(id, reason = '') {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player found');
    if (this.isAdmin(u)) throw new AccountError('You can\'t ban an admin');
    const bests = toObj(await this.store.cmd('HGETALL', K.best(id)));
    await this.store.pipeline([
      ['HSET', K.user(id), 'banned', 1, 'banReason', String(reason).slice(0, 200), 'pv', int(u.pv) + 1], // logs them out everywhere
      ['ZREM', K.board('overall'), id], ...Object.keys(bests).map((p) => ['ZREM', K.board(p), id]),
    ]);
    return this.adminView(id);
  }

  async unban(id) {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player found');
    const bests = toObj(await this.store.cmd('HGETALL', K.best(id)));
    const ops = [['HSET', K.user(id), 'banned', 0, 'banReason', '']];
    if (int(u.games)) ops.push(['ZADD', K.board('overall'), int(u.rating), id]);
    for (const [p, score] of Object.entries(bests)) if (packs.byId.has(p)) ops.push(['ZADD', K.board(p), int(score), id]);
    await this.store.pipeline(ops);
    return this.adminView(id);
  }

  // ---------- casual (non-ranked) games ----------
  // play: { songs, correct, firstTry, points, won, players }
  async submitCasual(userId, play) {
    if (!(await this.getUser(userId))) return null;
    const pts = Math.max(0, Math.round(Number(play.points) || 0));
    const ops = [
      ['HINCRBY', K.user(userId), 'cGames', 1],
      ['HINCRBY', K.user(userId), 'cSongs', int(play.songs)],
      ['HINCRBY', K.user(userId), 'cCorrect', int(play.correct)],
      ['HINCRBY', K.user(userId), 'cFirst', int(play.firstTry)],
      ['HINCRBY', K.user(userId), 'cPoints', pts],
    ];
    if (play.players >= 2) ops.push(['HINCRBY', K.user(userId), 'cMulti', 1]);
    if (play.won && play.players >= 2) ops.push(['HINCRBY', K.user(userId), 'cWins', 1]);
    await this.store.pipeline(ops);
    const best = int(await this.store.cmd('HGET', K.user(userId), 'cBest'));
    if (pts > best) await this.store.cmd('HSET', K.user(userId), 'cBest', pts);
    return true;
  }

  // ---------- you vs. your friends ----------
  async friendsBoard(meId) {
    const ids = [meId, ...(await this.friendIds(meId))];
    const rows = await this.store.pipeline(ids.map((x) => ['HMGET', K.user(x), 'name', 'rating', 'icon', 'avatarV', 'games', 'cGames', 'cWins', 'cMulti', 'cPoints', 'banned']));
    const list = ids.map((x, i) => {
      const [name, rating, icon, avatarV, games, cGames, cWins, cMulti, cPoints, banned] = rows[i] || [];
      if (!name || (int(banned) && x !== meId)) return null;
      return {
        id: x, name, tag: tagFor(x), icon: cleanIcon(icon), avatar: avatarUrl({ id: x, avatarV }), me: x === meId,
        rating: int(rating), ranked: int(games), casual: int(cGames), wins: int(cWins),
        winRate: int(cMulti) ? int(cWins) / int(cMulti) : 0, avgPoints: int(cGames) ? Math.round(int(cPoints) / int(cGames)) : 0,
      };
    }).filter(Boolean);
    const byRating = [...list].sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name));
    const byWins = [...list].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name));
    return { byRating, byWins };
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
    const gifts = await this.applyPendingGrants(id, email);
    return { token, user: await this.selfUser(await this.getUser(id)), gifts };
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
    if (int(u.banned)) throw new AccountError(`This account is banned${u.banReason ? `: ${u.banReason}` : ''}.`);
    const token = await this.newSession(id, pv);
    return { token, user: await this.selfUser(await this.getUser(id)) };
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
    if (int(u.banned)) throw new AccountError(`This account is banned${u.banReason ? `: ${u.banReason}` : ''}.`);
    const token = await this.newSession(u.id, int(u.pv));
    const gifts = await this.applyPendingGrants(u.id, u.email);
    return { token, user: await this.selfUser(gifts.length ? await this.getUser(u.id) : u), gifts };
  }

  async session(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const val = await this.store.cmd('GET', K.sess(token));
    if (!val) return null;
    const [id, pv] = String(val).split('.');
    const u = await this.getUser(id);
    if (!u) return null;
    if (int(pv) !== int(u.pv)) return null; // password changed since this login
    if (int(u.banned)) return null;
    return this.selfUser(u);
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

  // viewerIsAdmin: admins see hidden accounts too (flagged hiddenAcct so the page can mark them).
  async leaderboard(board = 'overall', meId = null, viewerIsAdmin = false) {
    if (board !== 'overall' && !(packs.byId.get(board) || {}).ranked) throw new AccountError('Unknown leaderboard');
    const flat = await this.store.cmd('ZREVRANGE', K.board(board), 0, TOP_N - 1, 'WITHSCORES');
    const rows = [];
    for (let i = 0; i < flat.length; i += 2) rows.push({ id: flat[i], value: Number(flat[i + 1]) });
    const names = rows.length ? await this.store.pipeline(rows.map((r) => ['HMGET', K.user(r.id), 'name', 'rating', 'icon', 'hidden', 'avatarV'])) : [];
    const friends = await this.friendIds(meId);
    const entries = rows.map((r, i) => {
      const [name, rating, icon, hidden, avatarV] = names[i] || [];
      const masked = int(hidden) && r.id !== meId && !friends.has(r.id) && !viewerIsAdmin; // hidden account: no name, no link
      return {
        rank: i + 1, id: masked ? null : r.id, name: masked ? 'Hidden player' : name || 'Player', tag: masked ? '' : tagFor(r.id),
        icon: masked ? '' : cleanIcon(icon), avatar: masked ? '' : avatarUrl({ id: r.id, avatarV }), hidden: !!masked,
        hiddenAcct: !!(viewerIsAdmin && int(hidden)),
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

  async profile(id, viewerId = null, viewerIsAdmin = false) {
    const u = await this.getUser(id);
    if (!u) throw new AccountError('No player with that id');
    if (int(u.banned) && viewerId !== id && !viewerIsAdmin) throw new AccountError('That player isn\'t available');
    if (int(u.hidden) && viewerId !== id && !viewerIsAdmin && !(await this.areFriends(viewerId, id))) {
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
      id: u.id, name: u.name, tag: tagFor(u.id), icon: cleanIcon(u.icon), avatar: avatarUrl(u), hidden: !!int(u.hidden), created: int(u.created),
      casual: {
        games: int(u.cGames), wins: int(u.cWins), multi: int(u.cMulti), songs: int(u.cSongs), correct: int(u.cCorrect),
        winRate: int(u.cMulti) ? int(u.cWins) / int(u.cMulti) : 0,
        accuracy: int(u.cSongs) ? int(u.cCorrect) / int(u.cSongs) : 0,
        firstTry: int(u.cCorrect) ? int(u.cFirst) / int(u.cCorrect) : 0,
        avgPoints: int(u.cGames) ? Math.round(int(u.cPoints) / int(u.cGames)) : 0,
        best: int(u.cBest),
      },
      ...(viewerIsAdmin ? { admin: await this.adminView(id) } : {}),
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
    const info = ids.length ? await this.store.pipeline(ids.map((x) => ['HMGET', K.user(x), 'name', 'rating', 'icon', 'avatarV'])) : [];
    const who = new Map(ids.map((x, i) => [x, { id: x, name: (info[i] && info[i][0]) || null, tag: tagFor(x), rating: int(info[i] && info[i][1]), icon: cleanIcon(info[i] && info[i][2]), avatar: avatarUrl({ id: x, avatarV: info[i] && info[i][3] }) }]));
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

module.exports = { Accounts, AccountError, ppFor, ratingFrom, tagFor, ICONS, parseImage, SHOP };
