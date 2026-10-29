// Friends: codes, requests, accept/decline, remove, block, live invites, blocked joins.
// Run: node test/friends.test.js   (starts its own server on port 3998)

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { MiniRedis } = require('../server/store');
const { Accounts } = require('../server/accounts');

const PORT = 3998;
const URL = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };
const tryErr = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(URL.replace('http', 'ws') + '/ws');
  const ready = new Promise((r) => ws.addEventListener('open', r));
  const pending = new Map();
  let nextId = 1;
  const s = { last: null, events: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.ack !== undefined) { pending.get(m.ack)(m.d); pending.delete(m.ack); }
    else if (m.e === 'state') s.last = m.d;
    else s.events.push(m);
  });
  s.call = async (e, d) => {
    await ready;
    return new Promise((res) => { const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ e, d: d || {}, id })); });
  };
  s.waitFor = async (e, ms = 3000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { const m = s.events.find((x) => x.e === e); if (m) { s.events.splice(s.events.indexOf(m), 1); return m.d; } await wait(20); }
    return null;
  };
  s.close = () => ws.close();
  return s;
}
const api = async (p, token, body) => {
  const r = await fetch(URL + p, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

(async () => {
  try {
    console.log('friend logic');
    const store = new MiniRedis();
    const acc = new Accounts(store);
    const a = (await acc.signup({ name: 'Asher', email: 'a@x.co', password: 'secret1' })).user;
    const b = (await acc.signup({ name: 'Bo', email: 'b@x.co', password: 'secret1' })).user;
    const c = (await acc.signup({ name: 'Cy', email: 'c@x.co', password: 'secret1' })).user;
    const codeA = await acc.friendCode(a.id);
    check(/^[A-Z2-9]{6}$/.test(codeA) && codeA === await acc.friendCode(a.id), 'each account gets one stable 6-character friend code');
    check(codeA !== await acc.friendCode(b.id), 'codes are unique');
    check(/your own code/.test(await tryErr(() => acc.requestFriend(a.id, { code: codeA }))), 'can\'t add yourself');
    check(/No player has the code/.test(await tryErr(() => acc.requestFriend(a.id, { code: 'ZZZZZZ' }))), 'unknown code explained');
    const sent = await acc.requestFriend(b.id, { code: codeA.toLowerCase().replace(/(...)/, '$1 ') });
    check(sent.status === 'sent' && sent.other === a.id, 'request by code (lowercase, spaces ok)');
    check(/already asked/.test(await tryErr(() => acc.requestFriend(b.id, { id: a.id }))), 'no duplicate requests');
    let fa = await acc.friends(a.id);
    check(fa.incoming.length === 1 && fa.incoming[0].name === 'Bo' && !fa.friends.length, 'shows up as an incoming request');
    check((await acc.friends(b.id)).outgoing[0].id === a.id, '…and as sent for the asker');
    await acc.acceptFriend(a.id, b.id);
    fa = await acc.friends(a.id, (id) => ({ online: id === b.id, room: null }));
    check(fa.friends.length === 1 && fa.friends[0].online && !fa.incoming.length, 'accepted: friends both ways, with online status');
    check(await acc.areFriends(b.id, a.id), 'friendship is two-way');
    check(/already friends/.test(await tryErr(() => acc.requestFriend(a.id, { id: b.id }))), 'can\'t re-add a friend');
    // mutual requests auto-accept
    await acc.requestFriend(a.id, { id: c.id });
    const mutual = await acc.requestFriend(c.id, { id: a.id });
    check(mutual.status === 'friends', 'if they already asked you, adding them makes you friends');
    await acc.removeFriend(c.id, a.id);
    check(!(await acc.areFriends(a.id, c.id)), 'remove works both ways');
    // block
    await acc.block(a.id, b.id);
    check(!(await acc.areFriends(a.id, b.id)), 'blocking unfriends');
    check(/isn't accepting/.test(await tryErr(() => acc.requestFriend(b.id, { id: a.id }))), 'blocked player can\'t send requests');
    check(/Unblock them first/.test(await tryErr(() => acc.requestFriend(a.id, { id: b.id }))), 'blocker is told to unblock first');
    check(await acc.isBlockedEitherWay(b.id, a.id), 'block detected either way');
    check((await acc.friends(a.id)).blocked[0].id === b.id, 'shows in blocked list');
    await acc.unblock(a.id, b.id);
    check(!(await acc.isBlockedEitherWay(a.id, b.id)) && (await acc.requestFriend(b.id, { id: a.id })).status === 'sent', 'unblock lets requests through again');

    console.log('live: invites and blocks over the network');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sliver-fr-'));
    const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEMO_ONLY: '1' };
    for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'RENDER']) delete env[k];
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));
    try {
      const A = await api('/api/signup', null, { name: 'Asher', email: 'a@x.co', password: 'secret1' });
      const B = await api('/api/signup', null, { name: 'Bo', email: 'b@x.co', password: 'secret1' });
      const C = await api('/api/signup', null, { name: 'Cy', email: 'c@x.co', password: 'secret1' });
      check((await api('/api/friends')).ok === false, 'friends need a login');
      const ca = client(), cb = client(), cc = client();
      await ca.call('auth', { token: A.token }); await cb.call('auth', { token: B.token }); await cc.call('auth', { token: C.token });
      const listA = await api('/api/friends', A.token);
      check(listA.ok && /^[A-Z2-9]{6}$/.test(listA.code), 'GET /api/friends gives your code');
      const req = await api('/api/friends/request', B.token, { code: listA.code });
      check(req.ok && req.outgoing.length === 1, 'request sent over the API');
      const note = await ca.waitFor('friendsChanged');
      check(note && /Bo #\d{4} sent you a friend request/.test(note.text), 'Asher gets a live "friend request" notice');
      const acc2 = await api('/api/friends/accept', A.token, { id: B.user.id });
      check(acc2.ok && acc2.friends[0].id === B.user.id && acc2.friends[0].online, 'accepted; friend shows online');
      check(!!(await cb.waitFor('friendsChanged')), 'Bo hears it was accepted');

      const room = await ca.call('create', { name: 'Asher', auth: A.token });
      const seen = await api('/api/friends', B.token);
      check(seen.friends[0].room === room.code, 'friends can see which room you\'re in');
      check((await ca.call('invite', { userId: C.user.id })).error === 'You can only invite friends', 'can\'t invite non-friends');
      const inv = await ca.call('invite', { userId: B.user.id });
      check(inv.ok, 'invite a friend');
      const got = await cb.waitFor('invite');
      check(got && got.code === room.code && got.from.name === 'Asher', 'friend gets the invite with the room code');
      check(/few seconds/.test((await ca.call('invite', { userId: B.user.id })).error || ''), 'invite spam is slowed down');
      const joinB = await cb.call('join', { code: room.code, name: 'Bo', auth: B.token });
      check(joinB.ok, 'friend joins from the invite');
      await wait(200);
      check(ca.last && ca.last.players.some((p) => p.userId === B.user.id), 'players list carries account ids (for "Add friend")');

      // Asher blocks Cy: Cy can't join Asher's room or friend him.
      await api('/api/friends/block', A.token, { id: C.user.id });
      const joinC = await cc.call('join', { code: room.code, name: 'Cy', auth: C.token });
      check(!joinC.ok && /can't join/.test(joinC.error), 'blocked player can\'t join a room you host');
      const reqC = await api('/api/friends/request', C.token, { id: A.user.id });
      check(!reqC.ok && /isn't accepting/.test(reqC.error), 'blocked player can\'t send a request');
      await api('/api/friends/unblock', A.token, { id: C.user.id });
      check((await cc.call('join', { code: room.code, name: 'Cy', auth: C.token })).ok, 'after unblocking they can join');

      // Offline friend
      cb.close(); await wait(150);
      await ca.call('leave');
      const r2 = await ca.call('create', { name: 'Asher', auth: A.token });
      check(r2.ok && /offline/.test((await ca.call('invite', { userId: B.user.id })).error || ''), 'inviting an offline friend explains it');
      const off = await api('/api/friends', A.token);
      check(off.friends[0].online === false, 'friend shows offline after closing the tab');
      ca.close(); cc.close();
    } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  } catch (err) {
    failed++;
    console.error('  ✗ crashed:', err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
