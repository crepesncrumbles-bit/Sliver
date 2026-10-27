/* Sliver client */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const MIN_LEN = 0.1, MAX_LEN = 30; // Songless: 0.1 s up to the whole 30 s clip
  const RATIO = MAX_LEN / MIN_LEN;

  // Small WebSocket wrapper with acks + auto-reconnect (matches server/realtime.js).
  function createSocket() {
    const handlers = {};
    const pending = new Map();
    let ws = null, nextId = 1, retry = 0, everConnected = false;
    const api = {
      connected: false,
      on(evt, fn) { (handlers[evt] ||= []).push(fn); },
      emit(evt, data, ack) {
        if (!ws || ws.readyState !== 1) { ack && ack({ ok: false, error: 'Not connected yet — try again in a second' }); return; }
        const msg = { e: evt, d: data || {} };
        if (ack) { msg.id = nextId++; pending.set(msg.id, ack); }
        ws.send(JSON.stringify(msg));
      },
    };
    const fire = (evt, data) => (handlers[evt] || []).forEach((fn) => fn(data));
    function open() {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => { retry = 0; api.connected = true; everConnected = true; fire('connect'); };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.ack !== undefined) { const fn = pending.get(m.ack); pending.delete(m.ack); fn && fn(m.d); }
        else fire(m.e, m.d);
      };
      ws.onclose = () => {
        const was = api.connected;
        api.connected = false;
        for (const fn of pending.values()) fn({ ok: false, error: 'Connection lost' });
        pending.clear();
        if (was) fire('disconnect');
        else if (!everConnected && retry === 3) fire('unreachable');
        setTimeout(open, Math.min(5000, 300 * 2 ** retry++));
      };
    }
    open();
    return api;
  }
  const socket = createSocket();
  socket.on('unreachable', () => toast('Can\'t reach the Sliver server. Is it still running on the host laptop?', 'error', 6000));
  let state = null;
  let session = loadSession();
  let pool = { version: -1, songs: [] };
  let clockSkew = 0; // serverNow - Date.now()
  let lanBase = null;

  // ---------- helpers ----------
  function loadSession() {
    try { return JSON.parse(localStorage.getItem('sliver.session')) || null; } catch { return null; }
  }
  function saveSession(s) {
    session = s;
    try { s ? localStorage.setItem('sliver.session', JSON.stringify(s)) : localStorage.removeItem('sliver.session'); } catch {}
  }
  function savedName() { try { return localStorage.getItem('sliver.name') || ''; } catch { return ''; } }
  function rememberName(n) { try { localStorage.setItem('sliver.name', n); } catch {} }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // Lengths snap to tenths of a second (0.1, 0.2 … 3.0 … 30.0) so the points match Songless exactly.
  const lenFromSlider = (v) => Math.max(MIN_LEN, Math.min(MAX_LEN, Math.round(MIN_LEN * Math.pow(RATIO, v / 1000) * 10) / 10));
  const sliderFromLen = (l) => Math.round(1000 * Math.log(Math.max(MIN_LEN, l) / MIN_LEN) / Math.log(RATIO));
  // Same curve as server/game.js (matches Songless's published points).
  const pointsFor = (len) => {
    const l = Math.min(MAX_LEN, Math.max(MIN_LEN, len || MIN_LEN));
    return Math.round(3500 + 6500 * Math.pow(1 - Math.log(l / MIN_LEN) / Math.log(RATIO), 1.55));
  };
  const fmtLen = (l) => (l < 1 ? l.toFixed(1) : l < 10 ? l.toFixed(1) : Math.round(l)) + 's';

  function toast(text, kind = 'info', ms = 3800) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove(); // never let notices pile up
    setTimeout(() => el.remove(), ms);
  }

  function emit(event, payload) {
    return new Promise((resolve) => socket.emit(event, payload || {}, (res) => resolve(res || { ok: true })));
  }

  function show(screen) {
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== `screen-${screen}`;
  }

  // ---------- home ----------
  $('#name').value = savedName();
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('#join-code').value = params.get('room').toUpperCase();

  function getName() {
    const n = $('#name').value.trim();
    if (!n) { $('#name').classList.add('shake'); $('#name').focus(); setTimeout(() => $('#name').classList.remove('shake'), 400); return null; }
    rememberName(n);
    return n;
  }

  $('#btn-create').onclick = async () => {
    const name = getName(); if (!name) return;
    const res = await emit('create', { name });
    if (!res.ok) return toast(res.error, 'error');
    joined(res);
  };

  async function joinRoom() {
    const name = getName(); if (!name) return;
    const code = $('#join-code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Room codes are 4 letters', 'error');
    const res = await emit('join', { code, name });
    if (!res.ok) return toast(res.error, 'error');
    joined(res);
  }
  $('#btn-join').onclick = joinRoom;
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

  function joined(res) {
    saveSession({ code: res.code, token: res.token });
    history.replaceState(null, '', `/?room=${res.code}`);
  }

  async function tryRejoin() {
    const want = (params.get('room') || '').toUpperCase();
    if (session && (!want || session.code === want)) {
      const res = await emit('join', { code: session.code, token: session.token, name: savedName() });
      if (res.ok) return joined(res);
      saveSession(null);
      if (want) toast(res.error, 'error');
    }
    show('home');
  }

  socket.on('connect', () => {
    if (!state) tryRejoin();
    else if (session) emit('join', { code: session.code, token: session.token, name: savedName() });
  });
  socket.on('disconnect', () => toast('Connection lost — reconnecting…', 'error', 2500));
  // Keep-alive: free hosts (Render) put the server to sleep after 15 minutes without messages,
  // which would wipe a room while friends sit in the lobby. A tiny ping every 4 minutes prevents that.
  setInterval(() => { if (socket.connected && state) socket.emit('ping'); }, 4 * 60 * 1000);

  // ---------- server events ----------
  socket.on('toast', (t) => toast(t.text, t.kind === 'error' ? 'error' : 'info'));
  socket.on('pool', (p) => { pool = p; });
  socket.on('state', (s) => {
    const prev = state;
    state = s;
    clockSkew = s.serverNow - Date.now();
    if (s.poolVersion !== pool.version) socket.emit('getPool');
    render(prev);
  });

  // ---------- render ----------
  function render(prev) {
    const isHost = state.hostId === state.meId;
    document.querySelectorAll('.host-only').forEach((el) => (el.hidden = !isHost));
    document.querySelectorAll('.guest-only').forEach((el) => (el.hidden = isHost));
    const phase = state.phase;
    document.body.classList.toggle('in-game', ['loading', 'round', 'reveal'].includes(phase));
    if (phase === 'lobby') renderLobby();
    else if (phase === 'loading') show('loading');
    else if (phase === 'round') renderRound(prev);
    else if (phase === 'reveal') renderReveal();
    else if (phase === 'results') renderResults();
    if (phase !== 'round' && phase !== 'reveal') stopAudio();
  }

  function renderLobby() {
    show('lobby');
    $('#lobby-code').textContent = state.code;
    const invite = inviteUrl();
    $('#invite-text').innerHTML = invite.lan
      ? `Friends on the same Wi-Fi can open <code>${esc(invite.url)}</code>`
      : `Send friends the invite link, or have them enter the code.`;

    const AV = ['#FFD43B', '#FF9EC7', '#8FF0CF', '#AFC0FF', '#FFC48A', '#D7B8FF'];
    $('#lobby-players').innerHTML = state.players.map((p, i) => `
      <li class="${p.connected ? '' : 'offline'}">
        <span class="av" style="background:${AV[i % AV.length]}">${esc((p.name || '?')[0].toUpperCase())}</span>
        ${esc(p.name)}${p.id === state.meId ? ' (you)' : ''}
        ${p.id === state.hostId ? '<span class="host-tag">host</span>' : ''}
      </li>`).join('');

    const isHost = state.hostId === state.meId;
    $('#pool-count').textContent = `${fmt(state.poolSize)} song${state.poolSize === 1 ? '' : 's'}`;
    $('#sources').innerHTML = state.sources.map((src) => {
      const canRemove = isHost || src.byId === state.meId;
      return `<li>
        <div class="s-main"><div class="s-name">${esc(src.name)}</div>
        <div class="s-meta">${src.count} song${src.count === 1 ? '' : 's'}, added by ${esc(src.by)}</div></div>
        ${canRemove ? `<button class="x" data-remove="${esc(src.key)}" aria-label="Remove ${esc(src.name)}" title="Remove">×</button>` : ''}
      </li>`;
    }).join('');
    $('#btn-clear').hidden = !isHost || state.sources.length < 2;

    // Built-in packs, grouped by category. Tap to add; tap again to remove.
    const added = new Map(state.sources.filter((x) => x.packId).map((x) => [x.packId, x]));
    const cats = [];
    for (const pk of state.packs || []) {
      let c = cats.find((x) => x.name === pk.cat);
      if (!c) cats.push(c = { name: pk.cat, packs: [] });
      c.packs.push(pk);
    }
    $('#packs').innerHTML = cats.map((c) => `<h3>${esc(c.name)}</h3><div class="pack-row">${c.packs.map((pk) =>
      `<button class="pack${added.has(pk.id) ? ' on' : ''}${busyPacks.has(pk.id) ? ' busy' : ''}" data-pack="${esc(pk.id)}" aria-pressed="${added.has(pk.id)}">${esc(pk.name)}</button>`
    ).join('')}</div>`).join('');

    document.querySelectorAll('#modes .mode').forEach((el) => {
      const on = el.dataset.mode === state.settings.mode;
      el.classList.toggle('on', on);
      el.setAttribute('aria-checked', on);
    });
    const modeName = { classic: 'Classic', hard: 'Hard', chaos: 'Chaos' }[state.settings.mode] || 'Classic';
    $('#guest-mode').textContent = `Mode: ${modeName}. ${state.settings.rounds} songs.`;

    const rSel = $('#set-rounds'), tSel = $('#set-time'), gSel = $('#set-guesses');
    if (!rSel.options.length) {
      [3, 5, 7, 10, 15, 20].forEach((n) => rSel.add(new Option(`${n} songs`, n)));
      tSel.add(new Option('No time limit', 0));
      [30, 45, 60, 90, 120, 180].forEach((n) => tSel.add(new Option(n < 120 ? `${n} seconds` : `${n / 60} minutes`, n)));
      gSel.add(new Option('Unlimited', 0));
      [1, 3, 5, 10].forEach((n) => gSel.add(new Option(`${n} guess${n === 1 ? '' : 'es'}`, n)));
    }
    rSel.value = state.settings.rounds;
    tSel.value = state.settings.roundTime;
    gSel.value = state.settings.maxGuesses;
    $('#btn-start').disabled = state.poolSize < 2;
    $('#btn-start').textContent = state.poolSize < 2 ? 'Add songs to start' : `Start ${state.settings.rounds} songs`;
  }

  function inviteUrl() {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (local && lanBase) return { url: `${lanBase}/?room=${state.code}`, lan: true };
    return { url: `${location.origin}/?room=${state.code}`, lan: false };
  }
  fetch('/api/info').then((r) => r.json()).then((info) => {
    lanBase = info.lan && info.lan[0];
    if (state && state.phase === 'lobby') renderLobby();
  }).catch(() => {});

  $('#btn-copy').onclick = async () => {
    const { url } = inviteUrl();
    try { await navigator.clipboard.writeText(url); toast('Invite link copied', 'good'); }
    catch { prompt('Copy this link:', url); }
  };

  $('#form-playlist').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#playlist-input').value.trim() || 'demo';
    const btn = $('#btn-add');
    btn.disabled = true; btn.textContent = 'Loading…';
    const res = await emit('addPlaylist', { input });
    btn.disabled = false; btn.textContent = 'Add';
    if (!res.ok) return toast(res.error, 'error', 6000);
    $('#playlist-input').value = '';
    if (res.added === 0) toast('Those songs were already in the game', 'info');
  };
  $('#btn-clear').onclick = () => emit('clearPool');
  const busyPacks = new Set();
  document.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const res = await emit('removeSource', { key: rm.dataset.remove });
      if (!res.ok) toast(res.error, 'error');
      return;
    }
    const pk = e.target.closest('[data-pack]');
    if (pk && !busyPacks.has(pk.dataset.pack)) {
      const id = pk.dataset.pack;
      const existing = state.sources.find((x) => x.packId === id);
      if (existing) {
        const res = await emit('removeSource', { key: existing.key });
        if (!res.ok) toast(res.error, 'error');
        return;
      }
      busyPacks.add(id); pk.classList.add('busy');
      const res = await emit('addPlaylist', { packId: id });
      busyPacks.delete(id);
      if (!res.ok) toast(res.error, 'error', 6000);
      if (state.phase === 'lobby') renderLobby();
      return;
    }
    const md = e.target.closest('#modes [data-mode]');
    if (md) emit('settings', { mode: md.dataset.mode });
  });
  $('#set-rounds').onchange = (e) => emit('settings', { rounds: e.target.value });
  $('#set-time').onchange = (e) => emit('settings', { roundTime: e.target.value });
  $('#set-guesses').onchange = (e) => emit('settings', { maxGuesses: e.target.value });
  $('#btn-start').onclick = async () => {
    unlockAudio();
    const res = await emit('start');
    if (!res.ok) toast(res.error, 'error');
  };

  // ---------- audio ----------
  // Quality notes:
  //  • The AudioContext is only created on a tap/click, with latencyHint "playback" (bigger
  //    buffers = no crackling when the laptop is busy, e.g. screen-sharing on Discord).
  //  • MP3s start with ~25-50 ms of encoder silence, which would eat half of a 0.1 s clip,
  //    so the clip start is moved to the first audible sample.
  //  • Every song is volume-matched (RMS) and peak-limited so nothing clips or blasts.
  let ctx = null;
  let clip = { url: null, data: null, buffer: null, start: 0, gain: 1, loading: null };
  let playing = null; // { source, startedAt, len, raf }

  function unlockAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); }
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (clip.data && !clip.buffer && !clip.decoding) decodeClip(clip);
    return ctx;
  }

  function analyze(buf) {
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    const n = buf.length, sr = buf.sampleRate;
    const limit = Math.min(n, Math.floor(sr * 1.5));
    let start = 0;
    find: for (let i = 0; i < limit; i++) {
      for (const ch of chans) if (Math.abs(ch[i]) > 0.004) { start = i; break find; }
    }
    let sum = 0, peak = 0, count = 0;
    for (let i = start; i < n; i += 4) {
      for (const ch of chans) { const v = ch[i]; sum += v * v; count++; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    }
    const rms = Math.sqrt(sum / Math.max(1, count)) || 0.1;
    const gain = Math.max(0.25, Math.min(0.15 / rms, 0.97 / (peak || 1), 3));
    return { start: Math.max(0, start / sr - 0.002), gain };
  }

  function decodeClip(c) {
    c.decoding = new Promise((res, rej) => ctx.decodeAudioData(c.data.slice(0), res, rej))
      .then((buf) => { Object.assign(c, analyze(buf)); c.buffer = buf; updatePlayButton(); return buf; });
    return c.decoding;
  }

  function loadClip(url) {
    if (clip.url === url) return clip.loading;
    const mine = { url, data: null, buffer: null, start: 0, gain: 1, loading: null, decoding: null };
    clip = mine;
    mine.loading = fetch(url)
      .then((r) => { if (!r.ok) throw new Error('Clip not found'); return r.arrayBuffer(); })
      .then((ab) => { mine.data = ab; updatePlayButton(); return ctx ? decodeClip(mine) : null; })
      .catch((err) => { toast(`Couldn't load the clip: ${err.message || err}`, 'error'); throw err; });
    updatePlayButton();
    return mine.loading;
  }

  async function ensureDecoded(url) {
    if (clip.url !== url) loadClip(url);
    const mine = clip;
    await mine.loading;
    if (!mine.buffer) await (mine.decoding || decodeClip(mine));
    return mine;
  }

  // Only one clip can ever play at a time. Overlapping copies of the same song (from a
  // double-tap, or +1s while a clip was still loading) sound like a weird echo/reverb.
  let playGen = 0;
  const activeSources = new Set();

  function stopAudio() {
    playGen++; // also cancels any play that's still loading
    if (ctx) {
      const now = ctx.currentTime;
      for (const a of activeSources) {
        try {
          a.gain.gain.cancelScheduledValues(now);
          a.gain.gain.setValueAtTime(a.gain.gain.value, now);
          a.gain.gain.linearRampToValueAtTime(0, now + 0.012);
          a.source.stop(now + 0.015);
        } catch {}
      }
    }
    activeSources.clear();
    if (playing) cancelAnimationFrame(playing.raf);
    playing = null;
    setPlayingUI(false, 0);
  }

  // Chaos-mode twists. Each changes how the clip sounds, never how long you heard it.
  const TWISTS = {
    reverse: { name: 'Reversed', blurb: 'The clip plays backwards' },
    chipmunk: { name: 'Chipmunk', blurb: 'Sped up and pitched high', rate: 1.45 },
    slowmo: { name: 'Slow-mo', blurb: 'Slowed down and pitched low', rate: 0.72 },
    underwater: { name: 'Underwater', blurb: 'Muffled, like it\'s through a wall' },
    'random-start': { name: 'Deep cut', blurb: 'Starts somewhere in the middle' },
  };

  function reversedBuffer(c) {
    if (c.reversed) return c.reversed;
    const b = c.buffer;
    const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const src = b.getChannelData(ch), dst = r.getChannelData(ch), n = src.length;
      for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
    }
    return (c.reversed = r);
  }

  // mode: 'round' (counts toward your score) or 'listen' (the 15 s after you've guessed:
  // always the real song, from the top, no twist)
  async function startClip(url, wantLen, mode) {
    stopAudio();
    const gen = playGen;
    if (!url) return;
    unlockAudio();
    let c;
    try { c = await ensureDecoded(url); } catch { return; }
    if (gen !== playGen) return; // something else started or the user stopped it meanwhile
    const r = mode === 'round' && state && state.round;
    const twist = r ? TWISTS[r.twist] || null : null;
    const twistKey = r ? r.twist : null;
    const rate = (twist && twist.rate) || 1;
    const dur = c.buffer.duration;
    const startPos = Math.min(c.start + (r ? r.offset || 0 : 0), Math.max(c.start, dur - 0.3));
    const len = Math.max(0.05, Math.min(wantLen, (dur - startPos) / rate));

    const src = ctx.createBufferSource();
    let from = startPos;
    if (twistKey === 'reverse') {
      src.buffer = reversedBuffer(c);
      from = Math.max(0, dur - (startPos + len)); // same slice of the song, played backwards
    } else {
      src.buffer = c.buffer;
    }
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    let level = c.gain;
    let node = src;
    if (twistKey === 'underwater') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.8;
      node = src.connect(lp);
      level = Math.min(level * 1.7, 4);
    }
    const t0 = ctx.currentTime + 0.03;
    const fadeIn = Math.min(0.004, len / 10);
    const fadeOut = Math.min(mode === 'listen' ? 0.6 : 0.012, len / 5);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(level, t0 + fadeIn);
    gain.gain.setValueAtTime(level, t0 + len - fadeOut);
    gain.gain.linearRampToValueAtTime(0, t0 + len);
    node.connect(gain).connect(ctx.destination);
    src.start(t0, from);
    src.stop(t0 + len + 0.005);
    const entry = { source: src, gain };
    activeSources.add(entry);
    if (mode === 'round') {
      socket.emit('listen', { seconds: len });
      myHeard = Math.max(myHeard, len);
      updateReadout();
    }
    playing = { source: src, gain, startedAt: t0, len, raf: 0, mode };
    src.onended = () => {
      activeSources.delete(entry);
      if (playing && playing.source === src) { playing = null; setPlayingUI(false, 0); }
    };
    setPlayingUI(true, 0);
    const tick = () => {
      if (!playing || playing.source !== src) return;
      setPlayingUI(true, Math.min(1, Math.max(0, (ctx.currentTime - t0) / len)));
      playing.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function playClip(lenOverride) {
    const override = typeof lenOverride === 'number';
    if (playing && playing.mode === 'round' && !override) return stopAudio(); // tap again = stop
    const r = state && state.round;
    if (!r) return;
    startClip(r.clipUrl, override ? lenOverride : currentLen(), 'round');
  }

  const LISTEN_LEN = 15;
  function toggleListen() {
    if (playing && playing.mode === 'listen') return stopAudio();
    startClip(clip.url, LISTEN_LEN, 'listen');
  }

  function setPlayingUI(on, progress) {
    const mode = on && playing ? playing.mode : null;
    const roundOn = mode === 'round';
    $('.icon-play').hidden = roundOn;
    $('.icon-stop').hidden = !roundOn;
    $('.ring circle').style.strokeDashoffset = String(289 * (1 - (roundOn ? progress : 0)));
    const listenOn = mode === 'listen';
    document.querySelectorAll('[data-listen]').forEach((btn) => {
      btn.textContent = listenOn ? 'Stop' : `Play ${LISTEN_LEN} seconds`;
    });
    document.querySelectorAll('.listen-bar span').forEach((bar) => {
      bar.style.width = `${listenOn ? progress * 100 : 0}%`;
    });
  }

  function updatePlayButton() {
    const btn = $('#btn-play');
    const done = state && state.round && state.round.my.status !== 'playing';
    btn.disabled = false;
    const loading = !!clip.url && !clip.data;
    btn.classList.toggle('loading', loading);
    btn.title = loading ? 'Loading the song…' : done ? 'Replay' : 'Play';
  }

  // ---------- round ----------
  let myHeard = 0;
  let timerInt = null;
  let roundKey = null;

  const scrubber = $('#scrubber');
  let selectedLen = MIN_LEN; // exact length chosen (slider or +1s)
  const currentLen = () => selectedLen;
  const setLen = (l) => { selectedLen = Math.round(Math.max(MIN_LEN, Math.min(MAX_LEN, l)) * 10) / 10; scrubber.value = sliderFromLen(selectedLen); };

  function buildTicks() {
    const marks = [0.1, 0.5, 1, 3, 10, 30]; // Songless's labels
    $('#ticks').innerHTML = marks.map((m) => `<span style="left:${(sliderFromLen(m) / 10).toFixed(2)}%">${m}s</span>`).join('');
  }
  buildTicks();

  // Waveform strip under the slider: purely visual, seeded per song.
  const BARS = 56;
  function buildWave(seed) {
    let x = 0;
    for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    $('#wave').innerHTML = Array.from({ length: BARS }, (_, i) => {
      const h = 22 + Math.round(78 * (0.35 + 0.65 * rnd()) * (0.55 + 0.45 * Math.sin(i / 3.1 + rnd())));
      return `<i style="height:${Math.max(14, Math.min(100, h))}%"></i>`;
    }).join('');
  }
  buildWave('sliver');
  function paintWave() {
    const lit = Number(scrubber.value) / 1000;
    const heard = myHeard ? sliderFromLen(myHeard) / 1000 : -1;
    document.querySelectorAll('#wave i').forEach((el, i) => {
      const pos = (i + 0.5) / BARS;
      el.className = pos <= heard ? 'heard' : pos <= lit ? 'lit' : '';
    });
  }

  function updateReadout() {
    const len = currentLen();
    paintWave();
    $('#len-value').textContent = fmtLen(len);
    const effective = Math.max(len, myHeard);
    $('#pts-value').textContent = fmt(pointsFor(effective));
    const mult = (state && state.round && state.round.mult) || 1;
    $('#pts-value').textContent = fmt(Math.round(pointsFor(effective) * mult));
    $('#heard-note').textContent = myHeard > 0
      ? `You've heard ${fmtLen(myHeard)}, so you can score up to ${fmt(Math.round(pointsFor(myHeard) * mult))}.`
      : 'Drag to hear more. The longer you listen, the fewer points.';
  }
  scrubber.addEventListener('input', () => { if (playing) stopAudio(); selectedLen = lenFromSlider(Number(scrubber.value)); updateReadout(); });
  $('#btn-play').onclick = () => playClip();
  // +1s: one more second than the longest you've heard (or the slider, if that's further).
  $('#btn-plus').onclick = () => {
    if (myHeard >= MAX_LEN) return;
    setLen(Math.max(currentLen(), myHeard) + 1);
    updateReadout();
    playClip(selectedLen);
  };

  function renderRound() {
    show('round');
    const r = state.round;
    if (!r) return;
    const key = `${state.code}:${r.num}:${r.clipUrl}`;
    if (key !== roundKey) {
      roundKey = key;
      stopAudio();
      myHeard = r.my.maxHeard || 0;
      setLen(myHeard || MIN_LEN);
      $('#done-card').dataset.status = '';
      $('#guess-input').value = '';
      hideSuggestions();
      buildWave(key);
      celebrated = false;
      loadClip(r.clipUrl).catch(() => {});
    }
    $('#round-label').textContent = `Song ${r.num} of ${r.total}`;
    const tw = r.twist ? TWISTS[r.twist] : r.mode === 'hard' ? { name: 'Hard mode', blurb: 'Starts mid-song. Type the title yourself.' } : null;
    $('#twist').hidden = !tw;
    if (tw) { $('#twist b').textContent = tw.name; $('#twist span').textContent = tw.blurb; }
    typedMode = !!r.typed;
    $('#guess-title').textContent = typedMode ? 'Type the title' : 'Your guess';
    gi.placeholder = typedMode ? 'Type the song title' : 'Start typing a song or artist…';
    $('#btn-submit-typed').hidden = !typedMode;
    updateReadout();
    updatePlayButton();

    const my = r.my;
    const wrong = my.guesses.filter((g) => !g.correct).length;
    $('#guesses-left').textContent = state.maxGuesses
      ? `${state.maxGuesses - my.guesses.length} left`
      : wrong ? `${wrong} wrong, −${fmt(wrong * 500)}` : 'Unlimited guesses';
    $('#my-guesses').innerHTML = my.guesses.map((g) =>
      `<li class="${g.correct ? 'ok' : ''}">${esc(g.title)}${g.artist ? `, ${esc(g.artist)}` : ''}</li>`).join('');

    const done = my.status !== 'playing';
    $('#guess-card').hidden = done;
    $('#done-card').hidden = !done;
    if (done) {
      const msg = {
        correct: `<div class="verdict">Got it</div><div class="big-pts">+${fmt(my.points)}</div>`,
        out: `<div class="verdict">Out of guesses</div>`,
        'gave-up': `<div class="verdict">Skipped</div>`,
        timeout: `<div class="verdict">${r.endsAt ? 'Time\'s up' : 'Song over'}</div>`,
      }[my.status] || '';
      if (my.status === 'correct' && !celebrated) { celebrated = true; confetti(); }
      if ($('#done-card').dataset.status !== my.status) {
        $('#done-card').dataset.status = my.status;
        $('#done-card').innerHTML = msg +
          `<button class="btn listen" data-listen>Play ${LISTEN_LEN} seconds</button><div class="listen-bar"><span></span></div>` +
          '<p>Here\'s the song while everyone else finishes.</p>';
        // Hear the song right after your guess. Your own device only.
        toggleListen();
      }
    }

    $('#round-players').innerHTML = state.players.filter((p) => p.connected).map((p) => {
      const icon = { correct: '✓ ', out: '', 'gave-up': '', timeout: '' }[p.roundStatus] ?? '';
      return `<li class="${p.roundStatus || ''}">${icon}${esc(p.name)}</li>`;
    }).join('');

    clearInterval(timerInt);
    $('#timer').classList.remove('low');
    if (!r.endsAt) { $('#timer').textContent = ''; $('#timer').title = 'No time limit'; return; }
    const tickTimer = () => {
      const remain = Math.max(0, Math.ceil((r.endsAt - (Date.now() + clockSkew)) / 1000));
      const el = $('#timer');
      el.textContent = remain;
      el.classList.toggle('low', remain <= 10);
      if (remain <= 0) clearInterval(timerInt);
    };
    tickTimer();
    timerInt = setInterval(tickTimer, 250);
  }

  $('#btn-giveup').onclick = () => socket.emit('giveUp');
  document.addEventListener('click', (e) => { if (e.target.closest('[data-listen]')) toggleListen(); });
  $('#btn-skip').onclick = () => emit('next');

  // ---------- autocomplete ----------
  const gi = $('#guess-input');
  const sug = $('#suggestions');
  let matches = [];
  let active = 0;

  // Results come in sections: songs whose title matches, then — when you type an
  // artist's name — every song by that artist in this game.
  // Spotify lists multiple artists as "A, B". Keep "&" names whole (Simon & Garfunkel).
  const splitArtists = (a) => String(a || '').split(/\s*,\s*|\s+feat\.?\s+|\s+ft\.?\s+/i).filter(Boolean);
  let sections = [];

  function search(q) {
    const qn = norm(q);
    const words = qn.split(' ').filter(Boolean);
    if (!words.length) return [];
    const tried = new Set(((state && state.round && state.round.my.guesses) || []).map((g) => g.poolId));
    const songs = pool.songs.filter((s) => !tried.has(s.id));

    // Artist sections (match on each individual artist name, so "Dua" finds "Dua Lipa, DaBaby").
    const artists = new Map(); // normName -> { name, songs, starts }
    for (const s of songs) {
      for (const name of splitArtists(s.artist)) {
        const an = norm(name);
        if (!an.includes(qn)) continue;
        if (!artists.has(an)) artists.set(an, { name, songs: [], starts: an.startsWith(qn) });
        artists.get(an).songs.push(s);
      }
    }
    const artistGroups = [...artists.values()]
      .sort((x, y) => (y.starts - x.starts) || (y.songs.length - x.songs.length) || x.name.localeCompare(y.name))
      .slice(0, 3);
    for (const g of artistGroups) g.songs.sort((x, y) => x.title.localeCompare(y.title));
    const inGroups = new Set(artistGroups.flatMap((g) => g.songs.map((s) => s.id)));

    // Title matches (every typed word appears somewhere, and at least one is in the title).
    const scored = [];
    for (const s of songs) {
      if (inGroups.has(s.id)) continue;
      const t = norm(s.title), hay = `${t} ${norm(s.artist)}`;
      if (!words.every((w) => hay.includes(w)) || !words.some((w) => t.includes(w))) continue;
      scored.push([(t.startsWith(words[0]) ? 0 : 2) + (t.includes(qn) ? 0 : 1), s]);
    }
    scored.sort((x, y) => x[0] - y[0] || x[1].title.localeCompare(y[1].title));
    const titles = scored.slice(0, artistGroups.length ? 6 : 30).map((x) => x[1]);

    sections = [];
    if (titles.length) sections.push({ label: artistGroups.length ? 'Songs' : null, songs: titles });
    for (const g of artistGroups) sections.push({ label: `All songs by ${g.name} (${g.songs.length})`, songs: g.songs });
    return sections.flatMap((sec) => sec.songs);
  }

  let typedMode = false;
  let celebrated = false;
  function renderSuggestions() {
    if (typedMode || !gi.value.trim()) return hideSuggestions();
    matches = search(gi.value);
    active = Math.min(active, Math.max(0, matches.length - 1));
    sug.hidden = false;
    if (!matches.length) { sug.innerHTML = '<li class="empty">No song in this game matches that</li>'; return; }
    let i = 0;
    sug.innerHTML = sections.map((sec) =>
      (sec.label ? `<li class="group">${esc(sec.label)}</li>` : '') +
      sec.songs.map((s) => {
        const idx = i++;
        return `<li data-id="${s.id}" data-idx="${idx}" class="${idx === active ? 'active' : ''}"><div>${esc(s.title)}</div><div class="s-artist">${esc(s.artist)}</div></li>`;
      }).join('')).join('');
    const el = sug.querySelector('li.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function hideSuggestions() { sug.hidden = true; matches = []; active = 0; }

  gi.addEventListener('input', () => { active = 0; renderSuggestions(); });
  gi.addEventListener('keydown', (e) => {
    if (typedMode) { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } return; }
    if (sug.hidden || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % matches.length; renderSuggestions(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; renderSuggestions(); }
    else if (e.key === 'Enter') { e.preventDefault(); submitGuess(matches[active].id); }
    else if (e.key === 'Escape') hideSuggestions();
  });
  sug.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) { e.preventDefault(); submitGuess(Number(li.dataset.id)); }
  });
  gi.addEventListener('blur', () => setTimeout(hideSuggestions, 150));

  $('#btn-submit-typed').onclick = () => submitTyped();
  async function submitTyped() {
    const text = gi.value.trim();
    if (!text) return;
    gi.value = '';
    const res = await emit('guessText', { text });
    afterGuess(res);
    gi.focus();
  }

  async function submitGuess(songId) {
    hideSuggestions();
    gi.value = '';
    const res = await emit('guess', { songId });
    afterGuess(res);
  }

  function afterGuess(res) {
    if (!res.ok) return toast(res.error, 'error');
    if (!res.correct) {
      $('#guess-card').classList.add('shake');
      setTimeout(() => $('#guess-card').classList.remove('shake'), 400);
      const msg = res.guessesLeft === null ? 'Not that one. −500, try again.'
        : res.guessesLeft ? `Not that one. −500, ${res.guessesLeft} guess${res.guessesLeft === 1 ? '' : 'es'} left.` : 'Out of guesses.';
      toast(msg, 'error', 1800);
    }
  }

  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('#confetti');
    const colors = ['#FFD43B', '#FF4F9A', '#2FD6A0', '#FFFFFF', '#8FA0FF'];
    box.innerHTML = Array.from({ length: 70 }, () => {
      const left = Math.random() * 100, dx = (Math.random() - 0.5) * 220, rot = Math.round(Math.random() * 720 - 360);
      const delay = Math.random() * 0.25, dur = 1 + Math.random() * 0.8;
      return `<i style="left:${left}%;background:${colors[Math.floor(Math.random() * colors.length)]};--dx:${dx}px;--rot:${rot}deg;animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
    }).join('');
    setTimeout(() => { box.innerHTML = ''; }, 2400);
  }

  // ---------- reveal ----------
  let autoInt = null;
  let revealKey = null;
  function renderReveal() {
    show('reveal');
    const v = state.reveal;
    $('#reveal-title').textContent = v.title;
    $('#reveal-artist').textContent = v.artist;
    $('#reveal-cover').style.backgroundImage = v.cover
      ? `url("${encodeURI(v.cover)}"), linear-gradient(135deg, #2336E6, #FF4F9A)` : '';
    const link = $('#reveal-link');
    link.hidden = !v.link;
    if (v.link) link.href = v.link;
    const twistName = v.twist && TWISTS[v.twist] ? TWISTS[v.twist].name : null;
    $('#reveal-mode').textContent = v.mode === 'hard' ? `Hard mode, ${v.mult}× points`
      : twistName ? `Chaos twist: ${twistName}, ${v.mult}× points` : '';
    const label = { correct: '', out: 'Missed it', 'gave-up': 'Skipped', timeout: 'Ran out of time' };
    const totals = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    $('#reveal-results').innerHTML = v.results.map((r) => {
      const how = r.status === 'correct'
        ? `Heard ${fmtLen(Math.max(0.1, r.heard))}${r.guesses > 1 ? `, ${r.guesses - 1} wrong` : ''}`
        : label[r.status] || '';
      return `<li>
        <div><div class="r-name">${esc(r.name)}</div><div class="r-sub">${how}. Total ${fmt(totals[r.id])}</div></div>
        <span class="r-pts ${r.points ? '' : 'zero'}">+${fmt(r.points)}</span>
      </li>`;
    }).join('');
    $('#btn-next').textContent = v.last ? 'See final scores' : 'Next song';
    // Play 15 s of the song for everyone (unless it's already playing from your own guess).
    const key = `${state.code}:${v.title}:${v.autoNextAt}`;
    if (key !== revealKey) {
      revealKey = key;
      if (!(playing && playing.mode === 'listen')) toggleListen();
    }
    clearInterval(autoInt);
    const tick = () => {
      const s = Math.max(0, Math.ceil((v.autoNextAt - (Date.now() + clockSkew)) / 1000));
      $('#auto-next').textContent = s ? `${v.last ? 'Final scores' : 'Next song'} in ${s} seconds` : '';
    };
    tick();
    autoInt = setInterval(tick, 500);
  }
  $('#btn-next').onclick = () => { unlockAudio(); emit('next'); };

  // ---------- results ----------
  function renderResults() {
    show('results');
    const ps = [...state.players].sort((a, b) => b.score - a.score);
    const top = ps[0];
    const tied = ps.filter((p) => p.score === top.score);
    $('#winner').textContent = tied.length > 1 ? `${tied.map((p) => p.name).join(' & ')} tie` : top.name;
    $('#final-board').innerHTML = ps.map((p) =>
      `<li><span class="b-name">${esc(p.name)}</span><span class="b-score">${fmt(p.score)}</span></li>`).join('');
  }
  $('#btn-again').onclick = () => { unlockAudio(); emit('start').then((r) => !r.ok && toast(r.error, 'error')); };
  $('#btn-lobby').onclick = () => emit('lobby');

  // Keyboard: space plays the clip during a round (when not typing).
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state && state.phase === 'round' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); playClip();
    }
  });
})();
