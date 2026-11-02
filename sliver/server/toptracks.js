// An artist's top songs, ranked across platforms, plus real artist photos for suggestions.
//
// Spotify (through the web player's own queries, no login): artist search with photos, and the
// artist page, which lists their top songs and albums with all-time play counts.
// Apple (iTunes Search API): its song search for the artist, best known songs first.
// Deezer (when it lets the server in): the artist's top songs by Deezer's popularity score.
//
// The rankings are merged with reciprocal-rank fusion: a song near the top on several platforms
// beats one that only one platform likes. Spotify's ranking is by total play count (all-time),
// so a brand-new single doesn't push out the songs people actually know.

const sw = require('./spotifyweb');
const { normText } = require('./text');

const ITUNES = 'https://itunes.apple.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SKIP = /[([\-–].*\b(live|remix|remixed|instrumental|karaoke|sped ?up|slowed|reverb|a ?cappella|acapella|commentary|voice memo|demo version|edit)\b/i;
const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function cached(key, fn, ms = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.promise;
  const promise = fn();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  if (cache.size > 1500) cache.delete(cache.keys().next().value);
  return promise;
}

// Same song on different platforms? Compare titles without "(feat. …)", " - Remastered" etc.
const songKey = (title) => normText(String(title || '')
  .replace(/\s*[([](feat|ft|with|from|prod)\.?[^)\]]*[)\]]/gi, '')
  .replace(/\s+-\s+.*$/, '')
  .replace(/\s*[([][^)\]]*(version|remaster|edit|mix)[^)\]]*[)\]]/gi, '')).replace(/ /g, '');
const squash = (s) => normText(s).replace(/ /g, '');
// A rough "consonant skeleton" so different spellings of the same title match:
// "Tamally Maak" / "Tamly Maak", "Nour El Ein" / "Noor Al Ain", and Arabic script
// "خليك معايا" / "Khalik Maaya".
const AR = { 'ب': 'b', 'ت': 't', 'ث': 's', 'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'غ': 'gh', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ة': '', 'و': '', 'ي': '', 'ى': '', 'ا': '', 'أ': '', 'إ': '', 'آ': '', 'ء': '', 'ئ': '', 'ؤ': '', 'ع': '' };
function skeleton(title) {
  let t = String(title || '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '');
  t = [...t].map((c) => (c in AR ? AR[c] : c)).join('');
  t = normText(t).replace(/[^a-z]/g, '')
    .replace(/q/g, 'k').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[aeiouyw]/g, '').replace(/(.)\1+/g, '$1');
  return t;
}
const bestImage = (sources, max = 640) => {
  if (!Array.isArray(sources) || !sources.length) return null;
  const s = [...sources].sort((a, b) => (b.width || 0) - (a.width || 0));
  return (s.find((x) => (x.width || 0) <= max) || s[s.length - 1]).url || null;
};

// ---------- Spotify ----------
async function spotifyArtists(q) {
  return cached(`sa:${squash(q)}`, async () => {
    const token = await sw.anonToken();
    const data = await sw.pathfinder('searchSuggestions', {
      query: q, limit: 30, numberOfTopResults: 30, offset: 0,
      includeAudiobooks: false, includeAuthors: false, includeEpisodeContentRatingsV2: false,
    }, token);
    const out = new Map();
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (typeof o.uri === 'string' && o.uri.startsWith('spotify:artist:') && o.profile && o.profile.name) {
        const id = o.uri.split(':').pop();
        const prev = out.get(id);
        const picture = bestImage(o.visuals && o.visuals.avatarImage && o.visuals.avatarImage.sources, 320);
        if (!prev) out.set(id, { id: `sp:${id}`, name: o.profile.name, picture, verified: !!(o.onPlatformReputationTrait && o.onPlatformReputationTrait.verification && o.onPlatformReputationTrait.verification.isVerified) });
        else if (!prev.picture && picture) prev.picture = picture;
      }
      for (const v of Object.values(o)) walk(v);
    })(data);
    return [...out.values()];
  }, 30 * 60 * 1000);
}

async function spotifyOverview(id) {
  return cached(`so:${id}`, async () => {
    const token = await sw.anonToken();
    const d = await sw.pathfinder('queryArtistOverview', { uri: `spotify:artist:${id}`, locale: '', includePrerelease: false }, token);
    return d.artistUnion || {};
  });
}

