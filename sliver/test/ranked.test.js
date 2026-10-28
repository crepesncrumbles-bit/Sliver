// Offline tests: accounts, ranked play, leaderboards, stacked modes, first-guess bonus,
// host transfer, clip/listen lengths, long Spotify playlists, play counts.
// Run: node test/ranked.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };

// ---------- fake Spotify web player ----------
const HASH = (c) => c.repeat(64);
let webPlayerUp = true;
const fetched = [];
const nd = (obj) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(obj)}</script>`;
const json = (url, o, ok = true) => ({ ok, status: ok ? 200 : 403, url, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => 'application/json' } });
global.fetch = async (url, opts = {}) => {
  url = String(url); fetched.push(url);
  if (url.includes('open.spotify.com/embed/playlist/BIG')) {
    const trackList = Array.from({ length: 100 }, (_, i) => ({ uri: `spotify:track:T${i}`, title: `Song ${i}`, subtitle: `Artist ${i % 9}` }));
    return { ok: true, status: 200, url, text: async () => nd({ props: { pageProps: { state: {
      data: { entity: { name: 'Big playlist', trackList } },
      settings: { session: { accessToken: 'A'.repeat(60), accessTokenExpirationTimestampMs: Date.now() + 3600e3 } },
    } } } }) };
  }
  if (url.includes('open.spotify.com/embed/track/')) {
    return { ok: true, status: 200, url, text: async () => nd({ props: { pageProps: { state: { settings: { session: { accessToken: 'B'.repeat(60) } } } } } }) };
  }
  if (url === 'https://open.spotify.com/') {
    if (!webPlayerUp) return { ok: false, status: 503, url, text: async () => '' };
    return { ok: true, status: 200, url, text: async () => '<script src="https://open.spotifycdn.com/cdn/build/web-player/web-player.abc123.js"></script>' };
  }
  if (url.includes('web-player.abc123.js')) {
    return { ok: true, status: 200, url, text: async () => `x("fetchPlaylist","query","${HASH('a')}",null);x("getTrack","query","${HASH('b')}",null);x("searchDesktop","query","${HASH('c')}",null)` };
  }
  if (url.includes('pathfinder/v2/query')) {
    const body = JSON.parse(opts.body);
    if (body.operationName === 'fetchPlaylist') {
      const { offset } = body.variables;
      const n = Math.max(0, Math.min(100, 260 - offset));
      return json(url, { data: { playlistV2: { content: { totalCount: 260, items: Array.from({ length: n }, (_, i) => ({ itemV2: { data: {
        __typename: 'Track', uri: `spotify:track:T${offset + i}`, name: `Song ${offset + i}`,
        artists: { items: [{ profile: { name: `Artist ${(offset + i) % 9}` } }] },
        albumOfTrack: { coverArt: { sources: [{ url: `https://i/${offset + i}.jpg`, width: 300 }] } },
      } } })) } } } });
    }
    if (body.operationName === 'getTrack') {
      const id = body.variables.uri.split(':').pop();
      return json(url, { data: { trackUnion: { __typename: 'Track', uri: body.variables.uri, name: 'x', playcount: id === 'NOPLAYS' ? null : '1234567890' } } });
    }
    if (body.operationName === 'searchDesktop') {
      return json(url, { data: { searchV2: { tracksV2: { items: [
        { item: { data: { uri: 'spotify:track:WRONG', name: 'Other Song', artists: { items: [{ profile: { name: 'Someone' } }] } } } },
        { item: { data: { uri: 'spotify:track:FOUND', name: 'Backup 1', artists: { items: [{ profile: { name: 'Band 1' } }] } } } },
      ] } } } });
    }
  }
  if (url.includes('api.spotify.com/v1/playlists/')) return json(url, { error: 'no' }, false);
  throw new Error('unexpected fetch ' + url);
};

const { MiniRedis } = require('../server/store');
const { Accounts, ratingFrom } = require('../server/accounts');
const { RoomManager, pointsForLength, FIRST_BONUS } = require('../server/game');
const { loadSpotifySource } = require('../server/spotify');
const web = require('../server/spotifyweb');

const events = [];
const io = { to: (to) => ({ emit: (e, d) => events.push({ to, e, d }) }) };

