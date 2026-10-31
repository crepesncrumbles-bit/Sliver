// Deezer helpers: read public playlists/albums and fetch 30-second previews.
// Deezer's public API needs no login or API key.

const API = 'https://api.deezer.com';
const { normText } = require('./text');
const itunes = require('./itunes');
const MAX_TRACKS = 500; // most songs one playlist can add

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Sliver/1.0' } });
  if (!res.ok) throw new Error(`Deezer returned HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) {
    throw new Error(data.error.message || 'Deezer error');
  }
  return data;
}

// Accepts: a full Deezer URL, a share link (link.deezer.com / deezer.page.link), or a bare ID.
async function parseDeezerInput(input) {
  const text = String(input || '').trim();
  if (/^\d+$/.test(text)) return { kind: 'playlist', id: text };

  let m = text.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album)\/(\d+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };

  if (/^https?:\/\/(link\.deezer\.com|deezer\.page\.link|dzr\.page\.link)\//i.test(text)) {
    // Short share link: follow redirects, then look in the final URL and the page body.
    const res = await fetch(text, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    m = res.url.match(/(playlist|album)\/(\d+)/i);
    if (m) return { kind: m[1].toLowerCase(), id: m[2] };
    const body = await res.text();
    m = body.match(/deezer\.com\/(?:[a-z]{2}\/)?(playlist|album)\/(\d+)/i);
    if (m) return { kind: m[1].toLowerCase(), id: m[2] };
  }

  throw new Error('That doesn\'t look like a Spotify or Deezer playlist/album link.');
}

function toTrack(t, albumCover) {
  return {
    source: 'deezer',
    sourceId: String(t.id),
    title: t.title_short || t.title,
    artist: t.artist ? t.artist.name : 'Unknown',
    cover: (t.album && (t.album.cover_medium || t.album.cover)) || albumCover || null,
    link: t.link || `https://www.deezer.com/track/${t.id}`,
    // Deezer's popularity score (higher = more popular; same scale for every song on Deezer).
    ...(t.rank !== undefined ? { pop: Number(t.rank) || 0 } : {}),
  };
}

async function loadDeezerSource(input) {
  const { kind, id } = await parseDeezerInput(input);
  const meta = await getJson(`${API}/${kind}/${id}`);
  const name = meta.title || `${kind} ${id}`;
  const albumCover = kind === 'album' ? meta.cover_medium : null;

  const tracks = [];
  let url = `${API}/${kind}/${id}/tracks?limit=100`;
  let capped = false; // the playlist had more than MAX_TRACKS songs
  while (url) {
    const page = await getJson(url);
    for (const t of page.data || []) {
      if (t.readable === false || !t.preview) continue;
      if (tracks.length >= MAX_TRACKS) { capped = true; break; }
      tracks.push(toTrack(t, albumCover));
    }
    if (tracks.length >= MAX_TRACKS) { capped = capped || !!page.next; break; }
    url = page.next || null;
  }
  if (!tracks.length) throw new Error(`"${name}" has no playable previews.`);
  return { name, tracks, capped };
}

