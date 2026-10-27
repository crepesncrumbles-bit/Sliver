// Room + game logic. All state lives in memory; restarting the server clears it.

const crypto = require('crypto');
const { demoTracks, renderDemoWav } = require('./demo');
const { loadDeezerSource, fetchPreview, searchDeezer } = require('./deezer');
const { isSpotify, loadSpotifySource, fetchUrlPreview, fetchSpotifyCover } = require('./spotify');

const MIN_LEN = 0.1;
const MAX_LEN = 30; // the whole preview clip, like Songless
const WRONG_PENALTY = 500;
const REVEAL_AUTO_ADVANCE_MS = 18000; // room for the 15 s listen
const ROOM_IDLE_MS = 30 * 60 * 1000;

// Songless's curve. Matches their published values exactly:
// 0.1s 10,000 · 0.5s 7,388 · 1s 6,417 · 3s 5,093 · 10s 4,006 · 30s 3,500
function pointsForLength(len) {
  const l = Math.min(MAX_LEN, Math.max(MIN_LEN, len || MIN_LEN));
  const remaining = 1 - Math.log(l / MIN_LEN) / Math.log(MAX_LEN / MIN_LEN);
  return Math.round(3500 + 6500 * Math.pow(remaining, 1.55));
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const id = (n = 12) => crypto.randomBytes(n).toString('base64url');

function makeCode(existing) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (existing.has(code));
  return code;
}

class Room {
  constructor(code, io, opts) {
    this.code = code;
    this.io = io;
    this.opts = opts;
    this.players = new Map(); // playerId -> player
    this.hostId = null;
    this.phase = 'lobby'; // lobby | loading | round | reveal | results
    // roundTime 0 = no time limit; maxGuesses 0 = unlimited (Songless default)
    this.settings = { rounds: 5, roundTime: 60, maxGuesses: 0 };
    this.sources = []; // { name, count, by }
    this.pool = []; // tracks
    this.poolVersion = 0;
    this.roundNum = 0;
    this.round = null;
    this.reveal = null;
    this.usedTrackKeys = new Set();
    this.timers = { round: null, reveal: null };
    this.lastActive = Date.now();
  }

  // ---------- players ----------
  addPlayer(name, socket) {
    const p = {
      id: id(8),
      token: id(16),
      name: String(name || 'Player').trim().slice(0, 20) || 'Player',
      score: 0,
      socketId: socket.id,
      connected: true,
      joinedAt: Date.now(),
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  reconnect(token, socket) {
    for (const p of this.players.values()) {
      if (p.token === token) {
        p.socketId = socket.id;
        p.connected = true;
        if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = p.id;
        return p;
      }
    }
    return null;
  }

  disconnect(socketId) {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) {
        p.connected = false;
        if (this.hostId === p.id) {
          const next = [...this.players.values()].find((q) => q.connected);
          if (next) this.hostId = next.id;
        }
        this.maybeEndRound();
        this.broadcast();
        return;
      }
    }
  }

  connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---------- song pool ----------
  async addSource(input, byName) {
    const text = String(input || '').trim();
    let name, tracks;
    if (!text || /^demo$/i.test(text)) {
      name = 'Demo songs (no internet needed)';
      tracks = demoTracks();
    } else {
      if (this.opts.demoOnly) throw new Error('Demo-only mode: type "demo" to load the built-in songs.');
      ({ name, tracks } = isSpotify(text) ? await loadSpotifySource(text) : await loadDeezerSource(text));
    }
    const seen = new Set(this.pool.map((t) => norm(t.title) + '|' + norm(t.artist)));
    let added = 0;
    for (const t of tracks) {
      const key = norm(t.title) + '|' + norm(t.artist);
      if (seen.has(key)) continue;
      seen.add(key);
      this.pool.push({ ...t, poolId: this.pool.length });
      added++;
    }
    this.sources.push({ name, count: added, by: byName });
    this.poolVersion++;
    this.touch();
    return { name, added, total: this.pool.length };
  }

  clearPool() {
    this.pool = [];
    this.sources = [];
    this.usedTrackKeys.clear();
    this.poolVersion++;
  }

  poolList() {
    return this.pool.map((t) => ({ id: t.poolId, title: t.title, artist: t.artist }));
  }

