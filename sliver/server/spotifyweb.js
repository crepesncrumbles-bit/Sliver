// Best-effort access to the data Spotify's own web player uses, without logging in.
// Used for two things the public embed page can't do:
//   • playlists longer than 100 songs (the embed only lists the first 100)
//   • play counts shown after each song
// Spotify can change these private endpoints at any time, so everything here fails
// quietly: callers get null / [] and the game carries on without the extra data.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SEED_TRACK = '4uLU6hMCjMI75M1A2tKUQC'; // any public track works for getting a token
const HASH_TTL = 6 * 60 * 60 * 1000;

const { normText: norm } = require('./text');

// ---------- anonymous token (from the public embed page) ----------
function nextData(html) {
  const m = String(html || '').match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Finds the embed page's anonymous access token wherever it sits in the JSON.
function extractToken(htmlOrData) {
  const data = typeof htmlOrData === 'string' ? nextData(htmlOrData) : htmlOrData;
  if (!data) return null;
  const stack = [data];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (typeof o.accessToken === 'string' && o.accessToken.length > 40) {
      const exp = Number(o.accessTokenExpirationTimestampMs) || Date.now() + 30 * 60 * 1000;
      return { token: o.accessToken, exp };
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

let tokenCache = null;
function rememberToken(t) { if (t && t.token) tokenCache = t; }
async function anonToken() {
  if (tokenCache && tokenCache.exp - 60 * 1000 > Date.now()) return tokenCache.token;
  const res = await fetch(`https://open.spotify.com/embed/track/${SEED_TRACK}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Spotify embed HTTP ${res.status}`);
  const t = extractToken(await res.text());
  if (!t) throw new Error('No Spotify token on the embed page');
  tokenCache = t;
  return t.token;
}

// ---------- persisted-query hashes (read from the web player's own code) ----------
let hashes = { at: 0, map: {}, loading: null };
async function loadHashes() {
  const res = await fetch('https://open.spotify.com/', { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`Spotify home HTTP ${res.status}`);
  const html = await res.text();
  const urls = [...new Set([...html.matchAll(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/[\w.~-]+\.js/g)].map((m) => m[0]))];
  const map = {};
  for (const url of urls.slice(0, 8)) {
    try {
      const js = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
      for (const m of js.matchAll(/"(\w+)","(?:query|mutation)","([0-9a-f]{64})"/g)) map[m[1]] = m[2];
    } catch { /* try the next file */ }
  }
  hashes = { at: Date.now(), map, loading: null };
  return map;
}
async function opHash(op) {
  if (!hashes.map[op] || Date.now() - hashes.at > HASH_TTL) {
    if (!hashes.loading || Date.now() - hashes.at > HASH_TTL) hashes.loading = loadHashes().catch(() => ({}));
    await hashes.loading;
  }
  return hashes.map[op] || null;
}

async function pathfinder(op, variables, token) {
  const hash = await opHash(op);
  if (!hash) throw new Error(`No hash for ${op}`);
  const extensions = { persistedQuery: { version: 1, sha256Hash: hash } };
  const headers = { 'User-Agent': UA, Authorization: `Bearer ${token}`, 'App-Platform': 'WebPlayer', Accept: 'application/json' };
  let res = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ variables, operationName: op, extensions }),
  });
  if (!res.ok) {
    const qs = new URLSearchParams({ operationName: op, variables: JSON.stringify(variables), extensions: JSON.stringify(extensions) });
    res = await fetch(`https://api-partner.spotify.com/pathfinder/v1/query?${qs}`, { headers });
  }
  if (!res.ok) throw new Error(`pathfinder ${op} HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !json.data) throw new Error(`pathfinder ${op}: no data`);
  return json.data;
}

// Walks any JSON and returns every track-like object, in order.
function collectTracks(root) {
  const out = [];
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { for (const v of o) walk(v); return; }
    const uri = o.uri || (o.id && o.type === 'track' ? `spotify:track:${o.id}` : null);
    if (typeof uri === 'string' && uri.startsWith('spotify:track:') && o.name && !seen.has(uri)) {
      seen.add(uri);
      out.push(o);
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(root);
  return out;
}

function findKey(root, key) {
  const stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(o, key) && o[key] !== null && typeof o[key] !== 'object') return o[key];
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function bestImage(sources) {
  if (!Array.isArray(sources) || !sources.length) return null;
  const sorted = [...sources].sort((a, b) => (b.width || 0) - (a.width || 0));
  return (sorted.find((s) => (s.width || 0) <= 640) || sorted[0]).url || null;
}

// One track object (from either the web player or the public Web API) → Sliver track.
function toSliverTrack(t) {
  const id = String(t.uri || '').split(':').pop() || t.id;
  const artists = t.artists?.items
    ? t.artists.items.map((a) => a.profile?.name || a.name).filter(Boolean)
    : (t.artists || []).map((a) => a.name).filter(Boolean);
  const cover = bestImage(t.albumOfTrack?.coverArt?.sources) || bestImage(t.album?.images) || null;
  return {
    source: 'spotify',
    sourceId: id,
    title: t.name,
    artist: artists.join(', ') || 'Unknown',
    cover,
    exactCover: !!cover,
    link: `https://open.spotify.com/track/${id}`,
    previewUrl: t.preview_url || null,
  };
}

