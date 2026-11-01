// Batch 7: Easter, photo icons, 3 theme slots, premium themes + shop, Buy Me a Coffee,
// admin bans/gifts, friends ranking, casual stats, username change, account deletion.
// Run: node test/v7.test.js   (starts its own server on port 3996)

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');

let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };
const tryErr = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { MiniRedis } = require('../server/store');
const { Accounts, parseImage } = require('../server/accounts');
const bmc = require('../server/bmc');
const SHOP = require('../public/shop.js');
const { RoomManager, cleanAvatar } = require('../server/game');

// A real tiny JPEG (1×1) and PNG as data URLs.
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function loadThemes(store = {}) {
  const events = [];
  const ctx = {
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { documentElement: { style: { setProperty() {} }, dataset: {} }, querySelector: () => null },
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    setTimeout, clearTimeout,
  };
  ctx.window = { dispatchEvent: (e) => events.push(e), SliverShop: SHOP };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/themes.js'), 'utf8'), ctx);
  return { T: ctx.window.SliverThemes, events, store };
}

(async () => {
  try {
    // ------------------------------------------------------------------
    console.log('themes: Easter, 3 slots, premium');
    {
      const { T, events, store } = loadThemes({ 'sliver.customTheme': JSON.stringify({ page: '#111111', card: '#FFFFFF', accent: '#FF0000', pop: '#00FF00' }), 'sliver.theme': 'custom' });
      const days = (d) => d.toISOString().slice(0, 10);
      check(days(T.easterSunday(2026)) === '2026-04-05' && days(T.easterSunday(2027)) === '2027-03-28' && days(T.easterSunday(2028)) === '2028-04-16', 'Easter Sunday worked out for any year (Apr 5 2026, Mar 28 2027, Apr 16 2028)');
      const easter = T.THEMES.find((t) => t.id === 'easter');
      check(easter && easter.name === 'Egg Hunt' && easter.decor === 'easter', 'Easter theme "Egg Hunt" with its own decorations');
      check(T.inSeason(easter, new Date(2027, 2, 15)) && T.inSeason(easter, new Date(2027, 2, 29)) && !T.inSeason(easter, new Date(2027, 2, 13)) && !T.inSeason(easter, new Date(2027, 2, 30)), 'shows from 2 weeks before Easter to the day after');
      const decor = fs.readFileSync(path.join(__dirname, '../public/decor.js'), 'utf8');
      check(/easter\(\)/.test(decor) && /const (egg|bunny|chick|tulip|butterfly) =/.test(decor), 'Easter decorations: eggs, bunnies, a chick, tulips, butterflies');
      check(T.current() === 'custom1' && T.slots()[0].page === '#111111', 'the old single "My theme" moved into slot 1');
      T.setSlot(2, { page: '#222222', card: '#EEEEEE', accent: '#0000FF', pop: '#FFFF00' });
      check(T.SLOTS === 3 && T.current() === 'custom3' && T.slots().filter(Boolean).length === 2 && T.slotTheme(2).name === 'My theme 3', '3 save slots for your own themes');
      T.clearSlot(2);
      check(!T.slots()[2] && T.current() === 'cobalt', 'clearing the slot you use goes back to the default');

      const premium = T.premium();
      check(premium.length === SHOP.ALL.length && SHOP.PREMIUM.length >= 12 && premium.every((t) => t.fx && t.premium) && SHOP.PRICE === 2.5, `${premium.length} premium themes, $2.50 each`);
      check(!T.available().some((t) => t.premium), 'premium themes aren\'t in the free list');
      T.set('nebula');
      check(T.current() === 'cobalt', 'a premium theme you don\'t own falls back to the default');
      T.setOwned(['nebula']);
      check(T.current() === 'nebula' && JSON.parse(store['sliver.owned']).includes('nebula'), 'owning it switches it on (remembered on this device)');
      T.setOwned([]);
      check(T.current() === 'cobalt', 'logging out hides it again');
      const p = T.preview('ember', 50);
      check(p && events.at(-1).detail.fx === 'ember' && T.previewing(), 'anyone can preview a premium theme…');
      await wait(80);
      check(!T.previewing() && events.at(-1).detail.id === 'cobalt', '…for a few seconds, then it goes back');
      const fx = fs.readFileSync(path.join(__dirname, '../public/fx.js'), 'utf8');
      check(SHOP.ids.every((id) => new RegExp(`\\b${id}\\(\\) \\{`).test(fx)), 'every premium theme has its own animated scene: ' + SHOP.ids.join(', '));
      const names = premium.map((t) => t.name);
      check(!names.some((n) => /disney|barbie|hello kitty|marvel|pok|matrix|star wars|tron|stranger/i.test(n)), 'names are original: ' + names.join(', '));
    }

    // ------------------------------------------------------------------
    console.log('pictures');
    {
      check(parseImage(JPG).type === 'image/jpeg' && parseImage(PNG).type === 'image/png', 'accepts JPG and PNG');
      check(/didn't upload/.test(await tryErr(() => parseImage('data:text/html;base64,PGgxPg=='))), 'refuses non-images');
      check(/isn't a picture/.test(await tryErr(() => parseImage('data:image/png;base64,' + Buffer.from('<script>').toString('base64')))), 'refuses files pretending to be pictures');
      check(/too big/.test(await tryErr(() => parseImage('data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(70000)]).toString('base64')))), 'refuses huge files');
      check(cleanAvatar('/api/avatar/u/abcdefgh?v=12ab') && cleanAvatar('/api/avatar/g/abcdefghij') && !cleanAvatar('https://evil.example/x.png') && !cleanAvatar('javascript:alert(1)'), 'rooms only accept our own photo links');
    }

    // ------------------------------------------------------------------
    console.log('accounts: photo, name, themes, bans, casual stats, friends ranking, deleting');
    const store = new MiniRedis();
    const acc = new Accounts(store, null, { adminEmails: 'boss@x.co' });
    const boss = (await acc.signup({ name: 'Boss', email: 'boss@x.co', password: 'secret1' })).user;
    const a = (await acc.signup({ name: 'Asher', email: 'a@x.co', password: 'secret1' })).user;
    const b = (await acc.signup({ name: 'Bo', email: 'b@x.co', password: 'secret1' })).user;
    check(boss.admin === true && a.admin === false, 'ADMIN_EMAILS accounts are admins');
    {
      const r = await acc.setAvatar(a.id, JPG);
      check(/^\/api\/avatar\/u\/[\w-]+\?v=\w+$/.test(r.user.avatar), 'photo saved to the account');
      const img = await acc.getAvatar(a.id);
      check(img.type === 'image/jpeg' && img.buffer[0] === 0xff, 'and served back');
      check((await acc.changeName(a.id, '  Asher  2 ')).user.name === 'Asher 2' && /2 to 20/.test(await tryErr(() => acc.changeName(a.id, 'x'))), 'change username (2–20 characters)');
    }
    {
      const t1 = await acc.grantTheme(a.id, 'sakura', 'test');
      check(t1 === 'sakura' && (await acc.grantTheme(a.id, 'sakura')) === null, 'grant a theme; no duplicates');
      const got = [];
      for (let i = 0; i < SHOP.ids.length + 3; i++) { const t = await acc.grantTheme(a.id, 'random'); if (t) got.push(t); }
      check(got.length === SHOP.ids.length - 1 && !got.includes('sakura') && (await acc.ownedThemes(a.id)).length === SHOP.ids.length, 'random gifts never repeat; stop when you own them all');
      check((await acc.session((await acc.login({ email: 'a@x.co', password: 'secret1' })).token)).themes.length === SHOP.ids.length, 'your themes come with your login');
      const pend = await acc.grantByEmail('newbie@x.co', 'random', 'bmc');
      check(pend.pending, 'bought before having an account: kept for that email');
      const nb = await acc.signup({ name: 'Newbie', email: 'newbie@x.co', password: 'secret1' });
      check(nb.gifts.length === 1 && nb.user.themes.length === 1, '…and unlocked when that email signs up');
    }
    {
      await acc.submitRanked(b.id, { packId: 'pop', score: 7000, songs: 5, correct: 5 });
      check((await acc.leaderboard('pop')).entries.some((e) => e.id === b.id), 'Bo is on the Pop board');
      await acc.ban(b.id, 'cheating');
      check(/banned: cheating/.test(await tryErr(() => acc.login({ email: 'b@x.co', password: 'secret1' }))), 'banned players can\'t log in (and see why)');
      check(!(await acc.leaderboard('pop')).entries.some((e) => e.id === b.id) && !(await acc.leaderboard('overall')).entries.some((e) => e.id === b.id), 'banned players leave the leaderboards');
      check(/isn't available/.test(await tryErr(() => acc.profile(b.id, a.id))) && (await acc.profile(b.id, boss.id, true)).admin.banned, 'their profile is gone, except for admins');
      check(/can't ban an admin/.test(await tryErr(() => acc.ban(boss.id))), 'admins can\'t be banned');
      await acc.unban(b.id);
      check((await acc.leaderboard('pop')).entries.some((e) => e.id === b.id) && !!(await acc.login({ email: 'b@x.co', password: 'secret1' })).token, 'unban puts them back (scores kept)');
      check((await acc.findUser('B@X.CO')) === b.id && (await acc.findUser(await acc.friendCode(b.id))) === b.id && /No player/.test(await tryErr(() => acc.findUser('nobody@x.co'))), 'admins find players by email or friend code');
    }
    {
      await acc.submitCasual(a.id, { songs: 5, correct: 4, firstTry: 3, points: 30000, won: true, players: 3 });
      await acc.submitCasual(a.id, { songs: 5, correct: 2, firstTry: 1, points: 12000, won: false, players: 2 });
      await acc.submitCasual(a.id, { songs: 3, correct: 3, firstTry: 3, points: 20000, won: true, players: 1 }); // solo: no win counted
      const c = (await acc.profile(a.id, a.id)).casual;
      check(c.games === 3 && c.wins === 1 && c.multi === 2 && Math.abs(c.winRate - 0.5) < 1e-9 && c.best === 30000 && c.avgPoints === 20667, 'casual stats: games, wins (multiplayer only), win rate, best, average');
      check(Math.abs(c.accuracy - 9 / 13) < 1e-9 && Math.abs(c.firstTry - 7 / 9) < 1e-9, 'casual accuracy and first-try rate');
      await acc.requestFriend(a.id, { id: b.id }); await acc.acceptFriend(b.id, a.id);
      await acc.submitCasual(b.id, { songs: 5, correct: 5, firstTry: 5, points: 40000, won: true, players: 2 });
      await acc.submitCasual(b.id, { songs: 5, correct: 5, firstTry: 5, points: 40000, won: true, players: 2 });
      const fb = await acc.friendsBoard(a.id);
      check(fb.byRating.length === 2 && fb.byRating[0].id === b.id && fb.byRating[0].rating > 0, 'friends ranking by ranked rating');
      check(fb.byWins[0].id === b.id && fb.byWins[0].wins === 2 && fb.byWins[1].me && fb.byWins[1].wins === 1, '…and by casual wins');
    }
    {
      check(/isn't right/.test(await tryErr(() => acc.deleteAccount(a.id, 'nope'))), 'deleting needs your password');
      await acc.deleteAccount(a.id, 'secret1');
      check(!(await acc.getUser(a.id)) && !(await acc.getAvatar(a.id)) && !(await acc.leaderboard('overall')).entries.some((e) => e.id === a.id), 'account, photo and leaderboard places gone');
      check(!(await acc.friendIds(b.id)).has(a.id), 'removed from friends\' lists');
      check(!!(await acc.signup({ name: 'Asher', email: 'a@x.co', password: 'secret2' })).token, 'the email can sign up again');
    }

    // ------------------------------------------------------------------
    console.log('Buy Me a Coffee');
    {
      const secret = 'whsec_test';
      const body = JSON.stringify({ type: 'donation.created', live_mode: true, data: { id: 1 } });
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      check(bmc.verify(Buffer.from(body), sig, secret) && !bmc.verify(Buffer.from(body), sig, 'other') && !bmc.verify(Buffer.from(body + ' '), sig, secret) && !bmc.verify(Buffer.from(body), '', secret), 'signature check (HMAC-SHA256 of the raw body)');
      const s2 = new MiniRedis(); const acc2 = new Accounts(s2);
      const u = (await acc2.signup({ name: 'Fan', email: 'fan@x.co', password: 'secret1' })).user;
      const notes = [];
      const ctx = { accounts: acc2, store: s2, notify: (id, m) => notes.push([id, m]) };
      const coffee = (id, amount, extra = {}) => ({ event_id: id, type: 'donation.created', live_mode: true, data: { id, amount, currency: 'USD', supporter_email: 'FAN@x.co', ...extra } });
      check((await bmc.handleEvent(coffee(1, 1), ctx)).ignored === 'coffee under $2', 'a $1 coffee: thanks, no theme');
      const r1 = await bmc.handleEvent(coffee(2, 5), ctx);
      check(r1.granted.length === 1 && SHOP.ids.includes(r1.granted[0]) && notes.length === 1 && /unlocked/.test(notes[0][1].text), 'a $5 coffee: one random premium theme, and a live thank-you');
      check((await bmc.handleEvent(coffee(2, 5), ctx)).ignored === 'already handled', 'the same payment sent twice only counts once');
      check((await bmc.handleEvent({ ...coffee(3, 9), live_mode: false }, ctx)).ignored === 'test event', 'BMC test events are ignored');
      const pick = SHOP.PREMIUM.find((t) => t.id !== r1.granted[0]);
      const ex = await bmc.handleEvent({ type: 'extra_purchase.created', live_mode: true, data: { id: 77, amount: '2.50', supporter_email: 'fan@x.co', extras: [{ title: pick.name }] } }, ctx);
      check(ex.granted[0] === pick.id, 'buying the "Synthwave" extra unlocks Synthwave');
      const ref = await bmc.handleEvent({ type: 'extra_purchase.refunded', live_mode: true, data: { id: 77, supporter_email: 'fan@x.co' } }, ctx);
      check(ref.revoked[0] === pick.id && !(await acc2.ownedThemes(u.id)).includes(pick.id), 'a refund takes it back');
      const viaNote = await bmc.handleEvent(coffee(4, 3, { supporter_email: 'paypal-other@x.co', support_note: 'my sliver email is fan@x.co thanks!' }), ctx);
      check(viaNote.userId === u.id && viaNote.granted.length === 1, 'paid with another email but wrote their Sliver email in the note → still theirs');
      const pending = await bmc.handleEvent(coffee(5, 2, { supporter_email: 'later@x.co' }), ctx);
      check(pending.pending && (await acc2.signup({ name: 'Later', email: 'later@x.co', password: 'secret1' })).user.themes.length === 1, 'no account yet: unlocked when they sign up with that email');
    }

    // ------------------------------------------------------------------
    console.log('casual games count only when played to the end');
    {
      const got = [];
      const mgr = new RoomManager({ to: () => ({ emit() {} }) }, { onCasual: (r, e) => got.push(...e) });
      const room = mgr.create();
      const p1 = room.addPlayer('A', { id: 'a' }, '', '/api/avatar/g/abcdefghij'), p2 = room.addPlayer('B', { id: 'b' });
      room.setAccount(p1.id, { id: 'U1xxxx' });
      check(room.publicState(p1.id).players.find((x) => x.name === 'A').avatar === '/api/avatar/g/abcdefghij', 'players carry their photo');
      await room.addSource('demo');
      room.updateSettings({ rounds: 1 });
      await room.start();
      room.reportListen(p1.id, 1); room.guess(p1.id, room.round.track.poolId); room.giveUp(p2.id);
      await room.nextRound();
      check(room.phase === 'results' && got.length === 1 && got[0].userId === 'U1xxxx' && got[0].won && got[0].correct === 1 && got[0].players === 2, 'finished game → stats for the logged-in player (win, 1/1)');
      got.length = 0;
      await room.start(); room.endGame('A');
      check(got.length === 0, 'ended early by the host → not counted');
    }

    // ------------------------------------------------------------------
    console.log('server: photos, purchases webhook, admin, friends board, delete');
    const PORT = 3996, URL = `http://127.0.0.1:${PORT}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sliver-v7-'));
    const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEMO_ONLY: '1', ADMIN_EMAILS: 'boss@x.co', BMC_URL: 'https://buymeacoffee.com/sliver', BMC_WEBHOOK_SECRET: 'shh' };
    for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'RENDER', 'ADMIN_KEY']) delete env[k];
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let log = '';
    srv.stdout.on('data', (d) => { log += d; });
    await new Promise((r) => { const iv = setInterval(() => { if (log.includes('running') && log.includes('Theme purchases')) { clearInterval(iv); r(); } }, 50); });
    const post = (p, body, token, headers = {}) => fetch(URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }).then((r) => r.json());
    const get = (p, token) => fetch(URL + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.json());
    try {
      check(/Admin accounts: 1/.test(log) && /Theme purchases: on \(Buy Me a Coffee, https:\/\/buymeacoffee.com\/sliver\)/.test(log), 'startup log: admins and purchases on');
      const info = await get('/api/info');
      check(info.bmc === 'https://buymeacoffee.com/sliver' && info.shop === 'https://buymeacoffee.com/sliver/extras' && info.payments, 'the page gets the coffee and shop links');
      const g = await post('/api/avatar/guest', { image: PNG });
      const img = await fetch(URL + g.avatar);
      check(g.ok && /^\/api\/avatar\/g\//.test(g.avatar) && img.ok && img.headers.get('content-type') === 'image/png', 'guests can upload a photo too');
      const boss2 = await post('/api/signup', { name: 'Boss', email: 'boss@x.co', password: 'secret1' });
      const fan = await post('/api/signup', { name: 'Fan', email: 'fan@x.co', password: 'secret1' });
      const pic = await post('/api/me/avatar', { image: JPG }, fan.token);
      check(pic.ok && pic.user.avatar && (await fetch(URL + pic.user.avatar)).ok, 'account photo upload');
      check((await post('/api/me/name', { name: 'Fanny' }, fan.token)).user.name === 'Fanny', 'username change over the API');

      const evt = JSON.stringify({ event_id: 9, type: 'donation.created', live_mode: true, data: { id: 9, amount: 3, supporter_email: 'fan@x.co' } });
      const bad = await post('/api/bmc/webhook', evt, null, { 'x-signature-sha256': 'nope' });
      check(bad.ok === false && /signature/i.test(bad.error), 'webhook with a bad signature is refused');
      const good = await post('/api/bmc/webhook', evt, null, { 'x-signature-sha256': crypto.createHmac('sha256', 'shh').update(evt).digest('hex') });
      check(good.ok && good.granted.length === 1, 'signed coffee webhook unlocks a theme');
      check((await get('/api/me', fan.token)).user.themes.length === 1, 'the buyer\'s account now has it');

      check((await post('/api/admin/user', { action: 'view', query: 'fan@x.co' }, fan.token)).ok === false, 'non-admins can\'t use admin tools');
      const have = (await get('/api/me', fan.token)).user.themes;
      const want = SHOP.ids.find((t) => !have.includes(t));
      const gift = await post('/api/admin/user', { action: 'gift', query: 'fan@x.co', themeId: want }, boss2.token);
      check(gift.ok && gift.user.themes.includes(want), 'admin gifts a theme');
      check(/already have that theme/.test((await post('/api/admin/user', { action: 'gift', query: 'fan@x.co', themeId: want }, boss2.token)).error), 'gifting one they already own is explained');
      const ban = await post('/api/admin/user', { action: 'ban', query: 'fan@x.co', reason: 'spam' }, boss2.token);
      check(ban.ok && ban.user.banned && (await get('/api/me', fan.token)).user === null, 'admin bans: they\'re logged out everywhere');
      check(/banned: spam/.test((await post('/api/login', { email: 'fan@x.co', password: 'secret1' })).error), 'and can\'t log back in');
      await post('/api/admin/user', { action: 'unban', id: ban.user.id }, boss2.token);
      const back = await post('/api/login', { email: 'fan@x.co', password: 'secret1' });
      check(back.ok && back.user.themes.length === 2, 'unbanned: back in, themes kept');
      const rm = await post('/api/admin/user', { action: 'removePicture', id: ban.user.id }, boss2.token);
      check(rm.ok && !rm.user.avatar, 'admin can remove a photo');
      const fb = await get('/api/leaderboard/friends', back.token);
      check(fb.ok && fb.byRating.length === 1 && fb.byRating[0].me, 'friends leaderboard (just you, until you add friends)');
      check((await get('/api/leaderboard/friends')).ok === false, 'friends leaderboard needs a login');
      const del = await post('/api/me/delete', { password: 'secret1' }, back.token);
      check(del.ok && del.deleted && (await post('/api/login', { email: 'fan@x.co', password: 'secret1' })).ok === false, 'delete account over the API');
    } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  } catch (err) {
    failed++;
    console.error('  ✗ crashed:', err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
