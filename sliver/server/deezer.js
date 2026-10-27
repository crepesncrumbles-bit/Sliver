// Deezer helpers: read public playlists/albums and fetch 30-second previews.
// Deezer's public API needs no login or API key.

const API = 'https://api.deezer.com';
const MAX_TRACKS = 500;

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

module.exports = { loadDeezerSource, fetchPreview, parseDeezerInput, searchDeezer };