// The rest of a playlist after the first 100 songs. Tries the web player's query,
// then the public Web API. Returns [] if Spotify won't share more.
async function morePlaylistTracks(playlistId, { token, offset = 100, max = 2000 } = {}) {
  if (!/^[A-Za-z0-9]+$/.test(String(playlistId))) return [];
  try { token = token || await anonToken(); } catch { return []; }
  const out = [];

  // 1) Web player query (fetchPlaylist), 100 at a time.
  try {
    let at = offset;
    for (let page = 0; page < 30 && out.length + offset < max; page++) {
      const data = await pathfinder('fetchPlaylist', {
        uri: `spotify:playlist:${playlistId}`, offset: at, limit: 100, enableWatchFeedEntrypoint: false,
      }, token);
      const items = collectTracks(data);
      if (!items.length) break;
      out.push(...items.map(toSliverTrack));
      at += items.length;
      const total = Number(findKey(data, 'totalCount')) || 0;
      if (total && at >= total) break;
    }
    if (out.length) return out;
  } catch { /* try the Web API */ }

  // 2) Public Web API with the same anonymous token.
  for (const path of ['tracks', 'items']) {
    try {
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/${path}?offset=${offset}&limit=100`;
      for (let page = 0; url && page < 30 && out.length + offset < max; page++) {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Web API HTTP ${res.status}`);
        const json = await res.json();
        const items = (json.items || []).map((x) => x.track || x.item).filter((t) => t && (t.type === 'track' || !t.type) && t.name);
        out.push(...items.map((t) => toSliverTrack({ ...t, uri: t.uri || `spotify:track:${t.id}` })));
        url = json.next || null;
      }
      if (out.length) return out;
    } catch { /* try the next path */ }
  }
  return out;
}

// ---------- play counts ----------
const playsCache = new Map(); // key -> { at, value }
const PLAYS_TTL = 12 * 60 * 60 * 1000;

async function findSpotifyId(title, artist, token) {
  const data = await pathfinder('searchDesktop', {
    searchTerm: `${title} ${String(artist || '').split(',')[0]}`.trim(),
    offset: 0, limit: 10, numberOfTopResults: 5, includeAudiobooks: false,
    includeArtistHasConcertsField: false, includePreReleases: false, includeLocalConcertsField: false,
  }, token);
  const t = norm(title), a = norm(String(artist || '').split(',')[0]);
  const tracks = collectTracks(data);
  const artistOf = (x) => norm((x.artists?.items || x.artists || []).map((y) => y.profile?.name || y.name).join(' '));
  const hit = tracks.find((x) => norm(x.name) === t && artistOf(x).includes(a))
    || tracks.find((x) => norm(x.name).startsWith(t) && artistOf(x).includes(a))
    || tracks.find((x) => norm(x.name) === t);
  return hit ? String(hit.uri).split(':').pop() : null;
}

// Spotify play count for a song, or null if Spotify won't say.
async function spotifyPlays(track) {
  const key = track.source === 'spotify' ? `id:${track.sourceId}` : `q:${norm(track.title)}|${norm(track.artist)}`;
  const hit = playsCache.get(key);
  if (hit && Date.now() - hit.at < PLAYS_TTL) return hit.value;
  let value = null;
  try {
    const token = await anonToken();
    const id = track.source === 'spotify' ? track.sourceId : await findSpotifyId(track.title, track.artist, token);
    if (id) {
      const data = await pathfinder('getTrack', { uri: `spotify:track:${id}` }, token);
      const n = Number(findKey(data, 'playcount'));
      if (Number.isFinite(n) && n > 0) value = n;
    }
  } catch { value = null; }
  playsCache.set(key, { at: Date.now(), value });
  return value;
}

function _reset() { tokenCache = null; hashes = { at: 0, map: {}, loading: null }; playsCache.clear(); }

module.exports = { extractToken, rememberToken, anonToken, morePlaylistTracks, spotifyPlays, collectTracks, toSliverTrack, _reset };
