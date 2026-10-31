// Apple iTunes Search API: a second catalogue with 30-second previews. No login or key.
// Used to fill gaps in an artist's songs (Deezer is thin for many Egyptian and Arabic
// artists) and as another place to find audio for songs from Spotify or Anghami.
// Apple asks for roughly 20 requests a minute at most, so results are cached.

const API = 'https://itunes.apple.com';
const { normText } = require('./text');

// Apple's store per country has its own catalogue; Egypt and Saudi Arabia carry the most
// Arabic music, the US store the most Western music.
const STORES_ARABIC = ['eg', 'sa', 'us'];
const STORES_WEST = ['us'];
const ARABIC_SCRIPT = /[؀-ۿ]/;
const SKIP_VERSION = /[([\-–].*\b(live|remix|remixed|instrumental|karaoke|sped ?up|slowed|reverb|a ?cappella|acapella|commentary|voice memo|demo version)\b/i;
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map(); // url -> { at, promise }

async function getJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Sliver/1.0' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`iTunes returned HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  })();
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return promise;
}

function toTrack(r) {
  const cover = r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.') : null;
  return {
    source: 'itunes',
    sourceId: String(r.trackId),
    title: r.trackName,
    artist: r.artistName || 'Unknown',
    cover,
    exactCover: !!cover,
    link: r.trackViewUrl || null,
    previewUrl: r.previewUrl,
    durationMs: r.trackTimeMillis || 0,
  };
}

const isSong = (r) => r && r.wrapperType === 'track' && r.kind === 'song' && r.previewUrl && r.trackName;
const squash = (s) => normText(s).replace(/ /g, '');

// The artist's iTunes id (the same id in every country's store).
async function findArtistId(name, stores) {
  const want = squash(name);
  for (const cc of stores) {
    try {
      const data = await getJson(`${API}/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=8&country=${cc}`);
      const list = (data.results || []).filter((r) => r.artistId);
      const hit = list.find((r) => squash(r.artistName) === want) || (stores.length === 1 ? list[0] : null);
      if (hit) return hit.artistId;
    } catch { /* try the next store */ }
  }
  return null;
}

// Up to ~200 songs per store by this artist (as the main artist), most popular first.
async function itunesArtistSongs(name, { arabic } = {}) {
  const isArabic = arabic || ARABIC_SCRIPT.test(name);
  const stores = isArabic ? STORES_ARABIC : STORES_WEST;
  const artistId = await findArtistId(name, stores).catch(() => null);
  if (!artistId) return [];
  const out = [];
  const seen = new Set();
  for (const cc of stores) {
    let data;
    try { data = await getJson(`${API}/lookup?id=${artistId}&entity=song&limit=200&country=${cc}`); } catch { continue; }
    for (const r of data.results || []) {
      if (!isSong(r) || r.artistId !== artistId) continue;
      if (SKIP_VERSION.test(r.trackName)) continue;
      const key = normText(r.trackName);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(toTrack(r));
    }
  }
  return out;
}

// Find one song (for playlists from Spotify/Anghami whose audio isn't on Deezer).
async function searchItunes(title, artist) {
  const t = normText(String(title || '').replace(/\s*[([].*?[)\]]/g, ''));
  const a = normText(String(artist || '').split(/,|&| feat\.? | x /i)[0]);
  const stores = ARABIC_SCRIPT.test(`${title} ${artist}`) ? STORES_ARABIC : ['us', 'eg'];
  for (const cc of stores) {
    let data;
    try { data = await getJson(`${API}/search?term=${encodeURIComponent(`${title} ${String(artist || '').split(',')[0]}`)}&entity=song&limit=15&country=${cc}`); } catch { continue; }
    const songs = (data.results || []).filter(isSong);
    const hit = songs.find((r) => normText(r.trackName).startsWith(t) && normText(r.artistName).includes(a))
      || songs.find((r) => normText(r.trackName).includes(t) && (!a || normText(r.artistName).includes(a.split(' ')[0])));
    if (hit) return toTrack(hit);
  }
  throw new Error(`No iTunes match for "${title}"`);
}

module.exports = { itunesArtistSongs, searchItunes, findArtistId, toTrack, ARABIC_SCRIPT, _cache: cache };