  // ---------- game flow ----------
  async start() {
    if (this.phase !== 'lobby' && this.phase !== 'results') throw new Error('Game already running');
    if (this.pool.length < 2) throw new Error('Add a playlist with at least 2 songs first');
    for (const p of this.players.values()) p.score = 0;
    this.roundNum = 0;
    this.usedTrackKeys.clear();
    await this.nextRound();
  }

  async nextRound() {
    this.clearTimers();
    if (this.roundNum >= this.settings.rounds) return this.finish();
    this.phase = 'loading';
    this.reveal = null;
    this.broadcast();

    let unused = this.pool.filter((t) => !this.usedTrackKeys.has(t.poolId));
    if (!unused.length) { this.usedTrackKeys.clear(); unused = [...this.pool]; }

    let clip = null, track = null;
    for (let attempt = 0; attempt < 8 && unused.length; attempt++) {
      const pick = unused.splice(crypto.randomInt(unused.length), 1)[0];
      this.usedTrackKeys.add(pick.poolId);
      try {
        clip = await this.loadClip(pick);
        track = pick;
        break;
      } catch (err) {
        console.warn(`  skipped "${pick.title}": ${err.message}`);
      }
    }
    if (!track) {
      this.phase = 'lobby';
      this.broadcast();
      this.io.to(this.code).emit('toast', { kind: 'error', text: 'Couldn\'t load any song audio. Is the laptop online? Try the demo songs.' });
      return;
    }

    this.roundNum++;
    const roundTimeMs = this.settings.roundTime * 1000;
    this.round = {
      num: this.roundNum,
      nonce: id(10),
      track,
      clip,
      offset: 0, // every clip plays from the start of the 30 s preview, like Songless
      startedAt: Date.now(),
      endsAt: roundTimeMs ? Date.now() + roundTimeMs : null,
      results: new Map(), // playerId -> { status, guesses:[], maxHeard, points }
    };
    this.phase = 'round';
    if (roundTimeMs) this.timers.round = setTimeout(() => this.endRound(), roundTimeMs + 300);
    this.broadcast();
  }

  async loadClip(track) {
    if (track.source === 'demo') {
      return { buffer: renderDemoWav(Number(track.sourceId)), contentType: 'audio/wav' };
    }
    if (track.source === 'spotify') {
      // The song's own cover art from Spotify, fetched alongside the audio.
      const coverP = track.exactCover ? null : fetchSpotifyCover(track.sourceId)
        .then((url) => { if (url) { track.cover = url; track.exactCover = true; } })
        .catch(() => {});
      // Prefer an exact Deezer match (128 kbps, better than Spotify's 96 kbps previews),
      // then Spotify's own preview, then a looser Deezer search.
      const useDeezer = async (strict) => {
        if (!track.deezerId) {
          const match = await searchDeezer(track.title, track.artist, { strict });
          track.deezerId = match.sourceId;
          if (match.cover && !track.exactCover) track.cover = match.cover;
        }
        return fetchPreview(track.deezerId);
      };
      const audio = (async () => {
        try { return await useDeezer(true); } catch { /* try the next source */ }
        if (track.previewUrl) {
          try { return await fetchUrlPreview(track.previewUrl); } catch { /* try the next source */ }
        }
        return useDeezer(false);
      })();
      const result = await audio;
      if (coverP) await Promise.race([coverP, new Promise((r) => setTimeout(r, 2500))]);
      return result;
    }
    return fetchPreview(track.sourceId);
  }

  resultFor(playerId) {
    let r = this.round.results.get(playerId);
    if (!r) {
      r = { status: 'playing', guesses: [], maxHeard: 0, points: 0 };
      this.round.results.set(playerId, r);
    }
    return r;
  }

  reportListen(playerId, seconds) {
    if (this.phase !== 'round') return;
    const r = this.resultFor(playerId);
    if (r.status !== 'playing') return;
    const s = Number(seconds);
    if (Number.isFinite(s)) r.maxHeard = Math.max(r.maxHeard, Math.min(MAX_LEN, Math.max(0, s)));
  }