// Preview URLs are signed and expire, so always look the track up fresh.
async function fetchPreview(trackId) {
  const t = await getJson(`${API}/track/${trackId}`);
  if (!t.preview) throw new Error('No preview for this track');
  const res = await fetch(t.preview);
  if (!res.ok) throw new Error(`Preview download failed (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, contentType: res.headers.get('content-type') || 'audio/mpeg' };
}

// Find a song on Deezer by title + artist (used for Spotify tracks that have no preview).
const clean = (s) => String(s || '')
  .replace(/\s*[-–]\s*(\d{4}\s+)?(remaster(ed)?|live|radio edit|single version|mono|stereo|bonus track).*$/i, '')
  .replace(/\s*[([](feat\.?|ft\.?|with|from|remaster|live)[^)\]]*[)\]]/gi, '')
  .trim();

async function searchDeezer(title, artist, { strict = false } = {}) {
  const t = clean(title);
  const a = String(artist || '').split(/,|&| feat\.? | x /i)[0].trim();
  const queries = strict ? [`artist:"${a}" track:"${t}"`] : [`artist:"${a}" track:"${t}"`, `${a} ${t}`, t];
  for (const q of queries) {
    const data = await getJson(`${API}/search?q=${encodeURIComponent(q)}&limit=10`);
    const hit = (data.data || []).find((x) => x.preview && x.readable !== false);
    if (hit) return toTrack(hit);
  }
  throw new Error(`No Deezer match for "${title}"`);
}

// Find public Deezer playlists by name (backup for built-in packs) and load them.
// query can be a list: each search adds its best playlist, merged without repeats
// (used to pull more songs into packs like Egyptian Pop).
async function loadDeezerPlaylistSearch(query, name) {
  const queries = Array.isArray(query) ? query : [query];
  const seen = new Set();
  const usedLists = new Set();
  const tracks = [];
  let firstName = null;
  for (const q of queries) {
    try {
      const data = await getJson(`${API}/search/playlist?q=${encodeURIComponent(q)}&limit=10`);
      const list = (data.data || []).filter((p) => !usedLists.has(String(p.id)));
      const pick = list.find((p) => (p.nb_tracks || 0) >= 25) || list[0];
      if (!pick) continue;
      usedLists.add(String(pick.id));
      const src = await loadDeezerSource(String(pick.id));
      firstName = firstName || src.name;
      for (const t of src.tracks) {
        const key = normText(t.title) + '|' + normText(t.artist);
        if (seen.has(key) || tracks.length >= MAX_TRACKS) continue;
        seen.add(key);
        tracks.push(t);
      }
    } catch (err) {
      if (queries.length === 1) throw err;
    }
  }
  if (!tracks.length) throw new Error(`Couldn't find songs for "${name || queries[0]}"`);
  return { name: name || firstName, tracks };
}

// An artist's songs: their top 100 plus the songs from their albums, EPs and singles
// (up to MAX_ARTIST_SONGS). Each song gets a `weight` from Deezer's popularity rank,
// so games mostly pick well-known songs while every song is still guessable.
const MAX_ARTIST_SONGS = 400;
const MAX_ARTIST_WITH_EXTRA = 500; // after adding iTunes-only songs
const TOP_N_SONGS = 20;
const MAX_RELEASES = 45;
const SKIP_VERSION = /[([\-–].*\b(live|remix|remixed|instrumental|karaoke|sped ?up|slowed|reverb|a ?cappella|acapella|commentary|voice memo|demo version)\b/i;
const artistCache = new Map(); // "artistId:all|top" -> { at, promise }
const ARTIST_TTL = 6 * 60 * 60 * 1000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Deezer allows ~50 requests per 5 s; on "quota" errors wait and retry once.
async function getJsonRetry(url) {
  try { return await getJson(url); } catch (err) {
    if (!/quota/i.test(err.message)) throw err;
    await wait(1500);
    return getJson(url);
  }
}

async function findArtist(q, artistId) {
  if (artistId && /^\d+$/.test(String(artistId))) return getJson(`${API}/artist/${artistId}`);
  if (!q) throw new Error('Type an artist name');
  const found = await getJson(`${API}/search/artist?q=${encodeURIComponent(q)}&limit=5`);
  const nq = normText(q).replace(/ /g, '');
  const list = found.data || [];
  return list.find((a) => normText(a.name).replace(/ /g, '') === nq) || list[0] || null;
}

async function artistSongs(artist, { top = 0 } = {}) {
  const seen = new Set();
  const out = [];
  const add = (t, cover) => {
    if (!t || !t.preview || t.readable === false) return;
    if (t.artist && t.artist.id && String(t.artist.id) !== String(artist.id)) return; // other artists on compilations
    const title = t.title_short || t.title;
    if (SKIP_VERSION.test(t.title || '')) return;
    const key = normText(title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...toTrack(t, cover), pop: Number(t.rank) || 0 });
  };

  // "Top 20": just their 20 most popular songs.
  if (top) {
    const res = await getJsonRetry(`${API}/artist/${artist.id}/top?limit=${Math.min(100, top * 3)}`);
    for (const t of res.data || []) add(t);
    out.sort((a, b) => b.pop - a.pop);
    return out.slice(0, top);
  }

  const [topList, releases] = await Promise.all([
    getJsonRetry(`${API}/artist/${artist.id}/top?limit=100`),
    getJsonRetry(`${API}/artist/${artist.id}/albums?limit=100`).catch(() => ({ data: [] })),
  ]);
  for (const t of topList.data || []) add(t);

  // Biggest releases first (by fans), albums before singles when tied.
  const rel = (releases.data || [])
    .filter((a) => !/live|remix|karaoke|instrumental/i.test(a.title || ''))
    .sort((a, b) => (b.fans || 0) - (a.fans || 0) || (a.record_type === 'album' ? -1 : 1))
    .slice(0, MAX_RELEASES);
  for (let i = 0; i < rel.length && out.length < MAX_ARTIST_SONGS; i += 8) {
    const batch = rel.slice(i, i + 8);
    const lists = await Promise.all(batch.map((a) =>
      getJsonRetry(`${API}/album/${a.id}/tracks?limit=100`).then((r) => ({ a, tracks: r.data || [] })).catch(() => ({ a, tracks: [] }))));
    for (const { a, tracks } of lists) for (const t of tracks) add(t, a.cover_medium);
    if (i + 8 < rel.length) await wait(900); // stay under Deezer's rate limit
  }
  return out.slice(0, MAX_ARTIST_SONGS);
}

// Popularity weights averaging 1: hits ~2–3, deep cuts ~0.2. Songs only found on iTunes
// (no Deezer popularity) count as deep cuts.
function addWeights(list) {
  const known = list.filter((t) => t.pop > 0);
  const roots = known.map((t) => Math.sqrt(t.pop));
  const mean = roots.reduce((x, y) => x + y, 0) / Math.max(1, roots.length) || 1;
  for (const t of list) {
    t.weight = t.pop > 0 ? Math.max(0.15, Math.round((Math.sqrt(t.pop) / mean) * 100) / 100) : 0.35;
  }
  return list;
}

// Same song in two catalogues? Titles equal after cleanup, or within a small typo distance
// ("Tamally Maak" / "Tamaly Ma'ak").
const squashTitle = (s) => normText(String(s || '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '')).replace(/ /g, '');
function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function sameSong(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 5 && lev(a, b) <= Math.max(1, Math.floor(n * 0.18));
}

// Add the artist's songs that Deezer doesn't have, from Apple's iTunes catalogue.
// Only songs written in the same script as the rest of the list (Arabic or Latin), so the
// same song never shows up twice under two spellings.
async function addItunesSongs(list, artistName, opts) {
  let extra;
  try { extra = await itunes.itunesArtistSongs(artistName, opts); } catch { return list; }
  if (!extra.length) return list;
  const arabicShare = list.length ? list.filter((t) => itunes.ARABIC_SCRIPT.test(t.title)).length / list.length : null;
  const keys = list.map((t) => squashTitle(t.title));
  for (const t of extra) {
    if (list.length >= MAX_ARTIST_WITH_EXTRA) break;
    const arabic = itunes.ARABIC_SCRIPT.test(t.title);
    if (arabicShare !== null && list.length >= 10 && (arabic ? arabicShare < 0.5 : arabicShare >= 0.5)) continue;
    const k = squashTitle(t.title);
    if (!k || keys.some((x) => sameSong(x, k))) continue;
    keys.push(k);
    list.push({ ...t, pop: 0 });
  }
  return list;
}

// An artist's songs. mode 'top' = their 20 most popular; otherwise every song we can find:
// Deezer's top 100 + albums/EPs/singles, plus iTunes for artists Deezer covers thinly
// (Arabic artists, or anyone with under 150 songs on Deezer).
// artistId (from the suggestions list) picks the exact artist; otherwise search by name.
async function loadDeezerArtist(artistName, artistId, { mode = 'all', arabic = false } = {}) {
  const q = String(artistName || '').trim();
  const artist = await findArtist(q, artistId);
  if (!artist || !artist.id) throw new Error(`No artist called "${q}" found. For a playlist, paste its link.`);
  const top = mode === 'top' ? TOP_N_SONGS : 0;
  const key = `${artist.id}:${top ? 'top' : 'all'}`;
  const hit = artistCache.get(key);
  let tracks;
  if (hit && Date.now() - hit.at < ARTIST_TTL) tracks = await hit.promise;
  else {
    const promise = (async () => {
      let list = await artistSongs(artist, { top });
      if (!top && (arabic || itunes.ARABIC_SCRIPT.test(artist.name) || list.length < 150)) {
        list = await addItunesSongs(list, artist.name, { arabic });
      }
      return addWeights(list);
    })();
    artistCache.set(key, { at: Date.now(), promise });
    promise.catch(() => artistCache.delete(key));
    tracks = await promise;
  }
  if (tracks.length < 2) throw new Error(`Not enough playable songs by ${artist.name}`);
  return { name: `${artist.name}: ${top ? `top ${top}` : 'all songs'}`, tracks: tracks.map((t) => ({ ...t })), image: artist.picture_medium || null };
}

// Artist suggestions while typing (name, picture, fans), most popular first.
const artistSearchCache = new Map();
async function searchArtists(query) {
  const q = String(query || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return [];
  const hit = artistSearchCache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  const data = await getJson(`${API}/search/artist?q=${encodeURIComponent(q)}&limit=8`);
  const exact = normText(q).replace(/ /g, '');
  const list = (data.data || []).map((a) => ({
    id: String(a.id), name: a.name, picture: a.picture_small || a.picture_medium || null, fans: a.nb_fan || 0,
  }))
    // Most popular first; an exact name match still comes first.
    .sort((a, b) => ((normText(b.name).replace(/ /g, '') === exact) - (normText(a.name).replace(/ /g, '') === exact)) || b.fans - a.fans);
  artistSearchCache.set(q, { at: Date.now(), list });
  if (artistSearchCache.size > 500) artistSearchCache.delete(artistSearchCache.keys().next().value);
  return list;
}

module.exports = { searchArtists, loadDeezerSource, fetchPreview, parseDeezerInput, searchDeezer, loadDeezerPlaylistSearch, loadDeezerArtist, addItunesSongs, sameSong, squashTitle, MAX_TRACKS, TOP_N_SONGS };
