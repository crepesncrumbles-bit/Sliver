// Sliver server: serves the game page, runs rooms over WebSockets, and streams song clips.
// Uses only Node's standard library — no `npm install` needed.

const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { Realtime } = require('./realtime');
const { RoomManager } = require('./game');
const { createStore } = require('./store');
const { Accounts, AccountError } = require('./accounts');
const { createMailer } = require('./mailer');
const { searchArtists } = require('./deezer');
const { spotifyPlays } = require('./spotifyweb');
const { Stats } = require('./stats');
const crypto = require('crypto');
const ICONS = require('../public/icons.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const demoOnly = process.argv.includes('--demo-only') || process.env.DEMO_ONLY === '1';
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|docker|br-|utun|awdl|llw/i.test(name)) continue;
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  // Prefer typical home Wi-Fi ranges first.
  return out.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0));
}

let rooms; // set below
const store = createStore({ dir: process.env.DATA_DIR });
const mailer = createMailer();
const accounts = new Accounts(store, mailer);
const stats = new Stats(store);
const STARTED = Date.now();
// Admin page (/admin.html): set ADMIN_KEY on Render to turn it on.
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();

// ---------- small JSON API helpers ----------
const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AccountError('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new AccountError('Bad request')); }
    });
    req.on('error', reject);
  });
}
const bearer = (req) => (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/) || [])[1] || null;
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// Login/sign-up attempts per IP: 20 per 10 minutes.
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  attempts.set(ip, list);
  if (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
  return list.length > 40;
}

async function handleApi(req, res, p, url) {
  try {
    const authRoutes = {
      '/api/signup': (b) => accounts.signup(b),
      '/api/login': (b) => accounts.login(b),
      '/api/signup/verify': (b) => accounts.verifySignup(b),
      '/api/signup/resend': (b) => accounts.resendSignup(b),
      '/api/reset/start': (b) => accounts.startReset(b),
      '/api/reset/finish': (b) => accounts.finishReset(b),
    };
    if (authRoutes[p]) {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
      if (rateLimited(clientIp(req))) return sendJson(res, 429, { ok: false, error: 'Too many tries. Wait a few minutes.' });
      const body = await readBody(req);
      const out = await authRoutes[p](body);
      if (out && out.token && (p === '/api/signup' || p === '/api/signup/verify')) stats.bump('signups');
      return sendJson(res, 200, { ok: true, ...out });
    }
    if (p === '/api/logout') {
      await accounts.logout(bearer(req));
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/me') {
      const user = await accounts.session(bearer(req));
      return sendJson(res, 200, { ok: true, user });
    }
    if (p === '/api/leaderboard') {
      const me = await accounts.session(bearer(req));
      const out = await accounts.leaderboard(url.searchParams.get('board') || 'overall', me && me.id);
      return sendJson(res, 200, { ok: true, ...out });
    }
    if (p.startsWith('/api/friends')) return await handleFriends(req, res, p);
    if (p === '/api/admin/stats') return await handleAdmin(req, res, url);
    if (p === '/api/me/settings') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
      const me = await accounts.session(bearer(req));
      if (!me) return sendJson(res, 401, { ok: false, error: 'Log in first' });
      const body = await readBody(req);
      const out = await accounts.updateSettings(me.id, { icon: body.icon, hidden: body.hidden });
      refreshUserInRooms(out.user);
      return sendJson(res, 200, { ok: true, ...out });
    }
    const prof = p.match(/^\/api\/profile\/([\w-]{6,40})$/);
    if (prof) {
      const viewer = await accounts.session(bearer(req));
      return sendJson(res, 200, { ok: true, profile: await accounts.profile(prof[1], viewer && viewer.id) });
    }
    if (p === '/api/artists') {
      if (demoOnly) return sendJson(res, 200, { ok: true, artists: [] });
      const artists = await searchArtists(url.searchParams.get('q')).catch(() => []);
      return sendJson(res, 200, { ok: true, artists });
    }
    return sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    if (err instanceof AccountError) return sendJson(res, 400, { ok: false, error: err.message });
    console.error('API error:', err.message, err.cause ? `(${err.cause.message})` : '');
    const dbProblem = /Upstash|Database|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(err.message + (err.cause ? err.cause.message : ''));
    return sendJson(res, 500, { ok: false, error: dbProblem
      ? 'The account database isn\'t answering. If you run this site, check the Render logs for "Database check".'
      : 'Something went wrong on the server. Try again.' });
  }
}