  guess(playerId, poolId) {
    if (this.phase !== 'round') throw new Error('No song is playing right now');
    const r = this.resultFor(playerId);
    if (r.status !== 'playing') throw new Error('You\'re done for this round');
    const picked = this.pool[Number(poolId)];
    if (!picked) throw new Error('Pick a song from the list');
    if (r.guesses.some((g) => g.poolId === picked.poolId)) throw new Error('You already guessed that one');
    const answer = this.round.track;
    const correct = picked.poolId === answer.poolId ||
      (norm(picked.title) === norm(answer.title) && norm(picked.artist) === norm(answer.artist));
    r.guesses.push({ poolId: picked.poolId, title: picked.title, artist: picked.artist, correct });
    const max = this.settings.maxGuesses;
    if (correct) {
      r.status = 'correct';
      const wrong = r.guesses.length - 1;
      r.points = Math.max(0, pointsForLength(r.maxHeard) - wrong * WRONG_PENALTY);
      const p = this.players.get(playerId);
      if (p) p.score += r.points;
    } else if (max && r.guesses.length >= max) {
      r.status = 'out';
    }
    this.maybeEndRound();
    this.broadcast();
    return { correct, points: r.points, guessesLeft: max ? max - r.guesses.length : null };
  }

  giveUp(playerId) {
    if (this.phase !== 'round') return;
    const r = this.resultFor(playerId);
    if (r.status === 'playing') r.status = 'gave-up';
    this.maybeEndRound();
    this.broadcast();
  }

  maybeEndRound() {
    if (this.phase !== 'round') return;
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length && active.every((p) => this.resultFor(p.id).status !== 'playing')) this.endRound();
  }

  endRound() {
    if (this.phase !== 'round') return;
    this.clearTimers();
    for (const p of this.players.values()) {
      const r = this.resultFor(p.id);
      if (r.status === 'playing') r.status = 'timeout';
    }
    const t = this.round.track;
    this.reveal = {
      title: t.title,
      artist: t.artist,
      cover: t.cover,
      link: t.link,
      offset: this.round.offset,
      results: [...this.players.values()].map((p) => {
        const r = this.resultFor(p.id);
        return { id: p.id, name: p.name, status: r.status, points: r.points, guesses: r.guesses.length, heard: r.maxHeard };
      }).sort((a, b) => b.points - a.points),
      autoNextAt: Date.now() + REVEAL_AUTO_ADVANCE_MS,
      last: this.roundNum >= this.settings.rounds,
    };
    this.phase = 'reveal';
    this.timers.reveal = setTimeout(() => this.nextRound().catch(console.error), REVEAL_AUTO_ADVANCE_MS);
    this.broadcast();
  }

  finish() {
    this.clearTimers();
    this.phase = 'results';
    this.round = null;
    this.broadcast();
  }

  backToLobby() {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = null;
    this.reveal = null;
    for (const p of this.players.values()) p.score = 0;
    this.broadcast();
  }

  clearTimers() {
    clearTimeout(this.timers.round);
    clearTimeout(this.timers.reveal);
  }

  touch() { this.lastActive = Date.now(); }

  // ---------- state to clients ----------
  publicState(forPlayerId) {
    const me = this.players.get(forPlayerId);
    const state = {
      code: this.code,
      phase: this.phase,
      serverNow: Date.now(),
      hostId: this.hostId,
      meId: forPlayerId,
      settings: this.settings,
      sources: this.sources,
      poolSize: this.pool.length,
      poolVersion: this.poolVersion,
      maxGuesses: this.settings.maxGuesses,
      players: [...this.players.values()]
        .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          connected: p.connected,
          roundStatus: this.round && this.phase === 'round' ? this.resultFor(p.id).status : null,
        })),
      round: null,
      reveal: this.phase === 'reveal' ? this.reveal : null,
    };
    if (this.round && this.phase === 'round' && me) {
      const r = this.resultFor(me.id);
      state.round = {
        num: this.round.num,
        total: this.settings.rounds,
        offset: this.round.offset,
        clipUrl: `/api/clip/${this.code}/${this.round.nonce}`,
        endsAt: this.round.endsAt,
        my: { status: r.status, guesses: r.guesses, maxHeard: r.maxHeard, points: r.points },
      };
    }
    return state;
  }

  broadcast() {
    this.touch();
    for (const p of this.players.values()) {
      if (p.connected) this.io.to(p.socketId).emit('state', this.publicState(p.id));
    }
  }
}

class RoomManager {
  constructor(io, opts = {}) {
    this.io = io;
    this.opts = opts;
    this.rooms = new Map();
    setInterval(() => this.sweep(), 60 * 1000).unref();
  }

  create() {
    const code = makeCode(this.rooms);
    const room = new Room(code, this.io, this.opts);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase().trim());
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.connectedCount() === 0 && now - room.lastActive > ROOM_IDLE_MS) {
        room.clearTimers();
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager, pointsForLength, MIN_LEN, MAX_LEN };