// Tracks with play counts from one album (empty if Spotify won't say).
async function spotifyAlbumTracks(albumUri) {
  return cached(`sal:${albumUri}`, async () => {
    const token = await sw.anonToken();
    const d = await sw.pathfinder('getAlbum', { uri: albumUri, locale: '', offset: 0, limit: 50 }, token);
    const cover = bestImage(d.albumUnion && d.albumUnion.coverArt && d.albumUnion.coverArt.sources, 640);
    return sw.collectTracks(d).map((t) => ({ t, cover }));
  }).catch(() => []);
}

const artistIdsOf = (t) => ((t.artists && t.artists.items) || []).map((a) => String(a.uri || '').split(':').pop());

function spotifyTrack(t, cover) {
  const id = String(t.uri).split(':').pop();
  const artists = ((t.artists && t.artists.items) || []).map((a) => a.profile && a.profile.name).filter(Boolean);
  const img = bestImage(t.albumOfTrack && t.albumOfTrack.coverArt && t.albumOfTrack.coverArt.sources) || cover || null;
  return {
    source: 'spotify', sourceId: id, title: t.name, artist: artists.join(', ') || 'Unknown',
    cover: img, exactCover: !!img, link: `https://open.spotify.com/track/${id}`, previewUrl: null,
    plays: Number(t.playcount) || 0,
  };
}

// The artist's songs on Spotify with play counts: their top 10 plus the songs on their most
// popular releases, biggest first.
async function spotifyRanking(id) {
  const au = await spotifyOverview(id);
  const disco = au.discography || {};
  const found = new Map();
  const add = (t, cover) => {
    if (!t || !t.name || SKIP.test(t.name)) return;
    const ids = artistIdsOf(t);
    if (ids.length && ids[0] !== id) return; // only songs where they're the main artist
    const key = songKey(t.name);
    const plays = Number(t.playcount) || 0;
    const prev = found.get(key);
    if (!prev || plays > prev.plays) found.set(key, spotifyTrack(t, cover));
  };
  for (const x of (disco.topTracks && disco.topTracks.items) || []) add(x.track);
  // Releases: popular ones first, then albums and singles, up to 24 in all.
  const uris = [];
  const pushUris = (o) => (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v.uri === 'string' && v.uri.startsWith('spotify:album:')) { if (!uris.includes(v.uri)) uris.push(v.uri); return; }
    Object.values(v).forEach(walk);
  })(o);
  pushUris(disco.popularReleasesAlbums);
  pushUris(disco.albums);
  pushUris(disco.singles);
  const pick = uris.slice(0, 24);
  for (let i = 0; i < pick.length; i += 4) {
    const lists = await Promise.all(pick.slice(i, i + 4).map(spotifyAlbumTracks));
    for (const list of lists) for (const { t, cover } of list) add(t, cover);
  }
  const list = [...found.values()].sort((a, b) => b.plays - a.plays);
  const picture = bestImage(au.visuals && au.visuals.avatarImage && au.visuals.avatarImage.sources, 320);
  const name = (au.profile && au.profile.name) || null;
  return { list, picture, name, listeners: (au.stats && au.stats.monthlyListeners) || 0 };
}

// ---------- Apple ----------
async function itunesJson(url) {
  return cached(`it:${url}`, async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
    return res.json();
  });
}
// Apple's song search for the artist's name lists their best-known songs first.
async function appleRanking(name) {
  const data = await itunesJson(`${ITUNES}/search?term=${encodeURIComponent(name)}&entity=song&limit=200&country=us`);
  const want = squash(name);
  const out = [], seen = new Set();
  for (const r of data.results || []) {
    if (!r.previewUrl || !r.trackName || SKIP.test(r.trackName)) continue;
    const main = squash(String(r.artistName || '').split(/,|&| feat\.? | x /i)[0]);
    if (main !== want) continue;
    const key = songKey(r.trackName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: 'itunes', sourceId: String(r.trackId), title: r.trackName, artist: r.artistName,
      cover: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.') : null, exactCover: !!r.artworkUrl100,
      link: r.trackViewUrl || null, previewUrl: r.previewUrl,
    });
  }
  return out;
}