// ---------- admin ----------
function adminKeyOk(given) {
  if (!ADMIN_KEY || !given) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(String(given)).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(ADMIN_KEY).digest('hex'));
  return crypto.timingSafeEqual(a, b);
}
async function handleAdmin(req, res, url) {
  if (!ADMIN_KEY) return sendJson(res, 404, { ok: false, error: 'The admin page is off. Add ADMIN_KEY in Render → Environment to turn it on.' });
  const given = req.headers['x-admin-key'] || url.searchParams.get('key');
  if (!adminKeyOk(given)) {
    if (rateLimited(`admin:${clientIp(req)}`)) return sendJson(res, 429, { ok: false, error: 'Too many tries. Wait a few minutes.' });
    return sendJson(res, 401, { ok: false, error: 'Wrong admin key' });
  }
  const list = [...rooms.rooms.values()];
  const connected = (r) => [...r.players.values()].filter((p) => p.connected);
  const live = {
    rooms: list.length,
    activeRooms: list.filter((r) => connected(r).length).length,
    playing: list.filter((r) => connected(r).length && ['loading', 'round', 'reveal'].includes(r.phase)).length,
    rankedNow: list.filter((r) => connected(r).length && r.game && r.game.ranked).length,
    players: list.reduce((n, r) => n + connected(r).length, 0),
    onlineAccounts: userSockets.size,
    connections: contexts.size,
    roomList: list.filter((r) => r.players.size).map((r) => {
      const host = r.players.get(r.hostId);
      return {
        code: r.code, phase: r.phase, players: connected(r).length, total: r.players.size,
        host: host ? host.name : null, ranked: !!(r.game ? r.game.ranked : r.settings.ranked),
        mode: [r.settings.hard && 'Hard', r.settings.chaos && 'Chaos'].filter(Boolean).join(' + ') || 'Classic',
        songs: r.pool.length, round: r.round ? r.round.num : null, idleMin: Math.round((Date.now() - r.lastActive) / 60000),
      };
    }).sort((a, b) => b.players - a.players),
  };
  const counts = await stats.read();
  const board = await accounts.leaderboard('overall').catch(() => ({ entries: [] }));
  return sendJson(res, 200, {
    ok: true,
    now: Date.now(),
    server: {
      uptimeMin: Math.round((Date.now() - STARTED) / 60000),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      node: process.version,
      database: store.kind === 'upstash' ? 'Upstash' : 'local file',
      emailCodes: mailer ? mailer.kind : 'off',
    },
    live,
    ...counts,
    top: board.entries.slice(0, 10).map((e) => ({ rank: e.rank, name: e.hidden ? 'Hidden player' : e.name, tag: e.tag, rating: e.value })),
  });
}

// ---------- friends ----------
// Who's online: userId -> Set of socket ids (one person can have several tabs or devices).
const userSockets = new Map();
function setOnline(userId, socketId, on) {
  if (!userId) return;
  const set = userSockets.get(userId) || new Set();
  if (on) set.add(socketId); else set.delete(socketId);
  if (set.size) userSockets.set(userId, set); else userSockets.delete(userId);
}
// Account settings changed (icon, hidden): update that person in any room they're in.
function refreshUserInRooms(user) {
  for (const sid of userSockets.get(user.id) || []) {
    const ctx = contexts.get(sid);
    if (!ctx) continue;
    ctx.setUser(user);
    const r = ctx.room(), pl = ctx.player();
    if (r && pl && !(r.game && r.game.ranked)) { r.setAccount(pl.id, user); r.broadcast(); }
  }
}
function notifyUser(userId, event, data) {
  for (const sid of userSockets.get(userId) || []) io.to(sid).emit(event, data);
}
// What a friend can see about you: online, and the room you're in (so they can join).
function presence(userId) {
  const sids = userSockets.get(userId);
  if (!sids || !sids.size) return { online: false, room: null };
  for (const sid of sids) {
    const ctx = contexts.get(sid);
    const r = ctx && ctx.room();
    if (r) return { online: true, room: r.code, playing: r.phase !== 'lobby' && r.phase !== 'results', ranked: !!(r.game && r.game.ranked) };
  }
  return { online: true, room: null };
}

