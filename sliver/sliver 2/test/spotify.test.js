// Offline test for Spotify support: fakes Spotify's embed page and Deezer's API.
// Run: node test/spotify.test.js

let passed = 0, failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.log('  ✗', msg); } };

function embedHtml(entity, wrap = (e) => ({ props: { pageProps: { state: { data: { entity: e } } } } })) {
  return `<!doctype html><html><body><div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(wrap(entity))}</script></body></html>`;
}

const ENTITY = {
  type: 'playlist',
  name: 'Road Trip Bangers',
  coverArt: { sources: [{ url: 'https://img/640.jpg', width: 640 }, { url: 'https://img/300.jpg', width: 300 }] },
  trackList: [
    { uri: 'spotify:track:AAA', title: 'Mr. Brightside', subtitle: 'The Killers', audioPreview: { url: 'https://p.scdn.co/mp3-preview/aaa' } },
    { uri: 'spotify:track:BBB', title: 'Dreams - 2004 Remaster', subtitle: 'Fleetwood Mac' },
    { uri: 'spotify:episode:EEE', title: 'Some Podcast', subtitle: 'Host' },
    { uri: 'spotify:track:CCC', title: 'Levitating (feat. DaBaby)', subtitle: 'Dua Lipa, DaBaby' },
  ],
};

const calls = [];
global.fetch = async (url) => {
  url = String(url);
  calls.push(url);
  const json = (o) => ({ ok: true, status: 200, url, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => 'application/json' } });
  const bin = (type) => ({ ok: true, status: 200, url, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, headers: { get: () => type } });
  if (url.includes('open.spotify.com/oembed')) {
    if (decodeURIComponent(url).includes('/track/BBB')) return json({ thumbnail_url: 'https://i.scdn.co/image/dreams-album' });
    return { ok: false, status: 404, url, json: async () => ({}) };
  }
  if (url.includes('spotify.link/')) return { ok: true, status: 200, url: 'https://open.spotify.com/playlist/XYZ123?si=abc', text: async () => '' };
  if (url.includes('open.spotify.com/embed/playlist/MISSING')) return { ok: false, status: 404, url, text: async () => '' };
  if (url.includes('open.spotify.com/embed/playlist/PRIVATE')) return { ok: true, status: 200, url, text: async () => embedHtml({ name: 'x' }) };
  if (url.includes('open.spotify.com/embed/album/ALB')) {
    return { ok: true, status: 200, url, text: async () => embedHtml({ title: 'Album', trackList: [{ uri: 'spotify:track:Z', title: 'Song Z', subtitle: 'Band' }] }, (e) => ({ some: { other: { layout: e } } })) };
  }
  if (url.includes('open.spotify.com/embed/')) return { ok: true, status: 200, url, text: async () => embedHtml(ENTITY) };
  if (url.includes('p.scdn.co')) return bin('audio/mpeg');
  if (url.includes('api.deezer.com/search')) {
    const q = decodeURIComponent(url.split('q=')[1]);
    if (q.includes('Dreams') && !q.includes('Remaster')) return json({ data: [{ id: 555, title: 'Dreams', title_short: 'Dreams', preview: 'https://cdn/dz555.mp3', artist: { name: 'Fleetwood Mac' }, album: { cover_medium: 'https://dz/cover.jpg' } }] });
    if (q.includes('Levitating') && !q.includes('feat')) return json({ data: [{ id: 777, title: 'Levitating', preview: 'https://cdn/dz777.mp3', artist: { name: 'Dua Lipa' }, album: { cover_medium: 'https://dz/lev.jpg' } }] });
    return json({ data: [] });
  }
  if (url.includes('api.deezer.com/track/')) return json({ id: 1, preview: `https://cdn/${url.split('/').pop()}.mp3` });
  if (url.includes('cdn/')) return bin('audio/mpeg');
  throw new Error('unexpected fetch ' + url);
};

const { parseSpotifyInput, isSpotify } = require('../server/spotify');
const { RoomManager } = require('../server/game');

