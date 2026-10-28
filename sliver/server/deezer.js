// Deezer helpers: read public playlists/albums and fetch 30-second previews.
// Deezer's public API needs no login or API key.

const API = 'https://api.deezer.com';
const MAX_TRACKS = 2000;

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
  };
}

async function loadDeezerSource(input) {
  const { kind, id } = await parseDeezerInput(input);
  const meta = await getJson(`${API}/${kind}/${id}`);
  const name = meta.title || `${kind} ${id}`;
  const albumCover = kind === 'album' ? meta.cover_medium : null;

  const tracks = [];
  let url = `${API}/${kind}/${id}/tracks?limit=100`;
  while (url && tracks.length < MAX_TRACKS) {
    const page = await getJson(url);
    for (const t of page.data || []) {
      if (t.readable === false || !t.preview) continue;
      tracks.push(toTrack(t, albumCover));
    }
    url = page.next || null;
  }
  if (!tracks.length) throw new Error(`"${name}" has no playable previews.`);
  return { name, tracks };
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

// Find a public Deezer playlist by name (backup for built-in packs) and load it.
async function loadDeezerPlaylistSearch(query, name) {
  const data = await getJson(`${API}/search/playlist?q=${encodeURIComponent(query)}&limit=10`);
  const pick = (data.data || []).find((p) => (p.nb_tracks || 0) >= 25) || (data.data || [])[0];
  if (!pick) throw new Error(`Couldn't find songs for "${name || query}"`);
  const src = await loadDeezerSource(String(pick.id));
  return { name: name || src.name, tracks: src.tracks };
}

// An artist's most popular songs (also used when someone types an artist's name).
// artistId (from the suggestions list) picks the exact artist; otherwise search by name.
async function loadDeezerArtist(artistName, artistId) {
  const q = String(artistName || '').trim();
  let artist = null;
  if (artistId && /^\d+$/.test(String(artistId))) {
    artist = await getJson(`${API}/artist/${artistId}`);
  } else {
    if (!q) throw new Error('Type an artist name');
    const found = await getJson(`${API}/search/artist?q=${encodeURIComponent(q)}&limit=5`);
    const nq = q.toLowerCase().replace(/[^a-z0-9]/g, '');
    const list = found.data || [];
    artist = list.find((a) => a.name.toLowerCase().replace(/[^a-z0-9]/g, '') === nq) || list[0];
  }
  if (!artist) throw new Error(`No artist called "${q}" found. For a playlist, paste its link.`);
  const top = await getJson(`${API}/artist/${artist.id}/top?limit=60`);
  const tracks = (top.data || []).filter((t) => t.preview && t.readable !== false).map((t) => toTrack(t));
  if (tracks.length < 2) throw new Error(`Not enough playable songs by ${artist.name}`);
  return { name: `${artist.name} — top songs`, tracks, image: artist.picture_medium || null };
}

// Artist suggestions while typing (name, picture, fans), most popular first.
const artistCache = new Map();
async function searchArtists(query) {
  const q = String(query || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return [];
  const hit = artistCache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  const data = await getJson(`${API}/search/artist?q=${encodeURIComponent(q)}&limit=8`);
  const list = (data.data || []).map((a) => ({
    id: String(a.id), name: a.name, picture: a.picture_small || a.picture_medium || null, fans: a.nb_fan || 0,
  }));
  artistCache.set(q, { at: Date.now(), list });
  if (artistCache.size > 500) artistCache.delete(artistCache.keys().next().value);
  return list;
}

module.exports = { searchArtists, loadDeezerSource, fetchPreview, parseDeezerInput, searchDeezer, loadDeezerPlaylistSearch, loadDeezerArtist };
