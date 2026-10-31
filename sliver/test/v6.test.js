// Batch 6: 2× Hard+Chaos, fixed clip lengths, ranked timer, popularity sorting, Anghami,
// iTunes catalogue for Egyptian/Arabic artists, metal, top-20 artists, 500-song cap,
// host-only songs, icons, hidden accounts, custom themes + codes, decorations, admin stats.
// Offline: the network is mocked. Run: node test/v6.test.js

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');

let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };
const tryErr = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- mock network ----------
const realFetch = global.fetch;
let routes = [];
const calls = [];
const json = (obj) => ({ ok: true, status: 200, url: '', headers: { get: () => 'application/json' }, json: async () => obj, text: async () => JSON.stringify(obj), arrayBuffer: async () => new ArrayBuffer(3) });
const html = (body, url = '') => ({ ok: true, status: 200, url, headers: { get: () => 'text/html' }, text: async () => body, json: async () => JSON.parse(body) });
const audio = () => ({ ok: true, status: 200, headers: { get: () => 'audio/mp4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });
global.fetch = async (url, opts) => {
  url = String(url);
  calls.push(url);
  for (const [test, reply] of routes) {
    if (typeof test === 'string' ? url.includes(test) : test.test(url)) return typeof reply === 'function' ? reply(url, opts) : reply;
  }
  return { ok: false, status: 404, headers: { get: () => '' }, json: async () => ({ error: { message: 'not found' } }), text: async () => 'not found' };
};

const { RoomManager, multFor, GUESS_CLIP, LISTEN_AFTER, RANKED_ROUND_TIME } = require('../server/game');
const anghami = require('../server/anghami');
const itunes = require('../server/itunes');
const deezer = require('../server/deezer');
const popularity = require('../server/popularity');
const packs = require('../server/packs');
const { MiniRedis } = require('../server/store');
const { Accounts } = require('../server/accounts');
const ICONS = require('../public/icons.js');
const mgr = (opts = {}) => new RoomManager({ to: () => ({ emit() {} }) }, opts);

// Fake Deezer track
const dz = (id, title, artist, rank, extra = {}) => ({ id, title, title_short: title, artist: { id: extra.artistId || 1, name: artist }, preview: `https://cdn.deezer/p${id}.mp3`, readable: true, rank, album: { cover_medium: null }, ...extra });

(async () => {
  try {
    // ----------------------------------------------------------------
    console.log('scoring and timing');
    check(multFor(false, false) === 1 && multFor(true, false) === 1.5 && multFor(false, true) === 1.25 && multFor(true, true) === 2, 'Hard 1.5×, Chaos 1.25×, both together 2×');
    check(GUESS_CLIP === 15 && LISTEN_AFTER === 30 && RANKED_ROUND_TIME === 90, '15 s to guess, 30 s after, ranked 90 s per song');
    {
      const room = mgr().create();
      room.addPlayer('A', { id: 'a' });
      await room.addSource('demo');
      room.updateSettings({ hard: true, chaos: true, roundTime: 0 });
      await room.start();
      check(room.round.mult === 2 && room.round.maxLen === 15 && room.round.endsAt === null, 'casual Hard + Chaos: 2×, 15 s clips, no timer unless the host sets one');
      room.backToLobby();
    }

    // ----------------------------------------------------------------
    console.log('Deezer: popularity on every song, 500-song cap');
    routes = [
      ['api.deezer.com/playlist/900/tracks', (url) => {
        const idx = Number((url.match(/index=(\d+)/) || [])[1] || 0);
        const data = Array.from({ length: 100 }, (_, i) => dz(idx + i + 1, `Song ${idx + i + 1}`, 'Band', 1000 * (idx + i)));
        return json({ data, next: idx + 100 < 600 ? `https://api.deezer.com/playlist/900/tracks?limit=100&index=${idx + 100}` : null });
      }],
      ['api.deezer.com/playlist/900', json({ id: 900, title: 'Huge Mix' })],
    ];
    {
      const r = await deezer.loadDeezerSource('https://www.deezer.com/en/playlist/900');
      check(r.tracks.length === 500 && r.capped === true, 'a 600-song playlist adds the first 500 (and says so)');
      check(r.tracks[10].pop === 10000, 'Deezer songs carry Deezer\'s popularity score');
      const room = mgr().create();
      room.addPlayer('A', { id: 'a' });
      const res = await room.addSource('900');
      check(res.capped && res.added === 500, 'the room reports the cap to the player');
      const list = room.poolList();
      check(list[0].pop === 0 && list[200].pop === 20 && list.every((s) => typeof s.pop === 'number'), 'song list sent to players includes popularity (0–100)');
    }

    // ----------------------------------------------------------------
    console.log('artist suggestions: most popular first');
    routes = [['api.deezer.com/search/artist', json({ data: [
      { id: 1, name: 'Amr Diab Tribute', nb_fan: 100 }, { id: 2, name: 'Amr Mostafa', nb_fan: 900000 }, { id: 3, name: 'Amr Diab', nb_fan: 5000000 }, { id: 4, name: 'Amro', nb_fan: 2000000 },
    ] })]];
    {
      const list = await deezer.searchArtists('amr');
      check(list.map((a) => a.name).join('|') === 'Amr Diab|Amro|Amr Mostafa|Amr Diab Tribute', 'sorted by fans');
      const exact = await deezer.searchArtists('Amr Mostafa');
      check(exact[0].name === 'Amr Mostafa', 'an exact name match still comes first');
    }

    // ----------------------------------------------------------------
    console.log('artists: top 20, and iTunes for Egyptian/Arabic artists');
    const deezerArtist = (artistId, n, opts = {}) => [
      [`api.deezer.com/artist/${artistId}/top`, (url) => json({ data: Array.from({ length: Math.min(n, Number((url.match(/limit=(\d+)/) || [])[1] || 100)) }, (_, i) => dz(artistId * 1000 + i, opts.title ? opts.title(i) : `Hit ${i}`, opts.name || 'Artist', 900000 - i * 1000, { artistId })) })],
      [`api.deezer.com/artist/${artistId}/albums`, json({ data: [] })],
      [new RegExp(`api\\.deezer\\.com/artist/${artistId}$`), json({ id: artistId, name: opts.name || 'Artist' })],
    ];
    routes = deezerArtist(55, 100, { name: 'Pop Star' });
    {
      const top = await deezer.loadDeezerArtist('Pop Star', '55', { mode: 'top' });
      check(top.tracks.length === 20 && top.name === 'Pop Star: top 20', '"Top 20" gives their 20 most popular songs');
      check(top.tracks[0].pop >= top.tracks[19].pop && !calls.some((u) => u.includes('itunes')), '…most popular first, without asking iTunes');
      const all = await deezer.loadDeezerArtist('Pop Star', '55', { mode: 'all' });
      check(all.tracks.length === 100 && all.name === 'Pop Star: all songs', '"All songs" still gives the full list');
    }
    {
      calls.length = 0;
      const itRes = (id, name, artistId = 777, extra = {}) => ({ wrapperType: 'track', kind: 'song', trackId: id, trackName: name, artistId, artistName: 'Amr Diab', previewUrl: `https://audio.itunes/p${id}.m4a`, artworkUrl100: 'https://is1.mzstatic/x/100x100bb.jpg', trackViewUrl: `https://music.apple/${id}`, ...extra });
      routes = [
        ...deezerArtist(66, 30, { name: 'Amr Diab', title: (i) => ['Tamally Maak', 'Nour El Ain', 'Habibi Ya Nour El Ain', 'Wala Ala Balo'][i] || `Song ${i}` }),
        [/itunes\.apple\.com\/search.*entity=musicArtist/, json({ results: [{ artistId: 777, artistName: 'Amr Diab' }] })],
        [/itunes\.apple\.com\/lookup\?id=777.*country=eg/, json({ results: [
          { wrapperType: 'artist', artistId: 777 },
          itRes(1, "Tamaly Ma'ak"),             // same song, other spelling → skipped
          itRes(2, 'Nour El Ain'),              // exact duplicate → skipped
          itRes(3, 'Ana Ayesh'),                // new → added
          itRes(4, 'Ana Ayesh (Live)'),         // live version → skipped
          itRes(5, 'Someone Else', 999),        // other artist → skipped
          itRes(6, 'عودوني'),                   // Arabic-script title while the list is Latin → skipped
          itRes(7, 'El Leila', 777, { previewUrl: null }), // no preview → skipped
        ] })],
        [/itunes\.apple\.com\/lookup\?id=777/, json({ results: [itRes(8, 'Ya Agmal Eyoun')] })],
        ['audio.itunes', audio()],
      ];
      const r = await deezer.loadDeezerArtist('Amr Diab', '66', { mode: 'all', arabic: true });
      const titles = r.tracks.map((t) => t.title);
      check(titles.includes('Ana Ayesh') && titles.includes('Ya Agmal Eyoun'), 'adds the artist\'s songs Deezer is missing (from the Egypt and US stores)');
      check(!titles.includes("Tamaly Ma'ak") && titles.filter((t) => t === 'Nour El Ain').length === 1, 'no duplicates, even spelled differently');
      check(!titles.some((t) => /Live|Someone|عودوني|El Leila/.test(t)), 'skips live versions, other artists, other-script titles and songs without audio');
      const extra = r.tracks.find((t) => t.title === 'Ana Ayesh');
      check(extra.source === 'itunes' && extra.weight === 0.35 && extra.pop === 0 && /300x300/.test(extra.cover), 'iTunes songs: own audio and cover, picked less often than hits');
      const room = mgr().create();
      room.addPlayer('A', { id: 'a' });
      const clip = await room.loadClip({ ...extra });
      check(clip.buffer.length === 4 && calls.some((u) => u.includes('audio.itunes/p3')), 'iTunes songs play their iTunes preview');
    }

    // ----------------------------------------------------------------
    console.log('packs');
    {
      const metal = packs.byId.get('metal');
      check(metal && metal.ranked && Array.isArray(metal.backup), 'Metal genre pack (ranked, with its own leaderboard)');
      check(packs.PACKS.filter((p) => p.cat === 'Metal artists').length >= 15, 'Metal artists');
      const eg = packs.PACKS.filter((p) => p.cat === 'Egyptian artists');
      check(eg.length >= 30 && eg.every((p) => p.arabic) && eg.some((p) => p.id === 'artist-amr-diab'), 'Egyptian artists (saved packs keep their ids), using iTunes too');
      check(packs.byId.get('egyptian').backup.length >= 3 && packs.byId.get('egyptian-classics'), 'Egyptian packs merge several playlists; new Egyptian Classics pack');
      check(packs.publicPacks().find((p) => p.id === 'artist-drake').artist === true, 'clients can tell artist packs apart (for All songs / Top 20)');
      routes = [
        [/search\/playlist\?q=egyptian%20pop/, json({ data: [{ id: 11, nb_tracks: 40 }] })],
        [/search\/playlist\?q=/, json({ data: [{ id: 11, nb_tracks: 40 }, { id: 12, nb_tracks: 30 }] })],
        ['api.deezer.com/playlist/11/tracks', json({ data: [dz(1, 'A', 'X', 5), dz(2, 'B', 'X', 5)] })],
        ['api.deezer.com/playlist/12/tracks', json({ data: [dz(2, 'B', 'X', 5), dz(3, 'C', 'Y', 5)] })],
        [/api\.deezer\.com\/playlist\/1[12]$/, json({ title: 'P' })],
      ];
      const r = await deezer.loadDeezerPlaylistSearch(['egyptian pop', 'مصري'], 'Egyptian Pop');
      check(r.tracks.map((t) => t.title).join('') === 'ABC', 'two searches → two different playlists merged without repeats');
    }

    // ----------------------------------------------------------------
    console.log('Anghami');
    {
      const cases = [
        ['https://play.anghami.com/playlist/207754540', 'playlist', '207754540'],
        ['play.anghami.com/playlist/207754540?refer=share', 'playlist', '207754540'],
        ['https://play.anghami.com/album/1009163814', 'album', '1009163814'],
        ['anghami://playlist/55', 'playlist', '55'],
      ];
      for (const [u, k, id] of cases) { const r = await anghami.parseAnghamiInput(u); check(r.kind === k && r.id === id, `reads ${u}`); }
      check(/song or artist/.test(await tryErr(() => anghami.parseAnghamiInput('https://play.anghami.com/song/61424477'))), 'a single song link gets a clear message');
      check(anghami.isAnghami('https://play.anghami.com/playlist/1') && anghami.isAnghami('open.anghami.com/abc') && !anghami.isAnghami('https://open.spotify.com/playlist/x'), 'recognises Anghami links');

      // Page with the song list rendered as links (E = explicit badge)
      const linksPage = `<html><head><meta property="og:title" content=":) playlist | Play on Anghami" />
        <meta name="description" content="Play and download :) - which includes songs like Chanel by Frank Ocean, BLEACH by BROCKHAMPTON, and My Favorite Part by MAC MILLER &amp; Ariana Grande." /></head><body>
        <div>55 Songs</div>
        <div class="row"><a href="/song/61424477"><span>Chanel</span><span class="explicit">E</span></a><a href="/artist/1">Frank Ocean</a><a href="/album/2">Channel ORANGE</a></div>
        <div class="row"><a href="https://play.anghami.com/song/30630919">BLEACH E</a><a href="https://play.anghami.com/artist/3">BROCKHAMPTON</a></div>
        <div class="row"><a href="/song/16782278">My Favorite Part</a><a href="/artist/4">Mac Miller</a><a href="/artist/5">Ariana Grande</a></div>
        <div class="row"><a href="/song/73958856">Around Me</a><a href="/artist/6">Brent Faiyaz</a></div></body></html>`;
      const a = anghami.parseAnghamiPage(linksPage, 'playlist', '207754540');
      check(a.name === ':)' && a.tracks.length === 4, 'reads the rendered song list (4 songs) and the playlist name');
      check(a.tracks[0].title === 'Chanel' && a.tracks[1].title === 'BLEACH' && a.tracks[2].artist === 'Mac Miller, Ariana Grande', 'strips the explicit "E" badge; keeps every artist');
      check(a.listed === 55 && a.tracks[0].link === 'https://play.anghami.com/song/61424477', 'notices the playlist has 55 songs; links each song');

      // The real page's shape (checked on play.anghami.com, Oct 2026): minified HTML with unquoted
      // attributes, a schema.org MusicPlaylist block, and the app state (&q;-escaped) whose
      // GETplaylistdata answer has a "song" section plus video/artist sections.
      const songs = Array.from({ length: 50 }, (_, i) => ({ nofollow: false, id: String(1000 + i), title: i === 0 ? 'سوبريم' : `اغنية ${i}`, album: 'X', albumID: '9', artist: i === 0 ? 'عفروتو' : 'تامر حسني', artistID: '1', coverArt: String(500 + i), explicit: '0' }));
      const videos = [{ id: 'v1', title: 'Video song', artist: 'Someone', artistID: '2', albumID: '3' }, { id: 'v2', title: 'Clip', artist: 'Other', artistID: '4', albumID: '5' }];
      const stateObj = { 'G.https://coussa.anghami.com/gateway.php?buffered=1&playlistid=36571832&type=GETplaylistdata': { body: { title: 'Top Egyptian', count: 50, numsongs: 50, limit_number_songs: 5000, sections: [{ type: 'vibestags', data: [] }, { type: 'song', displaytype: 'list', data: songs }, { type: 'video', title: 'Music Videos', data: videos }, { type: 'artist', data: [{ id: '1', name: 'X' }] }] } }, NGRX_STATE: {} };
      const ld = { '@context': 'http://schema.org/', '@type': 'MusicPlaylist', '@id': 'https://play.anghami.com/playlist/36571832', name: 'Top Egyptian', numtracks: 50,
        track: songs.map((x) => ({ '@context': 'http://schema.org/', '@type': 'MusicRecording', name: x.title, byArtist: { '@type': 'MusicGroup', name: x.artist }, image: `https://artwork.anghcdn.co/?id=${x.coverArt}&size=120`, url: '' })) };
      const realPage = `<!DOCTYPE html><html lang=en><head><meta charset=utf-8><title>Top Egyptian playlist | Play on Anghami</title><meta property=og:title content="Top Egyptian playlist | Play on Anghami"><meta property=og:type content=music.playlist>` +
        `<script type=application/ld+json>{"@context":"http://schema.org","@type":"Organization","name":"Anghami"}</script><script crossorigin=anonymous src=/_fs-ch-1T1wmsGaOgGaSxcX/assets/script.js></script></head><body><app-root></app-root>` +
        `<script type=application/ld+json>${JSON.stringify(ld)}</script><script id=anghami-web-v2-state type=application/json>${JSON.stringify(stateObj).replace(/"/g, '&q;').replace(/&(?!q;)/g, '&a;')}</script></body></html>`;
      const b = anghami.parseAnghamiPage(realPage, 'playlist', '36571832');
      check(b.name === 'Top Egyptian' && b.tracks.length === 50 && b.listed === 50, 'real page layout: all 50 songs from the app state, playlist name from og:title');
      check(b.tracks[0].title === 'سوبريم' && b.tracks[0].artist === 'عفروتو' && !b.tracks.some((t) => /Video song|Clip/.test(t.title)), 'Arabic titles intact; music videos left out');
      check(b.tracks[0].cover === 'https://artwork.anghcdn.co/?id=500&size=296' && b.tracks[0].link === 'https://play.anghami.com/song/1000', 'each song gets its own cover art and link');
      const ldOnly = anghami.parseAnghamiPage(realPage.replace(/<script id=anghami-web-v2-state[\s\S]*?<\/script>/, ''), 'playlist', '1');
      check(ldOnly.tracks.length === 50 && ldOnly.tracks[1].artist === 'تامر حسني' && /size=296/.test(ldOnly.tracks[1].cover), 'without the app state: all songs from the schema.org list');
      const challenge = '<!doctype html><html lang="en"><head><link href="/_fs-ch-1T1wmsGaOgGaSxcX/assets/styles.css" rel="stylesheet" /><title>Client Challenge</title></head><body>Please enable JavaScript to proceed.</body></html>';
      check(anghami.isChallenge(challenge) && !anghami.isChallenge(realPage), 'recognises Anghami\'s bot-check page');

      // Only a description: still gets a few songs
      const c = anghami.parseAnghamiPage('<meta property="og:description" content="Play and download Road - which includes songs like Tamally Maak by Amr Diab, Ah W Noss by Nancy Ajram, and Aal Bal by Elissa.">', 'playlist', '1');
      check(c.tracks.length === 3 && c.tracks[1].title === 'Ah W Noss' && c.tracks[2].artist === 'Elissa' && c.partial, 'falls back to the songs named in the page description');

      routes = [
        ['play.anghami.com/playlist/36571832', html(realPage)],
        ['play.anghami.com/playlist/777', html(challenge)],
        ['play.anghami.com/playlist/207754540', html(linksPage)],
        ['play.anghami.com/playlist/404', { ok: false, status: 404, text: async () => '' }],
        [/deezer\.com\/search\?q=artist%3A%22Frank%20Ocean/, json({ data: [] })],
        [/itunes\.apple\.com\/search\?term=Chanel/, json({ results: [{ wrapperType: 'track', kind: 'song', trackId: 5, trackName: 'Chanel', artistName: 'Frank Ocean', previewUrl: 'https://audio.itunes/chanel.m4a', artworkUrl100: 'https://img/100x100bb.jpg' }] })],
        ['audio.itunes', audio()],
      ];
      const room = mgr().create();
      room.addPlayer('A', { id: 'a' });
      const res = await room.addSource({ input: 'https://play.anghami.com/playlist/207754540' });
      check(res.added === 4 && res.short === true && room.pool[0].source === 'anghami', 'adds an Anghami playlist (and says when Anghami only showed part of it)');
      calls.length = 0;
      const clip = await room.loadClip(room.pool[0]);
      check(clip.buffer.length === 4 && calls.findIndex((u) => u.includes('deezer.com/search')) < calls.findIndex((u) => u.includes('itunes.apple.com/search')), 'Anghami songs: audio from Deezer first, else iTunes');
      check(/doesn't exist/.test(await tryErr(() => room.addSource({ input: 'https://play.anghami.com/playlist/404' }))), 'missing/private playlist explained');
      const full = await room.addSource({ input: 'https://play.anghami.com/playlist/36571832?refer=share' });
      check(full.added === 50 && !full.short, 'a real-shaped Anghami playlist adds all its songs');
      check(/robot/.test(await tryErr(() => room.addSource({ input: 'https://play.anghami.com/playlist/777' }))), 'bot check: tries again, then explains');
    }

    // ----------------------------------------------------------------
    console.log('popularity lookups for songs without it');
    {
      const looked = [];
      popularity._setLookup(async (t) => { looked.push(t.title); if (t.title === 'Gone') throw new Error('none'); return { pop: t.title === 'Big' ? 950000 : 120000, sourceId: 'dz-' + t.title }; });
      const pushes = [];
      const room = new RoomManager({ to: () => ({ emit: (e, d) => pushes.push([e, d]) }) }, { popularity: true }).create();
      room.addPlayer('A', { id: 'a' });
      const tracks = ['Small', 'Big', 'Gone'].map((title, i) => ({ source: 'spotify', sourceId: 'sp' + i, title, artist: 'X' }));
      room.sources.push({ key: 'k', name: 'S', tracks, count: 0 });
      room.rebuildPool();
      room.findPopularity(tracks);
      check(room.poolList().every((s) => s.pop === null), 'unknown at first');
      await wait(1300);
      const list = room.poolList();
      check(looked.length === 3 && list.find((s) => s.title === 'Big').pop === 95 && list.find((s) => s.title === 'Small').pop === 12 && list.find((s) => s.title === 'Gone').pop === 0, 'looked up in the background (big hit 95, not found 0)');
      check(pushes.some(([e, d]) => e === 'pool' && d.songs.length === 3), 'everyone gets the updated song list');
      check(room.pool[1]._src.deezerId === 'dz-Big', 'the Deezer match is kept for a faster round later');
      popularity.enrich(tracks);
      await wait(50);
      check(looked.length === 3, 'never looked up twice');
    }

    // ----------------------------------------------------------------
    console.log('store, icons, hidden accounts');
    {
      const store = new MiniRedis();
      await store.cmd('HSET', 'h', 'a', 1, 'b', 2);
      check(await store.cmd('HLEN', 'h') === 2 && await store.cmd('HDEL', 'h', 'a') === 1 && await store.cmd('HLEN', 'h') === 1, 'HLEN / HDEL');
      const acc = new Accounts(store);
      const a = (await acc.signup({ name: 'Asher', email: 'a@x.co', password: 'secret1' })).user;
      const b = (await acc.signup({ name: 'Bo', email: 'b@x.co', password: 'secret1' })).user;
      const c = (await acc.signup({ name: 'Cy', email: 'c@x.co', password: 'secret1' })).user;
      const [scanCursor, scanKeys] = await store.cmd('SCAN', '0', 'MATCH', 'user:*', 'COUNT', 500);
      check(scanCursor === '0' && scanKeys.length === 3, 'SCAN finds the accounts');
      check(ICONS.length >= 30 && new Set(ICONS).size === ICONS.length, `${ICONS.length} icons to pick from`);
      check(/Pick one/.test(await tryErr(() => acc.updateSettings(a.id, { icon: '💩' }))), 'only the listed icons');
      const s1 = await acc.updateSettings(a.id, { icon: '🎧', hidden: true });
      check(s1.user.icon === '🎧' && s1.user.hidden === true, 'icon and "hide my account" saved');
      check((await acc.session((await acc.login({ email: 'a@x.co', password: 'secret1' })).token)).hidden === true, 'login knows the account is hidden');
      await acc.submitRanked(a.id, { packId: 'pop', score: 9000, songs: 5, correct: 5 });
      await acc.submitRanked(b.id, { packId: 'pop', score: 5000, songs: 5, correct: 5 });
      const asStranger = await acc.leaderboard('pop', c.id);
      check(asStranger.entries[0].name === 'Hidden player' && asStranger.entries[0].id === null && asStranger.entries[0].icon === '', 'strangers see "Hidden player" on leaderboards, with no link');
      check(asStranger.entries[1].name === 'Bo', '…other players are unaffected');
      check((await acc.leaderboard('pop', a.id)).entries[0].name === 'Asher', 'you still see yourself');
      check(/private/.test(await tryErr(() => acc.profile(a.id, c.id))) && /private/.test(await tryErr(() => acc.profile(a.id, null))), 'strangers can\'t open your stats');
      await acc.requestFriend(b.id, { id: a.id }); await acc.acceptFriend(a.id, b.id);
      check((await acc.leaderboard('pop', b.id)).entries[0].name === 'Asher' && (await acc.profile(a.id, b.id)).icon === '🎧', 'friends still see you');
      check((await acc.friends(b.id)).friends[0].icon === '🎧', 'friends list shows icons');
      await acc.updateSettings(a.id, { hidden: false });
      check((await acc.leaderboard('pop', c.id)).entries[0].name === 'Asher', 'un-hiding shows you again');
      const room = mgr().create();
      const p = room.addPlayer('Asher', { id: 's' }, '🦊');
      room.setAccount(p.id, { id: a.id, hidden: true });
      let st = room.publicState(p.id).players[0];
      check(st.icon === '🦊' && st.loggedIn && st.userId === null, 'in rooms: icon shown; hidden accounts don\'t reveal which account');
      room.setIcon(p.id, 'nope');
      check(room.publicState(p.id).players[0].icon === '', 'bad icons are ignored');
    }

    // ----------------------------------------------------------------
    console.log('themes, share codes, decorations');
    {
      const store = {};
      const events = [];
      const ctx = {
        localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        document: { documentElement: { style: { setProperty() {} }, dataset: {} }, querySelector: () => null },
        CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
      };
      ctx.window = { dispatchEvent: (e) => events.push(e) };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/themes.js'), 'utf8'), ctx);
      const T = ctx.window.SliverThemes;
      const names = T.THEMES.map((t) => t.name);
      check(!names.some((n) => /^GX|Opera|Ultraviolet|Hackerman|Rose Quartz|Purple Haze|Vaporwave|Sub Zero|Lambda|Frutti|Pay to Win|After Eight/i.test(n)), 'theme names are Sliver\'s own: ' + names.join(', '));
      check(new Set(names).size === names.length, 'every theme name is unique');
      store['sliver.theme'] = 'gx';
      check(T.current() === 'onair', 'a saved old "GX" choice moves to its new name');
      const colors = { page: '#0F172A', card: '#F8FAFC', accent: '#E11D48', pop: '#22D3EE' };
      const code = T.encode(colors);
      check(/^SLV-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{2}$/.test(code), `share code looks like ${code}`);
      check(JSON.stringify(T.decode(code)) === JSON.stringify(colors), 'a code turns back into the same 4 colors');
      check(JSON.stringify(T.decode(` ${code.toLowerCase().replace(/-/g, ' ')} `)) === JSON.stringify(colors), 'pasting is forgiving (lowercase, spaces)');
      check(T.decode(code.slice(0, -1) + (code.endsWith('Z') ? 'Y' : 'Z')) === null && T.decode('hello') === null, 'typos are caught');
      const t = T.setCustom(colors);
      check(t.id === 'custom' && T.current() === 'custom' && events.at(-1).detail.id === 'custom', 'using a code switches to "My theme"');
      const darkT = T.buildCustom({ page: '#000000', card: '#111111', accent: '#7C3AED', pop: '#FDE047' });
      check(darkT.dark && darkT.vars['--ink'] === '#F3F1FA' && T.contrast(darkT.vars['--ink'], '#111111') > 7, 'dark cards get light text');
      const lightT = T.buildCustom({ page: '#FFFFFF', card: '#FFFFFF', accent: '#FDE047', pop: '#1D4ED8' });
      check(lightT.vars['--on-page'] !== '#FFFFFF' && lightT.vars['--accent-ink'] !== '#FFFFFF' && lightT.vars['--pop-ink'] === '#FFFFFF', 'text color always picked for contrast');
      const holidays = T.THEMES.filter((x) => x.season);
      const decorSrc = fs.readFileSync(path.join(__dirname, '../public/decor.js'), 'utf8');
      check(holidays.every((h) => h.decor && new RegExp(`\\b${h.decor}\\(\\)`).test(decorSrc)), 'every holiday theme has decorations: ' + holidays.map((h) => h.decor).join(', '));
      const halloween = T.THEMES.find((x) => x.id === 'halloween');
      check(T.inSeason(halloween, new Date(2026, 9, 31)) && !T.inSeason(halloween, new Date(2026, 11, 2)), 'Halloween is on Oct 31, gone in December');
      check(/bat\(|ghost\(|pumpkin\(|spider\(|web\(|tomb\(/.test(decorSrc) && (decorSrc.match(/const (bat|ghost|pumpkin|spider|web|tomb|moon|candy) =/g) || []).length === 8, 'Halloween figures: bats, ghosts, pumpkins, spiders, webs, gravestones, moon, candy corn');
    }

    // ----------------------------------------------------------------
    console.log('server: host-only songs, icons, admin stats');
    global.fetch = realFetch;
    const PORT = 3997, URL = `http://127.0.0.1:${PORT}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sliver-v6-'));
    const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEMO_ONLY: '1', ADMIN_KEY: 'letmein' };
    for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'RENDER']) delete env[k];
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    await new Promise((r) => srv.stdout.on('data', (d) => { out += d; if (out.includes('running')) setTimeout(r, 100); }));
    const client = () => {
      const ws = new WebSocket(URL.replace('http', 'ws') + '/ws');
      const ready = new Promise((r) => ws.addEventListener('open', r));
      const pending = new Map(); let nextId = 1;
      const s = { last: null };
      ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.ack !== undefined) { pending.get(m.ack)(m.d); pending.delete(m.ack); } else if (m.e === 'state') s.last = m.d; });
      s.call = async (e, d) => { await ready; return new Promise((res) => { const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ e, d: d || {}, id })); }); };
      s.close = () => ws.close();
      return s;
    };
    try {
      check(out.includes('Admin page: on'), 'startup log says the admin page is on');
      const host = client(), guest = client();
      const room = await host.call('create', { name: 'Host', icon: '🎸' });
      await guest.call('join', { code: room.code, name: 'Guest', icon: '🐼' });
      await wait(100);
      check(host.last.players.find((p) => p.name === 'Guest').icon === '🐼', 'everyone sees each player\'s icon');
      await guest.call('setIcon', { icon: '🔥' }); await wait(80);
      check(host.last.players.find((p) => p.name === 'Guest').icon === '🔥', 'changing your icon updates the room');
      check((await host.call('settings', { hostOnlySongs: true })).ok, 'host turns on "Only the host adds songs"');
      await wait(60);
      check(guest.last.settings.hostOnlySongs === true, 'guests are told');
      check(/Only the host adds songs/.test((await guest.call('addPlaylist', { input: 'demo' })).error || ''), 'guests can\'t add songs');
      const added = await host.call('addPlaylist', { input: 'demo' });
      check(added.ok, 'the host still can');
      await wait(60);
      const key = host.last.sources[0].key;
      check(/Only the host/.test((await guest.call('removeSource', { key })).error || ''), 'guests can\'t remove songs either');
      check((await guest.call('settings', { hostOnlySongs: false })).ok === false, 'only the host can change it');
      await host.call('settings', { hostOnlySongs: false });
      check((await guest.call('addPlaylist', { packId: 'top-hits' })).ok === false && (await guest.call('addPlaylist', { input: 'demo' })).ok !== undefined, 'turned off: guests can add again');

      const noKey = await (await fetch(`${URL}/api/admin/stats`)).json();
      check(noKey.ok === false && /Wrong admin key/.test(noKey.error), 'admin stats need the key');
      check((await (await fetch(`${URL}/api/admin/stats`, { headers: { 'x-admin-key': 'nope' } })).json()).ok === false, 'wrong key refused');
      await host.call('settings', { rounds: 3 });
      await host.call('start');
      await wait(300);
      const st = await (await fetch(`${URL}/api/admin/stats`, { headers: { 'x-admin-key': 'letmein' } })).json();
      check(st.ok && st.live.players === 2 && st.live.activeRooms === 1 && st.live.playing === 1, 'live: 2 players, 1 room, 1 game being played');
      check(st.days[0].games === 1 && st.total.games === 1 && st.days[0].songs >= 1, 'counts games and songs played today and all-time');
      check(st.live.roomList[0].code === room.code && st.live.roomList[0].host === 'Host', 'lists open rooms with their host');
      check(st.days[0].peak === 2 && st.total.peak === 2, 'remembers the most players online at once (2)');
      check(st.total.accounts === 0 && st.days.length === 7 && st.server.database === 'local file', 'accounts, last 7 days, server info');
      const signup = await (await fetch(`${URL}/api/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New', email: 'n@x.co', password: 'secret1' }) })).json();
      const st2 = await (await fetch(`${URL}/api/admin/stats?key=letmein`)).json();
      check(signup.ok && st2.total.accounts === 1 && st2.days[0].signups === 1, 'sign-ups counted');
      const me = await (await fetch(`${URL}/api/me/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.token}` }, body: JSON.stringify({ icon: '👑', hidden: true }) })).json();
      check(me.ok && me.user.icon === '👑' && me.user.hidden === true, 'POST /api/me/settings saves icon + hidden');
      const page = await (await fetch(`${URL}/admin.html`)).text();
      check(/Sliver admin/.test(page) && !/letmein/.test(page), 'admin page is served and holds no secrets');
      host.close(); guest.close();
    } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  } catch (err) {
    failed++;
    console.error('  ✗ crashed:', err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