async function handleFriends(req, res, p) {
  const me = await accounts.session(bearer(req));
  if (!me) return sendJson(res, 401, { ok: false, error: 'Log in to use friends' });
  if (p === '/api/friends' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, ...(await accounts.friends(me.id, presence)) });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
  const body = await readBody(req);
  const other = body.id ? String(body.id) : null;
  const needId = () => { if (!other) throw new AccountError('Pick a player'); return other; };
  let out;
  switch (p) {
    case '/api/friends/request':
      if (rateLimited(`friend:${me.id}`)) return sendJson(res, 429, { ok: false, error: 'Too many friend requests. Wait a few minutes.' });
      out = await accounts.requestFriend(me.id, { code: body.code, id: other });
      notifyUser(out.other, 'friendsChanged', out.status === 'sent'
        ? { text: `${me.name} #${me.tag} sent you a friend request` }
        : { text: `${me.name} accepted your friend request` });
      break;
    case '/api/friends/accept':
      out = await accounts.acceptFriend(me.id, needId());
      notifyUser(out.other, 'friendsChanged', { text: `${me.name} accepted your friend request` });
      break;
    case '/api/friends/remove':
      out = await accounts.removeFriend(me.id, needId());
      notifyUser(out.other, 'friendsChanged', {});
      break;
    case '/api/friends/block':
      out = await accounts.block(me.id, needId());
      notifyUser(out.other, 'friendsChanged', {});
      break;
    case '/api/friends/unblock':
      out = await accounts.unblock(me.id, needId());
      break;
    default:
      return sendJson(res, 404, { ok: false, error: 'Not found' });
  }
  return sendJson(res, 200, { ok: true, ...out, ...(await accounts.friends(me.id, presence)) });
}

const API_PATHS = /^\/api\/(signup|signup\/verify|signup\/resend|reset\/start|reset\/finish|login|logout|me|leaderboard|profile\/[\w-]+|artists|me\/settings|admin\/stats|friends(\/(request|accept|remove|block|unblock))?)$/;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (API_PATHS.test(p)) return handleApi(req, res, p, url);

  if (p === '/api/info') {
    // When hosted (Render sets RENDER=true), there's no Wi-Fi address to share: use the public URL.
    const lan = process.env.RENDER ? [] : lanAddresses().map((ip) => `http://${ip}:${PORT}`);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ port: PORT, lan, demoOnly, accounts: store.kind, emailCodes: !!mailer }));
  }

  // The clip URL hides which song it is: only the room code and a per-round random nonce.
  const clip = p.match(/^\/api\/clip\/([A-Za-z]{4})\/([\w-]+)$/);
  if (clip) {
    const room = rooms.get(clip[1]);
    const round = room && room.round;
    if (!round || round.nonce !== clip[2] || !round.clip) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': round.clip.contentType,
      'Content-Length': round.clip.buffer.length,
      'Cache-Control': 'private, max-age=600',
    });
    return res.end(round.clip.buffer);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

const io = new Realtime(server, '/ws');
// After a ranked game: save each player's score, then tell them how it went.
async function onRanked(room, entries) {
  for (const e of entries) {
    try {
      const result = await accounts.submitRanked(e.userId, e);
      const p = room.players.get(e.playerId);
      if (p && p.connected) io.to(p.socketId).emit('rankedResult', result);
    } catch (err) {
      console.error('ranked save failed:', err.message);
      const p = room.players.get(e.playerId);
      if (p && p.connected) io.to(p.socketId).emit('toast', { kind: 'error', text: 'Couldn\'t save your ranked score. Sorry!' });
    }
  }
}

rooms = new RoomManager(io, {
  demoOnly,
  onStat: (name) => stats.bump(name),
  popularity: !process.env.NO_POPULARITY,
  packCacheMs: 20 * 60 * 1000,
  plays: demoOnly || process.env.NO_PLAYS ? null : spotifyPlays,
  onRanked,
});

const contexts = new Map(); // socket id -> { drop() } so a kick can detach that player's socket

