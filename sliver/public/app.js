/* Sliver client */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const MIN_LEN = 0.1, MAX_LEN = 30; // Songless: 0.1 s up to the whole 30 s clip
  const RATIO = MAX_LEN / MIN_LEN;   // the points curve always uses the full 30 s
  let maxLen = MAX_LEN;              // longest clip this game allows (host setting: 15, 20 or 30 s)

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
  const lenFromSlider = (v) => Math.max(MIN_LEN, Math.min(maxLen, Math.round(MIN_LEN * Math.pow(maxLen / MIN_LEN, v / 1000) * 10) / 10));
  const sliderFromLen = (l) => Math.min(1000, Math.round(1000 * Math.log(Math.max(MIN_LEN, l) / MIN_LEN) / Math.log(maxLen / MIN_LEN)));
  // Same curve as server/game.js (matches Songless's published points).
  const pointsFor = (len) => {
    const l = Math.min(MAX_LEN, Math.max(MIN_LEN, len || MIN_LEN));
    return Math.round(3500 + 6500 * Math.pow(1 - Math.log(l / MIN_LEN) / Math.log(RATIO), 1.55));
  };
  const fmtPlays = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
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
    const res = await emit('create', { name, auth: authToken() });
    if (!res.ok) return toast(res.error, 'error');
    joined(res);
  };

  async function joinRoom() {
    const name = getName(); if (!name) return;
    const code = $('#join-code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Room codes are 4 letters', 'error');
    const res = await emit('join', { code, name, auth: authToken() });
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
      const res = await emit('join', { code: session.code, token: session.token, name: savedName(), auth: authToken() });
      if (res.ok) return joined(res);
      saveSession(null);
      if (want) toast(res.error, 'error');
    }
    show('home');
  }

  socket.on('connect', () => {
    if (!state) tryRejoin();
    else if (session) emit('join', { code: session.code, token: session.token, name: savedName(), auth: authToken() });
  });
  socket.on('disconnect', () => toast('Connection lost — reconnecting…', 'error', 2500));
  // Keep-alive: free hosts (Render) put the server to sleep after 15 minutes without messages,
  // which would wipe a room while friends sit in the lobby. A tiny ping every 4 minutes prevents that.
  setInterval(() => { if (socket.connected && state) socket.emit('ping'); }, 4 * 60 * 1000);

  // ---------- server events ----------
  socket.on('toast', (t) => toast(t.text, t.kind === 'error' ? 'error' : 'info'));
  socket.on('pool', (p) => { pool = p; });
  socket.on('state', (s) => {
    if (!session) return; // left the room; ignore any late updates
    const prev = state;
    state = s;
    clockSkew = s.serverNow - Date.now();
    if (s.poolVersion !== pool.version) socket.emit('getPool');
    render(prev);
  });

  // ---------- kick (host only) ----------
  // First tap on × asks "Remove Name?", second tap within 3 s removes them.
  let armedKick = null, kickTimer = null;
  document.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kick]');
    if (!k) return;
    const id = k.dataset.kick;
    clearTimeout(kickTimer);
    if (armedKick !== id) {
      armedKick = id;
      kickTimer = setTimeout(() => { armedKick = null; if (state && state.phase === 'lobby') renderLobby(); }, 3000);
      renderLobby();
      return;
    }
    armedKick = null;
    const res = await emit('kick', { playerId: id });
    if (!res.ok) toast(res.error, 'error');
  });
  socket.on('kicked', () => {
    goHome();
    toast('The host removed you from the room', 'error', 5000);
  });

  // ---------- "X got it" pop-ups ----------
  const POP_COLORS = ['#FFD43B', '#2FD6A0', '#FF9EC7', '#8FB4FF', '#FFB36B', '#C9A7FF'];
  let popN = 0;
  socket.on('gotIt', (g) => {
    if (!state || g.playerId === state.meId) return; // your own win already gets confetti
    const el = document.createElement('div');
    el.className = 'pop-msg';
    el.style.background = POP_COLORS[popN++ % POP_COLORS.length];
    el.innerHTML = `<span class="dot">${g.first ? '★' : '♪'}</span><span><b>${esc(g.name)}</b> got the song${g.first ? ' first' : ''}</span>${g.points ? `<span class="pts">+${fmt(g.points)}</span>` : ''}`;
    const box = $('#gotit');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3100);
  });

  // ---------- settings (themes) ----------
  function renderThemes() {
    const T = window.SliverThemes;
    const cur = T.current();
    $('#theme-grid').innerHTML = T.available().map((t) => {
      const v = t.vars;
      return `<button class="theme${t.id === cur ? ' on' : ''}" data-theme-id="${t.id}" role="radio" aria-checked="${t.id === cur}">
        <span class="sw" style="background:${v['--page']}">
          <span class="sw-card" style="background:${v['--paper']}"></span>
          <span class="sw-disc" style="background:${v['--pop']};box-shadow:0 0 0 2px ${v['--stroke']}"></span>
          <span class="sw-bar" style="top:28px;background:${v['--accent']}"></span>
          <span class="sw-bar" style="top:40px;right:34px;background:${v['--line']}"></span>
        </span>
        ${t.deco ? `<span class="sw-deco" aria-hidden="true">${t.deco}</span>` : ''}
        <span class="name">${t.name}</span>
        ${t.season ? `<span class="season">Until ${T.seasonEnds(t)}</span>` : ''}
      </button>`;
    }).join('');
  }
  function openSettings() { renderThemes(); applyVolume(); openSheet('settings'); $('#btn-settings-close').focus(); }
  function closeSettings() { closeSheet('settings'); }
  $('#btn-settings').onclick = openSettings;
  $('#btn-settings-close').onclick = closeSettings;
  $('#btn-settings-done').onclick = closeSettings;
  $('#settings').addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-id]');
    if (t) { window.SliverThemes.set(t.dataset.themeId); renderThemes(); }
  });

  // ---------- end game (host) ----------
  // Same two-tap confirm as Leave room. Sends everyone back to the lobby.
  let endArmed = null;
  $('#btn-end').onclick = async () => {
    const btn = $('#btn-end');
    if (!endArmed) {
      btn.classList.add('confirm');
      btn.textContent = 'Tap again to end';
      endArmed = setTimeout(disarmEnd, 3000);
      return;
    }
    disarmEnd();
    const res = await emit('endGame');
    if (!res.ok) toast(res.error, 'error');
  };
  function disarmEnd() {
    clearTimeout(endArmed); endArmed = null;
    const btn = $('#btn-end');
    btn.classList.remove('confirm');
    btn.textContent = 'End game';
  }

  // ---------- leave room ----------
  // One tap arms it ("Tap again to leave"), a second tap within 3 s leaves.
  // Mid-song that protects against leaving by accident.
  let leaveArmed = null;
  $('#btn-leave').onclick = async () => {
    const btn = $('#btn-leave');
    if (!leaveArmed) {
      btn.classList.add('confirm');
      btn.textContent = 'Tap again to leave';
      leaveArmed = setTimeout(disarmLeave, 3000);
      return;
    }
    disarmLeave();
    await emit('leave');
    goHome();
  };
  function disarmLeave() {
    clearTimeout(leaveArmed); leaveArmed = null;
    const btn = $('#btn-leave');
    btn.classList.remove('confirm');
    btn.textContent = 'Leave room';
  }
  function goHome() {
    stopAudio();
    clearInterval(timerInt); clearInterval(autoInt);
    saveSession(null);
    state = null; roundKey = null; revealKey = null;
    pool = { version: -1, songs: [] };
    history.replaceState(null, '', '/');
    $('#join-code').value = '';
    $('#btn-leave').hidden = true;
    $('#btn-end').hidden = true;
    $('#btn-players').hidden = true;
    $('#btn-boards').hidden = false;
    lastRanked = null;
    closeSheet('players');
    document.body.classList.remove('in-game');
    show('home');
  }

  // ---------- render ----------
  function render(prev) {
    const isHost = state.hostId === state.meId;
    document.querySelectorAll('.host-only').forEach((el) => (el.hidden = !isHost));
    document.querySelectorAll('.guest-only').forEach((el) => (el.hidden = isHost));
    const phase = state.phase;
    $('#btn-leave').hidden = false;
    const inGame = ['loading', 'round', 'reveal'].includes(state.phase);
    $('#btn-end').hidden = !(isHost && inGame);
    $('#btn-players').hidden = false;
    $('#btn-boards').hidden = inGame;
    if (!$('#players').hidden) renderPlayersSheet();
    if ($('#btn-end').hidden) disarmEnd();
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
    const isHost = state.hostId === state.meId;
    const AV = ['#FFD43B', '#FF9EC7', '#8FF0CF', '#AFC0FF', '#FFC48A', '#D7B8FF'];
    $('#lobby-players').innerHTML = state.players.map((p, i) => {
      const canKick = isHost && p.id !== state.meId;
      const armed = armedKick === p.id;
      return `<li class="${p.connected ? '' : 'offline'}${armed ? ' arm' : ''}">
        <span class="av" style="background:${AV[i % AV.length]}">${esc((p.name || '?')[0].toUpperCase())}</span>
        ${armed ? `Remove ${esc(p.name)}?` : `${esc(p.name)}${p.id === state.meId ? ' (you)' : ''}`}
        ${p.id === state.hostId ? '<span class="host-tag">host</span>' : ''}
        ${state.settings.ranked && !p.loggedIn ? '<span class="guest-tag">not logged in</span>' : ''}
        ${canKick ? `<button class="kick" data-kick="${esc(p.id)}" aria-label="${armed ? 'Confirm removing' : 'Remove'} ${esc(p.name)}" title="${armed ? 'Tap again to remove' : 'Remove from room'}">×</button>` : ''}
      </li>`;
    }).join('');

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

    // ---- game type, mode, settings ----
    const st = state.settings;
    const ranked = !!st.ranked;
    $('#seg-casual').classList.toggle('on', !ranked);
    $('#seg-ranked').classList.toggle('on', ranked);
    $('#seg-casual').setAttribute('aria-selected', !ranked);
    $('#seg-ranked').setAttribute('aria-selected', ranked);
    $('#ranked-panel').hidden = !ranked;
    $('#songs-card').hidden = ranked;
    document.querySelectorAll('.casual-only').forEach((el) => (el.hidden = ranked));
    $('#ranked-fixed').hidden = !ranked;
    const rankedPacks = (state.packs || []).filter((pk) => pk.ranked);
    $('#ranked-genres').innerHTML = rankedPacks.map((pk) => {
      const on = st.rankedPack === pk.id;
      const busy = state.ranked && state.ranked.loading === pk.id;
      return `<button class="pack${on ? ' on' : ''}${busy ? ' busy' : ''}" data-rpack="${esc(pk.id)}" aria-pressed="${on}">${esc(pk.name)}</button>`;
    }).join('');

    document.querySelectorAll('#modes .mode').forEach((el) => {
      const m = el.dataset.mod;
      const on = m === 'classic' ? !st.hard && !st.chaos : !!st[m];
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
    });
    $('#mods-title').textContent = ranked ? 'Mods' : 'Mode';
    $('#mode-mult').textContent = st.hard && st.chaos ? 'Hard + Chaos together: 1.875× points'
      : st.hard || st.chaos ? 'Tap Classic to turn it off, or add the other one too.' : 'Hard and Chaos can be on at the same time.';
    const modeName = st.hard && st.chaos ? 'Hard + Chaos' : st.hard ? 'Hard' : st.chaos ? 'Chaos' : 'Classic';
    const packName = (id) => ((state.packs || []).find((x) => x.id === id) || {}).name || 'no genre picked yet';
    $('#guest-mode').textContent = ranked
      ? `Ranked: ${packName(st.rankedPack)}. ${modeName}. 5 songs.`
      : `Mode: ${modeName}. ${st.rounds} songs.`;
    const me = state.players.find((p) => p.id === state.meId);
    $('#guest-login').hidden = !(ranked && me && !me.loggedIn);

    const rSel = $('#set-rounds'), tSel = $('#set-time'), gSel = $('#set-guesses'), mSel = $('#set-maxlen'), lSel = $('#set-listen');
    if (!rSel.options.length) {
      [3, 5, 7, 10, 15, 20].forEach((n) => rSel.add(new Option(`${n} songs`, n)));
      tSel.add(new Option('No time limit', 0));
      [30, 45, 60, 90, 120, 180].forEach((n) => tSel.add(new Option(n < 120 ? `${n} seconds` : `${n / 60} minutes`, n)));
      gSel.add(new Option('Unlimited', 0));
      [1, 3, 5, 10].forEach((n) => gSel.add(new Option(`${n} guess${n === 1 ? '' : 'es'}`, n)));
      [15, 20].forEach((n) => mSel.add(new Option(`${n} seconds`, n)));
      mSel.add(new Option('30 seconds (whole clip)', 30));
      [15, 20].forEach((n) => lSel.add(new Option(`${n} seconds`, n)));
      lSel.add(new Option('30 seconds (whole clip)', 30));
    }
    rSel.value = st.rounds;
    tSel.value = st.roundTime;
    gSel.value = st.maxGuesses;
    mSel.value = st.maxLen;
    lSel.value = st.listenLen;

    const start = $('#btn-start');
    const warn = $('#ranked-warn');
    warn.hidden = true;
    if (ranked) {
      const guests = state.players.filter((p) => p.connected && !p.loggedIn);
      if (guests.length) {
        warn.hidden = false;
        warn.textContent = `Not logged in yet: ${guests.map((p) => p.name + (p.id === state.meId ? ' (you)' : '')).join(', ')}. Everyone needs an account for ranked.`;
      }
      const loading = state.ranked && state.ranked.loading;
      start.disabled = !st.rankedPack || !!loading || guests.length > 0;
      start.textContent = !st.rankedPack ? 'Pick a genre' : loading ? 'Loading songs…'
        : guests.length ? 'Waiting for logins' : `Start ranked: ${packName(st.rankedPack)}`;
    } else {
      start.disabled = state.poolSize < 2;
      start.textContent = state.poolSize < 2 ? 'Add songs to start' : `Start ${st.rounds} songs`;
    }
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
    if (!$('#artist-sug').hidden && artistActive >= 0 && artistList[artistActive]) return pickArtist(artistList[artistActive]);
    addInput($('#playlist-input').value.trim() || 'demo');
  };
  async function addInput(input, artistId) {
    hideArtistSug();
    const btn = $('#btn-add');
    btn.disabled = true; btn.textContent = 'Loading…';
    const res = await emit('addPlaylist', { input, artistId });
    btn.disabled = false; btn.textContent = 'Add';
    if (!res.ok) return toast(res.error, 'error', 6000);
    $('#playlist-input').value = '';
    hideArtistSug();
    if (res.added === 0) toast('Those songs were already in the game', 'info');
    else if (res.truncated) toast('Spotify only shared the first 100 songs of that playlist. The Deezer version of it will load all of them.', 'info', 7000);
  }
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
    const md = e.target.closest('#modes [data-mod]');
    if (md && state) {
      const st = state.settings, m = md.dataset.mod;
      emit('settings', m === 'classic' ? { hard: false, chaos: false } : { [m]: !st[m] });
    }
  });
  $('#set-rounds').onchange = (e) => emit('settings', { rounds: e.target.value });
  $('#set-time').onchange = (e) => emit('settings', { roundTime: e.target.value });
  $('#set-guesses').onchange = (e) => emit('settings', { maxGuesses: e.target.value });
  $('#set-maxlen').onchange = (e) => emit('settings', { maxLen: e.target.value });
  $('#set-listen').onchange = (e) => emit('settings', { listenLen: e.target.value });
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
    node.connect(gain).connect(ensureAnalyser());
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
    if (mode === 'round') startViz();
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

  // How long the song plays after you've guessed (host setting: 15, 20 or 30 s).
  const listenLen = () => (state && ((state.round && state.round.listenLen) || (state.reveal && state.reveal.listenLen) || (state.game && state.game.listenLen))) || 15;
  function toggleListen() {
    if (playing && playing.mode === 'listen') return stopAudio();
    startClip(clip.url, listenLen(), 'listen');
  }

  // ---------- sound-wave ring around the play button ----------
  // Bars around the button follow the actual audio (Web Audio analyser).
  let analyser = null, freq = null, master = null;
  function ensureMaster() {
    if (!master) {
      master = ctx.createGain();
      master.gain.value = volumeGain();
      master.connect(ctx.destination);
    }
    return master;
  }
  function ensureAnalyser() {
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      analyser.connect(ensureMaster());
      freq = new Uint8Array(analyser.frequencyBinCount);
    }
    return analyser;
  }
  const viz = $('#viz');
  const vctx = viz.getContext('2d');
  const BARS_N = 60;
  const levels = new Float32Array(BARS_N);
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let vizRaf = 0, vizColors = null;
  function startViz() {
    if (reduceMotion) return;
    const cs = getComputedStyle(document.documentElement);
    vizColors = [cs.getPropertyValue('--accent').trim() || '#FF4F9A', cs.getPropertyValue('--pop').trim() || '#FFD43B'];
    if (!vizRaf) vizRaf = requestAnimationFrame(drawViz);
  }
  function drawViz() {
    vizRaf = 0;
    const active = !!(playing && playing.mode === 'round' && analyser);
    if (active) analyser.getByteFrequencyData(freq);
    const half = BARS_N / 2;
    let any = false;
    for (let i = 0; i < BARS_N; i++) {
      const j = i < half ? i : BARS_N - 1 - i;            // mirror left/right
      const bin = Math.floor(2 + (j / half) ** 1.3 * (freq ? freq.length * 0.62 : 1));
      const target = active ? Math.pow(freq[bin] / 255, 1.4) : 0;
      levels[i] = target > levels[i] ? target : levels[i] * 0.86;
      if (levels[i] > 0.015) any = true;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 300 * dpr;
    if (viz.width !== size) { viz.width = size; viz.height = size; }
    vctx.clearRect(0, 0, size, size);
    vctx.save();
    vctx.translate(size / 2, size / 2);
    vctx.scale(dpr, dpr);
    vctx.lineCap = 'round';
    vctx.lineWidth = 4.5;
    const R0 = 72, MAX = 38;
    for (let i = 0; i < BARS_N; i++) {
      const a = -Math.PI / 2 + (i / BARS_N) * Math.PI * 2;
      const len = 3 + levels[i] * MAX;
      vctx.strokeStyle = vizColors[i % 2];
      vctx.globalAlpha = 0.55 + levels[i] * 0.45;
      vctx.beginPath();
      vctx.moveTo(Math.cos(a) * R0, Math.sin(a) * R0);
      vctx.lineTo(Math.cos(a) * (R0 + len), Math.sin(a) * (R0 + len));
      vctx.stroke();
    }
    vctx.restore();
    viz.classList.toggle('on', active || any);
    if (active || any) vizRaf = requestAnimationFrame(drawViz);
  }

  function setPlayingUI(on, progress) {
    const mode = on && playing ? playing.mode : null;
    const roundOn = mode === 'round';
    $('.icon-play').toggleAttribute('hidden', roundOn); // SVGs need the attribute, not .hidden
    $('.icon-stop').toggleAttribute('hidden', !roundOn);
    $('.ring circle').style.strokeDashoffset = String(289 * (1 - (roundOn ? progress : 0)));
    const listenOn = mode === 'listen';
    document.querySelectorAll('[data-listen]').forEach((btn) => {
      btn.textContent = listenOn ? 'Stop' : `Play ${listenLen()} seconds`;
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
  const setLen = (l) => { selectedLen = Math.round(Math.max(MIN_LEN, Math.min(maxLen, l)) * 10) / 10; scrubber.value = sliderFromLen(selectedLen); };

  function buildTicks() {
    const marks = [0.1, 0.5, 1, 3, 10, 30].filter((m) => m < maxLen).concat(maxLen); // Songless's labels
    $('#ticks').innerHTML = [...new Set(marks)].map((m) => `<span style="left:${(sliderFromLen(m) / 10).toFixed(2)}%">${m}s</span>`).join('');
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
    if (myHeard >= maxLen) return;
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
      if ((r.maxLen || MAX_LEN) !== maxLen) { maxLen = r.maxLen || MAX_LEN; buildTicks(); }
      myHeard = r.my.maxHeard || 0;
      setLen(myHeard || MIN_LEN);
      $('#done-card').dataset.status = '';
      $('#guess-input').value = '';
      hideSuggestions();
      buildWave(key);
      celebrated = false;
      loadClip(r.clipUrl).catch(() => {});
    }
    $('#round-label').textContent = `${r.ranked ? 'Ranked · ' : ''}Song ${r.num} of ${r.total}`;
    const tws = [];
    if (r.hard) tws.push({ name: 'Hard', blurb: 'Starts mid-song. Type the title yourself.' });
    if (r.twist) tws.push(TWISTS[r.twist]);
    $('#twist').hidden = !tws.length;
    if (tws.length) {
      $('#twist b').textContent = tws.map((t) => t.name).join(' + ') + (r.mult > 1 ? ` · ${r.mult}×` : '');
      $('#twist span').textContent = tws.map((t) => t.blurb).join(' ');
    }
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
        correct: `<div class="verdict">Got it${my.bonus ? ', and first!' : ''}</div><div class="big-pts">+${fmt(my.points)}</div>${my.bonus ? `<div class="bonus-note">includes +${fmt(my.bonus)} for being first</div>` : ''}`,
        out: `<div class="verdict">Out of guesses</div>`,
        'gave-up': `<div class="verdict">Skipped</div>`,
        timeout: `<div class="verdict">${r.endsAt ? 'Time\'s up' : 'Song over'}</div>`,
      }[my.status] || '';
      if (my.status === 'correct' && !celebrated) { celebrated = true; confetti(); }
      if ($('#done-card').dataset.status !== my.status) {
        $('#done-card').dataset.status = my.status;
        $('#done-card').innerHTML = msg +
          `<button class="btn listen" data-listen>Play ${listenLen()} seconds</button><div class="listen-bar"><span></span></div>` +
          '<p>Here\'s the song while everyone else finishes.</p>';
        // Hear the song right after your guess. Your own device only.
        toggleListen();
      }
    }

    const amHost = state.hostId === state.meId;
    $('#round-players').innerHTML = state.players.filter((p) => p.connected).map((p) => {
      const icon = { correct: '✓ ', out: '', 'gave-up': '', timeout: '' }[p.roundStatus] ?? '';
      const inner = `${icon}${esc(p.name)}${p.id === state.hostId ? ' <small>host</small>' : ''}`;
      return `<li class="${p.roundStatus || ''}">${amHost && p.id !== state.meId ? `<button data-player-menu="${esc(p.id)}">${inner}</button>` : inner}</li>`;
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
    const modeBits = [v.hard && 'Hard', twistName && `Chaos twist: ${twistName}`].filter(Boolean);
    $('#reveal-mode').textContent = modeBits.length ? `${modeBits.join(', ')}, ${v.mult}× points` : '';
    $('#reveal-plays').hidden = !v.plays;
    if (v.plays) {
      $('#reveal-plays').innerHTML = `<b>${fmtPlays(v.plays)}</b> plays on Spotify`;
      $('#reveal-plays').title = `${fmt(v.plays)} plays`;
    }
    const label = { correct: '', out: 'Missed it', 'gave-up': 'Skipped', timeout: 'Ran out of time' };
    const totals = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    $('#reveal-results').innerHTML = v.results.map((r) => {
      const how = r.status === 'correct'
        ? `Heard ${fmtLen(Math.max(0.1, r.heard))}${r.guesses > 1 ? `, ${r.guesses - 1} wrong` : ''}${r.bonus ? ', first to get it' : ''}`
        : label[r.status] || '';
      return `<li>
        <div><div class="r-name">${esc(r.name)}</div><div class="r-sub">${how}. Total ${fmt(totals[r.id])}</div></div>
        <span class="r-pts ${r.points ? '' : 'zero'}">${r.bonus ? '<i class="first-tag">1st</i>' : ''}+${fmt(r.points)}</span>
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
    renderRankedResult();
  }
  $('#btn-again').onclick = () => { unlockAudio(); emit('start').then((r) => !r.ok && toast(r.error, 'error')); };
  $('#btn-lobby').onclick = () => emit('lobby');

  // ---------- sheets (settings, log in, leaderboards, stats, players) ----------
  const SHEETS = ['settings', 'auth', 'boards', 'profile', 'players'];
  const sheetStack = [];
  function openSheet(id) {
    const el = $('#' + id);
    el.hidden = false;
    const i = sheetStack.indexOf(id);
    if (i >= 0) sheetStack.splice(i, 1);
    sheetStack.push(id);
    el.style.zIndex = String(70 + sheetStack.length);
  }
  function closeSheet(id) {
    $('#' + id).hidden = true;
    const i = sheetStack.indexOf(id);
    if (i >= 0) sheetStack.splice(i, 1);
  }
  for (const id of SHEETS) {
    $('#' + id).addEventListener('click', (e) => {
      if (e.target.id === id || e.target.closest('[data-close]')) closeSheet(id);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetStack.length) closeSheet(sheetStack[sheetStack.length - 1]);
  });

  // ---------- volume ----------
  let volume = 80, muted = false;
  try {
    const v = Number(localStorage.getItem('sliver.volume'));
    if (localStorage.getItem('sliver.volume') !== null && v >= 0 && v <= 100) volume = v;
    muted = localStorage.getItem('sliver.muted') === '1';
  } catch {}
  function volumeGain() { return muted ? 0 : Math.pow(volume / 100, 2); } // feels even across the slider
  function applyVolume() {
    if (master && ctx) master.gain.setTargetAtTime(volumeGain(), ctx.currentTime, 0.02);
    $('#volume').value = volume;
    $('#volume').style.setProperty('--fill', `${muted ? 0 : volume}%`);
    $('#volume-value').textContent = muted ? 'Muted' : `${volume}%`;
    const b = $('#btn-mute');
    b.innerHTML = muted || volume === 0
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path d="m16 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>'
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7${volume > 50 ? 'M18.5 6a8.5 8.5 0 0 1 0 12' : ''}" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;
    b.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    b.title = muted ? 'Unmute' : 'Mute';
    try { localStorage.setItem('sliver.volume', String(volume)); localStorage.setItem('sliver.muted', muted ? '1' : '0'); } catch {}
  }
  $('#volume').addEventListener('input', (e) => { volume = Number(e.target.value); muted = false; applyVolume(); });
  $('#btn-mute').onclick = () => { muted = !muted; if (!muted && volume === 0) volume = 50; applyVolume(); };
  $('#btn-test-sound').onclick = () => {
    unlockAudio();
    const out = ensureMaster();
    const t0 = ctx.currentTime + 0.02;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + i * 0.16);
      g.gain.linearRampToValueAtTime(0.25, t0 + i * 0.16 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.16 + 0.35);
      o.connect(g).connect(out);
      o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.4);
    });
  };
  applyVolume();

  // ---------- accounts ----------
  let auth = (() => { try { return JSON.parse(localStorage.getItem('sliver.auth')) || null; } catch { return null; } })();
  function authToken() { return auth && auth.token ? auth.token : null; }
  function saveAuth(a) {
    auth = a;
    try { a ? localStorage.setItem('sliver.auth', JSON.stringify(a)) : localStorage.removeItem('sliver.auth'); } catch {}
    renderAccount();
  }
  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (authToken()) headers.Authorization = `Bearer ${authToken()}`;
    if (body) headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return await r.json().catch(() => ({ ok: false, error: `Server error (${r.status})` }));
    } catch { return { ok: false, error: 'Can\'t reach the server. Check your connection.' }; }
  }
  async function refreshMe() {
    if (!authToken()) return renderAccount();
    const res = await api('/api/me');
    if (res.ok && res.user) saveAuth({ token: auth.token, user: res.user });
    else if (res.ok) { saveAuth(null); toast('You were logged out. Log in again for ranked.', 'info'); }
    else renderAccount();
  }
  function tellServerAboutLogin() { if (socket.connected) emit('auth', { token: authToken() }); }

  function renderAccount() {
    const u = auth && auth.user;
    const box = $('#account-box');
    if (u) {
      box.innerHTML = `<div class="acct-row">
          <span class="acct-av">${esc(u.name[0].toUpperCase())}</span>
          <div class="acct-main"><div class="acct-name">${esc(u.name)} <span class="tag-no">#${esc(u.tag)}</span></div>
          <div class="acct-sub">Rating <b>${fmt(u.rating)}</b> · ${fmt(u.games)} ranked game${u.games === 1 ? '' : 's'}</div></div>
        </div>
        <div class="acct-actions">
          <button class="btn small" data-open-profile="${esc(u.id)}">My stats</button>
          <button class="btn small" data-open-boards>Leaderboards</button>
          <button class="btn ghost small" data-logout>Log out</button>
        </div>`;
    } else {
      box.innerHTML = `<div class="acct-pitch"><b>Ranked play</b><span>Log in to put your scores on the leaderboards.</span></div>
        <div class="acct-actions">
          <button class="btn small primary-ish" data-open-auth="signup">Sign up</button>
          <button class="btn small" data-open-auth="login">Log in</button>
          <button class="btn ghost small" data-open-boards>Leaderboards</button>
        </div>`;
    }
    $('#settings-account').innerHTML = u
      ? `<p class="hint">Logged in as <b>${esc(u.name)}</b> #${esc(u.tag)} (${esc(u.email || '')})</p>
         <div class="acct-actions"><button class="btn small" data-open-profile="${esc(u.id)}">My stats</button><button class="btn ghost small" data-logout>Log out</button></div>`
      : `<p class="hint">Only needed for ranked games and leaderboards.</p>
         <div class="acct-actions"><button class="btn small" data-open-auth="signup">Sign up</button><button class="btn small" data-open-auth="login">Log in</button></div>`;
    if (u && !$('#name').value.trim()) $('#name').value = u.name;
    if (state && state.phase === 'lobby') renderLobby();
  }

  let authMode = 'login';
  function openAuth(mode = 'login') {
    authMode = mode;
    const signup = mode === 'signup';
    $('#auth-title').textContent = signup ? 'Sign up' : 'Log in';
    $('#auth-tab-login').classList.toggle('on', !signup);
    $('#auth-tab-signup').classList.toggle('on', signup);
    $('#auth-name-field').hidden = !signup;
    $('#auth-submit').textContent = signup ? 'Create account' : 'Log in';
    $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auth-error').hidden = true;
    if (signup && !$('#auth-name').value) $('#auth-name').value = $('#name').value.trim();
    openSheet('auth');
    (signup ? $('#auth-name') : $('#auth-email')).focus();
  }
  $('#auth-tab-login').onclick = () => openAuth('login');
  $('#auth-tab-signup').onclick = () => openAuth('signup');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#auth-submit');
    const body = { email: $('#auth-email').value, password: $('#auth-password').value };
    if (authMode === 'signup') body.name = $('#auth-name').value;
    btn.disabled = true;
    const res = await api(authMode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', body });
    btn.disabled = false;
    if (!res.ok) { $('#auth-error').textContent = res.error; $('#auth-error').hidden = false; return; }
    $('#auth-password').value = '';
    saveAuth({ token: res.token, user: res.user });
    tellServerAboutLogin();
    closeSheet('auth');
    toast(authMode === 'signup' ? `Welcome to Sliver, ${res.user.name}!` : `Welcome back, ${res.user.name}`, 'good');
  };
  async function logout() {
    await api('/api/logout', { method: 'POST' });
    saveAuth(null);
    tellServerAboutLogin();
    toast('Logged out', 'info');
  }
  $('#guest-login').onclick = () => openAuth('login');

  // ---------- leaderboards ----------
  let boardList = null;
  async function openBoards(board) {
    openSheet('boards');
    loadBoard(board || $('#board-select').value || 'overall');
  }
  async function loadBoard(board) {
    $('#board-list').innerHTML = '<li class="lb-empty">Loading…</li>';
    $('#board-me').hidden = true;
    const res = await api(`/api/leaderboard?board=${encodeURIComponent(board)}`);
    if (!res.ok) { $('#board-list').innerHTML = `<li class="lb-empty">${esc(res.error)}</li>`; return; }
    if (!boardList) {
      boardList = res.boards;
      const sel = $('#board-select');
      const cats = [];
      for (const b of boardList) { let c = cats.find((x) => x.name === b.cat); if (!c) cats.push(c = { name: b.cat, items: [] }); c.items.push(b); }
      sel.innerHTML = cats.map((c) => `<optgroup label="${esc(c.name)}">${c.items.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</optgroup>`).join('');
    }
    $('#board-select').value = res.board.id;
    const overall = res.board.id === 'overall';
    $('#board-note').textContent = overall
      ? 'Rating adds up your best game on every genre (each one after your best counts a little less), like osu! pp.'
      : `Top 25 best 5-song ranked games on ${res.board.name}. ${fmt(res.total)} player${res.total === 1 ? '' : 's'} so far.`;
    const meId = auth && auth.user && auth.user.id;
    $('#board-list').innerHTML = res.entries.length ? res.entries.map((e) => `
      <li class="${e.id === meId ? 'me' : ''}${e.rank <= 3 ? ' top' + e.rank : ''}">
        <span class="lb-rank">${e.rank}</span>
        <button class="lb-name" data-open-profile="${esc(e.id)}">${esc(e.name)} <span class="tag-no">#${esc(e.tag)}</span></button>
        <span class="lb-val">${overall ? `${fmt(e.value)}<small> rating</small>` : `${fmt(e.value)}<small> · ${fmt(e.pp)} pp</small>`}</span>
      </li>`).join('') : '<li class="lb-empty">No ranked games here yet. Be the first!</li>';
    if (res.me && res.me.rank > 25) {
      $('#board-me').hidden = false;
      $('#board-me').innerHTML = `You: <b>#${fmt(res.me.rank)}</b> with ${fmt(res.me.value)}${overall ? ' rating' : ''}`;
    }
  }
  $('#board-select').onchange = (e) => loadBoard(e.target.value);
  $('#btn-boards').onclick = () => openBoards();

  // ---------- player stats ----------
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString();
  }
  async function openProfile(id) {
    openSheet('profile');
    $('#profile-name').textContent = 'Stats';
    $('#profile-body').innerHTML = '<p class="hint">Loading…</p>';
    const res = await api(`/api/profile/${encodeURIComponent(id)}`);
    if (!res.ok) { $('#profile-body').innerHTML = `<p class="hint">${esc(res.error)}</p>`; return; }
    const p = res.profile, st = p.stats;
    $('#profile-name').innerHTML = `${esc(p.name)} <span class="tag-no">#${esc(p.tag)}</span>`;
    const mods = (r) => [r.hard && 'Hard', r.chaos && 'Chaos'].filter(Boolean).join(' + ');
    $('#profile-body').innerHTML = `
      <div class="pf-head">
        <div><div class="label">Rating</div><div class="pf-rating">${fmt(p.rating)}</div></div>
        <div><div class="label">Overall rank</div><div class="pf-rank">${p.globalRank ? `#${fmt(p.globalRank)}` : 'Unranked'}<small>${p.globalRank ? ` of ${fmt(p.players)}` : ''}</small></div></div>
      </div>
      <div class="tiles">
        <div class="tile"><b>${fmt(st.games)}</b><span>Ranked games</span></div>
        <div class="tile"><b>${pct(st.accuracy)}</b><span>Songs guessed</span></div>
        <div class="tile"><b>${pct(st.firstTry)}</b><span>Right first try</span></div>
        <div class="tile"><b>${st.correct ? fmtLen(Math.max(0.1, st.avgHeard)) : 'n/a'}</b><span>Avg. heard</span></div>
        <div class="tile"><b>${fmt(st.avgScore)}</b><span>Avg. game</span></div>
        <div class="tile"><b>${fmt(st.best)}</b><span>Best game${st.bestPack ? ` (${esc(st.bestPack)})` : ''}</span></div>
      </div>
      <h3>Best per genre</h3>
      ${p.genres.length ? `<ul class="pf-list">${p.genres.map((g) => `
        <li><button class="pf-genre" data-open-boards="${esc(g.packId)}">${esc(g.name)}</button>
        <span class="pf-score">${fmt(g.best)}<small> · ${fmt(g.pp)} pp</small></span>
        <span class="pf-pos">${g.rank ? `#${fmt(g.rank)}<small> of ${fmt(g.of)}</small>` : ''}</span></li>`).join('')}</ul>`
        : '<p class="hint">No ranked games yet.</p>'}
      ${p.recent.length ? `<h3>Recent games</h3><ul class="pf-list recent">${p.recent.map((r) => `
        <li><span class="pf-genre-txt">${esc(r.packName)}${mods(r) ? ` <i class="mods">${esc(mods(r))}</i>` : ''}<small>${ago(r.at)} · ${r.correct}/${r.songs} songs</small></span>
        <span class="pf-score">${fmt(r.score)}<small> · ${fmt(r.pp)} pp</small></span></li>`).join('')}</ul>` : ''}`;
  }

  // Buttons that open sheets can be anywhere (home, settings, results, leaderboards).
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-open-auth]');
    if (a) return openAuth(a.dataset.openAuth);
    const b = e.target.closest('[data-open-boards]');
    if (b) return openBoards(b.dataset.openBoards || undefined);
    const pf = e.target.closest('[data-open-profile]');
    if (pf) return openProfile(pf.dataset.openProfile);
    if (e.target.closest('[data-logout]')) return logout();
  });

  // ---------- ranked: lobby controls and results ----------
  $('#seg-casual').onclick = () => state && state.settings.ranked && emit('settings', { ranked: false });
  $('#seg-ranked').onclick = () => state && !state.settings.ranked && emit('settings', { ranked: true });
  document.addEventListener('click', async (e) => {
    const rp = e.target.closest('[data-rpack]');
    if (!rp || !state) return;
    const res = await emit('rankedPack', { packId: rp.dataset.rpack });
    if (!res.ok) toast(res.error, 'error', 5000);
  });
  let lastRanked = null;
  socket.on('rankedResult', (r) => {
    lastRanked = r;
    if (auth && auth.user) { auth.user.rating = r.rating; auth.user.games = (auth.user.games || 0) + 1; saveAuth(auth); }
    if (state && state.phase === 'results') renderRankedResult();
  });
  function renderRankedResult() {
    const box = $('#ranked-result');
    const lg = state.lastGame;
    if (!lg || !lg.ranked) { box.hidden = true; return; }
    box.hidden = false;
    const r = lastRanked && lastRanked.packId === lg.packId ? lastRanked : null;
    const me = state.players.find((p) => p.id === state.meId);
    if (!r) {
      box.innerHTML = me && me.loggedIn ? '<p class="hint">Saving your ranked score…</p>' : '<p class="hint">This was a ranked game. Log in next time to get on the leaderboard.</p>';
      return;
    }
    const delta = r.rating - r.ratingBefore;
    box.innerHTML = `
      <div class="label">Ranked · ${esc(r.packName)}</div>
      <div class="rr-score">${fmt(r.score)} <small>${fmt(r.pp)} pp</small></div>
      <p class="rr-line">${r.improved
        ? `${r.prevBest ? 'New personal best' : 'First game on this genre'}! <b>#${fmt(r.packRank)}</b> of ${fmt(r.packPlayers)} on ${esc(r.packName)}.`
        : !r.prevBest ? `No points this time, so you're not on the ${esc(r.packName)} board yet.`
        : `Your best on ${esc(r.packName)} is still ${fmt(r.prevBest)}${r.packRank ? ` (#${fmt(r.packRank)})` : ''}.`}</p>
      <p class="rr-line">Rating <b>${fmt(r.rating)}</b>${delta > 0 ? ` <span class="up">+${fmt(delta)}</span>` : ''}${r.globalRank && r.rating ? ` · #${fmt(r.globalRank)} overall` : ''}</p>
      <div class="acct-actions"><button class="btn small" data-open-boards="${esc(r.packId)}">${esc(r.packName)} top 25</button>
      <button class="btn small" data-open-profile="${esc(auth && auth.user ? auth.user.id : '')}">My stats</button></div>`;
  }

  // ---------- players sheet: host can hand over host or remove people any time ----------
  let plArmed = null, plTimer = null;
  function renderPlayersSheet() {
    if (!state) return;
    const isHost = state.hostId === state.meId;
    $('#players-list').innerHTML = state.players.map((p) => {
      const mine = p.id === state.meId;
      const arm = (act) => plArmed === `${act}:${p.id}`;
      return `<li class="${p.connected ? '' : 'offline'}">
        <span class="acct-av">${esc((p.name || '?')[0].toUpperCase())}</span>
        <div class="pl-main"><b>${esc(p.name)}${mine ? ' (you)' : ''}</b>
          <small>${p.id === state.hostId ? 'Host · ' : ''}${fmt(p.score)} points${p.connected ? '' : ' · offline'}${p.loggedIn ? ' · logged in' : ''}</small></div>
        ${isHost && !mine ? `<div class="pl-actions">
          ${p.connected ? `<button class="btn small${arm('host') ? ' armed' : ''}" data-pl-host="${esc(p.id)}">${arm('host') ? 'Tap to confirm' : 'Make host'}</button>` : ''}
          <button class="btn small danger${arm('kick') ? ' armed' : ''}" data-pl-kick="${esc(p.id)}">${arm('kick') ? 'Tap to remove' : 'Remove'}</button>
        </div>` : ''}
      </li>`;
    }).join('');
    $('#players-hint').textContent = isHost ? 'Tap twice to confirm. Works during a game too.' : 'Only the host can change the host or remove players.';
  }
  function openPlayers() { plArmed = null; renderPlayersSheet(); openSheet('players'); }
  $('#btn-players').onclick = openPlayers;
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-player-menu]')) return openPlayers();
    const h = e.target.closest('[data-pl-host]'), k = e.target.closest('[data-pl-kick]');
    if (!h && !k) return;
    const id = (h || k).dataset[h ? 'plHost' : 'plKick'];
    const key = `${h ? 'host' : 'kick'}:${id}`;
    clearTimeout(plTimer);
    if (plArmed !== key) {
      plArmed = key;
      plTimer = setTimeout(() => { plArmed = null; renderPlayersSheet(); }, 3000);
      return renderPlayersSheet();
    }
    plArmed = null;
    const res = await emit(h ? 'transferHost' : 'kick', { playerId: id });
    if (!res.ok) toast(res.error, 'error');
    else if (h) closeSheet('players');
    renderPlayersSheet();
  });

  // ---------- artist suggestions while typing in the add box ----------
  let artistList = [], artistActive = -1, artistTimer = null, artistReq = 0;
  const looksLikeLink = (v) => /^(https?:\/\/|spotify:|www\.|open\.|deezer|link\.|\d+$)/i.test(v) || /^demo$/i.test(v);
  function hideArtistSug() { $('#artist-sug').hidden = true; artistList = []; artistActive = -1; }
  function renderArtistSug() {
    const ul = $('#artist-sug');
    if (!artistList.length) return hideArtistSug();
    ul.hidden = false;
    ul.innerHTML = '<li class="group">Artists</li>' + artistList.map((a, i) => `
      <li data-artist="${i}" class="artist${i === artistActive ? ' active' : ''}">
        ${a.picture ? `<img src="${esc(a.picture)}" alt="" loading="lazy" />` : `<span class="a-ph">${esc(a.name[0])}</span>`}
        <div><div>${esc(a.name)}</div><div class="s-artist">${a.fans ? `${fmtPlays(a.fans)} fans · ` : ''}add their top songs</div></div>
      </li>`).join('');
  }
  function pickArtist(a) { $('#playlist-input').value = a.name; addInput(a.name, a.id); }
  $('#playlist-input').addEventListener('input', () => {
    const v = $('#playlist-input').value.trim();
    clearTimeout(artistTimer);
    if (v.length < 2 || looksLikeLink(v)) { artistReq++; return hideArtistSug(); }
    artistTimer = setTimeout(async () => {
      const mine = ++artistReq;
      const res = await api(`/api/artists?q=${encodeURIComponent(v)}`);
      if (mine !== artistReq || $('#playlist-input').value.trim() !== v) return;
      artistList = res.ok ? res.artists.slice(0, 6) : [];
      artistActive = -1;
      renderArtistSug();
    }, 220);
  });
  $('#playlist-input').addEventListener('keydown', (e) => {
    if ($('#artist-sug').hidden || !artistList.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); artistActive = (artistActive + 1) % artistList.length; renderArtistSug(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); artistActive = (artistActive - 1 + artistList.length) % artistList.length; renderArtistSug(); }
    else if (e.key === 'Escape') hideArtistSug();
  });
  $('#artist-sug').addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-artist]');
    if (li) { e.preventDefault(); pickArtist(artistList[Number(li.dataset.artist)]); }
  });
  $('#playlist-input').addEventListener('blur', () => setTimeout(hideArtistSug, 150));

  renderAccount();
  refreshMe();

  // Keyboard: space plays the clip during a round (when not typing).
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state && state.phase === 'round' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); playClip();
    }
  });
})();
