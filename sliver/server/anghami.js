// Anghami public playlists and albums, without logging in.
//
// Anghami's web player (play.anghami.com) renders public playlist pages on the server so
// search engines can read them. We read the song titles and artists from that page:
//   1. the JSON state the page ships for the app (if present), else
//   2. the song and artist links in the rendered list, else
//   3. the page description ("…songs like X by A, Y by B…").
// Anghami's audio needs an account, so each song's 30-second preview comes from Deezer or
// iTunes when its round starts (same as Spotify songs without a preview).

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
  .replace(/<(\w+)[^>]*class=["'][^"']*\b(explicit|badge)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ') // "E" explicit badges
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '\'')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

// Angular's server state escapes characters (&q; for ", &a; for &, …) in older versions.
const unescapeNgState = (s) => s.replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, '\'').replace(/&l;/g, '<').replace(/&g;/g, '>');

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[:.]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop.replace(/[:.]/g, '\\$&')}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decodeHtml(m[1]) : null;
}

// 1) Song objects anywhere in the page's JSON blobs.
function songsFromJson(html) {
  const out = [];
  const blobs = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) blobs.push(m[1]);
  for (const m of html.matchAll(/<script\b[^>]*id=["'](?:ng-state|serverApp-state|__NEXT_DATA__|__NUXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi)) blobs.push(m[1]);
  for (const raw of blobs) {
    let data;
    try { data = JSON.parse(raw); } catch { try { data = JSON.parse(unescapeNgState(raw)); } catch { continue; } }
    const stack = [data];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]); continue; }
      const title = typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : null;
      const artist = typeof o.artist === 'string' ? o.artist
        : o.byArtist ? (Array.isArray(o.byArtist) ? o.byArtist.map((a) => a && a.name).filter(Boolean).join(', ') : o.byArtist.name)
        : typeof o.artistName === 'string' ? o.artistName : null;
      const songish = o.type === 'song' || o['@type'] === 'MusicRecording' || o.albumID !== undefined || o.artistID !== undefined;
      if (title && artist && songish) {
        const id = String(o.id || o.songId || o.songID || (String(o.url || '').match(/song\/(\d+)/) || [])[1] || '');
        out.push({ id, title: decodeHtml(title), artist: decodeHtml(artist), coverArt: o.coverArt || o.cover || null });
        continue;
      }
      for (const k of Object.keys(o).reverse()) if (o[k] && typeof o[k] === 'object') stack.push(o[k]);
    }
  }
  return out;
}

// 2) The rendered track list: each song link is followed by its artist link(s).
function songsFromLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href=["'](?:https?:\/\/play\.anghami\.com)?\/(song|artist)\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
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

// 3) "Play and download X - which includes songs like A by B, C by D, and E by F."
function songsFromDescription(html) {
  const d = meta(html, 'og:description') || meta(html, 'description') || '';
  const m = d.match(/songs like (.+?)(?:\.\s|\.$|$)/i);
  if (!m) return [];
  return m[1].split(/,\s*(?:and\s+)?|\s+and\s+(?=[^,]+ by )/i)
    .map((part) => part.match(/^(.+?) by (.+)$/i))
    .filter(Boolean)
    .map((x) => ({ id: '', title: x[1].trim(), artist: x[2].trim() }));
}

function parseAnghamiPage(html, kind, id) {
  const rawTitle = meta(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const name = decodeHtml(rawTitle).replace(/\s*\|\s*Play on Anghami.*$/i, '').replace(/\s+(playlist|album)$/i, '').trim() || `Anghami ${kind}`;
  let songs = songsFromJson(html);
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
      cover: null,
      link: s.id ? `https://play.anghami.com/song/${s.id}` : `https://play.anghami.com/${kind}/${id}`,
    });
    if (tracks.length >= MAX_TRACKS) break;
  }
  const listedMatch = html.match(/(\d[\d,]*)\s+(?:songs|أغنية|أغاني)/i);
  const listed = listedMatch ? Number(listedMatch[1].replace(/,/g, '')) : null;
  return { name, tracks, listed, partial };
}

async function loadAnghamiSource(input) {
  const { kind, id } = await parseAnghamiInput(input);
  const res = await fetch(`https://play.anghami.com/${kind}/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
  });
  if (res.status === 404) throw new Error('Anghami says that playlist doesn\'t exist (or it\'s private).');
  if (!res.ok) throw new Error(`Anghami returned HTTP ${res.status}`);
  const result = parseAnghamiPage(await res.text(), kind, id);
  if (result.tracks.length < 2) {
    throw new Error('Couldn\'t see that Anghami playlist\'s songs. Make sure it\'s public. You can also open it on Spotify or Deezer and paste that link.');
  }
  // Anghami's page may only list the first songs of a long playlist.
  result.short = !!(result.listed && result.listed > result.tracks.length && result.tracks.length < MAX_TRACKS);
  return result;
}

module.exports = { isAnghami, parseAnghamiInput, parseAnghamiPage, loadAnghamiSource, songsFromJson, songsFromLinks, songsFromDescription };
