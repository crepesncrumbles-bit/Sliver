// How popular is each song? The guess list shows the most popular songs first.
//
// Deezer songs already carry Deezer's popularity score ("rank", the same scale for every
// song on Deezer). Songs from Spotify, Anghami or iTunes don't, so we look them up on Deezer
// in the background: slowly (a few a second, shared by all rooms) so it never gets in the
// way of loading the next song. The match also remembers the Deezer id, which makes that
// song's round load faster later.

const { searchDeezer } = require('./deezer');

const PER_SECOND = 4;
const queued = new WeakSet();
const jobs = []; // { list, i, onProgress, onDone }
let running = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let lookup = (t) => searchDeezer(t.title, t.artist, { strict: true });

function needsLookup(t) {
  return t && t.pop === undefined && t.source !== 'demo' && t.source !== 'deezer' && !queued.has(t);
}

// tracks: the source's own track objects (shared by every room using them).
// onProgress(n) is called every so often; onDone() at the end.
function enrich(tracks, { onProgress, onDone } = {}) {
  const list = (tracks || []).filter(needsLookup);
  for (const t of list) queued.add(t);
  if (!list.length) { if (onDone) onDone(); return 0; }
  jobs.push({ list, i: 0, onProgress, onDone });
  pump();
  return list.length;
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (jobs.length) {
      // Round-robin between jobs so one huge playlist doesn't hold up everyone else's.
      const job = jobs.shift();
      const batch = job.list.slice(job.i, job.i + PER_SECOND);
      job.i += batch.length;
      const started = Date.now();
      await Promise.all(batch.map(async (t) => {
        try {
          const hit = await lookup(t);
          t.pop = hit.pop || 0;
          if (!t.deezerId && hit.sourceId) t.deezerId = hit.sourceId;
        } catch {
          t.pop = 0; // not on Deezer: counts as least popular
        }
      }));
      if (job.i < job.list.length) {
        jobs.push(job);
        if (job.onProgress && job.i % (PER_SECOND * 15) === 0) try { job.onProgress(job.i); } catch {}
      } else if (job.onDone) {
        try { job.onDone(); } catch {}
      }
      const spent = Date.now() - started;
      if (spent < 1000) await wait(1000 - spent);
    }
  } finally {
    running = false;
  }
}

function pending() { return jobs.reduce((n, j) => n + j.list.length - j.i, 0); }
function _setLookup(fn) { lookup = fn; }

module.exports = { enrich, pending, _setLookup };
