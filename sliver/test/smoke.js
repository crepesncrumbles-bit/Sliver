// End-to-end server test: two players, demo songs, full game.
// Run: npm test   (starts its own server on port 3999)

const { spawn } = require('child_process');
const path = require('path');
const { pointsForLength } = require('../server/game');

const PORT = 3999;
const URL = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal client speaking the same protocol as public/app.js (needs Node 22+ global WebSocket).
function client() {
  const ws = new WebSocket(URL.replace('http', 'ws') + '/ws');
  const ready = new Promise((r) => ws.addEventListener('open', r));
  const pending = new Map();
  let nextId = 1;
  const s = { last: null, pool: null };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.ack !== undefined) { pending.get(m.ack)(m.d); pending.delete(m.ack); }
    else if (m.e === 'state') s.last = m.d;
    else if (m.e === 'pool') s.pool = m.d.songs;
  });
  s.emit = async (e, d) => { await ready; ws.send(JSON.stringify({ e, d: d || {} })); };
  s.call = async (e, d) => {
    await ready;
    return new Promise((res) => { const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ e, d: d || {}, id })); });
  };
  s.disconnect = () => ws.close();
  s.until = async (pred, ms = 5000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (s.last && pred(s.last)) return s.last; await wait(25); }
    throw new Error('timeout waiting for state');
  };
  return s;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));

  try {
    console.log('scoring');
    check(pointsForLength(0.1) === 10000, '0.1s = 10,000');
    const table = { 0.5: 7388, 1: 6417, 3: 5093, 10: 4006, 30: 3500 };
    check(Object.entries(table).every(([l, v]) => pointsForLength(Number(l)) === v), 'matches Songless: 0.5s 7,388 · 1s 6,417 · 3s 5,093 · 10s 4,006 · 30s 3,500');
    check(pointsForLength(0) === 10000, 'unheard counts as 0.1s');

    // Direct check of a correct guess (the answer is hidden over the network).
    {
      const { RoomManager } = require('../server/game');
      const fakeIo = { to: () => ({ emit() {} }) };
      const mgr = new RoomManager(fakeIo);
      const room = mgr.create();
      const p = room.addPlayer('Unit', { id: 'u1' });
      await room.addSource('demo', 'Unit');
      room.settings.rounds = 1;
      await room.start();
      const answer = room.round.track.poolId;
      const wrongId = room.pool.find((t) => t.poolId !== answer).poolId;
      room.reportListen(p.id, 2);
      room.guess(p.id, wrongId);
      const r = room.guess(p.id, answer);
      check(r.correct && r.points === pointsForLength(2) - 500, `correct after 1 wrong at 2s = ${pointsForLength(2) - 500} pts`);
      check(room.phase === 'reveal' && p.score === r.points, 'round ends when everyone is done; score added');
      room.clearTimers();
    }
    {
      const { RoomManager } = require('../server/game');
      const room = new RoomManager({ to: () => ({ emit() {} }) }).create();
      const p = room.addPlayer('Unit', { id: 'u2' });
      await room.addSource('demo', 'Unit');
      Object.assign(room.settings, { rounds: 1, roundTime: 0, maxGuesses: 0 });
      await room.start();
      check(room.round.endsAt === null && !room.timers.round, 'no time limit: no countdown, round waits for players');
      const answer = room.round.track.poolId;
      const wrong = room.pool.filter((t) => t.poolId !== answer).slice(0, 6);
      for (const t of wrong) room.guess(p.id, t.poolId);
      check(room.resultFor(p.id).status === 'playing', 'unlimited guesses: still playing after 6 wrong');
      let dupErr = null; try { room.guess(p.id, wrong[0].poolId); } catch (e) { dupErr = e.message; }
      check(/already guessed/.test(dupErr) && room.resultFor(p.id).guesses.length === 6, 'repeat guess rejected, no extra penalty');
      room.reportListen(p.id, 0.1);
      const r = room.guess(p.id, answer);
      check(r.correct && r.points === 7000 && r.guessesLeft === null, '6 wrong at 0.1s = 10,000 − 3,000 = 7,000');
      room.clearTimers();
    }

    console.log('rooms');
    const a = client(), b = client();
    const ca = await a.call('create', { name: 'Asher' });
    check(ca.ok && /^[A-Z]{4}$/.test(ca.code), 'host creates room');
    const bad = await b.call('join', { code: 'ZZZZ', name: 'X' });
    check(!bad.ok, 'bad room code rejected');
    const jb = await b.call('join', { code: ca.code.toLowerCase(), name: 'Friend' });
    check(jb.ok, 'friend joins (case-insensitive code)');
    await a.until((s) => s.players.length === 2);
    check(true, 'host sees 2 players');

    const st = await b.call('start');
    check(!st.ok, 'non-host cannot start');
    const early = await a.call('start'); await wait(100);
    check(a.last.phase === 'lobby', 'cannot start with empty song pool');

    console.log('songs');
    const sp = await b.call('addPlaylist', { input: 'https://example.com/not-music' });
    check(!sp.ok && /Spotify or Deezer/.test(sp.error), 'junk input gives clear message');
    const add = await b.call('addPlaylist', { input: 'demo' });
    check(add.ok && add.added === 12, 'friend adds 12 demo songs');
    const dup = await a.call('addPlaylist', { input: 'demo' });
    check(dup.ok && dup.added === 0, 'duplicates skipped');
    await wait(100);
    check(a.pool && a.pool.length === 12, 'pool list sent to clients');

    check(a.last.settings.maxGuesses === 0, 'default is unlimited guesses (like Songless)');
    await a.call('settings', { roundTime: 0 });
    await a.until((s) => s.settings.roundTime === 0);
    check(true, 'host can pick "no time limit"');
    await a.call('settings', { rounds: 3 });
    await a.call('settings', { roundTime: 20, maxGuesses: 3 });
    await a.until((s) => s.settings.rounds === 3 && s.settings.maxGuesses === 3 && s.settings.roundTime === 20);
    check(true, 'host sets 3 rounds');

    console.log('game');
    await a.call('start');
    const r1 = await a.until((s) => s.phase === 'round');
    check(r1.round.num === 1 && r1.round.offset === 0, 'round 1 plays from the start of the 30 s clip');
    check(!JSON.stringify(r1).match(/"title"/), 'answer hidden from clients during round');

    const clipRes = await fetch(URL + r1.round.clipUrl);
    const clipBuf = Buffer.from(await clipRes.arrayBuffer());
    check(clipRes.ok && clipBuf.slice(0, 4).toString() === 'RIFF', 'clip streams as audio');
    check((await fetch(URL + `/api/clip/${ca.code}/wrongnonce`)).status === 404, 'wrong clip nonce 404s');

    // Find the answer by testing guesses: host listens 2s, guesses wrong once then searches.
    a.emit('listen', { seconds: 2 });
    await wait(50);
    let correctId = null, wrongCount = 0, res;
    for (const song of a.pool) {
      res = await a.call('guess', { songId: song.id });
      if (res.correct) { correctId = song.id; break; }
      wrongCount++;
      if (res.guessesLeft === 0) break;
    }
    if (correctId === null) {
      check(a.last.round.my.status === 'out', 'host out after 3 wrong guesses');
    } else {
      const expect = Math.max(0, pointsForLength(2) - wrongCount * 500);
      check(res.points === expect + 500 && res.bonus === 500, `correct guess scores ${expect} + 500 for being first (2s heard, ${wrongCount} wrong)`);
    }
    const after = await a.call('guess', { songId: 0 });
    check(!after.ok, 'no more guesses once done');

    b.emit('giveUp');
    const rev = await a.until((s) => s.phase === 'reveal');
    check(!!rev.reveal.title && rev.reveal.results.length === 2, 'reveal shows song + both players');
    const bRes = rev.reveal.results.find((r) => r.name === 'Friend');
    check(bRes.status === 'gave-up' && bRes.points === 0, 'friend gave up, 0 pts');

    console.log('reconnect');
    b.disconnect();
    await wait(150);
    const b2 = client();
    const rj = await b2.call('join', { code: ca.code, token: jb.token });
    check(rj.ok && rj.playerId === jb.playerId, 'friend rejoins as same player after refresh');

    console.log('rounds 2-3');
    await a.call('next');
    await a.until((s) => s.phase === 'round' && s.round.num === 2);
    check(true, 'host advances to round 2');
    await a.call('next'); // host ends round early
    await a.until((s) => s.phase === 'reveal');
    check(a.last.reveal.results.every((r) => r.status === 'timeout'), 'end round early marks unguessed as timeout');
    await a.call('next');
    await a.until((s) => s.phase === 'round' && s.round.num === 3);
    a.emit('giveUp'); b2.emit('giveUp');
    await a.until((s) => s.phase === 'reveal' && s.reveal.last);
    check(true, 'round 3 is flagged last');
    await a.call('next');
    const fin = await a.until((s) => s.phase === 'results');
    check(fin.players.length === 2, 'results screen after 3 rounds');

    console.log('host handoff');
    a.disconnect();
    const ho = await b2.until((s) => s.hostId === jb.playerId);
    check(!!ho, 'friend becomes host when host leaves');

    await b2.call('start');
    await b2.until((s) => s.phase === 'round');
    check(b2.last.players.every((p) => p.score === 0), 'play again resets scores');
    b2.disconnect();
  } catch (err) {
    failed++;
    console.error('  ✗ crashed:', err);
  } finally {
    srv.kill();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();
