// Anghami public playlists and albums, without logging in.
//
// Anghami's web player (play.anghami.com) renders public playlist pages on the server.
// Checked on real pages (Oct 2026): the HTML carries
//   1. the app's state, <script id=anghami-web-v2-state type=application/json>, with the
//      GETplaylistdata answer: body.sections → the section with type "song" holds every song
//      ({ id, title, artist, coverArt, … }); other sections are videos/artists/related lists;
//   2. a schema.org MusicPlaylist block (<script type=application/ld+json>) whose `track`
//      list has every song (name + byArtist.name);
//   3. the rendered song links, and 4. a description naming 3 songs.
// We use the first one that works. The HTML is minified, so attributes may be unquoted.
// Anghami's audio needs an account, so each song's 30-second preview comes from Deezer or
// iTunes when its round starts (same as Spotify songs without a preview).
// Anghami sometimes answers with a "Client Challenge" (bot check) page instead; then we say so.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MAX_TRACKS = 500;
const { normText } = require('./text');

function isAnghami(text) {
  return /(^|\/\/|\.)anghami\.com\b|^anghami:/i.test(String(text || '').trim());
}

async function parseAnghamiInput(input) {
  let text = String(input || '').trim();
  let m = text.match(/^anghami:\/\/(playlist|album)\/(\d+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };
  m = text.match(/anghami\.com\/(?:[a-z]{2}\/)?(playlist|album)\/(\d+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };
  if (/\/(song|artist)\//i.test(text)) throw new Error('That\'s a song or artist page. Paste an Anghami playlist or album link.');
  // Short share links (open.anghami.com/…, anghami.com/…): follow them to the real page.
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
  const res = await fetch(text, { redirect: 'follow', headers: { 'User-Agent': UA } });
  const body = await res.text();
  m = (res.url + ' ' + body.slice(0, 300000)).match(/anghami\.com\/(?:[a-z]{2}\/)?(playlist|album)\/(\d+)/i)
    || body.match(/anghami:\/\/(playlist|album)\/(\d+)/i);
  if (m) return { kind: m[1].toLowerCase(), id: m[2] };
  throw new Error('Couldn\'t read that Anghami link. Use Share → Copy link on a public playlist or album.');
}

const decodeHtml = (s) => String(s || '')
  .replace(/<(\w+)[^>]*class=["']?[^"'>]*\b(explicit|badge)\b[^"'>]*["']?[^>]*>[\s\S]*?<\/\1>/gi, ' ') // "E" explicit badges
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '\'')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

// Angular's server state escapes characters (&q; for ", &a; for &, …).
const unescapeNgState = (s) => s.replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, '\'').replace(/&l;/g, '<').replace(/&g;/g, '>');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');

// <meta property=og:title content="…"> in any order, quoted or not.
function meta(html, prop) {
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (!new RegExp(`(?:property|name)\\s*=\\s*["']?${escRe(prop)}["'\\s/>]`, 'i').test(attrs + ' ')) continue;
    const c = attrs.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (c) return decodeHtml(c[1] ?? c[2] ?? c[3]);
  }
  return null;
}

// Every <script> whose type is JSON (ld+json or json), quoted or not: [{ id, text }]
function jsonScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (!/type\s*=\s*["']?application\/(?:ld\+)?json/i.test(attrs)) continue;
    const id = (attrs.match(/id\s*=\s*["']?([\w-]+)/i) || [])[1] || '';
    out.push({ id, text: m[2] });
  }
  return out;
}
function parseJson(text) {
  try { return JSON.parse(text); } catch { /* maybe Angular-escaped */ }
  try { return JSON.parse(unescapeNgState(text)); } catch { return null; }
}

const coverFor = (id) => (id && /^\d+$/.test(String(id)) ? `https://artwork.anghcdn.co/?id=${id}&size=296` : null);

// 1) The app state: the "song" section of the playlist/album answer.
function songsFromState(html) {
  for (const { text } of jsonScripts(html)) {
    if (!/GET(playlist|album)data|sections/.test(text) && !text.includes('&q;')) continue;
    const data = parseJson(text);
    if (!data || typeof data !== 'object') continue;
    const bodies = Object.entries(data)
      .sort(([a], [b]) => (/GET(playlist|album)data/.test(b) ? 1 : 0) - (/GET(playlist|album)data/.test(a) ? 1 : 0))
      .map(([, v]) => v && (v.body || v))
      .filter((b) => b && Array.isArray(b.sections));
    for (const body of bodies) {
      const sec = body.sections.find((x) => x && x.type === 'song' && Array.isArray(x.data) && x.data.length);
      if (!sec) continue;
      const songs = sec.data.filter((x) => x && typeof x.title === 'string' && x.title).map((x) => ({
        id: String(x.id || ''), title: decodeHtml(x.title), artist: decodeHtml(x.artist || ''), cover: coverFor(x.coverArt || x.AlbumArt),
      }));
      const listed = Number(body.count || body.numsongs || body.PlaylistCount) || null;
      if (songs.length) return { songs, listed };
    }
  }
  return null;
}

// 2) schema.org MusicPlaylist / MusicAlbum: track: [{ name, byArtist: { name } }]
function songsFromLd(html) {
  for (const { text } of jsonScripts(html)) {
    if (!/Music(Playlist|Album)/.test(text)) continue;
    const data = parseJson(text);
    const lists = (Array.isArray(data) ? data : [data]).filter((d) => d && /Music(Playlist|Album)/.test(d['@type'] || '') && d.track);
    for (const d of lists) {
      const tracks = Array.isArray(d.track) ? d.track : d.track.itemListElement || [];
      const songs = tracks.map((t) => (t && t.item) || t).filter((t) => t && t.name).map((t) => ({
        id: (String(t.url || t['@id'] || '').match(/song\/(\d+)/) || [])[1] || '',
        title: decodeHtml(t.name),
        artist: decodeHtml(Array.isArray(t.byArtist) ? t.byArtist.map((a) => a && a.name).filter(Boolean).join(', ') : (t.byArtist && t.byArtist.name) || ''),
        cover: typeof t.image === 'string' ? t.image.replace(/size=\d+/, 'size=296') : null,
      }));
      if (songs.length) return { songs, listed: Number(d.numtracks || d.numTracks) || null };
    }
  }
  return null;
}

// Older name kept for tests: whichever of the two JSON sources has songs.
function songsFromJson(html) {
  const r = songsFromState(html) || songsFromLd(html);
  return r ? r.songs : [];
}

// 3) The rendered track list: each song link is followed by its artist link(s).
function songsFromLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']?(?:https?:\/\/play\.anghami\.com)?\/(song|artist)\/(\d+)[^"'\s>]*["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let cur = null;
  for (const m of html.matchAll(re)) {
    const kind = m[1].toLowerCase();
    const text = decodeHtml(m[3]).replace(/\s+E$/, ''); // "E" = explicit badge inside the title link
    if (kind === 'song') {
      if (cur && cur.title) out.push(cur);
      cur = text ? { id: m[2], title: text, artists: [] } : null;
    } else if (cur && text && !cur.artists.includes(text)) {
      cur.artists.push(text);
    }
  }
  if (cur && cur.title) out.push(cur);
  return out.filter((s) => s.artists.length).map((s) => ({ id: s.id, title: s.title, artist: s.artists.join(', ') }));
}

// 4) "Play and download X - which includes songs like A by B, C by D, and E by F."
function songsFromDescription(html) {
  const d = meta(html, 'og:description') || meta(html, 'description') || '';
  const m = d.match(/songs like (.+?)(?:\.\s|\.$|$)/i);
  if (!m) return [];
  return m[1].split(/,\s*(?:and\s+)?|\s+and\s+(?=[^,]+ by )/i)
    .map((part) => part.match(/^(.+?) by (.+)$/i))
    .filter(Boolean)
    .map((x) => ({ id: '', title: x[1].trim(), artist: x[2].trim() }));
}

const isChallenge = (html) => /<title>\s*Client Challenge\s*<\/title>/i.test(html) || (/_fs-ch-/.test(html) && html.length < 8000 && !/og:title/i.test(html));

function parseAnghamiPage(html, kind, id) {
  const rawTitle = meta(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const name = decodeHtml(rawTitle).replace(/\s*\|\s*Play on Anghami.*$/i, '').replace(/\s+(playlist|album)$/i, '').trim() || `Anghami ${kind}`;
  const best = songsFromState(html) || songsFromLd(html);
  let songs = best ? best.songs : [];
  let listed = best ? best.listed : null;
  const fromLinks = songsFromLinks(html);
  if (fromLinks.length > songs.length) songs = fromLinks;
  let partial = false;
  if (songs.length < 2) { songs = songsFromDescription(html); partial = true; }
  const seen = new Set();
  const tracks = [];
  for (const s of songs) {
    const key = normText(s.title) + '|' + normText(s.artist);
    if (!s.title || seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      source: 'anghami',
      sourceId: s.id || key,
      title: s.title,
      artist: s.artist || 'Unknown',
      cover: s.cover || null,
      exactCover: !!s.cover,
      link: s.id ? `https://play.anghami.com/song/${s.id}` : `https://play.anghami.com/${kind}/${id}`,
    });
    if (tracks.length >= MAX_TRACKS) break;
  }
  if (!listed) {
    const m = decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ')).match(/(\d[\d,]*)\s+(?:songs|أغنية|أغاني)/i);
    listed = m ? Number(m[1].replace(/,/g, '')) : null;
  }
  return { name, tracks, listed, partial };
}

async function loadAnghamiSource(input) {
  const { kind, id } = await parseAnghamiInput(input);
  const get = () => fetch(`https://play.anghami.com/${kind}/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml', 'Upgrade-Insecure-Requests': '1' },
  });
  let res = await get();
  if (res.status === 404) throw new Error('Anghami says that playlist doesn\'t exist (or it\'s private).');
  if (!res.ok) throw new Error(`Anghami returned HTTP ${res.status}`);
  let html = await res.text();
  if (isChallenge(html)) { // their bot check: try once more after a moment
    await new Promise((r) => setTimeout(r, 1500));
    res = await get();
    html = res.ok ? await res.text() : '';
    if (!html || isChallenge(html)) {
      throw new Error('Anghami asked for a "are you a robot?" check, so its playlist couldn\'t be read right now. Try again in a minute, or paste the same playlist from Spotify or Deezer.');
    }
  }
  const result = parseAnghamiPage(html, kind, id);
  if (result.tracks.length < 2) {
    throw new Error('Couldn\'t see that Anghami playlist\'s songs. Make sure it\'s public. You can also open it on Spotify or Deezer and paste that link.');
  }
  // Anghami's page may only list the first songs of a long playlist.
  result.short = !!(result.listed && result.listed > result.tracks.length && result.tracks.length < MAX_TRACKS);
  return result;
}

module.exports = { isAnghami, parseAnghamiInput, parseAnghamiPage, loadAnghamiSource, songsFromJson, songsFromState, songsFromLd, songsFromLinks, songsFromDescription, meta, isChallenge };