// Peak players (for the admin page): checked on every join and every 20 s, saved at most once a minute.
function notePlayers() {
  let n = 0;
  for (const r of rooms.rooms.values()) for (const p of r.players.values()) if (p.connected) n++;
  stats.notePlayers(n);
}
setInterval(notePlayers, 20 * 1000).unref();

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  let user = null; // logged-in account on this connection
  contexts.set(socket.id, {
    drop: () => { if (room) socket.leaveRoom(room.code); room = null; player = null; },
    room: () => (room && rooms.get(room.code) === room ? room : null),
    player: () => player,
    setUser: (u) => { if (user && u && user.id === u.id) user = { ...user, ...u }; },
  });
  const useAuth = async (token) => {
    const before = user;
    user = token ? await accounts.session(token).catch(() => null) : null;
    if (before && (!user || before.id !== user.id)) setOnline(before.id, socket.id, false);
    if (user) setOnline(user.id, socket.id, true);
    return user;
  };

  const fail = (ack, err) => ack && ack({ ok: false, error: err.message || String(err) });
  const need = (ack) => {
    if (!room || !player) { fail(ack, new Error('Join a room first')); return false; }
    return true;
  };
  const hostOnly = (ack) => {
    if (!need(ack)) return false;
    if (room.hostId !== player.id) { fail(ack, new Error('Only the host can do that')); return false; }
    return true;
  };
  const sendPool = () => socket.emit('pool', { version: room.poolVersion, songs: room.poolList() });

  socket.on('create', async ({ name, auth, icon } = {}, ack) => {
    if (auth !== undefined) await useAuth(auth);
    if (room) socket.leaveRoom(room.code);
    room = rooms.create();
    player = room.addPlayer(name, socket, icon);
    room.setAccount(player.id, user);
    socket.join(room.code);
    ack && ack({ ok: true, code: room.code, token: player.token, playerId: player.id });
    sendPool();
    room.broadcast();
    notePlayers();
  });

  socket.on('join', async ({ code, name, token, auth, icon } = {}, ack) => {
    if (auth !== undefined) await useAuth(auth);
    const r = rooms.get(code);
    if (!r) return fail(ack, new Error(`No room called ${String(code || '').toUpperCase()} — it may have closed`));
    if (token && r.kickedTokens.has(token)) return fail(ack, new Error('The host removed you from this room'));
    let p = token ? r.reconnect(token, socket) : null;
    if (!p) {
      if (r.players.size >= 12) return fail(ack, new Error('Room is full (12 players)'));
      if (r.game && r.game.ranked) return fail(ack, new Error('A ranked game is running in that room. Join when it ends.'));
      const host = r.players.get(r.hostId);
      if (user && host && host.userId && await accounts.isBlockedEitherWay(host.userId, user.id).catch(() => false)) {
        return fail(ack, new Error('You can\'t join this room'));
      }
      p = r.addPlayer(name, socket, icon);
    } else if (icon !== undefined) {
      p.icon = ICONS.includes(icon) ? icon : '';
    }
    room = r; player = p;
    // Keep the account a ranked player started with, even if this device lost its login.
    if (user || !(r.game && r.game.ranked)) r.setAccount(p.id, user);
    socket.join(room.code);
    ack && ack({ ok: true, code: room.code, token: p.token, playerId: p.id });
    sendPool();
    room.broadcast();
    notePlayers();
  });

  socket.on('getPool', () => room && sendPool());

  socket.on('setIcon', ({ icon } = {}, ack) => {
    if (room && player) room.setIcon(player.id, icon);
    ack && ack({ ok: true });
  });

  // Logged in or out while connected.
  socket.on('auth', async ({ token } = {}, ack) => {
    await useAuth(token);
    if (room && player && !(room.game && room.game.ranked)) {
      room.setAccount(player.id, user);
      room.broadcast();
    }
    ack && ack({ ok: true, user });
  });

  socket.on('addPlaylist', async ({ input, packId, artistId, artistMode } = {}, ack) => {
    if (!need(ack)) return;
    if (room.phase !== 'lobby' && room.phase !== 'results') return fail(ack, new Error('Add songs between games'));
    if (room.settings.hostOnlySongs && room.hostId !== player.id) return fail(ack, new Error('The host turned on "Only the host adds songs"'));
    try {
      const result = await room.addSource({ input, packId, artistId, artistMode }, { name: player.name, id: player.id });
      ack && ack({ ok: true, ...result });
      io.to(room.code).emit('toast', { kind: 'info', text: `${player.name} added ${result.added} songs from "${result.name}"` });
      io.to(room.code).emit('pool', { version: room.poolVersion, songs: room.poolList() });
      room.broadcast();
    } catch (err) {
      const msg = /fetch failed|ENOTFOUND|EAI_AGAIN/i.test(err.message + (err.cause ? err.cause.message : ''))
        ? 'Couldn\'t reach Spotify/Deezer/Anghami. Is this laptop online? You can still play with "demo".'
        : err.message;
      fail(ack, new Error(msg));
    }
  });

  socket.on('removeSource', ({ key } = {}, ack) => {
    if (!need(ack)) return;
    try {
      if (room.settings.hostOnlySongs && room.hostId !== player.id) throw new Error('Only the host can change songs right now');
      const { name } = room.removeSource(key, player);
      ack && ack({ ok: true });
      io.to(room.code).emit('toast', { kind: 'info', text: `${player.name} removed "${name}"` });
      io.to(room.code).emit('pool', { version: room.poolVersion, songs: room.poolList() });
      room.broadcast();
    } catch (err) { fail(ack, err); }
  });

  socket.on('clearPool', (_, ack) => {
    if (!hostOnly(ack)) return;
    room.clearPool();
    io.to(room.code).emit('pool', { version: room.poolVersion, songs: [] });
    room.broadcast();
    ack && ack({ ok: true });
  });

  // Send only the fields being changed. roundTime 0 = no limit, maxGuesses 0 = unlimited.
  socket.on('settings', (s = {}, ack) => {
    if (!hostOnly(ack)) return;
    try {
      const before = room.poolVersion;
      room.updateSettings(s);
      if (room.poolVersion !== before) io.to(room.code).emit('pool', { version: room.poolVersion, songs: room.poolList() });
      ack && ack({ ok: true });
    } catch (err) { fail(ack, err); }
  });

  socket.on('rankedPack', async ({ packId } = {}, ack) => {
    if (!hostOnly(ack)) return;
    const r = room;
    try {
      await r.setRankedPack(packId);
      io.to(r.code).emit('pool', { version: r.poolVersion, songs: r.poolList() });
      ack && ack({ ok: true });
    } catch (err) {
      const msg = /fetch failed|ENOTFOUND|EAI_AGAIN/i.test(err.message + (err.cause ? err.cause.message : ''))
        ? 'Couldn\'t reach Spotify/Deezer to load that genre.' : err.message;
      fail(ack, new Error(msg));
    }
  });

  socket.on('transferHost', ({ playerId } = {}, ack) => {
    if (!hostOnly(ack)) return;
    try { room.transferHost(player.id, playerId); ack && ack({ ok: true }); } catch (err) { fail(ack, err); }
  });

  socket.on('start', async (_, ack) => {
    if (!hostOnly(ack)) return;
    try {
      const r = room;
      if (!r.settings.ranked && r.pool.length < 2) throw new Error('Add a playlist with at least 2 songs first');
      if (r.settings.ranked) {
        // Re-check everyone's login right before a ranked game.
        for (const p of r.players.values()) {
          if (!p.connected) continue;
          if (p.userId && !(await accounts.getUser(p.userId))) r.setAccount(p.id, null);
        }
      }
      await r.start();
      io.to(r.code).emit('pool', { version: r.poolVersion, songs: r.poolList() });
      ack && ack({ ok: true });
    } catch (err) {
      ack ? fail(ack, err) : socket.emit('toast', { kind: 'error', text: err.message });
    }
  });

  socket.on('listen', ({ seconds } = {}) => {
    if (room && player) room.reportListen(player.id, seconds);
  });

  socket.on('guess', ({ songId } = {}, ack) => {
    if (!need(ack)) return;
    try { ack && ack({ ok: true, ...room.guess(player.id, songId) }); } catch (err) { fail(ack, err); }
  });

  socket.on('guessText', ({ text } = {}, ack) => {
    if (!need(ack)) return;
    try { ack && ack({ ok: true, ...room.guessText(player.id, text) }); } catch (err) { fail(ack, err); }
  });

  socket.on('giveUp', () => room && player && room.giveUp(player.id));

  socket.on('next', async (_, ack) => {
    if (!hostOnly(ack)) return;
    if (room.phase === 'reveal') {
      ack && ack({ ok: true });
      await room.nextRound().catch((e) => socket.emit('toast', { kind: 'error', text: e.message }));
    } else if (room.phase === 'round') {
      room.endRound();
      ack && ack({ ok: true });
    } else {
      ack && ack({ ok: true });
    }
  });

  socket.on('endGame', (_, ack) => {
    if (!hostOnly(ack)) return;
    room.endGame(player.name);
    ack && ack({ ok: true });
  });

  socket.on('lobby', (_, ack) => {
    if (!hostOnly(ack)) return;
    room.backToLobby();
    ack && ack({ ok: true });
  });

  socket.on('kick', ({ playerId } = {}, ack) => {
    if (!need(ack)) return;
    try {
      if (room.hostId !== player.id) throw new Error('Only the host can remove players');
      const t = room.players.get(playerId);
      const ctx = t && t.id !== player.id && contexts.get(t.socketId);
      const r = room;
      if (ctx) ctx.drop(); // detach them first so they don't get the room-wide notice
      const target = r.kick(player.id, playerId);
      io.to(target.socketId).emit('kicked', { by: player.name });
      ack && ack({ ok: true });
    } catch (err) { fail(ack, err); }
  });

  socket.on('leave', (_, ack) => {
    if (room && player) {
      const r = room;
      socket.leaveRoom(r.code);
      r.leave(player.id);
      if (!r.players.size) rooms.sweep();
    }
    room = null; player = null;
    ack && ack({ ok: true });
  });

  // Invite a friend into the room you're in. They get a pop-up with a Join button.
  const lastInvite = new Map(); // friendId -> time
  socket.on('invite', async ({ userId } = {}, ack) => {
    try {
      if (!user) throw new Error('Log in to invite friends');
      if (!need(ack)) return;
      userId = String(userId || '');
      if (!(await accounts.areFriends(user.id, userId))) throw new Error('You can only invite friends');
      if (await accounts.isBlockedEitherWay(user.id, userId)) throw new Error('You can\'t invite that player');
      if (!userSockets.has(userId)) throw new Error('They\'re offline right now. Send them the invite link instead.');
      if ([...room.players.values()].some((x) => x.userId === userId && x.connected)) throw new Error('They\'re already in this room');
      if (Date.now() - (lastInvite.get(userId) || 0) < 10000) throw new Error('Invite sent. Give them a few seconds.');
      lastInvite.set(userId, Date.now());
      notifyUser(userId, 'invite', { from: { id: user.id, name: user.name, tag: user.tag }, code: room.code });
      ack && ack({ ok: true });
    } catch (err) { fail(ack, err); }
  });

  socket.on('disconnect', () => {
    if (user) setOnline(user.id, socket.id, false);
    contexts.delete(socket.id);
    if (room) room.disconnect(socket.id);
  });
});

