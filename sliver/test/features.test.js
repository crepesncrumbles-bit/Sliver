// Offline tests: removing playlists, built-in packs, artist lookup, Hard and Chaos modes.
// Run: node test/features.test.js

let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };

const calls = [];
let spotifyUp = true;
const dzTrack = (id, title, artist) => ({ id, title, title_short: title, preview: `https://cdn/${id}.mp3`, readable: true, artist: { name: artist }, album: { cover_medium: `https://dz/${id}.jpg` } });
const embed = (entity) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script>`;

global.fetch = async (url) => {
  url = String(url); calls.push(url);
  const json = (o) => ({ ok: true, status: 200, url, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => 'application/json' } });
  if (url.includes('open.spotify.com/embed/playlist/')) {
    if (!spotifyUp) return { ok: false, status: 403, url, text: async () => '' };
    const list = Array.from({ length: 30 }, (_, i) => ({ uri: `spotify:track:S${i}`, title: `Hit ${i}`, subtitle: `Star ${i % 5}` }));
    return { ok: true, status: 200, url, text: async () => embed({ name: 'Spotify editorial', trackList: list }) };
  }
  if (url.includes('api.deezer.com/search/playlist')) return json({ data: [{ id: 999, title: 'Backup Hits', nb_tracks: 80 }] });
  if (url.includes('api.deezer.com/playlist/999/tracks')) return json({ data: Array.from({ length: 40 }, (_, i) => dzTrack(9000 + i, `Backup ${i}`, `Band ${i % 7}`)) });
  if (url.includes('api.deezer.com/playlist/999')) return json({ id: 999, title: 'Backup Hits' });
  if (url.includes('api.deezer.com/search/artist')) {
    const q = decodeURIComponent(url.split('q=')[1].split('&')[0]);
    if (/nobody/i.test(q)) return json({ data: [] });
    return json({ data: [{ id: 77, name: q.replace(/\b\w/g, (c) => c.toUpperCase()), picture_medium: 'https://dz/a.jpg' }] });
  }
  if (url.includes('api.deezer.com/artist/77/top')) return json({ data: Array.from({ length: 25 }, (_, i) => dzTrack(7700 + i, `Artist Song ${i}`, 'Taylor Swift')) });
  throw new Error('unexpected fetch ' + url);
};

const { RoomManager, pointsForLength, MODES } = require('../server/game');
const packs = require('../server/packs');
const mgr = () => new RoomManager({ to: () => ({ emit() {} }) });

(async () => {
  try {
    console.log('removing playlists');
    {
      const room = mgr().create();
      const host = room.addPlayer('Host', { id: 'h' });
      const friend = room.addPlayer('Friend', { id: 'f' });
      const other = room.addPlayer('Other', { id: 'o' });
      const a = await room.addSource({ input: 'demo' }, { name: 'Friend', id: friend.id });
      const b = await room.addSource({ packId: 'artist-taylor-swift' }, { name: 'Host', id: host.id });
      check(room.pool.length === 37, 'two sources → 37 songs');
      let err = null; try { room.removeSource(a.key, other); } catch (e) { err = e.message; }
      check(/host or whoever added/.test(err) && room.pool.length === 37, 'a different guest can\'t remove someone else\'s playlist');
      room.removeSource(a.key, friend);
      check(room.pool.length === 25 && room.sources.length === 1, 'the person who added it can remove it');
      check(room.pool.every((t, i) => t.poolId === i), 'song ids stay consistent after removal');
      room.removeSource(b.key, host);
      check(room.pool.length === 0, 'host can remove any playlist');
      await room.addSource({ input: 'demo' }, { name: 'Host', id: host.id });
      await room.addSource({ input: 'demo' }, { name: 'Friend', id: friend.id });
      const dupe = room.sources[1];
      check(dupe.count === 0, 'duplicate playlist adds 0 new songs');
      room.removeSource(room.sources[0].key, host);
      check(room.pool.length === 12 && room.sources[0].count === 12, 'removing the first copy hands its songs to the second');
      room.settings.rounds = 1; await room.start();
      err = null; try { room.removeSource(room.sources[0].key, host); } catch (e) { err = e.message; }
      check(/between games/.test(err), 'can\'t remove playlists mid-game');
      room.clearTimers();
    }

    console.log('built-in packs');
    {
      check(packs.PACKS.length >= 30 && new Set(packs.PACKS.map((p) => p.id)).size === packs.PACKS.length, `${packs.PACKS.length} packs with unique ids`);
      const room = mgr().create();
      room.addPlayer('Host', { id: 'h' });
      calls.length = 0;
      const r1 = await room.addSource({ packId: 'hiphop' }, 'Host');
      check(r1.name === 'Hip-Hop' && r1.added === 30 && calls[0].includes('37i9dQZF1DX0XUsuxWHRQd'), 'genre pack loads its Spotify playlist');
      let err = null; try { await room.addSource({ packId: 'hiphop' }, 'Host'); } catch (e) { err = e.message; }
      check(/already in/.test(err), 'same pack can\'t be added twice');
      spotifyUp = false; calls.length = 0;
      const r2 = await room.addSource({ packId: 'rock' }, 'Host');
      check(r2.name === 'Rock Classics' && r2.added === 40 && calls.some((u) => u.includes('search/playlist?q=rock%20classics')), 'Spotify down → falls back to a Deezer playlist');
      spotifyUp = true; calls.length = 0;
      await room.addSource({ packId: 'afrobeats' }, 'Host');
      check(!calls.some((u) => u.includes('spotify')), 'packs without a Spotify id go straight to Deezer');
      const r3 = await room.addSource({ packId: 'artist-drake' }, 'Host');
      check(r3.name === 'Drake — top songs' && r3.added > 0, 'artist pack loads top songs');
      const pub = room.publicState(room.hostId);
      check(pub.packs.length === packs.PACKS.length && pub.sources.every((s) => !('tracks' in s)), 'state lists packs; doesn\'t leak track lists');
      check(pub.sources.find((s) => s.packId === 'hiphop'), 'state marks which packs are added');
    }

    console.log('typing an artist name');
    {
      const room = mgr().create();
      room.addPlayer('Host', { id: 'h' });
      const r = await room.addSource({ input: 'taylor swift' }, 'Host');
      check(r.name === 'Taylor Swift — top songs' && r.added === 25, '"taylor swift" adds her top songs');
      let err = null; try { await room.addSource({ input: 'nobody xyz' }, 'Host'); } catch (e) { err = e.message; }
      check(/No artist called/.test(err), 'unknown artist gets a clear message');
    }

    console.log('hard mode');
    {
      const room = mgr().create();
      const p = room.addPlayer('Hard', { id: 'h' });
      await room.addSource('demo', 'Hard');
      Object.assign(room.settings, { rounds: 1, roundTime: 0, mode: 'hard' });
      await room.start();
      const st = room.publicState(p.id).round;
      check(st.typed && st.offset >= 2 && st.offset <= 14 && st.mult === 1.5, 'random start (2–14 s), type-it-yourself, ×1.5');
      let err = null; try { room.guess(p.id, 0); } catch (e) { err = e.message; }
      check(/type the song title/.test(err), 'picking from the list is disabled');
      const answer = room.round.track.title;
      room.reportListen(p.id, 1);
      const w = room.guessText(p.id, 'definitely not it');
      check(!w.correct, 'wrong typed guess counts as wrong');
      err = null; try { room.guessText(p.id, 'Definitely  NOT it!'); } catch (e) { err = e.message; }
      check(/already guessed/.test(err), 'same text twice isn\'t charged again');
      const typo = answer.toLowerCase().replace(/[aeiou]/, '');
      const r = room.guessText(p.id, answer.length > 8 ? typo : answer.toLowerCase());
      check(r.correct, `forgiving match ("${answer.length > 8 ? typo : answer.toLowerCase()}" for "${answer}")`);
      check(r.points === Math.round((pointsForLength(1) - 500) * 1.5), `1 s heard, 1 wrong, ×1.5 = ${r.points}`);
      check(room.reveal.mode === 'hard' && room.reveal.mult === 1.5, 'reveal shows the mode');
      room.clearTimers();
    }

    console.log('chaos mode');
    {
      const room = mgr().create();
      const p = room.addPlayer('Chaos', { id: 'c' });
      await room.addSource('demo', 'Chaos');
      Object.assign(room.settings, { rounds: 8, roundTime: 0, mode: 'chaos' });
      await room.start();
      const seen = [];
      for (let i = 0; i < 8; i++) {
        seen.push(room.round.twist);
        if (i === 0) {
          check(room.publicState(p.id).round.twist && !room.round.typed && room.round.mult === 1.25, 'each song has a twist, list picking on, ×1.25');
          room.reportListen(p.id, 0.1);
          const r = room.guess(p.id, room.round.track.poolId);
          check(r.points === 12500, 'perfect 0.1 s guess = 12,500');
        } else room.giveUp(p.id);
        if (room.phase === 'reveal') await room.nextRound();
      }
      check(seen.every((t, i) => !i || t !== seen[i - 1]), 'never the same twist twice in a row: ' + seen.join(', '));
      check(seen.every((t) => ['reverse', 'chipmunk', 'slowmo', 'underwater', 'random-start'].includes(t)), 'only known twists');
      room.clearTimers();
    }

    console.log('leaving a room');
    {
      const m = mgr();
      const room = m.create();
      const a = room.addPlayer('Host', { id: 'a' });
      const b = room.addPlayer('Friend', { id: 'b' });
      await room.addSource('demo', 'Host');
      room.settings.rounds = 2; room.settings.roundTime = 0; await room.start();
      room.leave(a.id);
      check(!room.players.has(a.id) && room.hostId === b.id, 'host leaves mid-game → friend becomes host');
      check(room.phase === 'round', 'game keeps going for the people still there');
      room.giveUp(b.id);
      check(room.phase === 'reveal', 'round ends normally after the leaver is gone');
      room.leave(b.id);
      m.sweep();
      check(!m.rooms.has(room.code), 'empty room is deleted right away');
      room.clearTimers();
    }

    console.log('kicking and defaults');
    {
      const m = mgr();
      const room = m.create();
      const host = room.addPlayer('Host', { id: 'h1' });
      const bob = room.addPlayer('Bob', { id: 'b1' });
      const cat = room.addPlayer('Cat', { id: 'c1' });
      check(room.settings.roundTime === 0, 'new rooms default to no time limit');
      let err = null; try { room.kick(bob.id, cat.id); } catch (e) { err = e.message; }
      check(/Only the host/.test(err) && room.players.size === 3, 'only the host can remove players');
      err = null; try { room.kick(host.id, host.id); } catch (e) { err = e.message; }
      check(/Leave room/.test(err), 'host can\'t kick themselves');
      const gone = room.kick(host.id, bob.id);
      check(gone.name === 'Bob' && !room.players.has(bob.id) && room.kickedTokens.has(bob.token), 'host removes Bob');
      check(room.reconnect(bob.token, { id: 'b2' }) === null, 'Bob can\'t sneak back in with his old session');
      await room.addSource('demo', 'Host');
      room.settings.rounds = 1; await room.start();
      room.kick(host.id, cat.id);
      check(room.phase === 'round' && room.players.size === 1, 'kicking mid-song keeps the game going');
      const events = [];
      room.io = { to: () => ({ emit: (e, d) => events.push([e, d]) }) };
      room.reportListen(host.id, 0.5);
      room.guess(host.id, room.round.track.poolId);
      const got = events.find(([e]) => e === 'gotIt');
      check(got && got[1].name === 'Host' && got[1].points === 7388, 'correct guess announces "Host got the song" with points');
      room.clearTimers();
    }

    console.log('host ends the game');
    {
      const room = mgr().create();
      const host = room.addPlayer('Host', { id: 'e1' });
      const bob = room.addPlayer('Bob', { id: 'e2' });
      await room.addSource('demo', 'Host');
      Object.assign(room.settings, { rounds: 5, roundTime: 0 });
      await room.start();
      room.reportListen(host.id, 0.1); room.guess(host.id, room.round.track.poolId); room.giveUp(bob.id);
      check(room.phase === 'reveal' && host.score > 0, 'mid-game with points');
      room.endGame('Host');
      check(room.phase === 'lobby' && !room.round && host.score === 0 && room.pool.length === 12 && room.players.size === 2,
        'End game: back to lobby, scores reset, songs and players kept');
      // race: host ends while the next song is still downloading
      let release;
      const origLoad = room.loadClip.bind(room);
      room.loadClip = (t) => new Promise((res) => { release = () => res(origLoad(t)); });
      const pending = room.start();
      await new Promise((r) => setTimeout(r, 10));
      check(room.phase === 'loading', 'next song is loading');
      room.endGame('Host');
      release(); await pending;
      check(room.phase === 'lobby' && !room.round, 'a song finishing its download can\'t restart an ended game');
      room.loadClip = origLoad;
      await room.start();
      check(room.phase === 'round' && room.round.num === 1, 'a new game starts fresh at song 1');
      room.clearTimers();
    }

    console.log('classic unchanged');
    {
      const room = mgr().create();
      const p = room.addPlayer('C', { id: 'x' });
      await room.addSource('demo', 'C');
      room.settings.rounds = 1; await room.start();
      check(room.round.offset === 0 && !room.round.twist && room.round.mult === 1 && Object.keys(MODES).length === 3, 'classic: from the start, no twist, ×1');
      room.clearTimers();
    }
  } catch (err) {
    failed++; console.error('  ✗ crashed:', err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
