// Room + game logic. All state lives in memory; restarting the server clears it.

const crypto = require('crypto');
const { demoTracks, renderDemoWav } = require('./demo');
const { loadDeezerSource, fetchPreview, searchDeezer, loadDeezerPlaylistSearch, loadDeezerArtist } = require('./deezer');
const packs = require('./packs');
const { isSpotify, loadSpotifySource, fetchUrlPreview, fetchSpotifyCover } = require('./spotify');

const MIN_LEN = 0.1;
const MAX_LEN = 30; // the whole preview clip, like Songless (previews are 30 s long)
const WRONG_PENALTY = 500;
const FIRST_BONUS = 500; // multiplayer: first person to get each song
const RANKED_ROUNDS = 5;

// Modifiers. They stack: Hard + Chaos = 1.5 × 1.25 = 1.875× points.
const MODES = {
  classic: { mult: 1 },
  hard: { mult: 1.5 },   // starts somewhere random in the song + you type the title yourself
  chaos: { mult: 1.25 }, // every song gets a random twist
};
const TWISTS = ['reverse', 'chipmunk', 'slowmo', 'underwater', 'random-start'];
const LISTEN_OPTIONS = [15, 20, 30]; // seconds of the song after you've guessed
const CLIP_OPTIONS = [15, 20, 30];   // longest clip you can play while guessing
const ROOM_IDLE_MS = 30 * 60 * 1000;
const packCache = new Map(); // packId -> { at, promise } (only when opts.packCacheMs is set)

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
    this.settings = {
      rounds: 5, roundTime: 0, maxGuesses: 0, hard: false, chaos: false,
      listenLen: 15, maxLen: MAX_LEN, ranked: false, rankedPack: null,
    };
    this.game = null; // frozen copy of the settings while a game runs
    this.rankedPool = null; // { packId, tracks } songs for ranked play
    this.rankedLoading = null;
    this.sources = []; // { key, name, by, byId, packId, tracks, count }
    this.lastTwist = null;
    this.gameId = 0; // bumps when a game starts or ends, so a slow song download can't revive an ended game
    this.kickedTokens = new Set(); // removed players can't rejoin by refreshing
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
      userId: null, // set when logged in (needed for ranked)
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

  setAccount(playerId, user) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.userId = user ? user.id : null;
  }

  // Host hands the host role to someone else (works mid-game too).
  transferHost(byId, targetId) {
    if (byId !== this.hostId) throw new Error('Only the host can do that');
    const target = this.players.get(targetId);
    if (!target) throw new Error('That player already left');
    if (targetId === byId) throw new Error('You\'re already the host');
    if (!target.connected) throw new Error(`${target.name} is offline right now`);
    this.hostId = targetId;
    this.io.to(this.code).emit('toast', { kind: 'info', text: `${target.name} is now the host` });
    this.broadcast();
    return target;
  }

  // Host removes someone. Returns the removed player (so the server can notify them).
  kick(byId, targetId) {
    if (byId !== this.hostId) throw new Error('Only the host can remove players');
    if (targetId === byId) throw new Error('Use Leave room to leave');
    const target = this.players.get(targetId);
    if (!target) throw new Error('That player already left');
    this.kickedTokens.add(target.token);
    this.leave(targetId, `${target.name} was removed by the host`);
    return target;
  }

  // Player chose "Leave room": remove them for good (unlike a dropped connection,
  // which keeps their spot so a refresh can rejoin).
  leave(playerId, notice) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    if (this.round) this.round.results.delete(playerId);
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((q) => q.connected) || [...this.players.values()][0];
      this.hostId = next ? next.id : null;
    }
    if (this.players.size) {
      this.maybeEndRound();
      this.io.to(this.code).emit('toast', { kind: 'info', text: notice || `${p.name} left the room` });
      this.broadcast();
    } else {
      this.clearTimers();
      this.lastActive = 0; // empty: let the sweeper delete it right away
    }
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
  // input: a Spotify/Deezer link, "demo", or an artist's name. packId: a built-in pack.
  async addSource(what = {}, by = { name: 'Player', id: null }) {
    const { input, packId, artistId } = typeof what === 'string' ? { input: what } : what;
    if (typeof by === 'string') by = { name: by, id: null };
    let name, tracks, truncated = false;
    if (packId) {
      const pack = packs.byId.get(packId);
      if (!pack) throw new Error('Unknown pack');
      if (this.sources.some((s) => s.packId === packId)) throw new Error(`${pack.name} is already in`);
      ({ tracks } = await this.loadPackCached(pack));
      name = pack.artist ? `${pack.name} — top songs` : pack.name;
    } else {
      const text = String(input || '').trim();
      if (!text || /^demo$/i.test(text)) {
        name = 'Demo songs (no internet needed)';
        tracks = demoTracks();
      } else {
        if (this.opts.demoOnly) throw new Error('Demo-only mode: type "demo" to load the built-in songs.');
        if (artistId) ({ name, tracks } = await loadDeezerArtist(text, artistId));
        else if (isSpotify(text)) ({ name, tracks, truncated } = await loadSpotifySource(text));
        else if (/deezer|^https?:\/\/|^\d+$/i.test(text)) ({ name, tracks } = await loadDeezerSource(text));
        else ({ name, tracks } = await loadDeezerArtist(text)); // plain words = an artist's name
      }
    }
    const src = { key: id(6), name, by: by.name, byId: by.id, packId: packId || null, tracks, count: 0 };
    this.sources.push(src);
    this.rebuildPool();
    this.touch();
    return { key: src.key, name, added: src.count, total: this.pool.length, truncated: !!truncated };
  }

  loadPackCached(pack) {
    const ms = this.opts.packCacheMs;
    if (!ms) return this.loadPack(pack);
    const hit = packCache.get(pack.id);
    if (hit && Date.now() - hit.at < ms) return hit.promise;
    const promise = this.loadPack(pack);
    packCache.set(pack.id, { at: Date.now(), promise });
    promise.catch(() => packCache.delete(pack.id));
    return promise;
  }

  async loadPack(pack) {
    if (this.opts.demoOnly) throw new Error('Demo-only mode: type "demo" to load the built-in songs.');
    if (pack.artist) return loadDeezerArtist(pack.artist);
    if (pack.spotify) {
      try {
        const res = await loadSpotifySource(`spotify:playlist:${pack.spotify}`);
        if (res.tracks.length >= 10) return res;
      } catch (err) {
        console.warn(`  pack "${pack.name}": Spotify unavailable (${err.message}), using backup`);
      }
    }
    return loadDeezerPlaylistSearch(pack.backup, pack.name);
  }

  // Rebuild the pool from the sources still present (dedupes songs shared between playlists).
  rebuildPool() {
    const seen = new Set();
    this.pool = [];
    for (const src of this.sources) {
      src.count = 0;
      for (const t of src.tracks) {
        const key = norm(t.title) + '|' + norm(t.artist);
        if (seen.has(key)) continue;
        seen.add(key);
        this.pool.push({ ...t, poolId: this.pool.length, srcKey: src.key });
        src.count++;
      }
    }
    this.usedTrackKeys.clear();
    this.poolVersion++;
  }

  removeSource(key, player) {
    if (this.phase !== 'lobby' && this.phase !== 'results') throw new Error('Change songs between games');
    const src = this.sources.find((s) => s.key === key);
    if (!src) throw new Error('That playlist is already gone');
    if (player && player.id !== this.hostId && player.id !== src.byId) {
      throw new Error('Only the host or whoever added it can remove it');
    }
    this.sources = this.sources.filter((s) => s !== src);
    this.rebuildPool();
    return { name: src.name };
  }

  clearPool() {
    this.sources = [];
    this.rebuildPool();
  }

  // The songs the next/current game uses: the ranked genre's songs, or everything added.
  get gamePool() {
    if (this.game) return this.game.pool;
    return this.settings.ranked ? (this.rankedPool ? this.rankedPool.tracks : []) : this.pool;
  }

  poolList() {
    return this.gamePool.map((t) => ({ id: t.poolId, title: t.title, artist: t.artist }));
  }

  // ---------- settings ----------
  // Only the fields being changed. Settings are locked while a game runs.
  updateSettings(s = {}) {
    if (!['lobby', 'results'].includes(this.phase)) throw new Error('Change settings between games');
    const st = this.settings;
    const num = (v) => Math.round(Number(v));
    const before = st.ranked;
    if (s.rounds !== undefined && num(s.rounds) >= 1 && num(s.rounds) <= 20) st.rounds = num(s.rounds);
    if (s.roundTime !== undefined && (num(s.roundTime) === 0 || (num(s.roundTime) >= 15 && num(s.roundTime) <= 300))) st.roundTime = num(s.roundTime);
    if (s.maxGuesses !== undefined && num(s.maxGuesses) >= 0 && num(s.maxGuesses) <= 20) st.maxGuesses = num(s.maxGuesses);
    if (LISTEN_OPTIONS.includes(num(s.listenLen))) st.listenLen = num(s.listenLen);
    if (CLIP_OPTIONS.includes(num(s.maxLen))) st.maxLen = num(s.maxLen);
    if (typeof s.hard === 'boolean') st.hard = s.hard;
    if (typeof s.chaos === 'boolean') st.chaos = s.chaos;
    if (s.mode !== undefined) { // older clients: one mode at a time
      st.hard = s.mode === 'hard'; st.chaos = s.mode === 'chaos';
    }
    if (typeof s.ranked === 'boolean') st.ranked = s.ranked;
    if (st.ranked !== before) { this.usedTrackKeys.clear(); this.poolVersion++; }
    this.broadcast();
    return st;
  }

  // Ranked: pick the genre. Loads its songs (they're the only songs in a ranked game).
  async setRankedPack(packId) {
    const pack = packs.byId.get(packId);
    if (!pack || !pack.ranked) throw new Error('Pick one of the ranked genres');
    if (!['lobby', 'results'].includes(this.phase)) throw new Error('Change settings between games');
    this.settings.rankedPack = pack.id;
    if (this.rankedPool && this.rankedPool.packId === pack.id) { this.broadcast(); return this.rankedPool; }
    this.rankedLoading = pack.id;
    this.broadcast();
    try {
      const { tracks } = await this.loadPackCached(pack);
      if (this.settings.rankedPack !== pack.id) return null; // picked something else meanwhile
      const seen = new Set();
      const list = [];
      for (const t of tracks) {
        const key = norm(t.title) + '|' + norm(t.artist);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ ...t, poolId: list.length });
      }
      this.rankedPool = { packId: pack.id, tracks: list };
      this.usedTrackKeys.clear();
      this.poolVersion++;
      return this.rankedPool;
    } finally {
      if (this.rankedLoading === pack.id) this.rankedLoading = null;
      this.broadcast();
    }
  }

  // ---------- game flow ----------
  async start() {
    if (this.phase !== 'lobby' && this.phase !== 'results') throw new Error('Game already running');
    const st = this.settings;
    const ranked = !!st.ranked;
    const entrants = new Map(); // userId -> playerId
    if (ranked) {
      const pack = packs.byId.get(st.rankedPack);
      if (!pack) throw new Error('Pick a genre for ranked');
      if (!this.rankedPool || this.rankedPool.packId !== pack.id) await this.setRankedPack(pack.id);
      const present = [...this.players.values()].filter((p) => p.connected);
      const guests = present.filter((p) => !p.userId);
      if (guests.length) {
        const names = guests.map((p) => p.name).join(', ');
        throw new Error(`Ranked needs everyone logged in. Not logged in: ${names}`);
      }
      for (const p of present) {
        if (entrants.has(p.userId)) throw new Error(`${p.name} is in this room twice. One device per account for ranked.`);
        entrants.set(p.userId, p.id);
      }
    }
    const pool = ranked ? this.rankedPool.tracks : this.pool;
    if (pool.length < 2) throw new Error(ranked ? 'That genre didn\'t load enough songs. Try another.' : 'Add a playlist with at least 2 songs first');
    if (this.phase !== 'lobby' && this.phase !== 'results') throw new Error('Game already running');
    for (const p of this.players.values()) p.score = 0;
    this.roundNum = 0;
    this.usedTrackKeys.clear();
    this.gameId++;
    this.game = {
      id: this.gameId,
      ranked,
      packId: ranked ? st.rankedPack : null,
      pool,
      hard: st.hard,
      chaos: st.chaos,
      rounds: ranked ? RANKED_ROUNDS : st.rounds,
      maxGuesses: ranked ? 0 : st.maxGuesses,
      maxLen: ranked ? MAX_LEN : st.maxLen,
      listenLen: st.listenLen,
      roundTime: st.roundTime,
      entrants,
      history: [],
    };
    this.poolVersion++;
    await this.nextRound();
  }

  async nextRound() {
    const gid = this.gameId;
    const game = this.game;
    if (!game) return;
    this.clearTimers();
    if (this.roundNum >= game.rounds) return this.finish();
    this.phase = 'loading';
    this.reveal = null;
    this.broadcast();

    let unused = game.pool.filter((t) => !this.usedTrackKeys.has(t.poolId));
    if (!unused.length) { this.usedTrackKeys.clear(); unused = [...game.pool]; }

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
    if (gid !== this.gameId || this.phase !== 'loading') return; // host ended the game meanwhile
    if (!track) {
      this.phase = 'lobby';
      this.game = null;
      this.poolVersion++;
      this.broadcast();
      this.io.to(this.code).emit('toast', { kind: 'error', text: 'Couldn\'t load any song audio. Is the laptop online? Try the demo songs.' });
      return;
    }

    this.roundNum++;
    const roundTimeMs = game.roundTime * 1000;
    this.round = {
      num: this.roundNum,
      nonce: id(10),
      track,
      clip,
      ...this.roundTwist(), // { mode, hard, chaos, twist, offset, typed, mult }
      maxLen: game.maxLen,
      firstId: null,
      startedAt: Date.now(),
      endsAt: roundTimeMs ? Date.now() + roundTimeMs : null,
      results: new Map(), // playerId -> { status, guesses:[], maxHeard, points }
    };
    this.lookUpPlays(track, this.roundNum, gid);
    this.phase = 'round';
    if (roundTimeMs) this.timers.round = setTimeout(() => this.endRound(), roundTimeMs + 300);
    this.broadcast();
  }

  // Hard: starts somewhere random + type the title. Chaos: a random twist. Both can be on.
  roundTwist() {
    const { hard, chaos } = this.game || this.settings;
    const randomStart = () => Math.round((2 + Math.random() * 12) * 10) / 10; // 2–14 s in
    let twist = null;
    if (chaos) {
      const options = TWISTS.filter((t) => t !== this.lastTwist && !(hard && t === 'random-start'));
      twist = options[crypto.randomInt(options.length)];
      this.lastTwist = twist;
    }
    const mult = Math.round((hard ? MODES.hard.mult : 1) * (chaos ? MODES.chaos.mult : 1) * 1000) / 1000;
    const mode = hard && chaos ? 'hard+chaos' : hard ? 'hard' : chaos ? 'chaos' : 'classic';
    // Classic: every clip plays from the start of the 30 s preview, like Songless.
    const offset = hard || twist === 'random-start' ? randomStart() : 0;
    return { mode, hard: !!hard, chaos: !!chaos, twist, offset, typed: !!hard, mult };
  }

  // Spotify play count, shown with the answer. Looked up in the background.
  lookUpPlays(track, num, gid) {
    if (!this.opts.plays || track.source === 'demo') return;
    if (track.plays !== undefined) return;
    track.plays = null;
    Promise.resolve(this.opts.plays(track)).then((n) => {
      track.plays = n || null;
      if (n && gid === this.gameId && this.phase === 'reveal' && this.reveal && this.reveal.num === num && !this.reveal.plays) {
        this.reveal.plays = n;
        this.broadcast();
      }
    }).catch(() => {});
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
    if (Number.isFinite(s)) r.maxHeard = Math.max(r.maxHeard, Math.min(this.round.maxLen || MAX_LEN, Math.max(0, s)));
  }

  guess(playerId, poolId) {
    if (this.phase !== 'round') throw new Error('No song is playing right now');
    if (this.round.typed) throw new Error('Hard mode: type the song title');
    const r = this.resultFor(playerId);
    if (r.status !== 'playing') throw new Error('You\'re done for this round');
    const picked = this.gamePool[Number(poolId)];
    if (!picked) throw new Error('Pick a song from the list');
    if (r.guesses.some((g) => g.poolId === picked.poolId)) throw new Error('You already guessed that one');
    const answer = this.round.track;
    const correct = picked.poolId === answer.poolId ||
      (norm(picked.title) === norm(answer.title) && norm(picked.artist) === norm(answer.artist));
    return this.recordGuess(playerId, r, { poolId: picked.poolId, title: picked.title, artist: picked.artist, correct });
  }

  // Hard mode: free-typed title, forgiving of small typos and "feat."/"(Remastered)" bits.
  guessText(playerId, text) {
    if (this.phase !== 'round') throw new Error('No song is playing right now');
    const r = this.resultFor(playerId);
    if (r.status !== 'playing') throw new Error('You\'re done for this round');
    const typed = String(text || '').trim().slice(0, 120);
    if (norm(typed).length < 1) throw new Error('Type a song title');
    if (r.guesses.some((g) => norm(g.title) === norm(typed))) throw new Error('You already guessed that');
    const correct = titleMatches(typed, this.round.track);
    return this.recordGuess(playerId, r, { title: typed, artist: '', correct, typed: true });
  }

  recordGuess(playerId, r, entry) {
    r.guesses.push(entry);
    const max = this.game ? this.game.maxGuesses : this.settings.maxGuesses;
    if (entry.correct) {
      r.status = 'correct';
      const wrong = r.guesses.length - 1;
      const base = pointsForLength(r.maxHeard) - wrong * WRONG_PENALTY;
      r.points = Math.max(0, Math.round(base * (this.round.mult || 1)));
      // Multiplayer bonus: first to get the song. Not in ranked (scores there are compared
      // across all games, so they can't depend on who else was in the room).
      if (!this.round.firstId && this.players.size >= 2 && !(this.game && this.game.ranked)) {
        this.round.firstId = playerId;
        r.bonus = FIRST_BONUS;
        r.points += FIRST_BONUS;
      }
      const p = this.players.get(playerId);
      if (p) {
        p.score += r.points;
        this.io.to(this.code).emit('gotIt', { playerId, name: p.name, points: r.points, heard: r.maxHeard, first: !!r.bonus });
      }
    } else if (max && r.guesses.length >= max) {
      r.status = 'out';
    }
    this.maybeEndRound();
    this.broadcast();
    return { correct: entry.correct, points: r.points, bonus: r.bonus || 0, guessesLeft: max ? max - r.guesses.length : null };
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
    const game = this.game;
    const waitMs = (game.listenLen + 4) * 1000; // room to hear the song after the answer
    this.reveal = {
      num: this.round.num,
      title: t.title,
      artist: t.artist,
      cover: t.cover,
      link: t.link,
      plays: t.plays || null,
      offset: this.round.offset,
      mode: this.round.mode,
      hard: this.round.hard,
      chaos: this.round.chaos,
      twist: this.round.twist,
      mult: this.round.mult,
      listenLen: game.listenLen,
      results: [...this.players.values()].map((p) => {
        const r = this.resultFor(p.id);
        return { id: p.id, name: p.name, status: r.status, points: r.points, bonus: r.bonus || 0, guesses: r.guesses.length, heard: r.maxHeard };
      }).sort((a, b) => b.points - a.points),
      autoNextAt: Date.now() + waitMs,
      last: this.roundNum >= game.rounds,
    };
    game.history.push({
      title: t.title,
      artist: t.artist,
      results: new Map([...this.players.values()].map((p) => {
        const r = this.resultFor(p.id);
        return [p.id, { status: r.status, points: r.points, heard: r.maxHeard, guesses: r.guesses.length }];
      })),
    });
    this.phase = 'reveal';
    this.timers.reveal = setTimeout(() => this.nextRound().catch(console.error), waitMs);
    this.broadcast();
  }

  finish() {
    this.clearTimers();
    this.phase = 'results';
    this.round = null;
    const game = this.game;
    this.lastGame = game ? { ranked: game.ranked, packId: game.packId, hard: game.hard, chaos: game.chaos } : null;
    this.game = null;
    this.poolVersion++;
    this.broadcast();
    if (game && game.ranked && this.opts.onRanked) {
      const entries = this.rankedEntries(game);
      if (entries.length) Promise.resolve(this.opts.onRanked(this, entries)).catch((e) => console.error('ranked submit failed:', e));
    }
  }

  // One entry per logged-in player who started the ranked game and is still here.
  rankedEntries(game) {
    const out = [];
    for (const [userId, playerId] of game.entrants) {
      const p = this.players.get(playerId);
      if (!p || p.userId !== userId) continue; // left, or logged out mid-game
      let correct = 0, firstTry = 0, heard = 0, score = 0;
      for (const h of game.history) {
        const r = h.results.get(playerId);
        if (!r) continue;
        score += r.points;
        if (r.status === 'correct') {
          correct++;
          heard += r.heard;
          if (r.guesses === 1) firstTry++;
        }
      }
      out.push({
        playerId, userId, name: p.name, packId: game.packId, score, songs: game.history.length,
        correct, firstTry, heard: Math.round(heard * 10) / 10, hard: game.hard, chaos: game.chaos,
      });
    }
    return out;
  }

  // Host ends the game early: everyone goes back to the lobby (songs and players stay).
  endGame(byName) {
    if (!['loading', 'round', 'reveal', 'results'].includes(this.phase)) return false;
    this.backToLobby();
    this.io.to(this.code).emit('toast', { kind: 'info', text: `${byName} ended the game` });
    return true;
  }

  backToLobby() {
    this.gameId++;
    this.clearTimers();
    this.phase = 'lobby';
    this.round = null;
    this.reveal = null;
    if (this.game) { this.game = null; this.poolVersion++; }
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
    const g = this.game;
    const state = {
      code: this.code,
      phase: this.phase,
      serverNow: Date.now(),
      hostId: this.hostId,
      meId: forPlayerId,
      settings: this.settings,
      game: g ? { ranked: g.ranked, packId: g.packId, hard: g.hard, chaos: g.chaos, rounds: g.rounds, listenLen: g.listenLen, maxLen: g.maxLen } : null,
      lastGame: this.phase === 'results' ? this.lastGame || null : null,
      sources: this.sources.map(({ key, name, by, byId, packId, count }) => ({ key, name, by, byId, packId, count })),
      packs: packs.publicPacks(),
      poolSize: this.gamePool.length,
      casualPoolSize: this.pool.length,
      ranked: { packId: this.settings.rankedPack, loading: this.rankedLoading, ready: !!(this.rankedPool && this.rankedPool.packId === this.settings.rankedPack), songs: this.rankedPool && this.rankedPool.packId === this.settings.rankedPack ? this.rankedPool.tracks.length : 0 },
      poolVersion: this.poolVersion,
      maxGuesses: g ? g.maxGuesses : this.settings.maxGuesses,
      players: [...this.players.values()]
        .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          connected: p.connected,
          loggedIn: !!p.userId,
          roundStatus: this.round && this.phase === 'round' ? this.resultFor(p.id).status : null,
        })),
      round: null,
      reveal: this.phase === 'reveal' ? this.reveal : null,
    };
    if (this.round && this.phase === 'round' && me) {
      const r = this.resultFor(me.id);
      state.round = {
        num: this.round.num,
        total: g ? g.rounds : this.settings.rounds,
        offset: this.round.offset,
        mode: this.round.mode,
        hard: this.round.hard,
        chaos: this.round.chaos,
        ranked: !!(g && g.ranked),
        maxLen: this.round.maxLen,
        listenLen: g ? g.listenLen : 15,
        twist: this.round.twist,
        typed: this.round.typed,
        mult: this.round.mult,
        clipUrl: `/api/clip/${this.code}/${this.round.nonce}`,
        endsAt: this.round.endsAt,
        my: { status: r.status, guesses: r.guesses, maxHeard: r.maxHeard, points: r.points, bonus: r.bonus || 0 },
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
      if (room.players.size === 0 || (room.connectedCount() === 0 && now - room.lastActive > ROOM_IDLE_MS)) {
        room.clearTimers();
        this.rooms.delete(code);
      }
    }
  }
}