// ---------- Deezer ----------
async function deezerRanking(name) {
  const get = async (u) => {
    const res = await fetch(u, { headers: { 'User-Agent': 'Sliver/1.0' } });
    if (!res.ok) throw new Error(`Deezer returned HTTP ${res.status}`);
    const j = await res.json();
    if (j && j.error) throw new Error(j.error.message || 'Deezer error');
    return j;
  };
  const found = await cached(`dzs:${squash(name)}`, () => get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`));
  const a = (found.data || []).find((x) => squash(x.name) === squash(name));
  if (!a) return [];
  const top = await cached(`dzt:${a.id}`, () => get(`https://api.deezer.com/artist/${a.id}/top?limit=60`));
  return (top.data || []).filter((t) => t.preview && !SKIP.test(t.title || '')).map((t) => ({
    source: 'deezer', sourceId: String(t.id), title: t.title_short || t.title, artist: t.artist ? t.artist.name : name,
    cover: t.album ? t.album.cover_medium : null, link: t.link, pop: Number(t.rank) || 0,
  }));
}

// ---------- merge ----------
// Reciprocal-rank fusion: each platform adds weight / (K + position). K damps the gap between
// #1 and #2 so agreement across platforms matters more than one platform's exact order.
const K = 8;
// Spotify's all-time play counts are the steadiest signal. Apple's search order leans towards
// new releases, so it counts for less and mostly breaks ties.
const WEIGHTS = { spotify: 1.0, apple: 0.5, deezer: 0.7 };

async function topSongs({ spotifyId = null, name, n = 20 } = {}) {
  const key = `top:${spotifyId || squash(name)}:${n}`;
  return cached(key, async () => {
    let sp = { list: [], picture: null, name: null };
    if (spotifyId) sp = await spotifyRanking(spotifyId).catch((e) => { console.warn('  Spotify ranking failed:', e.message); return sp; });
    const artistName = sp.name || name;
    const [apple, deezer] = await Promise.all([
      appleRanking(artistName).catch(() => []),
      deezerRanking(artistName).catch(() => []),
    ]);
    const lists = { spotify: sp.list, apple, deezer };
    const songs = new Map(); // key -> { score, versions: {platform: track}, ranks }
    const bySkel = new Map(); // skeleton -> key (to merge spellings across platforms)
    for (const [platform, list] of Object.entries(lists)) {
      list.forEach((t, i) => {
        let k = songKey(t.title);
        if (!k) return;
        const sk = skeleton(t.title);
        if (!songs.has(k) && sk.length >= 4 && bySkel.has(sk)) k = bySkel.get(sk);
        else if (sk.length >= 4 && !bySkel.has(sk)) bySkel.set(sk, k);
        const s = songs.get(k) || { score: 0, by: {}, ranks: {} };
        if (s.by[platform]) return; // first (best) position only
        s.by[platform] = t;
        s.ranks[platform] = i + 1;
        s.score += WEIGHTS[platform] / (K + i + 1);
        songs.set(k, s);
      });
    }
    const ranked = [...songs.values()].sort((a, b) => b.score - a.score);
    const out = [];
    const spotifyKnows = sp.list.length >= 30;
    for (const s of ranked) {
      // With a full Spotify picture, a song far down Spotify's play counts isn't a "top" song,
      // however high another platform's search puts it (usually a brand-new release).
      if (spotifyKnows && s.ranks.spotify && s.ranks.spotify > 60) continue;
      // Prefer a version we can play straight away (Apple/Deezer preview); keep Spotify's
      // cover and play count when it has them.
      const sp1 = s.by.spotify, ap = s.by.apple, dz = s.by.deezer;
      const base = ap || dz || sp1;
      const t = {
        ...base,
        title: (sp1 || base).title,
        cover: (sp1 && sp1.cover) || base.cover,
        exactCover: !!((sp1 && sp1.cover) || base.exactCover),
        previewUrl: (ap && ap.previewUrl) || base.previewUrl || null,
        plays: sp1 ? sp1.plays : undefined,
        pop: Math.round(s.score * 1e6),
        ranks: s.ranks,
      };
      if (dz && !t.deezerId) t.deezerId = dz.sourceId;
      out.push(t);
      if (out.length >= n) break;
    }
    return { name: artistName, picture: sp.picture, tracks: out, sources: Object.keys(lists).filter((p) => lists[p].length) };
  });
}

// Spotify artist id for a name (exact name, verified first), or null.
async function findSpotifyArtist(name) {
  const list = await spotifyArtists(name).catch(() => []);
  const want = squash(name);
  const exact = list.filter((a) => squash(a.name) === want);
  return (exact.find((a) => a.verified) || exact[0] || null);
}

module.exports = { skeleton, topSongs, spotifyArtists, findSpotifyArtist, songKey, _cache: cache, _wait: wait };