(async () => {
  try {
    console.log('database (offline stand-in for Upstash)');
    {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sliver-')), 'db.json');
      const db = new MiniRedis(file);
      await db.cmd('SET', 'a', 'x', 'NX');
      check(await db.cmd('SET', 'a', 'y', 'NX') === null && await db.cmd('GET', 'a') === 'x', 'SET NX keeps the first value');
      await db.pipeline([['ZADD', 'z', 5, 'p'], ['ZADD', 'z', 9, 'q'], ['ZADD', 'z', 'GT', 3, 'p'], ['ZADD', 'z', 'GT', 7, 'p']]);
      check(JSON.stringify(await db.cmd('ZREVRANGE', 'z', 0, -1, 'WITHSCORES')) === '["q","9","p","7"]', 'sorted sets, ZADD GT only raises');
      check(await db.cmd('ZREVRANK', 'z', 'p') === 1, 'ZREVRANK');
      await db.cmd('SET', 'gone', '1', 'EX', -1);
      check(await db.cmd('GET', 'gone') === null, 'expired keys disappear');
      await new Promise((r) => setTimeout(r, 400));
      const again = new MiniRedis(file);
      check(await again.cmd('GET', 'a') === 'x' && await again.cmd('ZSCORE', 'z', 'q') === '9', 'saved to disk and read back');
    }

    console.log('accounts');
    const acc = new Accounts(new MiniRedis());
    let err = null;
    const tryErr = async (fn) => { err = null; try { await fn(); } catch (e) { err = e.message; } return err; };
    const a = await acc.signup({ name: 'Asher', email: 'Asher@Example.com', password: 'secret123' });
    check(a.token && a.user.name === 'Asher' && /^\d{4}$/.test(a.user.tag), 'sign up returns a session and a 4-digit tag');
    check(/already has an account/.test(await tryErr(() => acc.signup({ name: 'Other', email: 'asher@example.com ', password: 'whatever1' }))), 'emails are unique (any capitalisation)');
    const b = await acc.signup({ name: 'Asher', email: 'asher2@example.com', password: 'secret123' });
    check(b.user.id !== a.user.id, 'usernames don\'t have to be unique');
    check(/6 characters/.test(await tryErr(() => acc.signup({ name: 'X1', email: 'x@y.co', password: '123' }))), 'short password refused');
    check(/email/.test(await tryErr(() => acc.signup({ name: 'X1', email: 'nope', password: '123456' }))), 'bad email refused');
    check(/2 to 20/.test(await tryErr(() => acc.signup({ name: 'X', email: 'q@y.co', password: '123456' }))), 'one-letter username refused');
    check(/Wrong email or password/.test(await tryErr(() => acc.login({ email: 'asher@example.com', password: 'nope' }))), 'wrong password refused');
    check(/Wrong email or password/.test(await tryErr(() => acc.login({ email: 'nobody@example.com', password: 'nope' }))), 'unknown email gives the same message');
    const li = await acc.login({ email: ' ASHER@example.com', password: 'secret123' });
    check(li.user.id === a.user.id, 'log in by email');
    check((await acc.session(li.token)).id === a.user.id, 'session token finds the account');
    await acc.logout(li.token);
    check(await acc.session(li.token) === null, 'log out ends the session');
    const stored = await acc.getUser(a.user.id);
    check(stored.hash && !stored.hash.includes('secret123') && stored.salt, 'password is stored hashed, never plain');

    console.log('ranked scores, ratings, leaderboards');
    const r1 = await acc.submitRanked(a.user.id, { packId: 'pop', score: 40000, songs: 5, correct: 5, firstTry: 4, heard: 6.5, hard: true });
    check(r1.improved && r1.pp === 400 && r1.packRank === 1 && r1.rating === 400, 'first play: 400 pp, #1 on Pop, rating 400');
    const r2 = await acc.submitRanked(a.user.id, { packId: 'pop', score: 30000, songs: 5, correct: 3, firstTry: 3, heard: 4 });
    check(!r2.improved && r2.prevBest === 40000 && r2.rating === 400, 'a worse play doesn\'t lower your best or rating');
    const r3 = await acc.submitRanked(a.user.id, { packId: 'rock', score: 20000, songs: 5, correct: 4, firstTry: 2, heard: 8 });
    check(r3.rating === 590 && r3.ratingBefore === 400, 'second genre counts ×0.95: 400 + 200×0.95 = 590');
    check(ratingFrom({ a: 10000, b: 10000, c: 10000 }) === Math.round(100 + 95 + 90.25), 'rating weights 1, 0.95, 0.9025…');
    await acc.submitRanked(b.user.id, { packId: 'pop', score: 50000, songs: 5, correct: 5, firstTry: 5, heard: 2 });
    const lb = await acc.leaderboard('pop', a.user.id);
    check(lb.entries.length === 2 && lb.entries[0].id === b.user.id && lb.entries[0].value === 50000 && lb.me.rank === 2, 'Pop board: higher score first, my rank included');
    check(!JSON.stringify(lb).includes('@example.com'), 'leaderboards never show emails');
    // Top 25 only
    for (let i = 0; i < 30; i++) {
      const u = await acc.signup({ name: `P${i}`, email: `p${i}@x.co`, password: 'secret123' });
      await acc.submitRanked(u.user.id, { packId: 'hiphop', score: 1000 * (i + 1), songs: 5, correct: 1 });
    }
    const hh = await acc.leaderboard('hiphop');
    check(hh.entries.length === 25 && hh.total === 30 && hh.entries[0].name === 'P29', 'each genre shows its top 25');
    const overall = await acc.leaderboard('overall');
    check(overall.entries[0].id === a.user.id && overall.entries[0].value === 590, 'overall board sorts by rating');
    check(overall.boards.length === 1 + require('../server/packs').RANKED.length && overall.boards.length > 10 && overall.boards.every((x) => x.id === 'overall' || !x.id.startsWith('artist-')), 'one board per genre/decade plus overall');
    check(/Unknown leaderboard/.test(await tryErr(() => acc.leaderboard('artist-drake'))), 'artist packs aren\'t ranked');
    const prof = await acc.profile(a.user.id);
    check(prof.stats.games === 3 && prof.stats.songs === 15 && prof.stats.correct === 12, 'profile: games, songs, correct');
    check(Math.abs(prof.stats.accuracy - 0.8) < 1e-9 && Math.abs(prof.stats.firstTry - 9 / 12) < 1e-9, 'profile: accuracy 80%, first-try 75%');
    check(Math.abs(prof.stats.avgHeard - 18.5 / 12) < 0.01 && prof.stats.avgScore === 30000 && prof.stats.best === 40000, 'profile: average heard, average score, best game');
    check(prof.genres.length === 2 && prof.genres[0].packId === 'pop' && prof.genres[0].rank === 2, 'profile: best per genre with rank');
    check(prof.recent.length === 3 && prof.recent[0].packId === 'rock' && prof.globalRank === 1, 'profile: recent plays, global rank');
    check(!JSON.stringify(prof).includes('@example.com') && !JSON.stringify(prof).includes(stored.hash), 'profile never shows email or password hash');

    console.log('Hard + Chaos together');
    const mgr = (opts) => new RoomManager(io, opts);
    {
      const room = mgr().create();
      const p = room.addPlayer('Solo', { id: 's' });
      await room.addSource({ input: 'demo' });
      room.updateSettings({ hard: true, chaos: true, rounds: 6 });
      await room.start();
      const twists = [];
      for (let i = 0; i < 6; i++) {
        const r = room.round;
        twists.push(r.twist);
        check(r.mult === 1.875 && r.typed && r.offset >= 2 && r.twist && r.twist !== 'random-start', `song ${i + 1}: typed, mid-song start, twist "${r.twist}", 1.875×`);
        room.giveUp(p.id);
        await room.nextRound();
      }
      room.updateSettings({ mode: 'chaos' });
      check(room.settings.chaos && !room.settings.hard, 'old one-mode-at-a-time setting still works');
    }

    console.log('first-guess bonus');
    {
      const room = mgr().create();
      const a1 = room.addPlayer('A', { id: 'a' }), b1 = room.addPlayer('B', { id: 'b' });
      await room.addSource({ input: 'demo' });
      room.updateSettings({ rounds: 1 });
      await room.start();
      const ans = room.round.track.poolId;
      room.reportListen(a1.id, 1); room.reportListen(b1.id, 0.1);
      const ra = room.guess(a1.id, ans);
      const rb = room.guess(b1.id, ans);
      check(ra.points === pointsForLength(1) + FIRST_BONUS && ra.bonus === FIRST_BONUS, 'first correct guess gets +500');
      check(rb.points === pointsForLength(0.1) && !rb.bonus, 'second correct guess doesn\'t');
      const ev = events.filter((x) => x.e === 'gotIt').slice(-2);
      check(ev[0].d.first === true && ev[1].d.first === false, 'the pop-up says who was first');
      check(room.reveal.results.find((x) => x.id === a1.id).bonus === 500, 'reveal shows the bonus');

      const solo = mgr().create();
      const s1 = solo.addPlayer('Solo', { id: 's' });
      await solo.addSource({ input: 'demo' });
      solo.updateSettings({ rounds: 1 });
      await solo.start();
      solo.reportListen(s1.id, 1);
      check(!solo.guess(s1.id, solo.round.track.poolId).bonus, 'no bonus when playing alone');
    }

    console.log('host transfer and kicking mid-game');
    {
      const room = mgr().create();
      const h = room.addPlayer('Host', { id: 'h' }), f = room.addPlayer('Friend', { id: 'f' }), g = room.addPlayer('Guest', { id: 'g' });
      await room.addSource({ input: 'demo' });
      await room.start();
      check(/Only the host/.test(await tryErr(() => room.transferHost(f.id, g.id))), 'only the host can hand it over');
      room.transferHost(h.id, f.id);
      check(room.hostId === f.id && room.phase === 'round', 'host handed over mid-song, song keeps going');
      room.kick(f.id, g.id);
      check(!room.players.has(g.id) && room.phase === 'round', 'new host removes someone mid-song');
      room.giveUp(f.id);
      check(room.phase === 'round', 'round waits for the remaining player');
      room.giveUp(h.id);
      check(room.phase === 'reveal', 'and ends when everyone left is done');
    }

    console.log('clip length and listen length');
    {
      const room = mgr().create();
      const p = room.addPlayer('Solo', { id: 's' });
      await room.addSource({ input: 'demo' });
      room.updateSettings({ maxLen: 15, listenLen: 30 });
      check(room.settings.maxLen === 15 && room.settings.listenLen === 30, 'settings saved');
      room.updateSettings({ maxLen: 45, listenLen: 60 });
      check(room.settings.maxLen === 15 && room.settings.listenLen === 30, 'lengths longer than the 30 s preview are refused');
      await room.start();
      room.reportListen(p.id, 29);
      check(room.round.results.get(p.id).maxHeard === 15, 'can\'t hear past the longest-clip setting');
      check(/between games/.test(await tryErr(() => room.updateSettings({ rounds: 3 }))), 'settings locked during a game');
      room.giveUp(p.id);
      const wait = room.reveal.autoNextAt - Date.now();
      check(wait > 33000 && wait <= 34000 && room.reveal.listenLen === 30, 'answer screen waits for the 30 s listen');
      room.backToLobby();
    }

    console.log('ranked games');
    {
      const submitted = [];
      const room = mgr({ onRanked: (r, entries) => submitted.push(...entries) }).create();
      const h = room.addPlayer('Asher', { id: 'h' }), f = room.addPlayer('Guest', { id: 'f' });
      room.setAccount(h.id, { id: 'U1' });
      // Use demo songs as the "pop" genre for an offline test.
      room.loadPack = async () => ({ tracks: require('../server/demo').demoTracks() });
      room.updateSettings({ ranked: true, rounds: 10, maxGuesses: 1, maxLen: 15, hard: true, chaos: true });
      check(/Pick a genre/.test(await tryErr(() => room.start())), 'ranked needs a genre');
      check(/ranked genres/.test(await tryErr(() => room.setRankedPack('artist-drake'))), 'artist packs can\'t be ranked');
      await room.setRankedPack('pop');
      check(room.gamePool.length === 12 && room.poolList().length === 12, 'ranked uses only the genre\'s songs');
      check(/Not logged in: Guest/.test(await tryErr(() => room.start())), 'everyone has to be logged in');
      room.setAccount(f.id, { id: 'U1' });
      check(/twice/.test(await tryErr(() => room.start())), 'one device per account');
      room.setAccount(f.id, { id: 'U2' });
      await room.start();
      check(room.game.rounds === 5 && room.game.maxGuesses === 0 && room.game.maxLen === 30, 'ranked is always 5 songs, unlimited guesses, full 30 s clips');
      check(room.round.mult === 1.875, 'ranked keeps the Hard + Chaos multiplier');
      let total = 0;
      for (let i = 0; i < 5; i++) {
        room.reportListen(h.id, 1);
        if (i < 4) { room.guessText(h.id, room.round.track.title); total += room.round.results.get(h.id).points; } else room.giveUp(h.id);
        room.giveUp(f.id);
        check(!room.round.results.get(h.id).bonus, `song ${i + 1}: no first-guess bonus in ranked`);
        await room.nextRound();
      }
      check(room.phase === 'results' && submitted.length === 2, 'both scores sent when the game ends');
      const me = submitted.find((x) => x.userId === 'U1');
      check(me.score === total && me.correct === 4 && me.firstTry === 4 && me.songs === 5 && me.packId === 'pop' && me.hard && me.chaos, 'score, correct, first-try, mods recorded');
      check(submitted.find((x) => x.userId === 'U2').score === 0, 'a player who got nothing still gets a play');

      // Ended early → nothing saved; leaving → that player not saved
      submitted.length = 0;
      await room.start();
      room.endGame('Asher');
      check(room.phase === 'lobby' && submitted.length === 0, 'host ending a ranked game early saves nothing');
      await room.start();
      room.leave(f.id);
      for (let i = 0; i < 5; i++) { room.giveUp(h.id); await room.nextRound(); }
      check(submitted.length === 1 && submitted[0].userId === 'U1', 'a player who left isn\'t saved');
      room.updateSettings({ ranked: false });
      check(room.gamePool.length === 0, 'back to casual: the room\'s own songs again');
    }

    console.log('playlists over 100 songs (Spotify)');
    {
      web._reset();
      const res = await loadSpotifySource('https://open.spotify.com/playlist/BIG');
      check(res.tracks.length === 260 && !res.truncated, 'all 260 songs, not just the first 100');
      check(res.tracks[150].title === 'Song 150' && res.tracks[150].artist === 'Artist 6' && res.tracks[150].cover === 'https://i/150.jpg', 'songs after 100 have title, artist, cover');
      check(new Set(res.tracks.map((t) => t.sourceId)).size === 260, 'no duplicates');
      web._reset(); webPlayerUp = false;
      const res2 = await loadSpotifySource('https://open.spotify.com/playlist/BIG');
      check(res2.tracks.length === 100 && res2.truncated, 'if Spotify won\'t share more: first 100 and a warning');
      webPlayerUp = true;
    }

    console.log('play counts');
    {
      web._reset();
      check(await web.spotifyPlays({ source: 'spotify', sourceId: 'T1', title: 'Song 1', artist: 'A' }) === 1234567890, 'Spotify song: play count');
      check(await web.spotifyPlays({ source: 'deezer', sourceId: '9', title: 'Backup 1', artist: 'Band 1' }) === 1234567890, 'Deezer song: found on Spotify by title + artist');
      check(await web.spotifyPlays({ source: 'spotify', sourceId: 'NOPLAYS', title: 'x', artist: 'y' }) === null, 'missing count → nothing shown');
      web._reset(); webPlayerUp = false;
      check(await web.spotifyPlays({ source: 'spotify', sourceId: 'T2', title: 'x', artist: 'y' }) === null, 'Spotify down → nothing shown, no error');
      webPlayerUp = true;

      const room = mgr({ plays: async () => { await new Promise((r) => setTimeout(r, 50)); return 987654; } }).create();
      const p = room.addPlayer('Solo', { id: 's' });
      room.loadClip = async () => ({ buffer: Buffer.alloc(10), contentType: 'audio/mpeg' });
      room.sources.push({ key: 'k', name: 'x', tracks: [{ source: 'deezer', sourceId: '1', title: 'A', artist: 'B' }, { source: 'deezer', sourceId: '2', title: 'C', artist: 'D' }] });
      room.rebuildPool();
      room.updateSettings({ rounds: 1 });
      await room.start();
      room.giveUp(p.id);
      const before = room.reveal.plays;
      await new Promise((r) => setTimeout(r, 80));
      check(before === null && room.reveal.plays === 987654, 'count arrives after the answer shows, and the screen updates');
    }
  } catch (e) {
    failed++;
    console.error(e);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
