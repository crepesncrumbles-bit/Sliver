// Offline tests: email codes, password reset, Upstash connection, Arabic/Korean text,
// full artist catalogues. Run: node test/email.test.js

const http = require('http');
let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };
const tryErr = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const { MiniRedis, UpstashStore, createStore } = require('../server/store');
const { Accounts } = require('../server/accounts');
const { createMailer } = require('../server/mailer');
const { normText } = require('../server/text');

(async () => {
  try {
    console.log('sign-up with an email code');
    const sent = [];
    const mailer = { kind: 'test', from: 'me@x.co', sendCode: async (to, code, purpose) => sent.push({ to, code, purpose }) };
    const store = new MiniRedis();
    const acc = new Accounts(store, mailer);
    const s1 = await acc.signup({ name: 'Asher', email: 'Asher@Gmail.com', password: 'secret123' });
    check(s1.pending && !s1.token, 'sign-up waits for the code (no account yet)');
    check(sent.length === 1 && sent[0].to === 'asher@gmail.com' && /^\d{6}$/.test(sent[0].code) && sent[0].purpose === 'signup', 'a 6-digit code is emailed');
    check(await store.cmd('GET', 'email:asher@gmail.com') === null, 'email isn\'t taken until the code is entered');
    check(/Wait a few seconds/.test(await tryErr(() => acc.resendSignup({ email: 'asher@gmail.com' }))), 'can\'t spam new codes');
    check(/isn't finished/.test(await tryErr(() => acc.login({ email: 'asher@gmail.com', password: 'secret123' }))), 'logging in before verifying explains why');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    check(/4 tries left/.test(await tryErr(() => acc.verifySignup({ email: 'asher@gmail.com', code: wrong }))), 'wrong code: tries left');
    check(/6-digit/.test(await tryErr(() => acc.verifySignup({ email: 'asher@gmail.com', code: '12' }))), 'short code refused');
    const v = await acc.verifySignup({ email: 'asher@gmail.com', code: ` ${sent[0].code.slice(0, 3)} ${sent[0].code.slice(3)} ` });
    check(v.token && v.user.name === 'Asher', 'right code (spaces ok) creates the account and logs in');
    check(/expired/.test(await tryErr(() => acc.verifySignup({ email: 'asher@gmail.com', code: sent[0].code }))), 'a code works only once');
    check(/already has an account/.test(await tryErr(() => acc.signup({ name: 'X1', email: 'asher@gmail.com', password: 'secret123' }))), 'that email is now taken');

    // Too many wrong codes
    await store.cmd('DEL', 'sent:signup:b@x.co');
    await acc.signup({ name: 'Bee', email: 'b@x.co', password: 'secret123' });
    for (let i = 0; i < 4; i++) await tryErr(() => acc.verifySignup({ email: 'b@x.co', code: '999999' === sent[1].code ? '888888' : '999999' }));
    check(/Too many wrong codes/.test(await tryErr(() => acc.verifySignup({ email: 'b@x.co', code: '999999' === sent[1].code ? '888888' : '999999' }))), '5 wrong codes cancel it');
    check(/expired/.test(await tryErr(() => acc.verifySignup({ email: 'b@x.co', code: sent[1].code }))), '…even the right code no longer works');

    // Resend
    await store.cmd('DEL', 'sent:signup:c@x.co');
    await acc.signup({ name: 'Cee', email: 'c@x.co', password: 'secret123' });
    const first = sent[sent.length - 1].code;
    await store.cmd('DEL', 'sent:signup:c@x.co'); // pretend 45 s passed
    await acc.resendSignup({ email: 'c@x.co' });
    const second = sent[sent.length - 1].code;
    if (first !== second) check(/isn't right/.test(await tryErr(() => acc.verifySignup({ email: 'c@x.co', code: first }))), 'a resent code replaces the old one');
    check(!!(await acc.verifySignup({ email: 'c@x.co', code: second })).token, 'newest code works');

    // Email failure
    const broken = new Accounts(new MiniRedis(), { sendCode: async () => { throw new Error('HTTP 401'); } });
    check(/Couldn't send the email/.test(await tryErr(() => broken.signup({ name: 'Dee', email: 'd@x.co', password: 'secret123' }))), 'email service down: clear message');

    console.log('forgot password');
    const oldLogin = await acc.login({ email: 'asher@gmail.com', password: 'secret123' });
    await store.cmd('DEL', 'sent:reset:asher@gmail.com');
    await acc.startReset({ email: 'ASHER@gmail.com' });
    const rc = sent[sent.length - 1];
    check(rc.purpose === 'reset' && rc.to === 'asher@gmail.com', 'reset code emailed');
    const n = sent.length;
    await acc.startReset({ email: 'nobody@x.co' });
    check(sent.length === n, 'unknown email: same answer, but no email sent');
    check(/at least 6/.test(await tryErr(() => acc.finishReset({ email: 'asher@gmail.com', code: rc.code, password: '123' }))), 'new password must be 6+ characters');
    const r = await acc.finishReset({ email: 'asher@gmail.com', code: rc.code, password: 'newpass456' });
    check(r.token && r.user.name === 'Asher', 'code + new password logs you in');
    check(await acc.session(oldLogin.token) === null, 'other devices are logged out');
    check((await acc.session(r.token)).name === 'Asher', 'the new login works');
    check(/Wrong email or password/.test(await tryErr(() => acc.login({ email: 'asher@gmail.com', password: 'secret123' }))), 'old password stops working');
    check(!!(await acc.login({ email: 'asher@gmail.com', password: 'newpass456' })).token, 'new password works');

    console.log('without email set up');
    const plain = new Accounts(new MiniRedis(), null);
    const p1 = await plain.signup({ name: 'Eve', email: 'e@x.co', password: 'secret123' });
    check(p1.token && !p1.pending, 'account is created right away (laptop / no email key)');
    check(/isn't set up/.test(await tryErr(() => plain.startReset({ email: 'e@x.co' }))), 'reset says it isn\'t set up');
    check(createMailer({}) === null && createMailer({ BREVO_API_KEY: 'k' }) === null, 'mailer off unless key + MAIL_FROM are set');
    const m = createMailer({ BREVO_API_KEY: '"xkeysib-123"', MAIL_FROM: 'MAIL_FROM="me@gmail.com"' });
    check(m && m.kind === 'brevo' && m.from === 'me@gmail.com', 'Brevo mailer, pasted quotes tolerated');
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 201, text: async () => '{}' }; };
    await m.sendCode('you@x.co', '123456', 'signup');
    global.fetch = realFetch;
    const body = JSON.parse(calls[0].opts.body);
    check(calls[0].url === 'https://api.brevo.com/v3/smtp/email' && calls[0].opts.headers['api-key'] === 'xkeysib-123', 'calls Brevo with the API key');
    check(body.sender.email === 'me@gmail.com' && body.to[0].email === 'you@x.co' && body.subject.includes('123456') && body.htmlContent.includes('123456'), 'email has the code');

    console.log('Upstash connection (fake Upstash server)');
    const TOKEN = 'AbC123token';
    const fake = new MiniRedis();
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(JSON.stringify({ error: 'WRONGPASS invalid password' })); }
        const parsed = JSON.parse(b);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/pipeline') return res.end(JSON.stringify(parsed.map((c) => { try { return { result: fake.exec(c) }; } catch (e) { return { error: e.message }; } })));
        try { res.end(JSON.stringify({ result: fake.exec(parsed) })); } catch (e) { res.end(JSON.stringify({ error: e.message })); }
      });
    }).listen(0);
    const port = srv.address().port;
    const env = (url, token) => { process.env.UPSTASH_REDIS_REST_URL = url; process.env.UPSTASH_REDIS_REST_TOKEN = token; return createStore(); };
    const good = env(`"http://127.0.0.1:${port}"`, `UPSTASH_REDIS_REST_TOKEN="${TOKEN}"\n`);
    check(good.kind === 'upstash' && await good.cmd('PING') === 'PONG', 'values pasted with quotes and KEY= still connect');
    const ua = new Accounts(good, null);
    const up = await ua.signup({ name: 'Asher', email: 'a@up.co', password: 'secret123' });
    check(up.token && (await ua.session(up.token)).name === 'Asher', 'sign-up and login work through the Upstash API');
    await ua.submitRanked(up.user.id, { packId: 'pop', score: 30000, songs: 5, correct: 4 });
    const lb = await ua.leaderboard('pop', up.user.id);
    check(lb.entries[0].name === 'Asher' && lb.entries[0].value === 30000, 'ranked scores + leaderboard through the Upstash API');
    const badTok = env(`http://127.0.0.1:${port}`, 'wrong');
    check(/rejected the token/.test(await tryErr(() => badTok.cmd('PING'))), 'wrong token: error says to check the token');
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    srv.close();

    console.log('Arabic and Korean titles');
    check(normText('أنا مش بتاع حد') === normText('انا مش بتاع حد'), 'أ and ا match');
    check(normText('تملي معاك') !== '' && normText('Tamally Maak') === 'tamally maak', 'Arabic text isn\'t thrown away');
    check(normText('حبيبي يا نور العين (Remix)') === normText('حَبِيبِي يا نور العين'), 'harakat and (…) ignored');
    check(normText('봄날') === normText('봄날') && normText('봄날') !== '', 'Korean kept');
    const { RoomManager, titleMatches } = require('../server/game');
    const room = new RoomManager({ to: () => ({ emit() {} }) }).create();
    room.sources.push({ key: 'k', name: 'x', tracks: [
      { source: 'deezer', sourceId: '1', title: 'تملي معاك', artist: 'عمرو دياب' },
      { source: 'deezer', sourceId: '2', title: 'نور العين', artist: 'عمرو دياب' },
      { source: 'deezer', sourceId: '3', title: '봄날', artist: 'BTS' },
    ] });
    room.rebuildPool();
    check(room.pool.length === 3, 'Arabic songs aren\'t merged as "duplicates"');
    check(titleMatches('نور العين', { title: 'نور العين', artist: 'Amr Diab' }), 'hard mode: typed Arabic title matches');

    console.log('full artist catalogues');
    const albumTracks = (aid, n, rankBase) => Array.from({ length: n }, (_, i) => ({ id: aid * 100 + i, title: `Album ${aid} Song ${i}`, preview: 'p', readable: true, rank: rankBase - i * 1000, artist: { id: 5, name: 'Star' } }));
    global.fetch = async (url) => {
      url = String(url);
      const j = (o) => ({ ok: true, status: 200, json: async () => o });
      if (url.includes('/search/artist')) return j({ data: [{ id: 5, name: 'Star' }] });
      if (url.includes('/artist/5/top')) return j({ data: [
        { id: 1, title: 'Big Hit', preview: 'p', readable: true, rank: 900000, artist: { id: 5 } },
        { id: 2, title: 'Big Hit (Live)', preview: 'p', readable: true, rank: 500000, artist: { id: 5 } },
      ] });
      if (url.includes('/artist/5/albums')) return j({ data: [
        { id: 7, title: 'First Album', record_type: 'album', fans: 900, cover_medium: 'c7' },
        { id: 8, title: 'Second Album', record_type: 'album', fans: 500, cover_medium: 'c8' },
        { id: 9, title: 'Live at Wembley', record_type: 'album', fans: 800 },
        { id: 10, title: 'Collab Comp', record_type: 'compile', fans: 100 },
      ] });
      if (url.includes('/album/7/tracks')) return j({ data: [...albumTracks(7, 12, 400000), { id: 1, title: 'Big Hit', preview: 'p', readable: true, rank: 900000, artist: { id: 5 } }] });
      if (url.includes('/album/8/tracks')) return j({ data: [...albumTracks(8, 10, 100000), { id: 99, title: 'Big Hit - Remix', preview: 'p', readable: true, rank: 1, artist: { id: 5 } }] });
      if (url.includes('/album/10/tracks')) return j({ data: [{ id: 77, title: 'Someone Else', preview: 'p', readable: true, artist: { id: 6 } }] });
      throw new Error('unexpected ' + url);
    };
    const { loadDeezerArtist } = require('../server/deezer');
    const art = await loadDeezerArtist('star');
    const titles = art.tracks.map((t) => t.title);
    check(art.name === 'Star: all songs' && art.tracks.length === 23, `top songs + every album song: ${art.tracks.length} (1 hit + 12 + 10)`);
    check(!titles.some((t) => /Live|Remix/.test(t)) && !titles.includes('Someone Else'), 'skips live/remix versions and other artists\' songs');
    check(titles.filter((t) => t === 'Big Hit').length === 1, 'no duplicates');
    const hit = art.tracks.find((t) => t.title === 'Big Hit'), deep = art.tracks.find((t) => t.title === 'Album 8 Song 9');
    check(hit.weight > 1.5 && deep.weight < 0.8, `hits weigh more (${hit.weight}) than deep cuts (${deep.weight})`);
    check(art.tracks.find((t) => t.title === 'Album 7 Song 0').cover === 'c7', 'album songs get their album cover');

    // Weighted picking in a game
    const room2 = new RoomManager({ to: () => ({ emit() {} }) }).create();
    room2.sources.push({ key: 'k', name: 'x', tracks: art.tracks });
    room2.rebuildPool();
    const counts = {};
    const crypto = require('crypto');
    for (let i = 0; i < 4000; i++) {
      const list = [...room2.pool];
      // same picker the game uses
      const total = list.reduce((s, t) => s + (t.weight || 1), 0);
      let r = Math.random() * total, k = 0;
      for (; k < list.length; k++) { r -= list[k].weight || 1; if (r <= 0) break; }
      counts[list[Math.min(k, list.length - 1)].title] = (counts[list[Math.min(k, list.length - 1)].title] || 0) + 1;
    }
    check((counts['Big Hit'] || 0) > (counts['Album 8 Song 9'] || 0) * 2, `popular songs come up more often (${counts['Big Hit']} vs ${counts['Album 8 Song 9'] || 0} of 4000)`);
    void crypto;
  } catch (e) {
    failed++;
    console.error(e);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
