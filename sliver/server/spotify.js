// Spotify playlists/albums without login.
//
// Spotify's public embed player page (open.spotify.com/embed/...) contains the track list
// as JSON. We read titles + artists from it. For audio, we use the track's own 30 s preview
// when the embed includes one; otherwise the round looks the song up on Deezer.
// Only public playlists work (private ones aren't visible to the embed player).

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MAX_TRACKS = 500; // most songs one playlist can add
const { extractToken, rememberToken, morePlaylistTracks } = require('./spotifyweb');

function isSpotify(text) {
  return /(open\.spotify\.com|spotify\.link|spotify\.app\.link|^spotify:)/i.test(String(text || '').trim());
}

async function parseSpotifyInput(input) {
  let text = String(input || '').trim();
  let m = text.match(/^spotify:(playlist|album):([A-Za-z0-9]+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };

  if (/spotify\.link|spotify\.app\.link/i.test(text)) {
    // Short share link: follow redirects to the real open.spotify.com URL.
    if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
    const res = await fetch(text, { redirect: 'follow', headers: { 'User-Agent': UA } });
    text = res.url + ' ' + (await res.text()).slice(0, 200000);
  }

  m = text.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album)\/([A-Za-z0-9]+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };
  if (/\/track\//i.test(text)) throw new Error('That\'s a single song. Paste a Spotify playlist or album link.');
  throw new Error('Couldn\'t read that Spotify link. Use Share → Copy link on a playlist or album.');
}

// Pull the embed's JSON blob and find the entity that holds the track list.
function extractEntity(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const direct = data?.props?.pageProps?.state?.data?.entity;
  if (direct && Array.isArray(direct.trackList)) return direct;
  // Fallback: search the whole JSON for an object with a trackList array (layout changes).
  const stack = [data];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (Array.isArray(o.trackList) && o.trackList.length) return o;
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function bestImage(sources) {
  if (!Array.isArray(sources) || !sources.length) return null;
  const sorted = [...sources].sort((a, b) => (b.width || 0) - (a.width || 0));
  return (sorted.find((s) => (s.width || 0) <= 640) || sorted[0]).url || null;
}

function parseEmbed(html, kind, id) {
  const entity = extractEntity(html);
  if (!entity || !entity.trackList || !entity.trackList.length) {
    throw new Error('Couldn\'t see that Spotify playlist\'s songs. Make sure it\'s public (not private or a Blend).');
  }
  const name = entity.name || entity.title || `Spotify ${kind}`;
  const cover = bestImage(entity.coverArt?.sources) || bestImage(entity.visualIdentity?.image) || null;
  const tracks = [];
  for (const t of entity.trackList.slice(0, MAX_TRACKS)) {
    if (!t || !t.title) continue;
    if (t.uri && !/^spotify:track:/.test(t.uri)) continue; // skip podcast episodes
    const trackId = (t.uri || '').split(':').pop();
    tracks.push({
      source: 'spotify',
      sourceId: trackId || t.title,
      title: t.title,
      artist: t.subtitle || (t.artists || []).map((a) => a.name).join(', ') || 'Unknown',
      // Albums: every song shares the album art. Playlists: each song's own album art is
      // looked up when its round loads (fetchSpotifyCover); never the playlist's cover.
      cover: bestImage(t.coverArt?.sources) || bestImage(t.images) || bestImage(t.album?.images) || (kind === 'album' ? cover : null),
      link: trackId ? `https://open.spotify.com/track/${trackId}` : `https://open.spotify.com/${kind}/${id}`,
      previewUrl: (t.audioPreview && t.audioPreview.url) || null,
    });
  }
  if (!tracks.length) throw new Error(`"${name}" has no songs I can use.`);
  return { name, tracks, listed: entity.trackList.length };
}

async function loadSpotifySource(input) {
  const { kind, id } = await parseSpotifyInput(input);
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (res.status === 404) throw new Error('Spotify says that playlist doesn\'t exist (or it\'s private).');
  if (!res.ok) throw new Error(`Spotify returned HTTP ${res.status}`);
  const html = await res.text();
  const result = parseEmbed(html, kind, id);
  const { listed } = result;
  delete result.listed;
  // The embed page stops at 100 songs. Ask Spotify's web player for the rest.
  if (kind === 'playlist' && listed >= 100) {
    const tok = extractToken(html);
    rememberToken(tok);
    const more = await morePlaylistTracks(id, { token: tok && tok.token, offset: listed, max: MAX_TRACKS }).catch(() => []);
    const have = new Set(result.tracks.map((t) => t.sourceId));
    for (const t of more) {
      if (result.tracks.length >= MAX_TRACKS) break;
      if (!have.has(t.sourceId)) { have.add(t.sourceId); result.tracks.push(t); }
    }
    result.truncated = more.length === 0; // Spotify wouldn't share past the first 100
  }
  result.capped = result.tracks.length >= MAX_TRACKS && listed >= 100 && !result.truncated;
  if (listed > MAX_TRACKS) result.capped = true;
  return result;
}

async function fetchUrlPreview(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Preview download failed (HTTP ${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
}

// A song's own album art, via Spotify's public oEmbed endpoint (no login).
async function fetchSpotifyCover(trackId) {
  if (!/^[A-Za-z0-9]+$/.test(String(trackId))) return null;
  const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.thumbnail_url || null;
}

module.exports = { isSpotify, parseSpotifyInput, parseEmbed, extractEntity, loadSpotifySource, fetchUrlPreview, fetchSpotifyCover };