server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log('\n  🎵 Sliver is running!\n');
  console.log(mailer ? `  Email codes: on (${mailer.kind}, from ${mailer.from})` : '  Email codes: off (sign-ups don\'t need a code; see README to turn on)');
  console.log(ADMIN_KEY ? '  Admin page: on (/admin.html)' : '  Admin page: off (set ADMIN_KEY to turn it on)');
  if (mailer && mailer.check) {
    mailer.check().then(
      (r) => console.log(`  Email check: ${r}`),
      (e) => console.error(`  ⚠ Email check FAILED: ${e.message}`),
    );
  }
  if (store.kind === 'upstash') {
    console.log('  Accounts: saved in your Upstash database');
    store.cmd('PING').then(
      (r) => console.log(`  Database check: ${r === 'PONG' ? 'connected ✓' : 'unexpected reply ' + JSON.stringify(r)}`),
      (e) => console.error(`  ⚠ Database check FAILED: ${e.message}${e.cause ? ' (' + e.cause.message + ')' : ''}`),
    );
  }
  else if (process.env.RENDER) console.log('  ⚠ Accounts are saved on Render\'s temporary disk and will reset. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (see README).');
  else console.log(`  Accounts: saved in ${store.file}`);
  console.log(`  On this laptop:     http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Friends on Wi-Fi:   http://${ip}:${PORT}`);
  if (demoOnly) console.log('\n  (Demo-only mode: built-in songs, no internet needed)');
  console.log('\n  Keep this window open while you play. Press Ctrl+C to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — Sliver is probably already running in another window.`);
    console.error(`  Close that window, or start on another port:  PORT=3001 node server/index.js\n`);
    process.exit(1);
  }
  throw err;
});