// ---------- hard-mode title matching ----------
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[([](feat|ft|with|from|prod)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|live|mono|stereo|deluxe)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+(feat|ft)\.?\s+.*$/i, '');
}
const tidy = (s) => norm(s).replace(/&/g, 'and').replace(/^the /, '');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function titleMatches(guess, track) {
  const titles = new Set([tidy(cleanTitle(track.title)), tidy(track.title)].filter(Boolean));
  const g = tidy(guess);
  // Allow the artist to be typed too ("blinding lights the weeknd"): drop artist-only words.
  const titleWords = new Set([...titles].join(' ').split(' '));
  const artistWords = new Set(norm(track.artist).split(' ').filter((w) => !titleWords.has(w)));
  const gNoArtist = g.split(' ').filter((w) => !artistWords.has(w) && w !== 'by').join(' ');
  for (const t of titles) {
    for (const cand of [g, gNoArtist]) {
      if (!cand) continue;
      const a = cand.replace(/ /g, ''), b = t.replace(/ /g, '');
      const allowed = b.length <= 4 ? 0 : b.length <= 8 ? 1 : Math.min(3, Math.floor(b.length * 0.15) + 1);
      if (lev(a, b) <= allowed) return true;
    }
  }
  return false;
}

module.exports = { RoomManager, pointsForLength, titleMatches, MODES, MIN_LEN, MAX_LEN, FIRST_BONUS, RANKED_ROUNDS, LISTEN_OPTIONS, CLIP_OPTIONS };
