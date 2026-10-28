// Sliver server: serves the game page, runs rooms over WebSockets, and streams song clips.
// Uses only Node's standard library — no `npm install` needed.

const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { Realtime } = require('./realtime');
const { RoomManager } = require('./game');

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

  if (p === '/api/info') {
    // When hosted (Render sets RENDER=true), there's no Wi-Fi address to share: use the public URL.
    const lan = process.env.RENDER ? [] : lanAddresses().map((ip) => `http://${ip}:${PORT}`);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ port: PORT, lan, demoOnly }));
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
rooms = new RoomManager(io, { demoOnly });

const contexts = new Map(); // socket id -> { drop() } so a kick can detach that player's socket

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  contexts.set(socket.id, {
    drop: () => { if (room) socket.leaveRoom(room.code); room = null; player = null; },
  });

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

  socket.on('create', ({ name } = {}, ack) => {
    if (room) socket.leaveRoom(room.code);
    room = rooms.create();
    player = room.addPlayer(name, socket);
    socket.join(room.code);
    ack && ack({ ok: true, code: room.code, token: player.token, playerId: player.id });
    sendPool();
    room.broadcast();
  });

  socket.on('join', ({ code, name, token } = {}, ack) => {
    const r = rooms.get(code);
    if (!r) return fail(ack, new Error(`No room called ${String(code || '').toUpperCase()} — it may have closed`));
    if (token && r.kickedTokens.has(token)) return fail(ack, new Error('The host removed you from this room'));
    let p = token ? r.reconnect(token, socket) : null;
    if (!p) {
      if (r.players.size >= 12) return fail(ack, new Error('Room is full (12 players)'));
      p = r.addPlayer(name, socket);
    }
    room = r; player = p;
    socket.join(room.code);
    ack && ack({ ok: true, code: room.code, token: p.token, playerId: p.id });
    sendPool();
    room.broadcast();
  });

  socket.on('getPool', () => room && sendPool());

  socket.on('addPlaylist', async ({ input, packId } = {}, ack) => {
    if (!need(ack)) return;
    if (room.phase !== 'lobby' && room.phase !== 'results') return fail(ack, new Error('Add songs between games'));
    try {
      const result = await room.addSource({ input, packId }, { name: player.name, id: player.id });
      ack && ack({ ok: true, ...result });
      io.to(room.code).emit('toast', { kind: 'info', text: `${player.name} added ${result.added} songs from "${result.name}"` });
      io.to(room.code).emit('pool', { version: room.poolVersion, songs: room.poolList() });
      room.broadcast();
    } catch (err) {
      const msg = /fetch failed|ENOTFOUND|EAI_AGAIN/i.test(err.message + (err.cause ? err.cause.message : ''))
        ? 'Couldn\'t reach Spotify/Deezer. Is this laptop online? You can still play with "demo".'
        : err.message;
      fail(ack, new Error(msg));
    }
  });

  socket.on('removeSource', ({ key } = {}, ack) => {
    if (!need(ack)) return;
    try {
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
  socket.on('settings', ({ rounds, roundTime, maxGuesses, mode } = {}, ack) => {
    if (!hostOnly(ack)) return;
    const r = Math.round(Number(rounds));
    const t = Math.round(Number(roundTime));
    const g = Math.round(Number(maxGuesses));
    if (r >= 1 && r <= 20) room.settings.rounds = r;
    if (roundTime !== undefined && (t === 0 || (t >= 15 && t <= 300))) room.settings.roundTime = t;
    if (maxGuesses !== undefined && g >= 0 && g <= 20) room.settings.maxGuesses = g;
    if (['classic', 'hard', 'chaos'].includes(mode)) room.settings.mode = mode;
    room.broadcast();
    ack && ack({ ok: true });
  });

  socket.on('start', async (_, ack) => {
    if (!hostOnly(ack)) return;
    try {
      if (room.pool.length < 2) throw new Error('Add a playlist with at least 2 songs first');
      ack && ack({ ok: true });
      await room.start();
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

  socket.on('disconnect', () => {
    contexts.delete(socket.id);
    if (room) room.disconnect(socket.id);
  });
});

server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log('\n  🎵 Sliver is running!\n');
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