(async () => {
  try {
    console.log('spotify links');
    check(isSpotify('https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd?si=1') && !isSpotify('https://www.deezer.com/playlist/1'), 'detects Spotify vs Deezer links');
    const forms = [
      ['https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd?si=abc', 'playlist', '37i9dQZF1DX0XUsuxWHRQd'],
      ['https://open.spotify.com/intl-es/playlist/ABC123', 'playlist', 'ABC123'],
      ['spotify:playlist:QQQ999', 'playlist', 'QQQ999'],
      ['https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy', 'album', '4aawyAB9vmqN3uQ7FjRGTy'],
      ['https://spotify.link/abcDEF', 'playlist', 'XYZ123'],
    ];
    for (const [input, kind, id] of forms) {
      const r = await parseSpotifyInput(input);
      check(r.kind === kind && r.id === id, `parses ${input.slice(0, 48)}`);
    }
    try { await parseSpotifyInput('https://open.spotify.com/track/123'); check(false, 'single track rejected'); }
    catch (e) { check(/single song/.test(e.message), 'single track link gets a clear message'); }

    console.log('adding a playlist');
    const room = new RoomManager({ to: () => ({ emit() {} }) }).create();
    const p = room.addPlayer('Asher', { id: 's1' });
    const res = await room.addSource('https://open.spotify.com/playlist/XYZ123?si=1', 'Asher');
    check(res.name === 'Road Trip Bangers' && res.added === 3, 'reads 3 songs, skips the podcast episode');
    check(room.pool.every((t) => t.cover === null), 'playlist songs never use the playlist\'s cover');
    check(!calls.some((u) => u.includes('deezer')), 'adding is instant: no Deezer lookups up front');

    try { await room.addSource('https://open.spotify.com/playlist/PRIVATE', 'Asher'); check(false, 'private rejected'); }
    catch (e) { check(/public/.test(e.message), 'private/unreadable playlist explains it must be public'); }
    try { await room.addSource('https://open.spotify.com/playlist/MISSING', 'Asher'); check(false, 'missing rejected'); }
    catch (e) { check(/doesn't exist/.test(e.message), 'missing playlist gets a clear message'); }
    const alb = await room.addSource('https://open.spotify.com/album/ALB', 'Asher');
    check(alb.added === 1, 'album works, and survives a changed page layout');
    check(room.pool.at(-1).cover === null, 'album without art in the page has no fake cover');

    console.log('audio for rounds');
    const [bright, dreams, lev] = room.pool;
    calls.length = 0;
    const c1 = await room.loadClip(bright);
    const audioCalls = calls.filter((u) => !u.includes('oembed'));
    check(c1.buffer.length === 3 && audioCalls[0].includes('deezer.com/search') && audioCalls.at(-1).includes('p.scdn.co'),
      'tries an exact Deezer match first (better quality), falls back to Spotify\'s preview');
    calls.length = 0;
    await room.loadClip(dreams);
    check(dreams.deezerId === '555' && calls.some((u) => u.includes('track/555')), 'no Spotify preview → matched on Deezer (remaster tag stripped)');
    check(dreams.cover === 'https://i.scdn.co/image/dreams-album', 'song\'s own Spotify album art wins over Deezer\'s');
    await room.loadClip(lev);
    check(lev.deezerId === '777', '"(feat. …)" stripped for matching');
    check(bright.cover === null && lev.cover !== null, 'no Spotify art → Deezer match art; neither → no cover (not the playlist\'s)');
    check(lev.title === 'Levitating (feat. DaBaby)', 'guess list keeps Spotify\'s song names');

    console.log('full round with Spotify songs');
    room.settings.rounds = 1;
    await room.start();
    check(room.phase === 'round', 'round starts with a Spotify-sourced clip');
    room.guess(p.id, room.round.track.poolId);
    check(room.phase === 'reveal' && room.reveal.link.startsWith('https://open.spotify.com/track/'), 'reveal links to the song on Spotify');
    room.clearTimers();
  } catch (err) {
    failed++; console.error('  ✗ crashed:', err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
