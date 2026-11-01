/* Animated backgrounds for the premium themes (see shop.js / themes.js).
 * One canvas behind the page, redrawn every frame by the theme's scene. Everything is drawn
 * here from scratch (no images). Pauses when the tab is hidden; with "reduce motion" turned on
 * it draws one still frame. */
(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  // Two layers: the scenery canvas behind everything, and a see-through "front" canvas for the
  // things you play with. The front one sits above the Sliver logo but under the cards, so
  // creatures and figures pass in front of the logo and never cover the game.
  let canvas = null, front = null, bctx = null, fctx = null, ctx = null, W = 0, H = 0, DPR = 1, scene = null, raf = 0, last = 0, t0 = 0, current = null;
  const toFront = () => { ctx = fctx; };
  const toBack = () => { ctx = bctx; };

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    front = document.createElement('canvas');
    front.id = 'fx-front';
    front.setAttribute('aria-hidden', 'true');
    (document.getElementById('app') || document.body).prepend(front);
    bctx = ctx = canvas.getContext('2d');
    fctx = front.getContext('2d');
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else if (scene) startLoop(); });
    resize(true);
  }
  function resize(force) {
    if (!canvas) return;
    const w = window.innerWidth, h = window.innerHeight;
    // Phones change the window height all the time (the address bar slides in and out while you
    // scroll). Rebuilding the scene on every one of those made everything jump around, so a
    // height-only change just grows the canvas (never shrinks it) and keeps the scene as is.
    const widthChanged = force === true || w !== W;
    if (!widthChanged && h <= H) return;
    DPR = light ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    W = w; H = widthChanged ? h : Math.max(H, h);
    for (const [c, x] of [[canvas, bctx], [front, fctx]]) {
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    if (widthChanged && scene && scene.resize) scene.resize();
    if (scene && reduce) frame(performance.now());
  }
  // The middle column is where the game is. Anything you play with stays in the side lanes
  // (on wide screens; phones have no room beside the cards, so there it's the whole width).
  const MID = 300;
  const lanes = () => { const g = W / 2 - MID; return g >= 110 ? g : 0; };
  const inMid = (x) => { const g = lanes(); return !!g && x > g && x < W - g; };
  const laneOf = (x, m = 20) => { const g = lanes(); if (!g) return [m, W - m]; return x < W / 2 ? [m, g - m] : [W - g + m, W - m]; };
  const sideX = (m = 30) => { const g = lanes(); if (!g) return rand(m, W - m); return Math.random() < 0.5 ? rand(m, g - m) : rand(W - g + m, W - m); };
  const density = () => Math.max(0.45, Math.min(1.6, (W * H) / (1366 * 768)));

  // Phones and small screens: 30 fps and 1x resolution, so the background never slows the game down.
  const light = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.hardwareConcurrency || 8) <= 4;
  function frame(now) {
    raf = 0;
    if (!scene) return;
    if (light && last && now - last < 31) { if (!reduce && !document.hidden) raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    try {
      fctx.clearRect(0, 0, W, H);
      toBack();
      scene.draw(dt, (now - t0) / 1000);
      toFront();
      drawParts(dt);
    } catch (err) {
      // A drawing error must never leave a canvas tilted or stuck: wipe the drawing state.
      if (!frame.warned) { frame.warned = true; console.warn('fx:', err); }
      for (const [c, x] of [[canvas, bctx], [front, fctx]]) { if (x.reset) x.reset(); else c.width = c.width; x.setTransform(DPR, 0, 0, DPR, 0, 0); }
      parts = [];
    }
    toBack();
    if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf && scene) { last = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function grad(y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function glowDot(x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  }
  function sparkle(x, y, s, color, a) {
    ctx.globalAlpha = a; ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- scenes
  // ---------- shared tap effects ----------
  // One small particle pool for every theme's tap effects, capped so tapping like mad can't lag.
  let parts = [];
  const MAX_PARTS = 260;
  function emit(p) {
    if (parts.length >= MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS + 1);
    parts.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 0, life: 1, decay: 1, s: 4, rot: 0, vr: 0, c: '#fff', kind: 'dot', add: false }, p));
  }
  function burst(x, y, n, make) { for (let i = 0; i < n; i++) emit(make(i, (i / n) * TAU)); }
  function drawParts(dt) {
    if (!parts.length) return;
    for (const p of parts) {
      p.life -= dt * p.decay;
      if (p.life <= 0) continue;
      p.vy += p.g * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy = -Math.abs(p.vy) * 0.45; p.vx *= 0.7; }
      const a = Math.min(1, p.life * 1.8);
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
      switch (p.kind) {
        case 'ring': p.s += p.vr * dt; ctx.lineWidth = p.w || 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.stroke(); break;
        case 'heart': heartPath(p.x, p.y, p.s); ctx.fill(); break;
        case 'star': sparkle(p.x, p.y, p.s, p.c, a); break;
        case 'streak': ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break;
        case 'bubble': ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.rot) * 4, p.y, p.s, 0, TAU); ctx.stroke(); break;
        case 'coin': {
          const w = Math.max(0.15, Math.abs(Math.cos(p.rot)));
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s * w, p.s, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#8C6A1C'; ctx.lineWidth = 1.2; ctx.stroke();
          if (w > 0.5) { ctx.fillStyle = '#FFF3C4'; ctx.beginPath(); ctx.ellipse(p.x - p.s * 0.25 * w, p.y - p.s * 0.3, p.s * 0.18 * w, p.s * 0.25, 0, 0, TAU); ctx.fill(); }
          break;
        }
        case 'petal': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.max(0.2, Math.abs(Math.cos(p.rot * 2))), 1);
          ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.bezierCurveTo(p.s * 0.9, -p.s * 0.6, p.s * 0.8, p.s * 0.6, 0, p.s);
          ctx.bezierCurveTo(-p.s * 0.8, p.s * 0.6, -p.s * 0.9, -p.s * 0.6, 0, -p.s); ctx.fill(); ctx.restore(); break;
        }
        case 'glow': ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 2.4, 0, TAU); ctx.fill(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    parts = parts.filter((p) => p.life > 0);
  }
  const ring = (x, y, c, opts = {}) => emit({ kind: 'ring', x, y, s: opts.s || 6, vr: opts.grow || 260, decay: opts.decay || 2.2, c, w: opts.w || 2.5, add: !!opts.add });

  const SCENES = {
    // Cherry blossoms: soft bokeh, a branch in the corner, petals fluttering down.
    sakura() {
      let petals = [], bokeh = [];
      const reset = () => {
        petals = Array.from({ length: Math.round(55 * density()) }, () => newPetal(true));
        bokeh = Array.from({ length: Math.round(16 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(30, 110), a: rand(0.05, 0.16), v: rand(4, 12), p: rand(0, TAU) }));
      };
      const newPetal = (anywhere) => ({
        x: rand(-50, W + 50), y: anywhere ? rand(-H, H) : rand(-80, -20), s: rand(7, 15), vy: rand(28, 60), sway: rand(20, 60),
        p: rand(0, TAU), spin: rand(-2, 2), flip: rand(1.5, 3.5), rot: rand(0, TAU), col: pick(['#FFE4EC', '#FFC7D9', '#FFB3CB', '#FFFFFF', '#FF9EBB']),
      });
      function petal(q, t) {
        const fx = Math.cos(t * q.flip + q.p); // flutter: the petal turns over as it falls
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(Math.max(0.15, Math.abs(fx)), 1);
        ctx.fillStyle = q.col; ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(0, -q.s);
        ctx.bezierCurveTo(q.s * 0.9, -q.s * 0.6, q.s * 0.8, q.s * 0.6, 0, q.s);
        ctx.bezierCurveTo(-q.s * 0.8, q.s * 0.6, -q.s * 0.9, -q.s * 0.6, 0, -q.s);
        ctx.fill();
        ctx.fillStyle = 'rgba(214,84,126,.35)'; // notch shading
        ctx.beginPath(); ctx.moveTo(0, -q.s); ctx.lineTo(q.s * 0.18, -q.s * 0.6); ctx.lineTo(-q.s * 0.18, -q.s * 0.6); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
      function branch() {
        ctx.save(); ctx.strokeStyle = 'rgba(74,32,44,.55)'; ctx.lineCap = 'round';
        ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(W + 10, 40); ctx.quadraticCurveTo(W - 140, 70, W - 260, 30); ctx.stroke();
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(W - 120, 55); ctx.quadraticCurveTo(W - 170, 110, W - 230, 120); ctx.stroke();
        for (const [bx, by] of [[W - 250, 34], [W - 200, 50], [W - 150, 60], [W - 230, 118], [W - 185, 98], [W - 100, 52], [W - 60, 40]]) {
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            ctx.fillStyle = k % 2 ? '#FFC7D9' : '#FFE4EC';
            ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * 7, by + Math.sin(a) * 7, 7, 4.5, a, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = '#E86A92'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // Swipe to draw: the swipe becomes a branch (thick where you started, thin at the end) that
      // sprouts twigs and blossoms as you go, drops a few petals, and fades after a while.
      let trees = [], drawing = null, now = 0;
      const BRANCH = '#5A2E3A';
      function addBlossom(tr, x, y, big) { tr.flowers.push({ x, y, r: big ? rand(7, 10) : rand(5, 8), at: now, rot: rand(0, TAU), col: pick(['#FFE4EC', '#FFC7D9', '#FFB3CB', '#FFFFFF']) }); }
      function addTwig(tr, x, y, ang) {
        const a = ang + (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.1), len = rand(18, 42);
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        tr.twigs.push({ x, y, ex, ey, w: rand(1.5, 3), at: now });
        addBlossom(tr, ex, ey, true);
        if (Math.random() < 0.6) addBlossom(tr, (x + ex) / 2 + rand(-4, 4), (y + ey) / 2 + rand(-4, 4), false);
      }
      function blossom(f, k) {
        const r = f.r * k;
        if (r < 0.5) return;
        for (let i = 0; i < 5; i++) {
          const a = f.rot + (i / 5) * TAU;
          ctx.fillStyle = i % 2 ? f.col : '#FFD6E2';
          ctx.beginPath(); ctx.ellipse(f.x + Math.cos(a) * r * 0.75, f.y + Math.sin(a) * r * 0.75, r * 0.72, r * 0.48, a, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#E86A92'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.14, 0, TAU); ctx.fill();
      }
      function drawTrees() {
        for (const tr of trees) {
          const age = now - (tr.done || now);
          const fade = tr.done ? Math.max(0, 1 - Math.max(0, age - 22) / 3) : 1; // lasts ~25 s after you finish
          if (fade <= 0) continue;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = BRANCH; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const n = tr.pts.length;
          for (let i = 1; i < n; i++) {
            ctx.lineWidth = Math.max(1.6, 11 * (1 - i / (n + 12)));
            ctx.beginPath(); ctx.moveTo(tr.pts[i - 1][0], tr.pts[i - 1][1]); ctx.lineTo(tr.pts[i][0], tr.pts[i][1]); ctx.stroke();
          }
          for (const w of tr.twigs) {
            const k = Math.min(1, (now - w.at) / 0.25);
            ctx.lineWidth = w.w; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + (w.ex - w.x) * k, w.y + (w.ey - w.y) * k); ctx.stroke();
          }
          for (const f of tr.flowers) {
            const k = Math.min(1, Math.max(0, (now - f.at - 0.1) / 0.35));
            blossom(f, k < 1 ? k * (1.25 - 0.25 * k) : 1);
            if (tr.done && Math.random() < 0.0015) emit({ kind: 'petal', x: f.x, y: f.y, vx: rand(-20, 20), vy: rand(30, 60), g: 20, s: rand(5, 8), rot: rand(0, TAU), vr: rand(-3, 3), decay: 0.25, c: f.col });
          }
          ctx.globalAlpha = 1;
        }
        trees = trees.filter((tr) => !tr.done || now - tr.done < 25);
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        dragStart(x, y) {
          if (trees.length >= 6) trees.shift();
          drawing = { pts: [[x, y]], twigs: [], flowers: [], done: 0, len: 0, nextTwig: rand(28, 50), nextFlower: rand(14, 26) };
          trees.push(drawing);
        },
        dragMove(x, y) {
          const tr = drawing; if (!tr) return;
          const [lx, ly] = tr.pts[tr.pts.length - 1], d = Math.hypot(x - lx, y - ly);
          if (d < 6 || tr.pts.length > 260) return;
          tr.pts.push([x, y]); tr.len += d;
          const ang = Math.atan2(y - ly, x - lx);
          if (tr.len > tr.nextTwig) { addTwig(tr, x, y, ang); tr.nextTwig = tr.len + rand(30, 60); }
          if (tr.len > tr.nextFlower) { addBlossom(tr, x + rand(-6, 6), y + rand(-6, 6), false); tr.nextFlower = tr.len + rand(16, 30); }
        },
        dragEnd() {
          const tr = drawing; drawing = null; if (!tr) return;
          const [x, y] = tr.pts[tr.pts.length - 1];
          for (let i = 0; i < 3; i++) addBlossom(tr, x + rand(-8, 8), y + rand(-8, 8), true);
          tr.done = now;
        },
        // Tap: a gust of blossoms bursts out and flutters down.
        tap(x, y) {
          burst(x, y, 24, (i, a) => { const v = rand(120, 340); return { kind: 'petal', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 160, drag: 1.6, s: rand(6, 12), rot: rand(0, TAU), vr: rand(-6, 6), decay: rand(0.35, 0.55), c: pick(['#FFE4EC', '#FFC7D9', '#FFB3CB', '#FFFFFF', '#FF9EBB']) }; });
          ring(x, y, 'rgba(255,255,255,.8)', { grow: 200 });
          return true;
        },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#F7A8C0'], [0.55, '#E26C93'], [1, '#C94A76']]);
          ctx.fillRect(0, 0, W, H);
          for (const b of bokeh) { b.y -= b.v * dt; if (b.y < -b.r) b.y = H + b.r; glowDot(b.x + Math.sin(t * 0.3 + b.p) * 20, b.y, b.r, '#FFFFFF', b.a); }
          if (W > 700) branch();
          now = t;
          toFront();
          drawTrees();
          for (const q of petals) {
            q.y += q.vy * dt; q.x += Math.sin(t * 0.9 + q.p) * q.sway * dt + 12 * dt; q.rot += q.spin * dt;
            if (q.y > H + 30) Object.assign(q, newPetal(false));
            petal(q, t);
          }
        },
      };
    },

    // Pastel sky: crisp cartoon clouds, hearts floating up, twinkles. Tap the sky to set a little
    // bird flying; tap a bird and it does a loop; tap a cloud and it boings and rains hearts.
    cottoncandy() {
      let clouds = [], hearts = [], stars = [], birds = [];
      const BIRD_COLS = [['#FF9EC7', '#FF6FAE'], ['#9FD8FF', '#5FB8F5'], ['#FFE07A', '#F6C443'], ['#C9B6FF', '#A58BFF'], ['#9EF0C8', '#5FD9A2']];
      // Each cloud is drawn once into a sprite (sharp, at double resolution) and reused.
      function cloudSprite() {
        const w = 280, h = 140, c = document.createElement('canvas');
        c.width = w * 2; c.height = h * 2;
        const g = c.getContext('2d'); g.scale(2, 2);
        const n = 6 + Math.floor(Math.random() * 3);
        const puffs = Array.from({ length: n }, (_, i) => {
          const k = i / (n - 1);
          return [40 + k * 200 + rand(-10, 10), 82 - Math.sin(k * Math.PI) * 32 + rand(-6, 6), 30 + Math.sin(k * Math.PI) * 26 + rand(-4, 4)];
        });
        puffs.push([140, 96, 40], [90, 98, 30], [190, 98, 30]);
        g.fillStyle = 'rgba(214,180,240,.55)'; // soft lilac underside
        for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + 7, r, 0, TAU); g.fill(); }
        const body = g.createLinearGradient(0, 20, 0, 130);
        body.addColorStop(0, '#FFFFFF'); body.addColorStop(0.75, '#FFF6FB'); body.addColorStop(1, '#F7E6FA');
        g.fillStyle = body;
        for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,.95)'; // top highlights
        for (const [x, y, r] of puffs.slice(0, n)) { g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, TAU); g.fill(); }
        return { c, w, h };
      }
      const cloud = (any) => ({ x: any ? rand(-200, W) : -320, y: rand(30, H * 0.85), s: rand(0.45, 1.15), v: rand(8, 22), sp: cloudSprite(), boing: 0 });
      const heart = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + 30, s: rand(8, 16), v: rand(18, 40), p: rand(0, TAU), col: pick(['#FF8FC8', '#FFB6D9', '#FFFFFF', '#F472B6', '#C4B5FD']) });
      const reset = () => {
        clouds = Array.from({ length: Math.round(8 * density()) }, () => cloud(true)).sort((a, b) => a.s - b.s);
        hearts = Array.from({ length: Math.round(16 * density()) }, () => heart(true));
        stars = Array.from({ length: Math.round(36 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(3, 7), p: rand(0, TAU), v: rand(1.5, 3.5) }));
      };
      const cloudBox = (c) => ({ x: c.x - (c.sp.w * c.s) / 2, y: c.y - (c.sp.h * c.s) / 2, w: c.sp.w * c.s, h: c.sp.h * c.s });
      const hitCloud = (x, y) => clouds.slice().reverse().find((c) => { const b = cloudBox(c); return x > b.x + b.w * 0.1 && x < b.x + b.w * 0.9 && y > b.y + b.h * 0.2 && y < b.y + b.h * 0.85; });
      const hitBird = (x, y) => birds.find((b) => Math.hypot(x - b.x, y - b.y) < 26 * b.s);
      function bird(b, t) {
        const flap = Math.sin(t * 14 + b.p);
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.dir * b.s, b.s); ctx.rotate(b.tilt || 0);
        ctx.fillStyle = b.col[1]; // back wing
        ctx.beginPath(); ctx.ellipse(-2, -4, 11, Math.max(1, 5 + flap * 4), -0.5 - flap * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = b.col[0]; // body
        ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-22, -7); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill(); // tail
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(3, 4, 8, 5, 0, 0, TAU); ctx.fill(); // tummy
        ctx.fillStyle = b.col[1]; // front wing
        ctx.beginPath(); ctx.ellipse(-3, -2, 10, Math.max(1, 4 + flap * 5), -0.3 - flap * 0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2B1B2E'; ctx.beginPath(); ctx.arc(8, -3, 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(8.6, -3.6, 0.7, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,120,160,.55)'; ctx.beginPath(); ctx.ellipse(7, 2, 2.5, 1.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(20, -1); ctx.lineTo(14, 1); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        tap(x, y) {
          const b = hitBird(x, y);
          if (b) { if (!b.loop && !b.zoom) { b.loop = 1; b.cx = b.x; b.cy = b.y - 34 * b.s; } burst(b.x, b.y, 6, (i, a) => ({ kind: 'heart', x: b.x, y: b.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 - 40, drag: 2, s: rand(5, 8), decay: 0.9, c: pick(['#FF8FC8', '#F472B6', '#FFFFFF']) })); return true; }
          const c = hitCloud(x, y);
          if (c) { c.boing = 1; return true; }
          if (birds.length >= 10) birds.shift();
          const dir = x < W / 2 ? -1 : 1; // fly outward, away from the game in the middle
          birds.push({ x, y, dir, s: rand(0.9, 1.3), v: rand(90, 140), p: rand(0, TAU), col: pick(BIRD_COLS), loop: 0, born: 0 });
          burst(x, y, 6, () => ({ kind: 'star', x: x + rand(-20, 20), y: y + rand(-20, 20), s: rand(3, 6), decay: 1.6, c: '#FFFFFF' }));
          return true;
        },
        draw(dt, t) {
          const shift = (Math.sin(t * 0.08) + 1) / 2;
          ctx.fillStyle = grad(0, H, [[0, `hsl(${330 - shift * 20},90%,84%)`], [0.5, `hsl(${265 + shift * 10},85%,82%)`], [1, `hsl(${200 + shift * 15},90%,80%)`]]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) sparkle(s.x, s.y, s.s, '#FFFFFF', 0.25 + 0.75 * Math.abs(Math.sin(t * s.v + s.p)));
          for (const c of clouds) {
            c.x += c.v * c.s * dt; if (c.x > W + 200) Object.assign(c, cloud(false));
            c.boing = Math.max(0, c.boing - dt * 1.4);
            const sq = c.boing ? Math.sin(c.boing * 16) * c.boing * 0.16 : 0;
            if (c.boing && Math.random() < dt * 16) emit({ kind: 'heart', x: c.x + rand(-90, 90) * c.s, y: c.y + 30 * c.s, vy: rand(70, 130), vx: rand(-15, 15), s: rand(5, 9), decay: 0.7, c: pick(['#FF8FC8', '#F472B6', '#C4B5FD']) });
            const w = c.sp.w * c.s * (1 + sq), h = c.sp.h * c.s * (1 - sq);
            ctx.drawImage(c.sp.c, c.x - w / 2, c.y - h / 2 + (c.sp.h * c.s - h) / 2, w, h);
          }
          toFront();
          for (const h of hearts) {
            h.y -= h.v * dt; if (h.y < -30) Object.assign(h, heart(false));
            ctx.globalAlpha = 0.8; ctx.fillStyle = h.col;
            heartPath(h.x + Math.sin(t * 1.2 + h.p) * 18, h.y, h.s * (1 + 0.08 * Math.sin(t * 4 + h.p))); ctx.fill();
            ctx.globalAlpha = 1;
          }
          for (const b of birds) {
            if (b.loop) { // a loop-the-loop, then carry on
              b.loop += dt * 1.4;
              const a = (b.loop - 1) * TAU;
              b.x = b.cx + Math.sin(a) * 34 * b.s * b.dir; b.y = b.cy + Math.cos(a) * 34 * b.s; b.tilt = -a;
              if (b.loop >= 2) { b.loop = 0; b.tilt = 0; b.x = b.cx; b.y = b.cy + 34 * b.s; b.zoom = 1; } // then zooms off
            } else if (b.zoom) { // after the loop: off the screen at full speed, trailing hearts
              b.zoom += dt; b.v = Math.min(900, b.v + 1400 * dt);
              b.x += b.dir * b.v * dt; b.y -= 60 * dt; b.tilt = -0.25;
              if (Math.random() < dt * 30) emit({ kind: 'heart', x: b.x - b.dir * 14 * b.s, y: b.y + rand(-4, 4), vx: -b.dir * rand(10, 40), vy: rand(-20, 20), drag: 1.5, s: rand(4, 8), decay: 0.9, c: pick(['#FF8FC8', '#F472B6', '#FFFFFF', '#C4B5FD']) });
            } else {
              b.x += b.dir * b.v * dt; b.y += Math.sin(t * 2.4 + b.p) * 26 * dt;
              b.tilt = Math.sin(t * 2.4 + b.p) * 0.12;
            }
            bird(b, t);
          }
          birds = birds.filter((b) => b.x > -60 && b.x < W + 60);
        },
      };
    },

    // Underwater: swaying light rays, bubbles and glittering scales. Every tap brings in a new sea
    // creature (fish, jellyfish, turtle, seahorse, puffer, octopus, whale, ray) that swims back and
    // forth across the screen. Tap a creature and it does a happy little spin.
    lagoon() {
      let bubbles = [], glints = [], pals = [], nextKind = 0;
      const KINDS = ['fish', 'jelly', 'turtle', 'seahorse', 'puffer', 'octopus', 'whale', 'ray', 'clown'];
      const bubble = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + 20, r: rand(2, 9), v: rand(25, 70), p: rand(0, TAU) });
      const reset = () => {
        bubbles = Array.from({ length: Math.round(40 * density()) }, () => bubble(true));
        glints = Array.from({ length: Math.round(28 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), p: rand(0, TAU), v: rand(2, 5) }));
        for (const c of pals) { c.x = Math.min(W - 40, c.x); c.y = Math.min(H - 40, c.y); }
      };
      const hitPal = (x, y) => pals.slice().reverse().find((c) => Math.abs(x - c.x) < 40 * c.s && Math.abs(y - c.y) < 32 * c.s);
      const hitBubble = (x, y) => bubbles.find((b) => Math.hypot(x - b.x, y - b.y) < b.r + 5);
      function eye(x, y, r) { ctx.fillStyle = '#1B1030'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill(); }
      function blush(x, y, r) { ctx.fillStyle = 'rgba(255,120,170,.5)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill(); }
      function creature(c, t) {
        const sw = Math.sin(t * 6 + c.p);
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.face * c.s, c.s); ctx.rotate(c.spin || 0);
        switch (c.kind) {
          case 'fish': {
            ctx.fillStyle = c.col; ctx.beginPath(); ctx.ellipse(0, 0, 24, 14, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-38, -12 + sw * 4); ctx.lineTo(-38, 12 + sw * 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-4, 0, 4, 12, 0, 0, TAU); ctx.fill();
            eye(13, -3, 3.5); blush(12, 5, 3); break;
          }
          case 'clown': {
            ctx.fillStyle = '#FF8A3D'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 13, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-32, -10 + sw * 4); ctx.lineTo(-32, 10 + sw * 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#FFFFFF'; for (const sx of [8, -6]) { ctx.beginPath(); ctx.ellipse(sx, 0, 3.5, 12, 0, 0, TAU); ctx.fill(); }
            eye(14, -3, 3); break;
          }
          case 'jelly': {
            const pulse = 1 + Math.sin(t * (3 + c.zap * 9) + c.p) * 0.12;
            if (c.zap) { ctx.globalCompositeOperation = 'lighter'; glowDot(0, 4, 46, 'rgba(165,243,252,.55)', c.zap); ctx.globalCompositeOperation = 'source-over'; }
            ctx.strokeStyle = 'rgba(255,200,240,.8)'; ctx.lineWidth = 2;
            for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 5, 4); for (let j = 1; j < 6; j++) ctx.lineTo(k * 5 + Math.sin(t * 4 + j + k) * 4, 4 + j * 7); ctx.stroke(); }
            ctx.fillStyle = 'rgba(244,170,255,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, 22 * pulse, 18 / pulse, 0, Math.PI, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(-7, -9, 5, 4, -0.4, 0, TAU); ctx.fill();
            eye(-6, -5, 2.4); eye(6, -5, 2.4); break;
          }
          case 'turtle': {
            const pad = Math.sin(t * 4 + c.p);
            ctx.fillStyle = '#7FD8A6';
            if (!c.shell) { // tucked in while hiding
              ctx.beginPath(); ctx.ellipse(10, 14, 10, 4, 0.6 + pad * 0.5, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.ellipse(-12, 14, 9, 4, -0.6 - pad * 0.5, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.ellipse(26, -2, 9, 8, 0, 0, TAU); ctx.fill();
            }
            ctx.fillStyle = '#3E9E6E'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 16, 0, Math.PI, TAU); ctx.lineTo(24, 4); ctx.lineTo(-24, 4); ctx.fill();
            ctx.fillStyle = '#5CC48D'; for (const [hx, hy] of [[-10, -6], [2, -10], [12, -5], [0, -2]]) { ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, TAU); ctx.fill(); }
            if (!c.shell) { eye(29, -4, 2.2); blush(27, 2, 2.5); } break;
          }
          case 'seahorse': {
            ctx.fillStyle = '#FFD86B';
            ctx.beginPath(); ctx.ellipse(0, -12, 10, 9, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(10, -14, 9, 4, 0.2, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(-2, 4, 9, 13, 0.1, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#FFD86B'; ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-4, 14); ctx.quadraticCurveTo(-10, 28, 2, 28); ctx.quadraticCurveTo(8, 26, 4, 22); ctx.stroke();
            ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.ellipse(-10, 0, 5, 8 + sw * 2, 0, 0, TAU); ctx.fill();
            eye(3, -14, 2.4); blush(4, -8, 2.5); break;
          }
          case 'puffer': {
            const big = 1 + (c.puff || 0) * 0.6;
            ctx.scale(big, big);
            ctx.strokeStyle = '#E8A93A'; ctx.lineWidth = 2;
            for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 15); ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 20); ctx.stroke(); }
            ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 16, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#FFF6D5'; ctx.beginPath(); ctx.ellipse(2, 6, 12, 7, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#FFC24A'; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-26, -7 + sw * 3); ctx.lineTo(-26, 7 + sw * 3); ctx.fill();
            eye(9, -4, 3); blush(8, 4, 3); break;
          }
          case 'octopus': {
            ctx.strokeStyle = '#FF8FB8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
            for (let k = 0; k < 5; k++) { const bx = -12 + k * 6; ctx.beginPath(); ctx.moveTo(bx, 6); ctx.quadraticCurveTo(bx + Math.sin(t * 3 + k) * 8, 20, bx - 4 + Math.sin(t * 3 + k + 1) * 6, 28); ctx.stroke(); }
            ctx.fillStyle = '#FF9EC7'; ctx.beginPath(); ctx.ellipse(0, -4, 18, 17, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-6, -12, 5, 4, -0.4, 0, TAU); ctx.fill();
            eye(-6, -2, 2.6); eye(6, -2, 2.6); blush(-10, 5, 2.5); blush(10, 5, 2.5); break;
          }
          case 'whale': {
            ctx.fillStyle = '#7FA8F5';
            ctx.beginPath(); ctx.ellipse(0, 0, 34, 20, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-28, -2); ctx.quadraticCurveTo(-42, -4, -50, -16 + sw * 4); ctx.quadraticCurveTo(-44, -2, -50, 10 + sw * 4); ctx.quadraticCurveTo(-40, 4, -28, 4); ctx.fill();
            ctx.fillStyle = '#DCE8FF'; ctx.beginPath(); ctx.ellipse(6, 9, 24, 9, 0, 0, Math.PI); ctx.fill();
            ctx.fillStyle = '#6B93E6'; ctx.beginPath(); ctx.ellipse(0, 10, 9, 4, 0.5 + sw * 0.3, 0, TAU); ctx.fill();
            eye(20, -4, 3); blush(18, 4, 3.5);
            if (Math.random() < 0.02) emit({ kind: 'bubble', x: c.x + c.face * 10 * c.s, y: c.y - 20 * c.s, vy: -rand(40, 80), vx: rand(-10, 10), s: rand(2, 4), vr: 5, decay: 0.7, c: 'rgba(224,255,251,.8)' });
            break;
          }
          case 'ray': {
            const w = Math.sin(t * 3 + c.p) * 8;
            ctx.fillStyle = '#B39DFF';
            ctx.beginPath(); ctx.moveTo(26, 0); ctx.quadraticCurveTo(0, -30 - w, -16, -4); ctx.lineTo(-16, 4); ctx.quadraticCurveTo(0, 30 + w, 26, 0); ctx.fill();
            ctx.strokeStyle = '#B39DFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-30, sw * 4, -42, 0); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(6, -6, 8, 3, -0.3, 0, TAU); ctx.fill();
            eye(16, -4, 2.2); eye(16, 4, 2.2); break;
          }
        }
        ctx.restore();
      }
      // Every creature reacts its own way when you tap it.
      function react(c) {
        const hearts = () => burst(c.x, c.y, 6, (i, a) => ({ kind: 'heart', x: c.x, y: c.y - 20, vx: Math.cos(a) * 60, vy: -rand(50, 110), drag: 1.5, s: rand(5, 8), decay: 0.8, c: pick(['#FF9EC7', '#FFFFFF', '#F0ABFC']) }));
        switch (c.kind) {
          case 'puffer': c.puff = 1; burst(c.x, c.y, 8, () => ({ kind: 'bubble', x: c.x, y: c.y, vx: rand(-60, 60), vy: rand(-80, -20), s: rand(2, 4), vr: 6, decay: 0.9, c: 'rgba(224,255,251,.8)' })); break;
          case 'jelly': // lights up with a zap and jets upward
            c.zap = 1; c.vy = -70;
            burst(c.x, c.y, 12, (i, a) => ({ kind: 'streak', x: c.x, y: c.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, drag: 3, s: 1.4, decay: 2.4, add: true, c: pick(['#A5F3FC', '#F0ABFC', '#FFFFFF']) }));
            ring(c.x, c.y, 'rgba(165,243,252,.9)', { s: 10, grow: 140, decay: 2.8, w: 2, add: true }); break;
          case 'octopus': // squirts ink and zooms off the other way
            c.ink = 1; c.dir *= -1; c.boost = 4;
            burst(c.x, c.y, 14, () => ({ kind: 'glow', x: c.x + rand(-10, 10), y: c.y + rand(0, 16), vx: rand(-40, 40), vy: rand(-20, 30), drag: 2.2, s: rand(5, 10), decay: 0.55, c: 'rgba(40,20,60,.55)' })); break;
          case 'turtle': // hides in its shell and tumbles for a moment
            c.shell = 2.2; break;
          case 'whale': // a big happy spout
            c.spout = 1.4; hearts(); break;
          case 'clown': // darts around in a zig-zag
            c.dart = 1.4; c.boost = 3; break;
          default: // fish, seahorse and ray do a happy spin
            c.happy = 1; hearts();
        }
      }
      // Visitors: now and then a creature swims in from one side and out the other.
      let visitT = 1.5;
      function visitor() {
        if (pals.filter((c) => c.visitor).length >= 5) return;
        const kind = pick(['fish', 'fish', 'clown', 'turtle', 'ray', 'jelly', 'whale', 'puffer', 'seahorse']);
        const dir = Math.random() < 0.5 ? 1 : -1;
        pals.push({ kind, visitor: true, x: dir > 0 ? -70 : W + 70, y: rand(H * 0.15, H - 90), dir, face: dir, lo: -200, hi: W + 200, s: rand(0.8, 1.2), v: kind === 'jelly' || kind === 'seahorse' ? rand(25, 40) : rand(40, 75), vy: rand(-8, 8), p: rand(0, TAU), col: pick(['#5EEAD4', '#F0ABFC', '#FDE68A', '#93C5FD', '#FCA5A5']), spin: 0, happy: 0, puff: 0, grow: 1, zap: 0, ink: 0, shell: 0, dart: 0, spout: 0, boost: 1 });
      }
      function addPal(x, y) {
        if (pals.filter((c) => !c.visitor).length >= 10) pals.splice(pals.findIndex((c) => !c.visitor), 1);
        const kind = KINDS[nextKind++ % KINDS.length];
        const dir = Math.random() < 0.5 ? -1 : 1;
        const lo = 46, hi = W - 46; // swims the whole width, passing behind the cards
        pals.push({ kind, x: Math.max(lo, Math.min(hi, x)), y, dir, face: dir, lo, hi, s: rand(0.95, 1.3), v: kind === 'jelly' || kind === 'seahorse' ? rand(25, 40) : rand(45, 85), vy: rand(-14, 14), p: rand(0, TAU), col: pick(['#5EEAD4', '#F0ABFC', '#FDE68A', '#93C5FD', '#FCA5A5']), spin: 0, happy: 0, puff: 0, grow: 0, zap: 0, ink: 0, shell: 0, dart: 0, spout: 0, boost: 1 });
        ring(x, y, 'rgba(224,255,251,.9)', { grow: 160, decay: 2.5, w: 2 });
        burst(x, y, 8, () => ({ kind: 'bubble', x: x + rand(-12, 12), y, vx: rand(-25, 25), vy: -rand(60, 140), s: rand(2, 6), vr: rand(3, 7), decay: 0.6, c: 'rgba(224,255,251,.8)' }));
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        tap(x, y) {
          const c = hitPal(x, y);
          if (c) { react(c); return true; }
          const b = hitBubble(x, y);
          if (b) {
            ring(b.x, b.y, 'rgba(224,255,251,.9)', { s: b.r, grow: 120, decay: 3, w: 1.5 });
            burst(b.x, b.y, 8, (i, a) => ({ x: b.x, y: b.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 3, s: 1.6, decay: 2.2, c: '#E0FFFB' }));
            Object.assign(b, bubble(false));
            return true;
          }
          addPal(x, y);
          return true;
        },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#22B8C9'], [0.45, '#0E7490'], [1, '#083344']]);
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 7; i++) {
            const x = (i + 0.5) * (W / 7) + Math.sin(t * 0.4 + i) * 60, w = 40 + 30 * Math.sin(t * 0.7 + i * 2);
            const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
            g.addColorStop(0, 'rgba(200,255,250,.16)'); g.addColorStop(1, 'rgba(200,255,250,0)');
            ctx.fillStyle = g; ctx.beginPath();
            ctx.moveTo(x - w, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 3 + 80, H * 0.9); ctx.lineTo(x + w * 1.5 + 80, H * 0.9); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const g of glints) sparkle(g.x, g.y, 3, '#E0FFFB', 0.6 * Math.max(0, Math.sin(t * g.v + g.p)));
          // sand
          ctx.fillStyle = '#E9D8A6'; ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, H - 22 - Math.sin(x * 0.01) * 8);
          ctx.lineTo(W, H); ctx.fill();
          toFront();
          visitT -= dt; if (visitT <= 0) { visitor(); visitT = rand(2.2, 4.5); }
          pals = pals.filter((c) => !c.visitor || (c.x > -120 && c.x < W + 120));
          for (const c of pals) {
            c.grow = Math.min(1, c.grow + dt * 3);
            // swim back and forth, turning around smoothly at the edges
            if (c.dart) { c.dart = Math.max(0, c.dart - dt); if (Math.random() < dt * 7) { c.dir *= -1; c.vy = rand(-60, 60); } if (!c.dart) c.boost = 1; }
            if (c.boost > 1 && !c.dart) c.boost = Math.max(1, c.boost - dt * 3);
            if (c.zap) { c.zap = Math.max(0, c.zap - dt * 0.8); if (Math.random() < dt * 10) emit({ kind: 'streak', x: c.x + rand(-14, 14), y: c.y + rand(0, 30), vx: rand(-40, 40), vy: rand(-40, 40), s: 1, decay: 4, add: true, c: '#A5F3FC' }); }
            if (c.ink) c.ink = Math.max(0, c.ink - dt);
            if (c.spout) { c.spout = Math.max(0, c.spout - dt); if (Math.random() < dt * 40) emit({ x: c.x + c.face * 8 * c.s, y: c.y - 22 * c.s, vx: rand(-30, 30), vy: -rand(140, 260), g: 380, s: rand(1.5, 3), decay: 1.2, c: 'rgba(224,255,251,.9)' }); }
            const still = c.shell ? 0.15 : c.happy ? 0.3 : c.boost;
            c.x += c.dir * c.v * dt * still; c.y += c.vy * dt + Math.sin(t * 1.6 + c.p) * 10 * dt + (c.shell ? 14 * dt : 0);
            if (c.shell) { c.shell = Math.max(0, c.shell - dt); c.spin = c.shell ? Math.sin(c.shell * 3) * 0.5 : 0; }
            const m = 46 * c.s;
            if (c.x < c.lo) c.dir = 1; if (c.x > c.hi) c.dir = -1; // stays in its own side lane
            c.vy *= c.vy < -30 ? Math.max(0, 1 - dt * 1.5) : 1;
            if (c.y < H * 0.12) c.vy = Math.abs(c.vy) + 4; if (c.y > H - 60) c.vy = -Math.abs(c.vy) - 4;
            c.face += (c.dir - c.face) * Math.min(1, dt * 5);
            if (Math.abs(c.face) < 0.08) c.face = c.dir * 0.08;
            if (c.happy) { c.happy = Math.max(0, c.happy - dt * 0.9); c.spin = (1 - c.happy) * TAU * (c.kind === 'puffer' ? 0 : 1); if (!c.happy) c.spin = 0; }
            if (c.puff) c.puff = Math.max(0, c.puff - dt * 0.5);
            const s0 = c.s; c.s = s0 * c.grow; creature(c, t); c.s = s0;
          }
          for (const b of bubbles) {
            b.y -= b.v * dt; b.x += Math.sin(t * 2 + b.p) * 10 * dt; if (b.y < -20) Object.assign(b, bubble(false));
            ctx.strokeStyle = 'rgba(224,255,251,.65)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU); ctx.fill();
          }
        },
      };
    },

    // Northern lights over mountains under the stars. Constellation hunt: a few bright stars appear
    // in the open sky; tap them in order (the next one pulses) and glowing lines join them. Finish
    // the shape and it lights up with its name, the aurora flares, and a new one appears.
    // Tapping elsewhere makes the lights flare with a shower of sparkles.
    aurora() {
      let stars = [];
      const reset = () => { stars = Array.from({ length: Math.round(140 * density()) }, () => ({ x: rand(0, W), y: rand(0, H * 0.75), r: rand(0.4, 1.6), p: rand(0, TAU), v: rand(0.5, 2) })); con = null; nextCon = 0.6; };
      const bands = [
        { hue: 150, y: 0.28, amp: 70, f: 0.004, s: 0.25, h: 170 },
        { hue: 175, y: 0.36, amp: 55, f: 0.006, s: -0.18, h: 130 },
        { hue: 275, y: 0.22, amp: 80, f: 0.003, s: 0.12, h: 120 },
      ];
      // Star patterns (0..1 box), joined in the order listed; extra links close shapes.
      const SHAPES = [
        { name: 'The Fox', pts: [[0.1, 0.2], [0.25, 0.05], [0.3, 0.3], [0.45, 0.45], [0.75, 0.5], [0.95, 0.75], [0.6, 0.8], [0.4, 0.95]] },
        { name: 'The Whale', pts: [[0.05, 0.5], [0.25, 0.3], [0.55, 0.28], [0.8, 0.45], [0.95, 0.25], [0.97, 0.65], [0.8, 0.55], [0.5, 0.72], [0.2, 0.68]], close: true },
        { name: 'The Owl', pts: [[0.3, 0.05], [0.5, 0.25], [0.7, 0.05], [0.8, 0.45], [0.7, 0.85], [0.5, 0.95], [0.3, 0.85], [0.2, 0.45]], close: true },
        { name: 'The Deer', pts: [[0.2, 0.05], [0.3, 0.2], [0.4, 0.05], [0.35, 0.35], [0.5, 0.5], [0.85, 0.5], [0.9, 0.9], [0.55, 0.9], [0.5, 0.5]] },
        { name: 'The Wolf', pts: [[0.15, 0.1], [0.3, 0.25], [0.05, 0.4], [0.35, 0.45], [0.6, 0.4], [0.9, 0.55], [0.75, 0.85], [0.45, 0.8]] },
        { name: 'The Crown', pts: [[0.05, 0.8], [0.15, 0.2], [0.35, 0.6], [0.5, 0.1], [0.65, 0.6], [0.85, 0.2], [0.95, 0.8]], close: true },
        { name: 'The Kite', pts: [[0.5, 0.0], [0.85, 0.35], [0.5, 0.75], [0.15, 0.35], [0.5, 0.0], [0.5, 0.75], [0.55, 0.95]] },
      ];
      let con = null, nextCon = 0.6, found = 0, shapeIx = Math.floor(Math.random() * SHAPES.length);
      try { found = Number(localStorage.getItem('sliver.aurora.found')) || 0; } catch {}
      function newCon() {
        const sh = SHAPES[shapeIx++ % SHAPES.length];
        // Put it in open sky beside the cards on wide screens, in the top band on narrow ones.
        const g = lanes(), side = g || W;
        const size = Math.max(130, Math.min(260, side - 50, H * 0.35));
        let x0, y0;
        if (g) { x0 = Math.random() < 0.5 ? rand(20, Math.max(20, g - size - 20)) : W - g + rand(20, Math.max(20, g - size - 20)); y0 = rand(70, Math.max(80, H * 0.55 - size)); }
        else { x0 = rand(16, Math.max(16, W - size - 16)); y0 = rand(70, Math.max(80, H * 0.3)); }
        con = { name: sh.name, close: !!sh.close, pts: sh.pts.map(([u, v]) => ({ x: x0 + u * size, y: y0 + v * size * 0.8, p: rand(0, TAU) })), next: 0, born: 0, done: 0, size };
      }
      let surge = 0, surgeX = 0, low = null, lctx = null, redraw = false, now = 0;
      for (const b of bands) {
        const c = document.createElement('canvas'); c.width = 1; c.height = 128;
        const g = c.getContext('2d'), lg = g.createLinearGradient(0, 0, 0, 128);
        lg.addColorStop(0, `hsla(${b.hue + 40},90%,65%,0)`); lg.addColorStop(0.55, `hsla(${b.hue},90%,60%,.10)`); lg.addColorStop(0.86, `hsla(${b.hue - 10},95%,70%,.24)`); lg.addColorStop(1, `hsla(${b.hue - 10},95%,70%,0)`);
        g.fillStyle = lg; g.fillRect(0, 0, 1, 128); b.sprite = c;
      }
      function flare(x, y, n) {
        surge = 1; surgeX = x;
        burst(x, y, n, (i, a) => { const v = rand(60, 200); return { kind: 'glow', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.8, g: 25, s: rand(1.2, 2.6), decay: rand(0.5, 0.9), add: true, c: pick(['#6EE7B7', '#34D399', '#A78BFA', '#67E8F9']) }; });
      }
      function drawCon(t) {
        if (!con) return;
        const age = now - con.born, fadeIn = Math.min(1, age / 0.8);
        const out = con.done ? Math.max(0, 1 - (now - con.done - 2.2) / 1) : 1;
        const a = fadeIn * out;
        if (a <= 0) return;
        ctx.lineCap = 'round';
        // the lines you've made
        const upto = con.done ? con.pts.length : con.next;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < upto; i++) {
          const p = con.pts[i - 1], q = con.pts[i];
          ctx.strokeStyle = `rgba(110,231,183,${0.28 * a})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          ctx.strokeStyle = `rgba(220,255,245,${0.9 * a})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        if (con.done && con.close) { const p = con.pts[con.pts.length - 1], q = con.pts[0]; ctx.strokeStyle = `rgba(220,255,245,${0.9 * a})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        // hint: a faint dotted line to the next star
        if (!con.done && con.next > 0) {
          const p = con.pts[con.next - 1], q = con.pts[con.next];
          ctx.setLineDash([3, 7]); ctx.strokeStyle = `rgba(200,240,255,${0.25 * a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
        }
        // the stars
        con.pts.forEach((s, i) => {
          const lit = con.done || i < con.next, nextOne = !con.done && i === con.next;
          const tw = 0.75 + 0.25 * Math.sin(t * 3 + s.p);
          const r = lit ? 3.2 : nextOne ? 3 + Math.sin(t * 6) * 0.8 : 2.4;
          glowDot(s.x, s.y, r * (nextOne ? 7 : 5), lit ? 'rgba(110,231,183,.55)' : 'rgba(186,230,253,.45)', a * tw);
          ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
          if (nextOne) { ctx.strokeStyle = `rgba(167,243,208,${a * (0.5 + 0.5 * Math.sin(t * 6))})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(s.x, s.y, 12 + Math.sin(t * 6) * 2, 0, TAU); ctx.stroke(); }
        });
        ctx.globalCompositeOperation = 'source-over';
        if (con.done) {
          const k = Math.min(1, (now - con.done) / 0.6);
          const cx = con.pts.reduce((s, p) => s + p.x, 0) / con.pts.length, top = Math.min(...con.pts.map((p) => p.y));
          ctx.globalAlpha = a * k; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.font = 'italic 600 20px Georgia, serif'; ctx.fillStyle = '#E6FFF6'; ctx.fillText(`✦ ${con.name} ✦`, cx, top - 18 - (1 - k) * 10);
          ctx.globalAlpha = 1; ctx.textAlign = 'left';
        }
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        targets: () => (con && !con.done ? con.pts.slice(con.next).map((p) => [p.x, p.y]) : []),
        tap(x, y) {
          if (con && !con.done) {
            const s = con.pts[con.next];
            if (Math.hypot(x - s.x, y - s.y) < 26) {
              con.next++;
              burst(s.x, s.y, 8, (i, a) => ({ kind: 'glow', x: s.x, y: s.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, drag: 2.5, s: rand(1, 1.8), decay: 1.4, add: true, c: pick(['#A7F3D0', '#FFFFFF', '#C4B5FD']) }));
              if (con.next >= con.pts.length) {
                con.done = now; found++;
                try { localStorage.setItem('sliver.aurora.found', String(found)); } catch {}
                for (const p of con.pts) ring(p.x, p.y, 'rgba(167,243,208,.9)', { s: 3, grow: 90, decay: 2, w: 1.5, add: true });
                flare(con.pts[0].x, con.pts[0].y, 26);
              }
              return true;
            }
            if (con.pts.some((p, i) => i > con.next && Math.hypot(x - p.x, y - p.y) < 26)) { // wrong star: the next one blinks at you
              ring(s.x, s.y, 'rgba(253,164,175,.9)', { s: 4, grow: 60, decay: 3, w: 1.5, add: true });
              return true;
            }
          }
          flare(x, y, 18);
          return true;
        },
        draw(dt, t) {
          now = t;
          surge = Math.max(0, surge - dt * 0.45);
          if (!con || (con.done && now - con.done > 3.3)) { if (con) con = null; nextCon -= dt; if (nextCon <= 0) { newCon(); con.born = now; nextCon = 1.2; } }
          ctx.fillStyle = grad(0, H, [[0, '#020617'], [0.6, '#0B1430'], [1, '#111C3A']]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.v + s.p)); ctx.fillStyle = '#E0F2FE'; ctx.fillRect(s.x, s.y, s.r, s.r); }
          ctx.globalAlpha = 1;
          const Q = 3;
          if (!low || low.width !== Math.ceil(W / Q) || low.height !== Math.ceil(H / Q)) { low = document.createElement('canvas'); low.width = Math.ceil(W / Q); low.height = Math.ceil(H / Q); lctx = low.getContext('2d'); }
          redraw = !redraw || surge > 0;
          if (redraw) {
            lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, low.width, low.height);
            lctx.globalCompositeOperation = 'lighter'; lctx.setTransform(1 / Q, 0, 0, 1 / Q, 0, 0);
            for (const b of bands) {
              for (let x = -10; x < W + 10; x += 3) {
                const y = H * b.y + Math.sin(x * b.f + t * b.s * 2) * b.amp + Math.sin(x * b.f * 2.7 - t * b.s * 3) * b.amp * 0.35;
                const boost = surge ? 1 + surge * 1.4 * Math.exp(-(((x - surgeX) / (W * 0.25)) ** 2)) : 1;
                const h = b.h * (0.6 + 0.4 * Math.sin(x * 0.01 + t * 0.8 + b.hue)) * boost;
                lctx.globalAlpha = Math.min(1, boost);
                lctx.drawImage(b.sprite, x, y - h, 4, h + 34);
              }
            }
          }
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(low, 0, 0, W, H);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          toFront(); drawCon(t); toBack();
          ctx.fillStyle = '#050A18';
          ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H - 60 - Math.abs(Math.sin(x * 0.006) * 120) - Math.abs(Math.sin(x * 0.017 + 1) * 40));
          ctx.lineTo(W, H); ctx.fill();
          ctx.font = '600 12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(2,6,23,.55)'; ctx.fillRect(14, H - 40, 200, 26);
          ctx.fillStyle = '#A7F3D0'; ctx.fillText(`✦ ${found} constellation${found === 1 ? '' : 's'} found`, 24, H - 22);
        },
      };
    },

    // Deep space: three layers of stars drifting, glowing nebulae, shooting stars. Tap to open a
    // black hole: it swirls nearby stars in and swallows them, then blows up in a supernova that
    // flings them back out across the screen.
    nebula() {
      let layers = [], clouds = [], shoot = null, nextShot = 2, holes = [], bodies = [];
      // Galaxies and suns: drawn once into crisp sprites (2x) and reused every frame.
      const sprite = (n, paint) => { const c = document.createElement('canvas'); c.width = c.height = n * 2; const g = c.getContext('2d'); g.scale(2, 2); paint(g, n / 2); return c; };
      const GALAXIES = [[280, 320], [200, 45], [170, 260]].map(([h1, h2]) => sprite(140, (g, c) => {
        const core = g.createRadialGradient(c, c, 0, c, c, c * 0.45);
        core.addColorStop(0, 'rgba(255,248,230,1)'); core.addColorStop(0.3, `hsla(${h2},90%,75%,.7)`); core.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = core; g.beginPath(); g.arc(c, c, c * 0.45, 0, TAU); g.fill();
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 260; i++) { // two spiral arms of tiny stars
          const k = i / 260, a = arm * Math.PI + k * 3.4 * Math.PI, r = 6 + k * (c - 8);
          const x = c + Math.cos(a) * r + rand(-4, 4) * (0.4 + k), y = c + Math.sin(a) * r * 0.55 + rand(-3, 3) * (0.4 + k);
          g.fillStyle = `hsla(${k < 0.5 ? h2 : h1},85%,${70 + rand(0, 25)}%,${0.85 - k * 0.6})`;
          g.fillRect(x, y, rand(0.6, 1.8), rand(0.6, 1.8));
        }
      }));
      const SUNS = [['#FFFFFF', '#FFE48A', '#FF9F43'], ['#FFFFFF', '#A5D8FF', '#4C6EF5'], ['#FFFFFF', '#FFB3C7', '#E64980']].map(([a, b, c2]) => sprite(110, (g, c) => {
        const glow = g.createRadialGradient(c, c, 0, c, c, c);
        glow.addColorStop(0, a); glow.addColorStop(0.18, b); glow.addColorStop(0.4, c2 + '88'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = glow; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
        g.strokeStyle = b + '66'; g.lineWidth = 1; // a few corona rays
        for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; g.beginPath(); g.moveTo(c + Math.cos(an) * c * 0.22, c + Math.sin(an) * c * 0.22); g.lineTo(c + Math.cos(an) * c * (0.55 + (i % 3) * 0.12), c + Math.sin(an) * c * (0.55 + (i % 3) * 0.12)); g.stroke(); }
      }));
      const newBody = (kind, any) => ({ kind, spr: kind === 'galaxy' ? pick(GALAXIES) : pick(SUNS), x: any ? rand(0, W) : W + 120, y: rand(40, H - 40), s: kind === 'galaxy' ? rand(0.6, 1.15) : rand(0.35, 0.7), rot: rand(0, TAU), vr: kind === 'galaxy' ? rand(0.05, 0.15) * (Math.random() < 0.5 ? -1 : 1) : 0, vx: 0, vy: 0, scale: 1, eaten: null, drift: rand(3, 7), p: rand(0, TAU) });
      const reset = () => {
        bodies = [...Array.from({ length: Math.max(2, Math.round(3 * density())) }, () => newBody('galaxy', true)), ...Array.from({ length: Math.max(2, Math.round(4 * density())) }, () => newBody('sun', true))];
        layers = [0.25, 0.6, 1.2].map((speed, i) => ({ speed, stars: Array.from({ length: Math.round([230, 120, 45][i] * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: [0.7, 1.2, 2][i] * rand(0.6, 1.2), p: rand(0, TAU), vx: 0, vy: 0, eaten: null })) }));
        clouds = Array.from({ length: 5 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), r: rand(180, 380), hue: pick([320, 280, 210, 190, 340]), p: i }));
        holes = [];
      };
      const R = () => Math.min(260, Math.max(160, Math.min(W, H) * 0.28));
      function explode(h) {
        ring(h.x, h.y, 'rgba(255,255,255,.95)', { s: 10, grow: 520, decay: 1.4, w: 3, add: true });
        ring(h.x, h.y, 'rgba(244,114,182,.85)', { s: 6, grow: 330, decay: 1.1, w: 7, add: true });
        burst(h.x, h.y, 30, (i, a) => { const v = rand(120, 460); return { kind: 'glow', x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.2, s: rand(1, 2.6), decay: rand(0.5, 0.9), add: true, c: pick(['#FFFFFF', '#F9A8D4', '#93C5FD', '#FDE68A']) }; });
        for (const b of bodies) if (b.eaten === h) {
          const a = rand(0, TAU), v = rand(160, 380);
          b.x = h.x; b.y = h.y; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.eaten = null; b.scale = 0.25; b.vr += rand(-1, 1);
        }
        for (const L of layers) for (const s of L.stars) if (s.eaten === h) {
          const a = rand(0, TAU), v = rand(250, 700);
          s.x = h.x; s.y = h.y; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.eaten = null;
        }
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        tap(x, y) {
          if (holes.length >= 3) { explode(holes[0]); holes.shift(); }
          holes.push({ x, y, age: 0, life: 3.2, eaten: 0, spin: rand(0, TAU) });
          ring(x, y, 'rgba(167,139,250,.8)', { s: R(), grow: -R() * 1.4, decay: 1.6, w: 1.5, add: true });
          return true;
        },
        draw(dt, t) {
          ctx.fillStyle = '#05031A'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (const c of clouds) {
            const x = c.x + Math.sin(t * 0.05 + c.p) * 60, y = c.y + Math.cos(t * 0.04 + c.p) * 40;
            const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
            g.addColorStop(0, `hsla(${c.hue},80%,55%,.22)`); g.addColorStop(0.5, `hsla(${c.hue + 30},80%,45%,.08)`); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, c.r, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          const rad = R();
          for (const h of holes) h.age += dt;
          for (const L of layers) {
            for (const s of L.stars) {
              if (s.eaten) continue;
              let pulled = false;
              for (const h of holes) {
                const dx = s.x - h.x, dy = s.y - h.y, d = Math.hypot(dx, dy);
                if (d > rad || h.age > h.life) continue;
                pulled = true;
                const k = Math.min(1, h.age / 0.6) * (1 - d / rad);
                const a = Math.atan2(dy, dx) + (2.6 * k + 0.4) * dt * 3;   // swirl around…
                const nd = Math.max(0, d - (40 + 220 * k) * dt);        // …and fall in
                s.x = h.x + Math.cos(a) * nd; s.y = h.y + Math.sin(a) * nd;
                if (nd < 6) { s.eaten = h; h.eaten++; }
                break;
              }
              if (!pulled) {
                s.x += (s.vx - L.speed * 12) * dt; s.y += s.vy * dt;
                s.vx *= Math.max(0, 1 - dt * 1.4); s.vy *= Math.max(0, 1 - dt * 1.4);
                if (s.x < -2) { s.x = W + 2; s.y = rand(0, H); } else if (s.x > W + 2) s.x = -2;
                if (s.y < -2) s.y = H + 2; else if (s.y > H + 2) s.y = -2;
              }
              const fast = Math.abs(s.vx) + Math.abs(s.vy) > 120;
              ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
              ctx.fillStyle = '#F8FAFF';
              if (fast) { ctx.strokeStyle = '#F8FAFF'; ctx.lineWidth = s.r; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke(); }
              else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
            }
          }
          ctx.globalAlpha = 1;
          // galaxies and suns: they drift, and black holes drag them in too (spinning faster,
          // shrinking as they fall); a supernova throws them back out.
          for (const b of bodies) {
            if (b.eaten) continue;
            let pulled = null;
            for (const h of holes) {
              const d = Math.hypot(b.x - h.x, b.y - h.y);
              if (h.age > h.life || d > rad * 1.6) continue;
              pulled = h;
              const k = Math.min(1, h.age / 0.6) * (1 - d / (rad * 1.6));
              const a = Math.atan2(b.y - h.y, b.x - h.x) + (1.8 * k + 0.3) * dt * 2.4;
              const nd = Math.max(0, d - (30 + 170 * k) * dt);
              b.x = h.x + Math.cos(a) * nd; b.y = h.y + Math.sin(a) * nd;
              b.scale = Math.min(b.scale, Math.max(0.05, nd / (rad * 0.9)));
              b.rot += dt * (2 + 8 * k);
              if (nd < 8) { b.eaten = h; h.eaten += 6; ring(h.x, h.y, 'rgba(255,200,150,.8)', { s: 4, grow: 90, decay: 3, w: 2, add: true }); }
              break;
            }
            if (!pulled) {
              b.x += (b.vx - b.drift) * dt; b.y += b.vy * dt + Math.sin(t * 0.2 + b.p) * 3 * dt;
              b.vx *= Math.max(0, 1 - dt * 0.9); b.vy *= Math.max(0, 1 - dt * 0.9);
              b.scale = Math.min(1, b.scale + dt * 0.5); b.rot += b.vr * dt;
              const m = 80 * b.s;
              if (b.x < -m) Object.assign(b, newBody(b.kind, false), { x: W + m });
              else if (b.x > W + m * 2) b.x = -m;
              if (b.y < -m) b.y = H + m; else if (b.y > H + m) b.y = -m;
            }
            const n = (b.kind === 'galaxy' ? 140 : 110) * b.s * b.scale;
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = b.kind === 'sun' ? 0.85 + 0.15 * Math.sin(t * 3 + b.p) : 0.9;
            ctx.drawImage(b.spr, -n / 2, -n / 2, n, n);
            ctx.restore();
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          // the black holes
          toFront();
          for (const h of holes) {
            const grow = Math.min(1, h.age / 0.5), r = (12 + Math.min(14, h.eaten * 0.25)) * grow;
            h.spin += dt * 3;
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(h.x, h.y, r, h.x, h.y, r * 4);
            g.addColorStop(0, 'rgba(255,170,90,.75)'); g.addColorStop(0.35, 'rgba(244,114,182,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, r * 4, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,220,180,.8)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(h.x, h.y, r * 2.6, r * 0.8, h.spin * 0.15, 0, TAU); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,240,220,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h.x, h.y, r + 1, 0, TAU); ctx.stroke();
          }
          for (const h of holes) if (h.age > h.life) explode(h);
          holes = holes.filter((h) => h.age <= h.life);
          nextShot -= dt;
          if (!shoot && nextShot <= 0) { shoot = { x: rand(W * 0.3, W), y: rand(0, H * 0.4), vx: -rand(500, 800), vy: rand(200, 320), life: 1 }; nextShot = rand(3, 7); }
          if (shoot) {
            shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 1.2;
            const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 0.18, shoot.y - shoot.vy * 0.18);
            g.addColorStop(0, `rgba(255,255,255,${Math.max(0, shoot.life)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 0.18, shoot.y - shoot.vy * 0.18); ctx.stroke();
            if (shoot.life <= 0) shoot = null;
          }
        },
      };
    },

    // Retro neon: striped sun, mountains and a grid racing toward you. It's a drive: a dashboard in
    // the corner counts how far you've gone. Tap for a turbo boost (stack taps to go faster); every
    // kilometre pops up, and your longest drive is remembered.
    synthwave() {
      const CRUISE = 0, MAX = 600;
      let lastTap = -9, tapCombo = 0, clock = 0;
      let posts = 0;
      let speed = 0, trip = 0, pos = 0, sunPulse = 0, nextKm = 1, flash = 0, best = 0, odo = 0, saveT = 0;
      try { best = Number(localStorage.getItem('sliver.synth.best')) || 0; odo = Number(localStorage.getItem('sliver.synth.odo')) || 0; } catch {}
      const save = () => { try { localStorage.setItem('sliver.synth.best', String(best)); localStorage.setItem('sliver.synth.odo', String(odo)); } catch {} };
      let pops = []; // "1 KM!" style pop-ups
      function hud() {
        const pad = 18, w = 210, h = 92, x = pad, y = H - h - pad;
        ctx.fillStyle = 'rgba(10,0,30,.62)'; ctx.strokeStyle = 'rgba(255,46,151,.85)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 12) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        ctx.fillStyle = '#22D3EE'; ctx.font = '700 11px ui-monospace, Menlo, monospace'; ctx.fillText('TRIP', x + 14, y + 22);
        ctx.fillStyle = '#FFE4F3'; ctx.font = '800 28px ui-monospace, Menlo, monospace'; ctx.fillText(`${trip.toFixed(2)} km`, x + 14, y + 50);
        // speed bar
        const k = (speed - CRUISE) / (MAX - CRUISE);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 14, y + 60, w - 28, 6);
        ctx.fillStyle = k > 0.6 ? '#FDE047' : '#FF2E97'; ctx.fillRect(x + 14, y + 60, (w - 28) * Math.max(0.04, k), 6);
        ctx.fillStyle = '#C4B5FD'; ctx.font = '700 11px ui-monospace, Menlo, monospace';
        ctx.fillText(speed < 1 ? 'TAP TO DRIVE ▸' : `${Math.round(speed)} km/h`, x + 14, y + 82);
        ctx.textAlign = 'right'; ctx.fillText(`BEST ${best.toFixed(1)} km`, x + w - 14, y + 82);
        ctx.textAlign = 'left';
      }
      return {
        hover: () => true,
        tap(x, y) {
          // tapping quickly builds up: each tap within half a second of the last adds more
          tapCombo = clock - lastTap < 0.5 ? Math.min(12, tapCombo + 1) : 1; lastTap = clock;
          speed = Math.min(MAX, speed + 25 + tapCombo * 9); sunPulse = 1;
          ring(x, y, '#FF2E97', { grow: 520, decay: 1.5, w: 3, add: true });
          ring(x, y, '#22D3EE', { grow: 340, decay: 1.5, w: 2, add: true });
          burst(x, y, 12, (i, a) => { const v = rand(200, 460); return { kind: 'streak', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2, s: 2, decay: 1.6, add: true, c: pick(['#FF2E97', '#22D3EE', '#FDE047']) }; });
          return true;
        },
        draw(dt, t) {
          // no taps = the car coasts and slows down to a stop
          clock += dt;
          speed = Math.max(0, speed - (18 + speed * 0.32) * dt);
          const km = (speed * dt) / 3600 * 3; // a sped-up world (3x), so the numbers move visibly
          trip += km; odo += km;
          if (trip > best) best = trip;
          if (trip >= nextKm) { pops.push({ text: `${nextKm} KM!`, life: 1 }); nextKm++; flash = 1; }
          saveT += dt; if (saveT > 3) { saveT = 0; save(); }
          sunPulse = Math.max(0, sunPulse - dt * 2); flash = Math.max(0, flash - dt * 2);
          pos += dt * speed / 38; // grid lines per second scale with your speed (300 km/h ≈ 8 a second)
          posts += dt * speed / 160;
          const horizon = H * 0.58;
          const rumble = speed > MAX * 0.6 ? (speed / MAX - 0.6) * 6 : 0;
          ctx.save(); if (rumble) ctx.translate(rand(-rumble, rumble), rand(-rumble, rumble));
          ctx.fillStyle = grad(0, horizon, [[0, '#0B0024'], [0.6, '#3B0764'], [1, '#9D174D']]);
          ctx.fillRect(0, 0, W, horizon);
          const r = Math.min(W, H) * 0.22 * (1 + sunPulse * 0.08), cx = W / 2, cy = horizon - r * 0.35;
          ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
          ctx.fillStyle = grad(cy - r, cy + r, [[0, '#FDE047'], [0.5, '#FB7185'], [1, '#C026D3']]);
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
          ctx.fillStyle = '#2A0550';
          for (let i = 0; i < 7; i++) {
            const k = ((i + (pos * 0.4) % 1) / 7);
            const y = cy + k * r, h = 2 + k * 9;
            if (y > cy) ctx.fillRect(cx - r, y, r * 2, h);
          }
          ctx.restore();
          glowDot(cx, cy, r * 1.8, 'rgba(251,113,133,.35)');
          ctx.fillStyle = '#1E0638'; ctx.strokeStyle = '#FF2E97'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(0, horizon);
          const peaks = [[0, 0.3], [0.08, 0.55], [0.17, 0.25], [0.27, 0.62], [0.36, 0.2], [0.64, 0.25], [0.72, 0.6], [0.82, 0.3], [0.9, 0.5], [1, 0.25]];
          for (const [px, ph] of peaks) ctx.lineTo(px * W, horizon - ph * H * 0.16);
          ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = grad(horizon, H, [[0, '#1A0033'], [1, '#05000F']]);
          ctx.fillRect(0, horizon, W, H - horizon);
          const fast = (speed - CRUISE) / (MAX - CRUISE);
          ctx.strokeStyle = fast > 0.5 ? 'rgba(253,224,71,.8)' : 'rgba(34,211,238,.75)'; ctx.lineWidth = 1.4;
          const sp = pos % 1;
          const blur = Math.min(1, speed / 360); // at speed, near lines smear into motion-blurred bands
          for (let i = 0; i < 18; i++) {
            const z = (i + 1 - sp) / 18;
            const y = horizon + Math.pow(z, 2.2) * (H - horizon);
            ctx.globalAlpha = Math.min(1, z * 1.6);
            ctx.lineWidth = 1.4 + blur * z * z * 10;
            if (blur > 0.05 && z > 0.4) ctx.globalAlpha *= 1 - blur * 0.45;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          }
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 1;
          for (let i = -16; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(cx + i * (W / 60), horizon); ctx.lineTo(cx + i * (W / 6), H); ctx.stroke(); }
          ctx.fillStyle = grad(horizon - 2, horizon + 30, [[0, 'rgba(255,46,151,.55)'], [1, 'rgba(255,46,151,0)']]);
          ctx.fillRect(0, horizon - 2, W, 32);
          // neon posts along both sides of the road whip past (they're what really sells the speed)
          for (let i = 0; i < 7; i++) {
            const z = ((i / 7) + posts) % 1, zz = Math.pow(z, 2.4);
            const y = horizon + zz * (H - horizon), hgt = 8 + zz * 190, off = 40 + zz * W * 0.62, w = 1.5 + zz * 9;
            const a = Math.min(1, z * 2.2);
            for (const d of [-1, 1]) {
              const x = cx + d * off;
              ctx.globalAlpha = a * 0.35; ctx.fillStyle = d < 0 ? '#22D3EE' : '#FF2E97'; ctx.fillRect(x - w * 1.6, y - hgt, w * 3.2, hgt);
              ctx.globalAlpha = a; ctx.fillRect(x - w / 2, y - hgt, w, hgt);
              ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - w / 4, y - hgt, w / 2, hgt * 0.9);
              if (blur > 0.3) { ctx.globalAlpha = a * blur * 0.35; ctx.fillStyle = d < 0 ? '#22D3EE' : '#FF2E97'; ctx.fillRect(x - w / 2 - d * w * 4 * blur, y - hgt, w * 4 * blur, hgt); }
            }
          }
          ctx.globalAlpha = 1;
          // speed lines at high speed
          if (fast > 0.2) {
            ctx.strokeStyle = `rgba(255,255,255,${fast * 0.35})`; ctx.lineWidth = 1; ctx.beginPath();
            for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + t * 0.3, r1 = Math.max(W, H) * (0.35 + ((t * 2 + i * 0.37) % 1) * 0.4); ctx.moveTo(cx + Math.cos(a) * r1, horizon + Math.sin(a) * r1 * 0.6); ctx.lineTo(cx + Math.cos(a) * (r1 + 60 * fast), horizon + Math.sin(a) * (r1 + 60 * fast) * 0.6); }
            ctx.stroke();
          }
          ctx.restore();
          if (flash) { ctx.fillStyle = `rgba(255,46,151,${flash * 0.12})`; ctx.fillRect(0, 0, W, H); }
          for (const p of pops) {
            p.life -= dt * 0.6;
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
            ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(30 + (1 - p.life) * 12)}px ui-monospace, Menlo, monospace`;
            ctx.fillStyle = '#FDE047'; ctx.fillText(p.text, 18 + 105, H - 92 - 34 - (1 - p.life) * 50); // just above the dashboard
            ctx.globalAlpha = 1; ctx.textAlign = 'left';
          }
          pops = pops.filter((p) => p.life > 0);
          hud();
        },
      };
    },

    // Forge: a glow at the bottom, embers rising. Forge-a-sword mini-game: a hot bar sits on an
    // anvil in a side lane with a ring closing in on it. Tap when the ring meets the gold target:
    // perfect strikes shape the blade fastest. Finish it and it's quenched into a sword.
    ember() {
      let embers = [], swords = 0, prog = 0, heat = 1, combo = 0, ringT = 0, hammer = 0, done = 0, flash = 0, label = null, now = 0;
      let forge = null, fade = 1, item = null, lastItem = -1;
      try { swords = Number(localStorage.getItem('sliver.ember.swords')) || 0; } catch {}
      // What gets made: a different piece each time (drawn lying on the anvil, centred on 0,0).
      const BROWN = '#5B3A1E', GOLD = '#D4AF37', STEEL = '#D9DEE7';
      const poly = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); };
      const ITEMS = [
        { name: 'SWORD', draw(c, f) { ctx.fillStyle = f ? BROWN : c; ctx.fillRect(-92, -5, 30, 10); ctx.fillStyle = f ? GOLD : c; ctx.fillRect(-64, -16, 7, 32); ctx.beginPath(); ctx.arc(-94, 0, 6, 0, TAU); ctx.fill(); ctx.fillStyle = f ? STEEL : c; poly([[-57, -6], [66, -4], [86, 0], [66, 4], [-57, 6]]); } },
        { name: 'DAGGER', draw(c, f) { ctx.fillStyle = f ? BROWN : c; ctx.fillRect(-52, -5, 22, 10); ctx.fillStyle = f ? GOLD : c; ctx.fillRect(-32, -12, 6, 24); ctx.fillStyle = f ? STEEL : c; poly([[-26, -7], [30, -5], [48, 0], [30, 5], [-26, 7]]); } },
        { name: 'AXE', draw(c, f) { ctx.fillStyle = f ? BROWN : c; ctx.fillRect(-80, -4, 130, 8); ctx.fillStyle = f ? STEEL : c; ctx.beginPath(); ctx.moveTo(30, -10); ctx.quadraticCurveTo(52, -40, 70, -38); ctx.quadraticCurveTo(58, 0, 70, 38); ctx.quadraticCurveTo(52, 40, 30, 10); ctx.closePath(); ctx.fill(); } },
        { name: 'HORSESHOE', draw(c, f) { ctx.strokeStyle = f ? STEEL : c; ctx.lineWidth = 15; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(0, 6, 32, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < 6; i++) { const a = Math.PI * (0.92 + i * 0.24); ctx.beginPath(); ctx.arc(Math.cos(a) * 32, 6 + Math.sin(a) * 32, 2, 0, TAU); ctx.fill(); } } },
        { name: 'SHIELD', draw(c, f) { ctx.fillStyle = f ? STEEL : c; ctx.beginPath(); ctx.moveTo(-34, -34); ctx.lineTo(34, -34); ctx.lineTo(34, 2); ctx.quadraticCurveTo(30, 28, 0, 40); ctx.quadraticCurveTo(-30, 28, -34, 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = f ? GOLD : 'rgba(0,0,0,.3)'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = f ? GOLD : 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, -2, 9, 0, TAU); ctx.fill(); } },
        { name: 'HAMMER', draw(c, f) { ctx.fillStyle = f ? BROWN : c; ctx.fillRect(-70, -4, 110, 8); ctx.fillStyle = f ? STEEL : c; ctx.fillRect(34, -20, 30, 40); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(34, -20, 30, 5); } },
        { name: 'KEY', draw(c, f) { const k = f ? GOLD : c; ctx.strokeStyle = k; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(-50, 0, 16, 0, TAU); ctx.stroke(); ctx.fillStyle = k; ctx.fillRect(-34, -4, 90, 8); ctx.fillRect(38, 4, 7, 14); ctx.fillRect(50, 4, 6, 10); } },
        { name: 'CROWN', draw(c, f) { ctx.fillStyle = f ? GOLD : c; poly([[-44, 22], [44, 22], [44, -6], [24, 8], [10, -24], [0, 4], [-10, -24], [-24, 8], [-44, -6]]); if (f) { for (const [x, col] of [[-22, '#E11D48'], [0, '#2563EB'], [22, '#16A34A']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, 14, 4, 0, TAU); ctx.fill(); } } } },
        { name: 'ANCHOR', draw(c, f) { const k = f ? STEEL : c; ctx.strokeStyle = k; ctx.fillStyle = k; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(44, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(-58, 0, 8, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-34, -18); ctx.lineTo(-34, 18); ctx.stroke(); ctx.beginPath(); ctx.arc(30, 0, 30, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke(); poly([[30, -36], [22, -24], [38, -24]]); poly([[30, 36], [22, 24], [38, 24]]); } },
      ];
      function nextItem() { let i; do { i = Math.floor(Math.random() * ITEMS.length); } while (i === lastItem && ITEMS.length > 1); lastItem = i; item = ITEMS[i]; }
      // The forge sets up somewhere new after every piece (side lanes on wide screens).
      function moveForge() {
        const g = lanes();
        if (g) { const left = Math.random() < 0.5, cx = left ? g / 2 : W - g / 2; forge = { x: cx + rand(-g * 0.12, g * 0.12), y: rand(H * 0.32, H * 0.72) }; }
        else forge = { x: rand(110, Math.max(111, W - 110)), y: rand(H * 0.55, H - 150) };
      }
      const ember = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + rand(0, 40), r: rand(0.8, 2.6), vy: rand(40, 120), sway: rand(10, 40), p: rand(0, TAU), hot: Math.random() < 0.15 });
      const reset = () => { embers = Array.from({ length: Math.round(80 * density()) }, () => ember(true)); moveForge(); if (!item) nextItem(); };
      // Where the anvil stands: centred in the right lane on wide screens, bottom corner on phones.
      const spot = () => { if (!forge) moveForge(); return forge; };
      const R0 = 84, TARGET = 24;
      const period = () => Math.max(0.6, 1.2 - combo * 0.05);
      const ringR = () => R0 * Math.max(0, 1 - ringT / period());
      const metal = (h) => h > 0.75 ? '#FFE7A3' : h > 0.5 ? '#FDBA74' : h > 0.3 ? '#F97316' : h > 0.15 ? '#9A3412' : '#6B7280';
      function say(text, c) { label = { text, c, life: 1 }; }
      function strike(auto) {
        if (done || fade < 1) return;
        hammer = 1;
        const S = spot(), r = ringR(), d = Math.abs(r - TARGET);
        const hx = S.x, hy = S.y - 18;
        let q = auto ? 'perfect' : d <= 5 ? 'perfect' : d <= 13 ? 'good' : 'miss';
        if (heat < 0.2 && !auto) q = 'cold';
        if (q === 'perfect' || q === 'good') {
          combo++; prog = Math.min(1, prog + (q === 'perfect' ? 0.2 : 0.11)); heat = Math.max(0.15, heat - 0.05); flash = q === 'perfect' ? 1 : 0.5;
          const n = q === 'perfect' ? 34 : 16;
          burst(hx, hy, n, () => { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(220, q === 'perfect' ? 640 : 420); return { kind: 'streak', x: hx + rand(-20, 20), y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, s: rand(1.2, 2.4), decay: rand(0.8, 1.4), add: true, c: pick(['#FFE7A3', '#FDBA74', '#FB923C', '#FFFFFF']) }; });
          ring(hx, hy, 'rgba(255,220,150,.95)', { s: 6, grow: q === 'perfect' ? 320 : 180, decay: 3, w: q === 'perfect' ? 3 : 2, add: true });
          say(auto ? '♪ ON THE BEAT' : q === 'perfect' ? `PERFECT!${combo > 1 ? ` ×${combo}` : ''}` : 'GOOD', q === 'perfect' ? '#FFE7A3' : '#FDBA74');
        } else {
          combo = 0; heat = Math.max(0, heat - 0.12);
          burst(hx, hy, 5, () => ({ kind: 'streak', x: hx, y: hy, vx: rand(-120, 120), vy: -rand(40, 140), g: 900, s: 1, decay: 2.5, add: true, c: '#9CA3AF' }));
          say(q === 'cold' ? 'Too cold! Reheating…' : 'MISS', '#9CA3AF');
        }
        ringT = 0;
        if (prog >= 1) {
          done = now; swords++;
          try { localStorage.setItem('sliver.ember.swords', String(swords)); } catch {}
          burst(hx, hy, 22, () => ({ kind: 'glow', x: hx + rand(-60, 60), y: hy + rand(-6, 6), vx: rand(-30, 30), vy: -rand(40, 110), drag: 0.8, s: rand(6, 12), decay: 0.6, c: 'rgba(230,230,235,.35)' })); // steam
          say(`${item.name} FORGED!`, '#F5E6A8');
        }
      }
      function anvil(x, y) {
        ctx.fillStyle = '#26262B'; ctx.strokeStyle = 'rgba(255,140,60,.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 70, y); ctx.lineTo(x + 46, y); ctx.quadraticCurveTo(x + 90, y + 2, x + 104, y - 10); ctx.quadraticCurveTo(x + 80, y + 16, x + 50, y + 18);
        ctx.lineTo(x + 30, y + 22); ctx.lineTo(x + 26, y + 46); ctx.lineTo(x + 50, y + 62); ctx.lineTo(x - 70, y + 62); ctx.lineTo(x - 46, y + 46); ctx.lineTo(x - 50, y + 22); ctx.lineTo(x - 70, y + 16); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x - 68, y + 1, 112, 4);
      }
      // The bar fades out as the piece takes shape; finished pieces are polished steel/gold.
      function piece(x, y, p, h, finished) {
        const col = finished ? STEEL : metal(h);
        if (!finished && h > 0.3) { ctx.globalCompositeOperation = 'lighter'; glowDot(x, y, 90, 'rgba(249,115,22,.35)', h); ctx.globalCompositeOperation = 'source-over'; }
        if (!finished && p < 1) { ctx.globalAlpha = fade * (1 - p); ctx.fillStyle = col; ctx.fillRect(x - 36, y - 11, 72, 22); }
        ctx.save(); ctx.translate(x, y); ctx.scale(0.75 + 0.25 * p, 0.75 + 0.25 * p);
        ctx.globalAlpha = fade * (finished ? 1 : Math.min(1, 0.15 + p));
        item.draw(col, finished);
        ctx.restore(); ctx.globalAlpha = fade;
      }
      function blade(x, y, p, h, finished) {
        const L = 70 + p * 100, th = 22 - p * 11, tip = p * 26, x0 = x - L / 2;
        if (finished) { // grip + crossguard
          ctx.fillStyle = '#5B3A1E'; ctx.fillRect(x0 - 34, y - 5, 30, 10);
          ctx.fillStyle = '#D4AF37'; ctx.fillRect(x0 - 6, y - 16, 7, 32); ctx.beginPath(); ctx.arc(x0 - 36, y, 6, 0, TAU); ctx.fill();
        }
        const col = finished ? '#D9DEE7' : metal(h);
        if (!finished && h > 0.3) { ctx.globalCompositeOperation = 'lighter'; glowDot(x, y, L * 0.7, 'rgba(249,115,22,.35)', h); ctx.globalCompositeOperation = 'source-over'; }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x0, y - th / 2); ctx.lineTo(x0 + L, y - th / 2 + tip * 0.15); ctx.lineTo(x0 + L + tip, y); ctx.lineTo(x0 + L, y + th / 2 - tip * 0.15); ctx.lineTo(x0, y + th / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = finished ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.25)'; ctx.fillRect(x0 + 4, y - 1, L - 8, 2); // fuller / shine
      }
      function hammerDraw(x, y) {
        const swing = hammer > 0 ? Math.max(0, hammer - 0.6) / 0.4 : 1; // 1 = raised, 0 = down
        const ang = -1.1 * swing;
        ctx.save(); ctx.translate(x + 70, y - 70); ctx.rotate(ang);
        ctx.fillStyle = '#6B4423'; ctx.fillRect(-60, -3, 64, 6);
        ctx.fillStyle = '#3F3F46'; ctx.fillRect(-74, -12, 20, 24);
        ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(-74, -12, 20, 4);
        ctx.restore();
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        tap() { strike(); return true; },
        info: () => ({ item: item && item.name, forge, prog, forged: swords }),
        draw(dt, t) {
          now = t;
          hammer = Math.max(0, hammer - dt * 5); flash = Math.max(0, flash - dt * 3);
          if (!done) ringT = (ringT + dt) % period();
          heat = Math.min(1, heat + dt * (heat < 0.2 ? 0.25 : 0.02)); // cold metal reheats in the forge
          // after a finished piece: the forge fades out, moves somewhere new and starts the next one
          if (done && now - done > 2.4) { fade = Math.max(0, fade - dt * 3); if (!fade) { done = 0; prog = 0; heat = 1; combo = 0; ringT = 0; moveForge(); nextItem(); } }
          else if (!done && fade < 1) fade = Math.min(1, fade + dt * 3);
          ctx.fillStyle = grad(0, H, [[0, '#0A0503'], [0.65, '#1C0D06'], [1, '#3A1405']]);
          ctx.fillRect(0, 0, W, H);
          const pulse = 0.85 + 0.15 * Math.sin(t * 2.3) + flash * 0.25;
          glowDot(W / 2, H + 80, Math.max(W, H) * 0.75 * pulse, 'rgba(249,115,22,.55)');
          glowDot(W * 0.2, H + 40, W * 0.35, 'rgba(234,88,12,.35)');
          glowDot(W * 0.8, H + 40, W * 0.35, 'rgba(251,191,36,.25)');
          ctx.globalCompositeOperation = 'lighter';
          for (const e of embers) {
            e.y -= e.vy * dt; e.x += Math.sin(t * 2 + e.p) * e.sway * dt;
            if (e.y < -10) Object.assign(e, ember(false));
            const k = e.y / H, a = Math.max(0, Math.min(1, k * 1.4)) * (0.6 + 0.4 * Math.sin(t * 15 + e.p));
            ctx.fillStyle = e.hot ? `rgba(255,236,170,${a})` : `rgba(255,${Math.round(110 + 80 * k)},40,${a})`;
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.4, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          toFront();
          const S = spot();
          ctx.globalAlpha = fade; ctx.save(); ctx.globalAlpha = fade;
          anvil(S.x, S.y);
          piece(S.x, S.y - 30, prog, heat, !!done);
          hammerDraw(S.x, S.y);
          if (!done) { // the timing rings
            const r = ringR(), near = Math.abs(r - TARGET) <= 5;
            ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(245,215,122,.9)'; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(S.x, S.y - 18, TARGET, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
            ctx.strokeStyle = near ? '#FFFFFF' : 'rgba(255,170,90,.95)'; ctx.lineWidth = near ? 4 : 3;
            ctx.beginPath(); ctx.arc(S.x, S.y - 18, Math.max(1, r), 0, TAU); ctx.stroke();
          }
          // progress bar under the anvil
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(S.x - 60, S.y + 74, 120, 7);
          ctx.fillStyle = '#F5D77A'; ctx.fillRect(S.x - 60, S.y + 74, 120 * prog, 7);
          ctx.restore(); ctx.globalAlpha = 1;
          if (label) {
            label.life -= dt * 0.9;
            ctx.globalAlpha = Math.max(0, Math.min(1, label.life * 2)); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.font = '900 18px ui-monospace, Menlo, monospace'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(label.text, S.x + 1, S.y - 118 - (1 - label.life) * 20 + 1);
            ctx.fillStyle = label.c; ctx.fillText(label.text, S.x, S.y - 118 - (1 - label.life) * 20);
            ctx.globalAlpha = 1; ctx.textAlign = 'left';
            if (label.life <= 0) label = null;
          }
          ctx.font = '700 12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(20,8,4,.6)'; ctx.fillRect(14, H - 40, 220, 26);
          ctx.fillStyle = '#FFE7A3'; ctx.fillText(`⚒ ${swords} forged${combo > 1 ? `   combo ×${combo}` : '   tap on the ring'}`, 24, H - 22);
          toBack();
        },
      };
    },

    // Storm: driving rain, splashes, and lightning that lights up the whole screen.
    storm() {
      let drops = [], splashes = [], bolt = null, flash = 0, next = 2.5;
      const drop = (any) => ({ x: rand(-100, W + 100), y: any ? rand(-H, H) : rand(-120, -10), l: rand(12, 28), v: rand(700, 1100) });
      const reset = () => { drops = Array.from({ length: Math.round(220 * density()) }, () => drop(true)); };
      function makeBolt(tx, ty) {
        const pts = [[tx !== undefined ? tx + rand(-120, 120) : rand(W * 0.15, W * 0.85), 0]];
        const end = ty !== undefined ? ty : H * rand(0.45, 0.8);
        while (pts[pts.length - 1][1] < end) {
          const [x, y] = pts[pts.length - 1];
          // steer toward the tap point if there is one
          const pull = tx !== undefined ? (tx - x) / Math.max(1, (end - y) / 40) : 0;
          pts.push([x + rand(-40, 40) + pull, Math.min(end, y + rand(25, 60))]);
        }
        if (tx !== undefined) pts[pts.length - 1] = [tx, ty];
        const forks = [];
        for (let i = 2; i < pts.length - 2; i += 3) if (Math.random() < 0.5) {
          const f = [pts[i]];
          for (let k = 0; k < 4; k++) { const [x, y] = f[f.length - 1]; f.push([x + rand(-50, 50), y + rand(20, 45)]); }
          forks.push(f);
        }
        return { pts, forks, life: 0.35 };
      }
      function strike(b) {
        bolt = b; flash = 1;
        document.documentElement.classList.add('fx-flash');
        setTimeout(() => document.documentElement.classList.remove('fx-flash'), 140);
      }
      let lastTap = 0;
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap: lightning strikes right where you tapped, with a burst of sparks.
        tap(x, y) {
          const nowS = performance.now();
          if (nowS - lastTap < 120) return true; // one bolt at a time
          lastTap = nowS;
          strike(makeBolt(x, y)); next = Math.max(next, 2.5);
          burst(x, y, 14, (i, a) => { const v = rand(120, 320); return { kind: 'streak', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 700, s: 1.5, decay: 2, add: true, c: pick(['#E0F2FE', '#BAE6FD', '#FFFFFF']) }; });
          ring(x, y, 'rgba(186,230,253,.9)', { grow: 240, decay: 3, w: 2, add: true });
          return true;
        },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#050913'], [0.5, '#0B1220'], [1, '#111B2E']]);
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < 4; i++) glowDot(W * (i / 3) + Math.sin(t * 0.1 + i) * 80, 0, W * 0.4, 'rgba(71,85,105,.35)'); // clouds
          next -= dt;
          if (next <= 0) {
            strike(makeBolt()); next = rand(3, 8);
          }
          if (flash > 0) { ctx.fillStyle = `rgba(200,225,255,${flash * 0.35})`; ctx.fillRect(0, 0, W, H); flash -= dt * 3; }
          if (bolt) {
            const a = Math.max(0, bolt.life / 0.35) * (Math.random() < 0.2 ? 0.4 : 1);
            const line = (pts, w) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y); ctx.lineWidth = w; ctx.stroke(); };
            ctx.strokeStyle = `rgba(186,230,253,${a * 0.35})`; line(bolt.pts, 10); for (const f of bolt.forks) line(f, 5);
            ctx.strokeStyle = `rgba(255,255,255,${a})`; line(bolt.pts, 2.4); for (const f of bolt.forks) line(f, 1.2);
            bolt.life -= dt; if (bolt.life <= 0) bolt = null;
          }
          ctx.strokeStyle = 'rgba(170,200,230,.45)'; ctx.lineWidth = 1.1; ctx.beginPath();
          for (const d of drops) {
            d.y += d.v * dt; d.x -= d.v * 0.18 * dt;
            if (d.y > H) { if (Math.random() < 0.3) splashes.push({ x: d.x, y: H - rand(0, 6), life: 0.25 }); Object.assign(d, drop(false)); }
            ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(170,200,230,.5)';
          splashes = splashes.filter((s) => (s.life -= dt) > 0);
          for (const s of splashes) { const k = 1 - s.life / 0.25; ctx.beginPath(); ctx.ellipse(s.x, s.y, 2 + k * 8, 1 + k * 2, 0, Math.PI, TAU); ctx.stroke(); }
        },
      };
    },

    // Black marble with gold veins and drifting gold dust. Gold Rush: coins, diamonds and black
    // bombs fall. Tap coins and diamonds to bank them (each catch in a row raises your combo);
    // a coin that hits the floor or a tapped bomb resets the combo. Your bank is remembered.
    blackgold() {
      let now = 0, resetArm = 0;
      let marble = null, dust = [], items = [], flyers = [], spawnT = 1, combo = 1, streak = 0, bank = 0, best = 0, shake = 0, msg = null;
      try { bank = Number(localStorage.getItem('sliver.gold.bank')) || 0; best = Number(localStorage.getItem('sliver.gold.best')) || 0; } catch {}
      const save = () => { try { localStorage.setItem('sliver.gold.bank', String(bank)); localStorage.setItem('sliver.gold.best', String(best)); } catch {} };
      // Crisp sprites, drawn once at 2x and reused (no per-frame gradients).
      function sprite(size, paint) { const c = document.createElement('canvas'); c.width = c.height = size * 2; const g = c.getContext('2d'); g.scale(2, 2); paint(g, size); return c; }
      const COIN = sprite(48, (g, n) => {
        const r = n / 2 - 2, cx = n / 2, cy = n / 2;
        const rim = g.createLinearGradient(0, 0, n, n); rim.addColorStop(0, '#FFF0B3'); rim.addColorStop(0.5, '#D4AF37'); rim.addColorStop(1, '#8C6A1C');
        g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
        const face = g.createLinearGradient(0, 0, n, n); face.addColorStop(0, '#FFE58A'); face.addColorStop(1, '#C9971F');
        g.fillStyle = face; g.beginPath(); g.arc(cx, cy, r * 0.8, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(120,85,10,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r * 0.8, 0, TAU); g.stroke();
        g.fillStyle = '#8C6A1C'; g.font = `900 ${Math.round(r * 1.05)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', cx, cy + 1);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.18, r * 0.32, -0.6, 0, TAU); g.fill();
      });
      const GEM = sprite(48, (g, n) => {
        const cx = n / 2;
        const f = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
        f([[cx - 18, 16], [cx - 10, 7], [cx + 10, 7], [cx + 18, 16], [cx, 42]], '#9EE7FF');
        f([[cx - 10, 7], [cx, 16], [cx + 10, 7]], '#E8FBFF');
        f([[cx - 18, 16], [cx, 16], [cx, 42]], '#5CC8F0');
        f([[cx, 16], [cx + 18, 16], [cx, 42]], '#B9F0FF');
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 18, 16); g.lineTo(cx + 18, 16); g.stroke();
      });
      const BOMB = sprite(48, (g, n) => {
        const cx = n / 2, cy = n / 2 + 3, r = 15;
        g.fillStyle = '#1A1A1E'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
        g.strokeStyle = '#D4AF37'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#2E2E36'; g.fillRect(cx - 4, cy - r - 4, 8, 6);
        g.strokeStyle = '#B08A3A'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - r - 4); g.quadraticCurveTo(cx + 8, cy - r - 12, cx + 12, cy - r - 8); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(cx - 5, cy - 6, 4, 6, -0.5, 0, TAU); g.fill();
      });
      function paintMarble() {
        marble = document.createElement('canvas');
        marble.width = Math.round(W * DPR); marble.height = Math.round(H * DPR);
        const m = marble.getContext('2d');
        m.scale(DPR, DPR);
        m.fillStyle = '#0A0A0A'; m.fillRect(0, 0, W, H);
        for (let i = 0; i < 26; i++) {
          let x = rand(-100, W), y = rand(-100, H);
          const gold = i % 4 === 0;
          m.strokeStyle = gold ? `rgba(212,175,55,${rand(0.15, 0.35)})` : `rgba(255,255,255,${rand(0.03, 0.08)})`;
          m.lineWidth = gold ? rand(0.6, 1.6) : rand(0.5, 3);
          m.beginPath(); m.moveTo(x, y);
          for (let k = 0; k < 8; k++) { const nx = x + rand(40, 160), ny = y + rand(-60, 90); m.quadraticCurveTo(x + rand(-40, 80), y + rand(-40, 60), nx, ny); x = nx; y = ny; }
          m.stroke();
        }
      }
      const reset = () => { paintMarble(); dust = Array.from({ length: Math.round(60 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 2), vx: rand(-6, 6), vy: rand(-10, -3), p: rand(0, TAU), v: rand(1, 3) })); };
      function spawn() {
        const roll = Math.random();
        const kind = roll < 0.12 ? 'gem' : roll < 0.27 ? 'bomb' : 'coin';
        const speed = (kind === 'gem' ? 1.35 : 1) * (120 + Math.min(260, streak * 9));
        const x = sideX(40), [lo, hi] = laneOf(x, 30);
        items.push({ kind, x, lo, hi, y: -30, vy: speed * rand(0.85, 1.15), vx: rand(-20, 20), rot: rand(0, TAU), vr: rand(2, 5) * (Math.random() < 0.5 ? -1 : 1), s: kind === 'gem' ? 1 : rand(0.85, 1.1) });
      }
      const hudX = 14, hudY = () => H - 74;
      function popText(text, x, y, c) { msg = { text, x, y, c, life: 1 }; }
      reset();
      return {
        resize: reset,
        hover: () => true,
        tap(x, y) {
          const y0 = hudY(); // ↺ reset button on the bank (tap twice to confirm)
          if (x > hudX + 228 && x < hudX + 262 && y > y0 + 13 && y < y0 + 47) {
            if (resetArm && now - resetArm < 2.5) { bank = 0; streak = 0; combo = 1; save(); resetArm = 0; popText('Bank reset', hudX + 120, y0, '#F5E6A8'); }
            else { resetArm = now; popText('Tap ↺ again to reset', hudX + 120, y0, '#F5E6A8'); }
            return true;
          }
          let hit = null, bestD = 1e9;
          for (const it of items) { const d = Math.hypot(x - it.x, y - it.y); if (d < 34 * it.s && d < bestD) { hit = it; bestD = d; } }
          if (!hit) { burst(x, y, 5, () => ({ kind: 'star', x: x + rand(-14, 14), y: y + rand(-14, 14), s: rand(3, 6), decay: 2, c: '#FFF3C4' })); return true; }
          items = items.filter((i) => i !== hit);
          if (hit.kind === 'bomb') {
            shake = 1; combo = 1; streak = 0;
            const lost = Math.floor(bank / 2); bank -= lost; save(); // half your money blown away
            for (let i = 0; i < Math.min(14, 2 + lost / 400); i++) flyers.push({ kind: 'coin', blown: true, x: hudX + 26, y: hudY() + 24, vx: rand(-260, 260), vy: -rand(300, 600), k: 0 });
            ring(hit.x, hit.y, 'rgba(255,200,120,.95)', { grow: 300, decay: 2.2, w: 4, add: true });
            burst(hit.x, hit.y, 22, (i, a) => ({ kind: 'streak', x: hit.x, y: hit.y, vx: Math.cos(a) * rand(150, 380), vy: Math.sin(a) * rand(150, 380), drag: 2, s: 2, decay: 1.6, add: true, c: pick(['#FFB347', '#FF6B3D', '#FFF1B8']) }));
            popText(lost ? `BOOM! −$${lost.toLocaleString()}` : 'BOOM!', hit.x, hit.y, '#FF8A5C');
            return true;
          }
          streak++; combo = Math.min(10, 1 + Math.floor(streak / 4));
          const worth = (hit.kind === 'gem' ? 500 : 100) * combo;
          bank += worth; if (bank > best) best = bank; save();
          flyers.push({ kind: hit.kind, x: hit.x, y: hit.y, sx: hit.x, sy: hit.y, k: 0 });
          burst(hit.x, hit.y, 10, () => ({ kind: 'star', x: hit.x + rand(-18, 18), y: hit.y + rand(-18, 18), s: rand(3, 7), decay: 1.8, c: hit.kind === 'gem' ? '#E8FBFF' : '#FFF3C4' }));
          popText(`+$${worth.toLocaleString()}${combo > 1 ? `  ×${combo}` : ''}`, hit.x, hit.y, hit.kind === 'gem' ? '#B9F0FF' : '#F5D77A');
          return true;
        },
        draw(dt, t) {
          now = t;
          shake = Math.max(0, shake - dt * 3);
          const sx = shake ? rand(-6, 6) * shake : 0, sy = shake ? rand(-6, 6) * shake : 0;
          ctx.drawImage(marble, sx, sy, W, H);
          const sweep = ((t * 0.12) % 1.6) - 0.3, swx = sweep * (W + H);
          const g = ctx.createLinearGradient(swx - 220, 0, swx + 220, H * 0.6);
          g.addColorStop(0, 'rgba(245,230,168,0)'); g.addColorStop(0.5, 'rgba(245,230,168,.07)'); g.addColorStop(1, 'rgba(245,230,168,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(232,196,90,.7)';
          for (const d of dust) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.y < -5) { d.y = H + 5; d.x = rand(0, W); } ctx.globalAlpha = 0.25 + 0.6 * Math.pow(Math.abs(Math.sin(t * d.v + d.p)), 3); ctx.fillRect(d.x, d.y, d.r, d.r); }
          ctx.globalAlpha = 1;
          // falling loot
          toFront();
          spawnT -= dt;
          if (spawnT <= 0 && items.length < 14) { spawn(); spawnT = Math.max(0.35, 1.1 - streak * 0.02) * rand(0.7, 1.3); }
          for (const it of items) {
            it.y += it.vy * dt; it.x += it.vx * dt; it.rot += it.vr * dt;
            if (it.x < it.lo || it.x > it.hi) it.vx *= -1;
            const sp = it.kind === 'coin' ? COIN : it.kind === 'gem' ? GEM : BOMB, n = 48 * it.s;
            ctx.save(); ctx.translate(it.x, it.y);
            if (it.kind === 'coin') ctx.scale(Math.max(0.12, Math.abs(Math.cos(it.rot))), 1); else ctx.rotate(Math.sin(it.rot) * 0.25);
            if (it.kind === 'gem') { ctx.globalCompositeOperation = 'lighter'; glowDot(0, 0, 30, 'rgba(158,231,255,.35)'); ctx.globalCompositeOperation = 'source-over'; }
            ctx.drawImage(sp, -n / 2, -n / 2, n, n);
            if (it.kind === 'bomb') { const fl = 0.6 + 0.4 * Math.sin(t * 30); ctx.fillStyle = `rgba(255,${180 + 60 * fl},80,${fl})`; ctx.beginPath(); ctx.arc(12 * it.s, -21 * it.s, 3, 0, TAU); ctx.fill(); }
            ctx.restore();
            if (it.y > H + 30) { it.gone = true; if (it.kind !== 'bomb') { if (streak) popText('Missed! Streak lost', it.x, H - 40, '#FF8A5C'); streak = 0; combo = 1; } }
          }
          items = items.filter((i) => !i.gone);
          // caught loot flies into the bank
          const tx = hudX + 26, ty = hudY() + 24;
          for (const f of flyers) {
            if (f.blown) { f.k += dt * 0.9; f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; ctx.globalAlpha = Math.max(0, 1 - f.k); ctx.drawImage(COIN, f.x - 14, f.y - 14, 28, 28); ctx.globalAlpha = 1; continue; }
            f.k += dt * 2.4; const k = Math.min(1, f.k), e = k * k;
            f.x = f.sx + (tx - f.sx) * e; f.y = f.sy + (ty - f.sy) * e - Math.sin(k * Math.PI) * 60;
            const n = 40 * (1 - k * 0.6);
            ctx.drawImage(f.kind === 'gem' ? GEM : COIN, f.x - n / 2, f.y - n / 2, n, n);
          }
          flyers = flyers.filter((f) => f.k < 1);
          if (msg) {
            msg.life -= dt * 1.2;
            ctx.globalAlpha = Math.max(0, Math.min(1, msg.life * 2)); ctx.fillStyle = msg.c; ctx.textAlign = 'center';
            ctx.font = '800 18px Georgia, serif'; ctx.fillText(msg.text, msg.x, msg.y - 30 - (1 - msg.life) * 40);
            ctx.globalAlpha = 1; ctx.textAlign = 'left';
            if (msg.life <= 0) msg = null;
          }
          // the bank
          const y0 = hudY();
          ctx.fillStyle = 'rgba(10,9,6,.72)'; ctx.strokeStyle = 'rgba(212,175,55,.75)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(hudX, y0, 220, 60, 12) : ctx.rect(hudX, y0, 220, 60); ctx.fill(); ctx.stroke();
          ctx.drawImage(COIN, hudX + 10, y0 + 8, 32, 32);
          ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
          ctx.fillStyle = '#F5E6A8'; ctx.font = '800 22px Georgia, serif'; ctx.fillText(`$${bank.toLocaleString()}`, hudX + 50, y0 + 32);
          ctx.fillStyle = combo > 1 ? '#FDE68A' : 'rgba(245,230,168,.6)'; ctx.font = '700 11px ui-monospace, Menlo, monospace';
          ctx.fillText(combo > 1 ? `COMBO ×${combo}` : 'TAP THE GOLD', hudX + 50, y0 + 50);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(245,230,168,.6)'; ctx.fillText(`streak ${streak}`, hudX + 208, y0 + 50); ctx.textAlign = 'left';
          // reset button
          const armed = resetArm && t - resetArm < 2.5;
          ctx.fillStyle = armed ? 'rgba(255,138,92,.9)' : 'rgba(10,9,6,.72)'; ctx.strokeStyle = 'rgba(212,175,55,.75)';
          ctx.beginPath(); ctx.arc(hudX + 245, y0 + 30, 16, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#F5E6A8'; ctx.font = '700 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('↺', hudX + 245, y0 + 31); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        },
      };
    },

    // Grand piano: a keyboard along the bottom whose keys light up with the music that's playing
    // (read live from the game's audio), and glowing notes rising off them. When nothing is
    // playing, it noodles a soft melody by itself.
    piano() {
      const LO = 48, HI = 95; // C3..B6
      const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);
      const keys = [];
      let kbH = 0, kbY = 0, whiteW = 0, bars = [], dust = [], idleT = 0, idleStep = 0;
      const IDLE = [72, 76, 79, 84, 81, 79, 76, 74, 72, 67, 69, 72, 76, 74, 71, 67];
      const reset = () => {
        kbH = Math.max(70, Math.min(140, H * 0.16));
        kbY = H - kbH;
        const whites = [];
        for (let m = LO; m <= HI; m++) if (!isBlack(m)) whites.push(m);
        whiteW = W / whites.length;
        keys.length = 0;
        for (let m = LO; m <= HI; m++) {
          const black = isBlack(m);
          const wi = whites.indexOf(black ? m - 1 : m);
          const x = black ? (wi + 1) * whiteW - whiteW * 0.31 : wi * whiteW;
          keys.push({ m, black, x, w: black ? whiteW * 0.62 : whiteW, glow: 0, held: false, off: 0, last: -9, col: hue(m), f: 440 * Math.pow(2, (m - 69) / 12) });
        }
        dust = Array.from({ length: Math.round(40 * density()) }, () => ({ x: rand(0, W), y: rand(0, kbY), r: rand(0.6, 1.8), v: rand(4, 14), p: rand(0, TAU) }));
        // The keyboard itself is drawn once (white keys, then black keys on a see-through layer)
        // and reused every frame; only lit keys are drawn on top. Much lighter than redrawing.
        const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(kbH * DPR); const g = c.getContext('2d'); g.scale(DPR, DPR); return [c, g]; };
        let g; [whiteLayer, g] = mk();
        const wg = g.createLinearGradient(0, 0, 0, kbH); wg.addColorStop(0, '#FFFDF6'); wg.addColorStop(1, '#E9E2D0');
        for (const k of keys) if (!k.black) { g.fillStyle = wg; g.fillRect(k.x + 0.5, 0, k.w - 1, kbH); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(k.x + k.w - 1, 0, 1, kbH); }
        [blackLayer, g] = mk();
        const bg2 = g.createLinearGradient(0, 0, 0, kbH * 0.62); bg2.addColorStop(0, '#2A2A30'); bg2.addColorStop(1, '#0B0B0E');
        for (const k of keys) if (k.black) { g.fillStyle = bg2; g.fillRect(k.x, 0, k.w, kbH * 0.62); }
        const sh = g.createLinearGradient(0, 0, 0, 14); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh; g.fillRect(0, 0, W, 14);
      };
      let whiteLayer = null, blackLayer = null;
      const hue = (m) => { const k = (m - LO) / (HI - LO); return `hsl(${Math.round(38 + k * 190)}, 85%, ${68 - k * 6}%)`; };
      let now = 0;
      const MAX_BARS = 70;
      function press(k, amt) {
        k.glow = Math.max(k.glow, amt);
        k.off = 0;
        // A new note only if this key wasn't just played, and never more than MAX_BARS on screen.
        if (!k.held) { stats.oct[Math.floor((k.m - LO) / 12)]++; stats.gap = Math.max(stats.gap, now - stats.lastAt); stats.lastAt = now; }
        if (!k.held && now - k.last > 0.18 && bars.length < MAX_BARS && (k.live || 0) < 3) { bars.push({ k, y: kbY, h: 0, growing: true, a: Math.min(1, 0.5 + amt) }); k.last = now; k.live = (k.live || 0) + 1; }
        k.held = true;
      }
      // A key lets go only after it's been quiet for a moment (the analysis flickers frame to frame).
      function release(k, dt) { k.off += dt; if (k.off > 0.12 && now > (k.tapUntil || 0)) k.held = false; }
      // Tapping a key: it lights up and music notes and sparkles burst out of it.
      let notes = [], sus = null;
      const stats = { oct: [0, 0, 0, 0], gap: 0, lastAt: 0 };
      function keyAt(x, y) {
        if (y < kbY - 6) return null;
        const blk = keys.find((k) => k.black && x >= k.x && x <= k.x + k.w && y <= kbY + kbH * 0.62);
        return blk || keys.find((k) => !k.black && x >= k.x && x < k.x + k.w) || null;
      }
      function burst(k) {
        k.held = false; k.last = -9;
        press(k, 1);
        k.tapUntil = now + 0.35;
        const cx = k.x + k.w / 2;
        for (let i = 0; i < 7; i++) {
          notes.push({ x: cx, y: kbY - 6, vx: rand(-110, 110), vy: rand(-420, -230), rot: rand(-0.4, 0.4), vr: rand(-2, 2), life: 1, s: rand(18, 30), g: pick(['♪', '♫', '♩', '♬']), c: k.col, spark: false });
        }
        for (let i = 0; i < 10; i++) notes.push({ x: cx, y: kbY - 4, vx: rand(-160, 160), vy: rand(-300, -80), life: 1, s: rand(2, 4), c: '#FFF3D6', spark: true });
        if (notes.length > 220) notes.splice(0, notes.length - 220);
      }
      function drawNotes(dt) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const n of notes) {
          n.life -= dt * (n.spark ? 1.4 : 0.55);
          n.vy += (n.spark ? 260 : 60) * dt; n.x += n.vx * dt; n.y += n.vy * dt;
          if (n.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, n.life * 1.6); ctx.fillStyle = n.c;
          if (n.spark) { ctx.fillRect(n.x, n.y, n.s, n.s); continue; }
          n.rot += n.vr * dt;
          ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.rot); ctx.font = `700 ${n.s}px system-ui, sans-serif`; ctx.fillText(n.g, 0, 0); ctx.restore();
        }
        ctx.globalAlpha = 1;
        notes = notes.filter((n) => n.life > 0);
      }
      // Following the music: each tick works out which of the 12 notes (C, C#, D…) are loudest
      // right now, and spots new hits (a sudden rise across the spectrum). On every hit it plays
      // those notes, each in a different octave across the keyboard, so the whole keyboard is
      // used. If a loud passage goes on with no clear hit, it keeps playing the current chord.
      let lastListen = 0, heard = false, prev = null, fluxAvg = 0, lastHit = -9, octTurn = 0;
      const chroma = new Float32Array(12);
      const keyFor = (pc, oct) => keys.find((k) => k.m === 48 + oct * 12 + pc);
      function hit(strength) {
        let top = 0; for (let i = 0; i < 12; i++) top = Math.max(top, chroma[i]);
        if (top <= 0) return;
        const order = [...chroma.keys()].sort((x, y) => chroma[y] - chroma[x]).filter((pc) => chroma[pc] >= top * 0.62).slice(0, 3);
        order.forEach((pc, i) => {
          const oct = (octTurn + i * 2 + Math.floor(Math.random() * 2)) % 4; // spread across C3..C6 and rotate each hit
          const k = keyFor(pc, oct);
          if (k) { k.held = false; k.last = -9; press(k, Math.min(1, 0.45 + strength)); k.tapUntil = now + 0.22; }
        });
        octTurn = (octTurn + 1) % 4;
        lastHit = now;
      }
      function listen(dt) {
        if (now - lastListen < 1 / 30) return heard; // analyse at most 30 times a second
        const step = now - lastListen;
        lastListen = now;
        const A = window.SliverAudio && window.SliverAudio.spectrum && window.SliverAudio.spectrum();
        heard = !!A;
        if (!A) return false;
        const { data, rate, size } = A;
        const binHz = rate / size, lo = Math.floor(100 / binHz), hi = Math.min(data.length - 1, Math.ceil(4000 / binHz));
        if (!prev || prev.length !== data.length) prev = new Float32Array(data.length);
        chroma.fill(0);
        let flux = 0, loud = 0;
        for (let i = lo; i <= hi; i++) {
          const v = data[i] / 255;
          const d = v - prev[i]; if (d > 0) flux += d;
          prev[i] = v; loud = Math.max(loud, v);
          if (i * binHz < 2100 && v > 0.2) {
            const pc = ((Math.round(12 * Math.log2((i * binHz) / 440)) + 69) % 12 + 12) % 12;
            chroma[pc] += v * v;
          }
        }
        flux /= (hi - lo + 1);
        if (loud < 0.15) { keys.forEach((k) => release(k, step)); fluxAvg *= 0.9; return true; } // quiet moment
        const isHit = flux > fluxAvg * 1.45 + 0.004 && now - lastHit > 0.12;
        fluxAvg += (flux - fluxAvg) * Math.min(1, step * 3);
        if (isHit) hit(Math.min(0.5, flux * 20));
        else if (now - lastHit > 0.42) hit(0.2); // a held, loud passage: keep playing the chord
        keys.forEach((k) => release(k, step));
        return true;
      }
      function idle(dt) {
        idleT -= dt;
        if (idleT > 0) return;
        keys.forEach((k) => { if (now > (k.tapUntil || 0)) k.held = false; });
        idleT = 0.42;
        const m = IDLE[idleStep++ % IDLE.length];
        const k = keys.find((x) => x.m === m);
        if (k) press(k, 0.55);
        if (idleStep % 4 === 1) { const b = keys.find((x) => x.m === m - 12); if (b) press(b, 0.4); }
      }
      function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
      reset();
      return {
        resize: reset,
        hover(x, y) { return !!keyAt(x, y); },
        stats: () => stats,
        resetStats: () => { stats.oct = [0, 0, 0, 0]; stats.gap = 0; stats.lastAt = now; },
        tap(x, y) { const k = keyAt(x, y); if (!k) return false; burst(k); return true; },
        // Hold a key: it stays lit, its column keeps growing and notes keep pouring out (sustain).
        // Slide along the keys while holding to glide from note to note.
        press(x, y) { const k = keyAt(x, y); if (!k) return; burst(k); sus = { k, acc: 0 }; k.sustain = true; },
        pressMove(x, y) { if (!sus) return; const k = keyAt(x, Math.max(y, kbY + 4)); if (k && k !== sus.k) { sus.k.sustain = false; sus.k.tapUntil = 0; burst(k); sus.k = k; k.sustain = true; } },
        pressEnd() { if (sus) { sus.k.sustain = false; sus.k.tapUntil = 0; } sus = null; },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#07070C'], [0.6, '#0F0F1A'], [1, '#17131F']]);
          ctx.fillRect(0, 0, W, H);
          glowDot(W * 0.5, -H * 0.15, H * 0.9, 'rgba(232,194,122,.10)');
          now = t;
          ctx.fillStyle = 'rgba(255,240,210,.35)';
          for (const d of dust) { d.y -= d.v * dt; if (d.y < 0) { d.y = kbY; d.x = rand(0, W); } ctx.fillRect(d.x + Math.sin(t * 0.4 + d.p) * 10, d.y, d.r, d.r); }
          if (sus) { // sustain: keep the held key lit and pouring notes
            const k = sus.k; k.held = true; k.tapUntil = now + 0.1; k.glow = 1;
            sus.acc += dt * 14;
            while (sus.acc >= 1) { sus.acc--; notes.push({ x: k.x + k.w / 2 + rand(-4, 4), y: kbY - 6, vx: rand(-50, 50), vy: rand(-320, -200), rot: rand(-0.4, 0.4), vr: rand(-2, 2), life: 1, s: rand(14, 24), g: pick(['♪', '♫', '♩', '♬']), c: k.col, spark: false }); if (Math.random() < 0.6) notes.push({ x: k.x + k.w / 2, y: kbY - 4, vx: rand(-90, 90), vy: rand(-240, -80), life: 1, s: rand(2, 3.5), c: '#FFF3D6', spark: true }); }
            if (notes.length > 260) notes.splice(0, notes.length - 260);
          }
          const music = listen(dt);
          if (!music) idle(dt);
          // rising notes
          toFront();
          ctx.globalCompositeOperation = 'lighter';
          const speed = 70;
          bars = bars.filter((b) => { const keep = b.y - b.h > -20 && b.a > 0.03; if (!keep) b.k.live--; return keep; });
          for (const b of bars) {
            if (b.growing && b.k.held && b.h < (b.k.sustain ? H * 0.8 : kbH * 1.6)) b.h += speed * (b.k.sustain ? 1.6 : 1) * dt; else { b.growing = false; b.y -= speed * dt; }
            b.a -= dt * (b.k.sustain && b.growing ? 0 : 0.16);
            const x = b.k.x + b.k.w * 0.12, w = b.k.w * 0.76, top = b.y - b.h;
            const hgt = Math.max(4, b.h);
            ctx.fillStyle = b.k.col;
            ctx.globalAlpha = Math.max(0, b.a) * 0.22; // soft halo: the same rounded shape, a bit bigger and fainter
            rr(x - 3, top - 3, w + 6, hgt + 6, Math.min(9, w / 2 + 3)); ctx.fill();
            ctx.globalAlpha = Math.max(0, b.a);
            rr(x, top, w, hgt, Math.min(6, w / 2)); ctx.fill();
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          // felt strip + keyboard
          toBack();
          ctx.fillStyle = '#5A0F1C'; ctx.fillRect(0, kbY - 5, W, 5);
          ctx.drawImage(whiteLayer, 0, kbY, W, kbH);
          for (const k of keys) {
            k.glow = Math.max(0, k.glow - dt * (k.held ? 0.4 : 2.6));
            if (k.black || k.glow <= 0.02) continue;
            ctx.globalAlpha = k.glow * 0.85; ctx.fillStyle = k.col; ctx.fillRect(k.x + 0.5, kbY, k.w - 1, kbH); ctx.globalAlpha = 1;
          }
          ctx.drawImage(blackLayer, 0, kbY, W, kbH);
          for (const k of keys) {
            if (!k.black || k.glow <= 0.02) continue;
            ctx.globalAlpha = k.glow; ctx.fillStyle = k.col; ctx.fillRect(k.x, kbY, k.w, kbH * 0.62); ctx.globalAlpha = 1;
          }
          ctx.globalCompositeOperation = 'lighter';
          for (const k of keys) if (k.glow > 0.15) glowDot(k.x + k.w / 2, kbY, k.w * (k.black ? 2.2 : 1.6), k.col, k.glow * 0.7);
          ctx.globalCompositeOperation = 'source-over';
          toFront(); drawNotes(dt);
        },
      };
    },

    // Crimson city: a red-lit skyline at night, flickering neon, rain and fog.
    crimson() {
      const aim = { x: -99, y: -99, on: false, touch: 0, kick: 0, hit: null, hitT: 0 };
      function reticle(dt, t) {
        aim.kick = Math.max(0, aim.kick - dt * 3.2); aim.touch = Math.max(0, aim.touch - dt); aim.hitT = Math.max(0, aim.hitT - dt * 0.9);
        const show = aim.on || aim.touch > 0 || aim.kick > 0;
        if (!show) return;
        const k = aim.kick, R = 34 * (1 + k * 0.35), x = aim.x, y = aim.y - k * 12; // recoil kicks the scope up
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * 0.35);
        ctx.globalAlpha = aim.on || aim.kick ? 1 : Math.min(1, aim.touch * 2);
        const red = k > 0.5 ? '#FFFFFF' : '#FF2847';
        if (aim.hitT && aim.hit === 'HEADSHOT') { ctx.fillStyle = `rgba(255,40,71,${0.18 * aim.hitT})`; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); }
        ctx.lineCap = 'round';
        for (const [col, w] of [['rgba(0,0,0,.55)', 5], [red, 2.2]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
          ctx.beginPath();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(dx * (R + 3), dy * (R + 3)); ctx.lineTo(dx * (R + 10), dy * (R + 10)); }
          ctx.stroke();
        }
        for (const [col, w] of [['rgba(0,0,0,.55)', 4.5], ['#FFE4E8', 1.8]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(dx * 6, dy * 6); ctx.lineTo(dx * 18, dy * 18); }
          ctx.stroke();
        }
        ctx.fillStyle = '#FF2847'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
        ctx.restore();
        if (aim.hitT && aim.hit) {
          ctx.globalAlpha = Math.min(1, aim.hitT * 2); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.font = '900 16px ui-monospace, Menlo, monospace';
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(aim.hit, aim.x + 1, aim.y - R - 16 - (1 - aim.hitT) * 14 + 1);
          ctx.fillStyle = aim.hit === 'HEADSHOT' ? '#FF4D6D' : '#FFD1D6'; ctx.fillText(aim.hit, aim.x, aim.y - R - 16 - (1 - aim.hitT) * 14);
          ctx.globalAlpha = 1; ctx.textAlign = 'left';
        }
      }
      let far = [], near = [], rain = [], span = 0, glitch = 0, flashA = 0, bolt = null, bodies = [], heads = 0, kills = 0;
      const nearSeen = []; // where the near buildings were drawn this frame (for tapping)
      try { heads = Number(localStorage.getItem('sliver.crimson.heads')) || 0; kills = Number(localStorage.getItem('sliver.crimson.kills')) || 0; } catch {}
      const saveScore = () => { try { localStorage.setItem('sliver.crimson.heads', String(heads)); localStorage.setItem('sliver.crimson.kills', String(kills)); } catch {} };
      // Rooftop figures: a silhouette that paces along its roof. state: up | down (collapsed) | gone
      const newFig = (b) => ({ fx: rand(14, Math.max(16, b.w - 14)), dir: Math.random() < 0.5 ? -1 : 1, v: rand(6, 16), state: 'up', t: 0, back: 0 });
      function figure(x, y, f, t, alpha = 1) {
        ctx.save(); ctx.translate(x, y); ctx.scale(1.25, 1.25); ctx.globalAlpha = alpha;
        if (f.state === 'down') ctx.rotate(f.dir * Math.min(1, f.t * 3) * Math.PI / 2); // keels over
        const step = f.state === 'up' ? Math.sin(t * 6 + f.fx) * 3 : 0;
        if (f.state === 'up') { ctx.globalCompositeOperation = 'lighter'; glowDot(0, -15, 22, 'rgba(255,40,71,.28)'); ctx.globalCompositeOperation = 'source-over'; }
        ctx.fillStyle = '#12020A'; ctx.strokeStyle = '#FF4D6D'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3 + step, -9); ctx.lineTo(3 + step, -9); ctx.lineTo(3, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); // legs
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-5, -20); ctx.lineTo(5, -20); ctx.lineTo(6, -9); ctx.closePath(); ctx.fill(); ctx.stroke(); // coat
        ctx.beginPath(); ctx.arc(0, -24.5, 4.5, 0, TAU); ctx.fill(); ctx.stroke(); // head
        ctx.fillStyle = '#FF2847'; ctx.fillRect(f.dir > 0 ? 1 : -4, -25.5, 3, 1.4); // glowing visor
        ctx.restore(); ctx.globalAlpha = 1;
      }
      function blood(x, y, n, power) {
        burst(x, y, n, () => { const a = rand(-Math.PI, 0) + rand(-0.6, 0.6), v = rand(60, power); return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, s: rand(1.2, 3), decay: rand(0.7, 1.2), c: pick(['#B5001F', '#E0102F', '#7A0014', '#FF2847']) }; });
        emit({ kind: 'glow', x, y, s: 7, decay: 3, c: 'rgba(160,0,20,.6)' });
      }
      function shoot(x, y) {
        for (const n of nearSeen.slice().reverse()) {
          const f = n.b.fig;
          if (!f || f.state !== 'up') continue;
          const fx = n.x + f.fx, fy = n.top;
          if (inMid(fx)) continue;
          if (Math.hypot(x - fx, y - (fy - 30.6)) < 9.5) { // headshot
            f.state = 'down'; f.t = 0; heads++; kills++; saveScore();
            flashA = 0.5; bolt = { x: fx, y: fy - 25, life: 0.22, pts: (() => { const p = [[fx + rand(-60, 60), 0]]; while (p[p.length - 1][1] < fy - 40) { const [px, py] = p[p.length - 1]; p.push([px + rand(-22, 22) + (fx - px) * 0.25, py + rand(30, 60)]); } p.push([fx, fy - 31]); return p; })() };
            blood(fx, fy - 31, 26, 300);
            ring(fx, fy - 31, 'rgba(255,230,230,.95)', { s: 3, grow: 120, decay: 3.5, w: 1.5, add: true });
            return true;
          }
          if (Math.abs(x - fx) < 9.5 && y > fy - 26 && y < fy + 2) { // body shot: knocked off the roof
            f.state = 'gone'; f.t = 0; kills++; saveScore();
            blood(fx, y, 16, 220);
            const push = x < fx ? 1 : -1;
            bodies.push({ x: fx, y: fy, vx: push * rand(60, 110), vy: -rand(120, 200), rot: 0, vr: push * rand(3, 6), dir: f.dir, life: 6, landed: false, ground: H * 0.86 + rand(4, 16) });
            return true;
          }
        }
        return false;
      }
      const city = (n, minH, maxH, minW, maxW) => {
        const out = []; let x = 0;
        while (x < span) {
          const w = rand(minW, maxW), h = rand(minH, maxH);
          const wins = [];
          for (let wy = 14; wy < h - 10; wy += 13) for (let wx = 7; wx < w - 8; wx += 11) if (Math.random() < 0.38) wins.push({ x: wx, y: wy, on: Math.random() < 0.7, f: rand(0.2, 2), c: pick(['#FF3B4E', '#FF6A3D', '#FFB199', '#FF2D6A']) });
          out.push({ x, w, h, wins, sign: Math.random() < n ? { y: rand(0.2, 0.6) * h, h: rand(30, 70), c: pick(['#FF2847', '#FF2D9A', '#FF5A36']), p: rand(0, TAU) } : null, antenna: Math.random() < 0.3 });
          x += w + rand(2, 10);
        }
        for (const b of out) if (n > 0.2 && b.w > 50 && Math.random() < 0.45) b.fig = newFig(b);
        return out;
      };
      const reset = () => {
        span = W * 2;
        far = city(0.05, H * 0.18, H * 0.45, 40, 90);
        near = city(0.35, H * 0.25, H * 0.62, 60, 130);
        rain = Array.from({ length: Math.round(150 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), l: rand(10, 26), v: rand(500, 800) }));
      };
      function layer(list, off, base, fill, edge, t, winA, seen) {
        for (const b of list) {
          let x = b.x - off; if (x + b.w < 0) x += span; if (x > W) continue;
          const top = base - b.h;
          if (seen) seen.push({ b, x, top });
          b.lit = Math.max(0, (b.lit || 0) - 1 / 60 * 0.8);
          ctx.fillStyle = fill; ctx.fillRect(x, top, b.w, b.h);
          if (b.antenna) { ctx.fillRect(x + b.w / 2 - 1, top - 24, 2, 24); glowDot(x + b.w / 2, top - 24, 6, '#FF2847', 0.5 + 0.5 * Math.sin(t * 3 + b.x)); }
          for (const w of b.wins) {
            const lit = b.lit && (w.y / b.h) > 1 - b.lit * 1.4; // a wave of light running up the building
            const on = lit || (w.on ? (Math.sin(t * w.f + b.x) > -0.95) : false);
            if (!on) continue;
            ctx.globalAlpha = lit ? 1 : winA; ctx.fillStyle = lit ? '#FFD1D6' : w.c; ctx.fillRect(x + w.x, top + w.y, 5, 7);
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = edge; ctx.lineWidth = b.lit ? 3 : 1; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + b.w, top); ctx.stroke();
          if (b.lit) { ctx.globalAlpha = b.lit * 0.8; ctx.strokeStyle = '#FF2847'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, top + 1, b.w - 2, b.h); ctx.globalAlpha = 1; }
          if (b.fig) { // the rooftop figure
            const f = b.fig; f.t += 1 / 60;
            if (f.state === 'up') { f.fx += f.dir * f.v / 60; if (f.fx < 10 || f.fx > b.w - 10) f.dir *= -1; f.fx = Math.max(10, Math.min(b.w - 10, f.fx)); }
            if ((f.state === 'up' || (f.state === 'down' && f.t < 5)) && !inMid(x + f.fx)) figure(x + f.fx, top, f, t, f.state === 'down' ? Math.max(0, Math.min(1, 5 - f.t)) : 1);
            if (f.state !== 'up' && f.t > 9) b.fig = newFig(b); // someone new shows up later
          }
          if (b.sign) {
            const s = b.sign; const flick = Math.sin(t * 9 + s.p) > -0.85 && Math.sin(t * 0.7 + s.p) > -0.98 ? 1 : 0.15;
            const sx = x + b.w * 0.5 - 6, sy = top + s.y;
            ctx.globalAlpha = flick; ctx.strokeStyle = s.c; ctx.lineWidth = 3; ctx.shadowColor = s.c; ctx.shadowBlur = 18;
            ctx.strokeRect(sx, sy, 12, s.h);
            for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(sx + 3, sy + (s.h * k) / 4); ctx.lineTo(sx + 9, sy + (s.h * k) / 4); ctx.stroke(); }
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          }
        }
      }
      reset();
      return {
        resize: reset,
        hover: () => true,
        cursor: 'none',
        pointer(x, y, on, touch) { aim.x = x; aim.y = y; aim.on = on; if (touch) aim.touch = 0.9; },
        oldCursor: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g fill="none" stroke-linecap="round"><circle cx="20" cy="20" r="14" stroke="#000" stroke-opacity=".55" stroke-width="4"/><circle cx="20" cy="20" r="14" stroke="#FF2847" stroke-width="2"/><path d="M20 12v16M12 20h16" stroke="#000" stroke-opacity=".55" stroke-width="4"/><path d="M20 12v16M12 20h16" stroke="#FFE4E8" stroke-width="1.6"/></g></svg>')}") 20 20, crosshair`,
        targets: () => nearSeen.filter((n) => n.b.fig && n.b.fig.state === 'up' && n.x > 0 && n.x < W && !inMid(n.x + n.b.fig.fx)).map((n) => [n.x + n.b.fig.fx, n.top]),
        // Sniper: tap a rooftop figure. Headshot = lightning flash, blood burst, they collapse.
        // Body shot = blood, and they're knocked off the building. A miss sparks off the wall.
        tap(x, y) {
          aim.x = x; aim.y = y; aim.kick = 1; aim.hit = null;
          const before = heads, kBefore = kills;
          const hitSomeone = shoot(x, y);
          if (hitSomeone) { aim.hit = heads > before ? 'HEADSHOT' : kills > kBefore ? 'HIT' : null; aim.hitT = 1; }
          if (hitSomeone) return true;
          const hit = nearSeen.slice().reverse().find((n) => x >= n.x && x <= n.x + n.b.w && y >= n.top);
          if (hit) hit.b.lit = 1;
          glitch = 0.4;
          burst(x, y, 8, (i, a) => ({ kind: 'streak', x, y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 60, g: 600, s: 1.2, decay: 2.6, add: true, c: pick(['#FFD1A8', '#FF8A3D', '#FFFFFF']) }));
          emit({ kind: 'glow', x, y, s: 2.5, decay: 0.6, c: 'rgba(20,0,5,.9)' }); // bullet hole
          return true;
        },
        draw(dt, t) {
          const ground = H * 0.86;
          glitch = Math.max(0, glitch - dt * 3);
          ctx.fillStyle = grad(0, H, [[0, '#0B0105'], [0.55, '#2A040E'], [0.86, '#4A0716'], [1, '#12020A']]);
          ctx.fillRect(0, 0, W, H);
          glowDot(W * 0.72, H * 0.3, H * 0.28, 'rgba(255,40,71,.35)');
          ctx.fillStyle = 'rgba(255,90,90,.9)'; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.3, Math.min(W, H) * 0.07, 0, TAU); ctx.fill();
          layer(far, (t * 8) % span, ground - 10, '#2B0610', 'rgba(255,60,80,.35)', t, 0.45);
          ctx.fillStyle = grad(ground - H * 0.25, ground, [[0, 'rgba(90,8,24,0)'], [1, 'rgba(90,8,24,.55)']]); ctx.fillRect(0, ground - H * 0.25, W, H * 0.25);
          nearSeen.length = 0;
          layer(near, (t * 20) % span, ground, '#0E0206', 'rgba(255,40,71,.8)', t, 0.9, nearSeen);
          // wet street with reflections
          ctx.fillStyle = grad(ground, H, [[0, '#1A030A'], [1, '#050003']]); ctx.fillRect(0, ground, W, H - ground);
          ctx.globalAlpha = 0.25; ctx.fillStyle = grad(ground, H, [[0, '#FF2847'], [1, 'rgba(255,40,71,0)']]); ctx.fillRect(0, ground, W, (H - ground) * 0.6); ctx.globalAlpha = 1;
          // scan line sweeping down
          const sy = ((t * 60) % (H + 200)) - 100;
          ctx.fillStyle = grad(sy - 40, sy + 40, [[0, 'rgba(255,40,71,0)'], [0.5, 'rgba(255,40,71,.06)'], [1, 'rgba(255,40,71,0)']]); ctx.fillRect(0, sy - 40, W, 80);
          // rain
          if (glitch > 0) { // a few horizontal slices jump sideways for a split second
            for (let k = 0; k < 4; k++) {
              const gy = rand(0, H), gh = rand(3, 14);
              ctx.fillStyle = k % 2 ? `rgba(255,40,71,${0.35 * glitch})` : `rgba(80,220,255,${0.18 * glitch})`;
              ctx.fillRect(rand(-30, 30) * glitch, gy, W, gh);
            }
          }
          ctx.strokeStyle = 'rgba(255,170,180,.35)'; ctx.lineWidth = 1; ctx.beginPath();
          for (const r of rain) { r.y += r.v * dt; r.x -= r.v * 0.12 * dt; if (r.y > H) { r.y = -20; r.x = rand(0, W + 60); } ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.12, r.y + r.l); }
          ctx.stroke();
          // bodies falling off the roofs
          toFront();
          for (const d of bodies) {
            if (!d.landed) {
              d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
              if (Math.random() < 0.3) emit({ x: d.x, y: d.y - 14, vx: rand(-20, 20), vy: rand(-20, 20), g: 400, s: rand(1, 2), decay: 1.5, c: '#B5001F' });
              if (d.y >= d.ground) { d.y = d.ground; d.landed = true; d.rot = (d.vr > 0 ? 1 : -1) * Math.PI / 2; blood(d.x, d.y - 4, 10, 140); }
            } else d.life -= dt;
            ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.translate(-d.x, -d.y);
            figure(d.x, d.y, { state: 'falling', dir: d.dir, fx: 0 }, t, Math.max(0, Math.min(1, d.life)));
            ctx.restore();
            if (d.landed) { ctx.globalAlpha = Math.max(0, Math.min(0.7, d.life / 3)); ctx.fillStyle = '#7A0014'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 2, 16, 3, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
          }
          bodies = bodies.filter((d) => d.life > 0 && d.x > -40 && d.x < W + 40);
          // headshot lightning + flash
          if (bolt) {
            bolt.life -= dt;
            ctx.strokeStyle = `rgba(255,220,230,${Math.max(0, bolt.life / 0.22)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]); for (const [px, py] of bolt.pts.slice(1)) ctx.lineTo(px, py); ctx.stroke();
            if (bolt.life <= 0) bolt = null;
          }
          if (flashA > 0) { ctx.fillStyle = `rgba(255,235,240,${flashA})`; ctx.fillRect(0, 0, W, H); flashA = Math.max(0, flashA - dt * 4); }
          // score
          ctx.font = '700 12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(10,0,4,.6)'; ctx.fillRect(14, H - 40, 196, 26);
          ctx.fillStyle = '#FFD1D6'; ctx.fillText(`☠ ${kills}   🎯 ${heads} headshot${heads === 1 ? '' : 's'}`, 24, H - 22);
          reticle(dt, t);
        },
      };
    },

    // Campfire Crew (the invite-friends theme): a starry night, pine trees, fireflies, and a
    // campfire with your crew sitting round it. Mini-game: hold to roast a marshmallow over the
    // fire and let go when it's golden-brown for the perfect s'more (your friends cheer).
    // Hold too long and it catches fire.
    campfire() {
      let stars = [], flies = [], trees = null, shoot = null, nextShot = 4, now = 0;
      let toast = 0, roasting = false, burning = 0, label = null, cheer = 0, smores = 0, streak = 0, best = 0, treats = [];
      // Timing game: a needle sweeps across the bar; tap while it's in the gold. 5 hits = perfect.
      // Each hit makes the gold smaller and the needle faster; a miss sets the marshmallow on fire.
      const HITS = 5;
      let hits = 0, needle = 0, ndir = 1, zoneC = 0.5, zoneW = 0.26, speed = 0.75, flashZone = 0;
      function newZone() {
        zoneW = 0.26 * Math.pow(0.76, hits);              // smaller gold each time
        speed = 0.75 * Math.pow(1.28, hits);              // faster needle each time
        zoneC = rand(zoneW / 2 + 0.04, 1 - zoneW / 2 - 0.04);
      }
      try { smores = Number(localStorage.getItem('sliver.camp.smores')) || 0; best = Number(localStorage.getItem('sliver.camp.best')) || 0; } catch {}
      const save = () => { try { localStorage.setItem('sliver.camp.smores', String(smores)); localStorage.setItem('sliver.camp.best', String(best)); } catch {} };
      const CREW = [
        { dx: -108, dy: 4, hood: '#7C9CFF', skin: '#F2C9A0', hat: '#FF6B6B' },
        { dx: -58, dy: 18, hood: '#FF9EC7', skin: '#8D5A3B', hat: null },
        { dx: 62, dy: 18, hood: '#9EF0C8', skin: '#C68B59', hat: '#FFD27A' },
        { dx: 112, dy: 4, hood: '#FFB38A', skin: '#F8DCC0', hat: null },
      ];
      const fire = () => { const g = lanes(); return g ? { x: Math.max(170, g / 2), y: H - 96 } : { x: W / 2, y: H - 90 }; };
      function paintTrees() { // two layers of pines, drawn once per size
        trees = document.createElement('canvas'); trees.width = Math.round(W * DPR); trees.height = Math.round(H * DPR);
        const g = trees.getContext('2d'); g.scale(DPR, DPR);
        const pine = (x, base, h, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 3; k++) { const y = base - h * (k * 0.28); const w = h * (0.34 - k * 0.07); g.moveTo(x - w, y); g.lineTo(x, y - h * 0.45); g.lineTo(x + w, y); } g.fill(); g.fillRect(x - h * 0.03, base - 2, h * 0.06, h * 0.08); };
        for (let x = -20; x < W + 40; x += rand(26, 48)) pine(x, H - 48, rand(70, 130), '#1E1A3A');
        for (let x = -20; x < W + 40; x += rand(34, 60)) pine(x, H - 30, rand(90, 160), '#14112A');
        g.fillStyle = '#100D22'; g.fillRect(0, H - 36, W, 36);
      }
      const reset = () => {
        stars = Array.from({ length: Math.round(130 * density()) }, () => ({ x: rand(0, W), y: rand(0, H * 0.7), r: rand(0.5, 1.6), p: rand(0, TAU), v: rand(0.6, 2) }));
        flies = Array.from({ length: Math.round(18 * density()) }, () => ({ x: rand(0, W), y: rand(H * 0.45, H - 60), p: rand(0, TAU), v: rand(0.5, 1.4) }));
        paintTrees();
      };
      function say(text, c) { label = { text, c, life: 1 }; }
      let lanterns = [];
      const zoomNow = () => (lanes() ? Math.min(1.35, lanes() / 260) : 1);
      function inFire(x, y) {
        const F = fire(), z = zoomNow();
        return Math.abs(x - F.x) < 175 * z && y > F.y - 200 * z && y < F.y + 45 * z;
      }
      function perfect() {
        roasting = false; hits = 0; toast = 0;
        smores++; streak++; best = Math.max(best, streak); save(); cheer = 1;
        say(streak > 1 ? `PERFECT S'MORE! ×${streak}` : "PERFECT S'MORE!", '#FFD27A');
        const F = fire();
        treats.push({ x: F.x + 40, y: F.y - 80, life: 1 });
        burst(F.x, F.y - 120, 18, (i, a) => ({ kind: i % 3 ? 'star' : 'heart', x: F.x, y: F.y - 120, vx: Math.cos(a) * rand(90, 200), vy: Math.sin(a) * rand(90, 200) - 40, drag: 1.6, s: rand(4, 8), decay: 0.9, c: pick(['#FFD27A', '#FF9EC7', '#FFFFFF', '#FF8A3D']) }));
      }
      function tapFire() {
        if (burning) return;
        if (!roasting) { // first tap: into the fire it goes
          roasting = true; hits = 0; toast = 0.05; needle = 0; ndir = 1; newZone();
          say('Tap in the gold!', '#FFF1D6');
          return;
        }
        const inGold = Math.abs(needle - zoneC) <= zoneW / 2;
        if (!inGold) { // a miss burns it
          roasting = false; burning = 1; toast = 1.05; streak = 0; hits = 0;
          say('Missed! It caught fire', '#FF8A5C');
          return;
        }
        hits++; flashZone = 1;
        toast = 0.08 + (hits / HITS) * 0.6;
        const F = fire();
        burst(F.x + 18, F.y - 60, 6, () => ({ kind: 'glow', x: F.x + 18, y: F.y - 60, vx: rand(-60, 60), vy: -rand(40, 120), s: rand(1, 2), decay: 1.6, add: true, c: '#FFD27A' }));
        if (hits >= HITS) perfect();
        else { say(['', 'Nice!', 'Good!', 'Great!', 'One more!'][hits] || 'Nice!', '#FFD27A'); newZone(); }
      }
      function friend(c, x, y, t, i) {
        const jump = cheer ? Math.abs(Math.sin((1 - cheer) * Math.PI * 3 + i)) * 14 * cheer : 0;
        const sway = Math.sin(t * 1.3 + i) * 1.5;
        y -= jump;
        ctx.save(); ctx.translate(x + sway, y);
        ctx.fillStyle = c.hood; // body
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-16, -26, 0, -28); ctx.quadraticCurveTo(16, -26, 14, 0); ctx.closePath(); ctx.fill();
        if (cheer) { ctx.strokeStyle = c.hood; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(-18, -40); ctx.moveTo(10, -20); ctx.lineTo(18, -40); ctx.stroke(); }
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(0, -36, 10, 0, TAU); ctx.fill(); // head
        if (c.hat) { ctx.fillStyle = c.hat; ctx.beginPath(); ctx.arc(0, -38, 10.5, Math.PI, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -49, 3, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#2B1B2E'; ctx.beginPath(); ctx.arc(-3.5, -35, 1.4, 0, TAU); ctx.arc(3.5, -35, 1.4, 0, TAU); ctx.fill(); // eyes (lit by the fire)
        ctx.strokeStyle = '#2B1B2E'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, -32, cheer ? 3.5 : 2.5, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.fillStyle = 'rgba(255,140,60,.25)'; ctx.beginPath(); ctx.arc(0, -36, 10, -0.8, 0.8); ctx.fill(); // warm rim light
        ctx.restore();
      }
      function flame(x, y, s, t) {
        const f = (k, w, h, col) => { const wob = Math.sin(t * 9 + k) * 3; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.9, y - h * 0.5, x + wob, y - h); ctx.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill(); };
        const fl = 1 + Math.sin(t * 7) * 0.06 + Math.sin(t * 13) * 0.04;
        f(1, 26 * s, 70 * s * fl, '#FF6B2B'); f(2, 18 * s, 54 * s * fl, '#FF9F43'); f(3, 10 * s, 34 * s * fl, '#FFE08A');
      }
      const mallowCol = (t) => { // white -> golden -> brown -> black
        const stops = [[0, [250, 246, 238]], [0.55, [240, 196, 110]], [0.8, [176, 112, 52]], [1.05, [70, 40, 22]], [1.3, [20, 14, 12]]];
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a0, c0] = stops[i - 1], [a1, c1] = stops[i]; const k = (t - a0) / (a1 - a0); return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`; }
        return 'rgb(20,14,12)';
      };
      reset();
      return {
        resize: reset,
        // Only the campfire (the fire, the crew and the bar above it) plays the roasting game.
        hover: (x, y) => inFire(x, y),
        tap(x, y) {
          if (inFire(x, y)) { tapFire(); return true; }
          // anywhere else: a paper lantern floats up, and fireflies gather round
          lanterns.push({ x, y, vx: rand(-12, 12), life: 1, s: rand(0.8, 1.2), p: rand(0, TAU), col: pick(['#FFB347', '#FF8A5C', '#FFD27A', '#FF9EC7']) });
          if (lanterns.length > 14) lanterns.shift();
          for (const f of flies) if (Math.hypot(f.x - x, f.y - y) < 260) { f.tx = x + rand(-40, 40); f.ty = y + rand(-40, 40); f.pull = 2.5; }
          burst(x, y, 8, () => ({ kind: 'glow', x, y, vx: rand(-60, 60), vy: rand(-60, 20), drag: 2, s: rand(1, 2), decay: 1.2, add: true, c: '#D2FF8C' }));
          return true;
        },
        info: () => ({ roasting, hits, needle, zoneC, zoneW, burning: !!burning, smores }),
        draw(dt, t) {
          now = t;
          cheer = Math.max(0, cheer - dt * 0.7);
          ctx.fillStyle = grad(0, H, [[0, '#0B0B26'], [0.55, '#211A44'], [0.85, '#3B2445'], [1, '#2A1A2E']]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.v + s.p)); ctx.fillStyle = '#FFF8E7'; ctx.fillRect(s.x, s.y, s.r, s.r); }
          ctx.globalAlpha = 1;
          const mx = W * 0.82, my = H * 0.16, mr = Math.min(W, H) * 0.05; // crescent moon
          glowDot(mx, my, mr * 4, 'rgba(255,240,200,.18)');
          ctx.fillStyle = '#FFF1C9'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
          ctx.fillStyle = '#16133A'; ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, TAU); ctx.fill();
          nextShot -= dt;
          if (!shoot && nextShot <= 0) { shoot = { x: rand(W * 0.2, W), y: rand(0, H * 0.3), life: 1 }; nextShot = rand(5, 10); }
          if (shoot) { shoot.x -= 520 * dt; shoot.y += 180 * dt; shoot.life -= dt * 1.4; ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, shoot.life)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x + 70, shoot.y - 24); ctx.stroke(); if (shoot.life <= 0) shoot = null; }
          ctx.drawImage(trees, 0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (const f of flies) {
            if (f.pull) { f.pull = Math.max(0, f.pull - dt); f.x += (f.tx - f.x) * Math.min(1, dt * 2); f.y += (f.ty - f.y) * Math.min(1, dt * 2); }
            f.x += Math.sin(t * 0.7 * f.v + f.p) * 14 * dt; f.y += Math.cos(t * 0.9 * f.v + f.p) * 10 * dt; const a = Math.max(0, Math.sin(t * 2 * f.v + f.p)); glowDot(f.x, f.y, 8, 'rgba(210,255,140,.8)', a * 0.8); }
          ctx.globalCompositeOperation = 'source-over';
          // ---- the campfire, the crew and the marshmallow (front layer) ----
          toFront();
          for (const l of lanterns) { // paper lanterns drifting up into the night
            l.life -= dt * 0.12; l.y -= 34 * dt; l.x += (l.vx + Math.sin(t + l.p) * 8) * dt;
            const a = Math.max(0, Math.min(1, l.life * 3));
            ctx.globalCompositeOperation = 'lighter'; glowDot(l.x, l.y, 34 * l.s, 'rgba(255,170,80,.45)', a * (0.8 + 0.2 * Math.sin(t * 6 + l.p))); ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = a; ctx.fillStyle = l.col;
            ctx.beginPath(); ctx.moveTo(l.x - 9 * l.s, l.y - 11 * l.s); ctx.lineTo(l.x + 9 * l.s, l.y - 11 * l.s); ctx.lineTo(l.x + 7 * l.s, l.y + 11 * l.s); ctx.lineTo(l.x - 7 * l.s, l.y + 11 * l.s); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(l.x - 4 * l.s, l.y + 6 * l.s, 8 * l.s, 4 * l.s);
            ctx.globalAlpha = 1;
          }
          lanterns = lanterns.filter((l) => l.life > 0 && l.y > -40);
          const F = fire();
          const zoom = lanes() ? Math.min(1.35, lanes() / 260) : 1; // bigger on wide screens
          ctx.save(); ctx.translate(F.x, F.y); ctx.scale(zoom, zoom); ctx.translate(-F.x, -F.y);
          ctx.globalCompositeOperation = 'lighter';
          glowDot(F.x, F.y - 20, 190 + Math.sin(t * 6) * 8, 'rgba(255,140,60,.28)');
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < 2; i++) friend(CREW[i], F.x + CREW[i].dx, F.y + CREW[i].dy - 6, t, i); // back row
          ctx.fillStyle = '#5B3A1E'; // logs
          ctx.save(); ctx.translate(F.x, F.y + 6); ctx.rotate(0.35); ctx.fillRect(-34, -6, 68, 12); ctx.rotate(-0.7); ctx.fillRect(-34, -6, 68, 12); ctx.restore();
          ctx.fillStyle = '#7A5230'; ctx.beginPath(); ctx.arc(F.x - 31, F.y + 17, 5, 0, TAU); ctx.arc(F.x + 31, F.y + 17, 5, 0, TAU); ctx.fill();
          flame(F.x, F.y, 1 + (roasting ? 0.06 : 0), t);
          if (Math.random() < dt * 9) emit({ kind: 'glow', x: F.x + rand(-14, 14), y: F.y - 40, vx: rand(-20, 20), vy: -rand(60, 130), s: rand(1, 2), decay: 1.2, add: true, c: pick(['#FFD27A', '#FF9F43']) });
          for (let i = 2; i < 4; i++) friend(CREW[i], F.x + CREW[i].dx, F.y + CREW[i].dy, t, i); // front row
          // roasting
          if (roasting) { needle += ndir * speed * dt; if (needle > 1) { needle = 2 - needle; ndir = -1; } if (needle < 0) { needle = -needle; ndir = 1; } }
          flashZone = Math.max(0, flashZone - dt * 4);
          if (burning) { burning += dt; toast = Math.min(1.3, toast + dt * 0.2); if (burning > 2.2) { burning = 0; toast = 0; say('Fresh marshmallow!', '#FFF1D6'); } }
          const target = roasting || burning ? 1 : 0;
          const tip = { x: F.x + 18 + (1 - target) * 52, y: F.y - 58 - (1 - target) * 26 };
          ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 4; ctx.lineCap = 'round'; // the stick
          ctx.beginPath(); ctx.moveTo(F.x + 150, F.y - 6); ctx.lineTo(tip.x, tip.y); ctx.stroke();
          ctx.fillStyle = mallowCol(toast); // the marshmallow
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tip.x - 10, tip.y - 12, 20, 24, 6) : ctx.rect(tip.x - 10, tip.y - 12, 20, 24); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(tip.x - 6, tip.y - 9, 4, 14);
          if (burning) flame(tip.x, tip.y - 8, 0.35, t * 1.3);
          // the toast meter (gold zone = perfect)
          const bx = F.x - 70, by = F.y - 150, bw = 140;
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
          ctx.fillStyle = 'rgba(255,241,214,.18)'; ctx.fillRect(bx, by, bw, 10);
          if (roasting) {
            ctx.fillStyle = flashZone ? '#FFFFFF' : '#FFD27A'; ctx.fillRect(bx + bw * (zoneC - zoneW / 2), by, bw * zoneW, 10);
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx + bw * needle - 1.5, by - 5, 3, 20);
          }
          for (let i = 0; i < HITS; i++) { // progress dots: 5 hits for a perfect one
            ctx.fillStyle = i < hits ? '#FFD27A' : 'rgba(255,241,214,.25)';
            ctx.beginPath(); ctx.arc(F.x - 32 + i * 16, by + 22, 4, 0, TAU); ctx.fill();
          }
          ctx.font = '700 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(255,241,214,.85)'; ctx.fillText(burning ? 'burnt…' : roasting ? `tap in the gold (${hits}/${HITS})` : 'tap to roast', F.x, by - 10);
          // s'mores floating up after a perfect one
          for (const s of treats) {
            s.life -= dt * 0.7; s.y -= 40 * dt;
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillStyle = '#C98B4F'; ctx.fillRect(s.x - 14, s.y - 4, 28, 7); ctx.fillRect(s.x - 14, s.y + 10, 28, 7);
            ctx.fillStyle = '#4A2A1A'; ctx.fillRect(s.x - 12, s.y + 3, 24, 3);
            ctx.fillStyle = '#F0C46E'; ctx.fillRect(s.x - 11, s.y + 6, 22, 4);
            ctx.globalAlpha = 1;
          }
          treats = treats.filter((s) => s.life > 0);
          if (label) {
            label.life -= dt * 0.8;
            ctx.globalAlpha = Math.max(0, Math.min(1, label.life * 2)); ctx.font = '900 17px ui-monospace, Menlo, monospace';
            ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(label.text, F.x + 1, by - 30 - (1 - label.life) * 20 + 1);
            ctx.fillStyle = label.c; ctx.fillText(label.text, F.x, by - 30 - (1 - label.life) * 20);
            ctx.globalAlpha = 1;
            if (label.life <= 0) label = null;
          }
          ctx.restore();
          ctx.textAlign = 'left';
          ctx.font = '700 12px ui-monospace, Menlo, monospace';
          ctx.fillStyle = 'rgba(16,13,34,.65)'; ctx.fillRect(14, 14, 238, 26);
          ctx.fillStyle = '#FFE7B8'; ctx.fillText(`🔥 ${smores} s'more${smores === 1 ? '' : 's'}   best streak ${best}`, 24, 32);
          toBack();
        },
      };
    },

    // Critter club: little bunnies, kittens, bears, chicks and frogs floating up on balloons,
    // with hearts and sparkles, over a pastel sky.
    critters() {
      let pals = [], hearts = [], twinkles = [];
      const KINDS = {
        bunny: { body: '#FFFFFF', inner: '#FFC4D6' }, kitty: { body: '#FFD9A8', inner: '#FF9DB5' }, bear: { body: '#C99A73', inner: '#F0CDB0' },
        chick: { body: '#FFE27A', inner: '#FFB347' }, frog: { body: '#9BE3A8', inner: '#FFB3C7' }, panda: { body: '#FFFFFF', inner: '#2F2F3A' },
      };
      const BALLOONS = ['#FF9EC7', '#B8A6FF', '#8FE3FF', '#FFD86B', '#9EF0C8', '#FFB38A'];
      const pal = (any) => ({ x: sideX(40), y: any ? rand(0, H + 200) : H + rand(60, 200), s: rand(20, 34), v: rand(18, 34), p: rand(0, TAU), kind: pick(Object.keys(KINDS)), bal: pick(BALLOONS), blink: rand(2, 6) });
      const reset = () => {
        pals = Array.from({ length: Math.max(5, Math.round(11 * density())) }, () => pal(true));
        hearts = Array.from({ length: Math.round(22 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(5, 11), v: rand(10, 26), p: rand(0, TAU), c: pick(['#FF7EB3', '#FFB0D0', '#FFFFFF', '#C9B6FF']) }));
        twinkles = Array.from({ length: Math.round(30 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(3, 7), p: rand(0, TAU), v: rand(1, 2.5) }));
      };
      function face(x, y, s, kind, t, blinkAt) {
        const K = KINDS[kind];
        ctx.save(); ctx.translate(x, y);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(90,50,80,.25)';
        const ear = (ex, ey, rx, ry, rot, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, TAU); ctx.fill(); };
        if (kind === 'bunny') { ear(-s * 0.38, -s * 1.15, s * 0.22, s * 0.62, -0.15, K.body); ear(s * 0.38, -s * 1.15, s * 0.22, s * 0.62, 0.15, K.body); ear(-s * 0.38, -s * 1.1, s * 0.1, s * 0.42, -0.15, K.inner); ear(s * 0.38, -s * 1.1, s * 0.1, s * 0.42, 0.15, K.inner); }
        if (kind === 'kitty') for (const d of [-1, 1]) { ctx.fillStyle = K.body; ctx.beginPath(); ctx.moveTo(d * s * 0.85, -s * 0.35); ctx.lineTo(d * s * 0.62, -s * 1.08); ctx.lineTo(d * s * 0.18, -s * 0.78); ctx.fill(); ctx.fillStyle = K.inner; ctx.beginPath(); ctx.moveTo(d * s * 0.72, -s * 0.5); ctx.lineTo(d * s * 0.6, -s * 0.9); ctx.lineTo(d * s * 0.36, -s * 0.74); ctx.fill(); }
        if (kind === 'bear' || kind === 'panda') { const c = kind === 'panda' ? '#2F2F3A' : K.body; ear(-s * 0.7, -s * 0.72, s * 0.32, s * 0.32, 0, c); ear(s * 0.7, -s * 0.72, s * 0.32, s * 0.32, 0, c); if (kind === 'bear') { ear(-s * 0.7, -s * 0.72, s * 0.16, s * 0.16, 0, K.inner); ear(s * 0.7, -s * 0.72, s * 0.16, s * 0.16, 0, K.inner); } }
        if (kind === 'frog') { ear(-s * 0.5, -s * 0.78, s * 0.32, s * 0.3, 0, K.body); ear(s * 0.5, -s * 0.78, s * 0.32, s * 0.3, 0, K.body); }
        if (kind === 'chick') { ctx.strokeStyle = '#E8A93A'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -s * 0.95); ctx.quadraticCurveTo(-s * 0.25, -s * 1.35, s * 0.05, -s * 1.3); ctx.stroke(); }
        ctx.fillStyle = K.body; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.9, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(90,50,80,.18)'; ctx.lineWidth = 2; ctx.stroke();
        // eyes
        const ey = kind === 'frog' ? -s * 0.78 : -s * 0.05, ex = kind === 'frog' ? s * 0.5 : s * 0.36;
        const blink = (t % blinkAt) < 0.14;
        for (const d of [-1, 1]) {
          if (kind === 'panda') { ctx.fillStyle = '#2F2F3A'; ctx.beginPath(); ctx.ellipse(d * ex, ey, s * 0.2, s * 0.25, d * 0.5, 0, TAU); ctx.fill(); }
          if (blink) { ctx.strokeStyle = kind === 'panda' ? '#fff' : '#2B1B2E'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d * ex, ey, s * 0.09, 0.2, Math.PI - 0.2); ctx.stroke(); continue; }
          ctx.fillStyle = kind === 'panda' ? '#FFFFFF' : '#2B1B2E'; ctx.beginPath(); ctx.arc(d * ex, ey, s * 0.11, 0, TAU); ctx.fill();
          ctx.fillStyle = kind === 'panda' ? '#2B1B2E' : '#FFFFFF'; ctx.beginPath(); ctx.arc(d * ex + s * 0.035, ey - s * 0.04, s * 0.04, 0, TAU); ctx.fill();
        }
        // blush
        ctx.fillStyle = 'rgba(255,120,160,.45)';
        for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.58, s * 0.22, s * 0.16, s * 0.1, 0, 0, TAU); ctx.fill(); }
        // mouth / beak
        if (kind === 'chick') { ctx.fillStyle = K.inner; ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.12); ctx.lineTo(s * 0.12, s * 0.12); ctx.lineTo(0, s * 0.3); ctx.fill(); }
        else { ctx.strokeStyle = '#2B1B2E'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-s * 0.08, s * 0.16, s * 0.08, 0.1, Math.PI - 0.1); ctx.arc(s * 0.08, s * 0.16, s * 0.08, 0.1, Math.PI - 0.1); ctx.stroke(); }
        if (kind === 'bunny' || kind === 'kitty' || kind === 'bear') { ctx.fillStyle = '#FF8FB1'; ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.07, s * 0.05, 0, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      // ---- interactive bits: popped balloons drop their animal onto the trampoline floor ----
      let jumpers = [], bits = [], rings = [], dips = [];
      const MAX_JUMPERS = 14, G = 1500;
      const matY = () => H - Math.max(26, Math.min(44, H * 0.05));
      function popPal(q) {
        const x = q.cx, by = q.by;
        rings.push({ x, y: by, r: q.br * 0.6, life: 1 });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + rand(-0.2, 0.2), v = rand(140, 300);
          bits.push({ x, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 1, c: i % 3 ? q.bal : '#FFFFFF', rot: rand(0, TAU), vr: rand(-10, 10), s: rand(4, 8) });
        }
        if (jumpers.length >= MAX_JUMPERS) { const old = jumpers.find((j) => !j.leaving); if (old) old.leaving = true; }
        jumpers.push({ lo: 0, hi: W, /* bounce anywhere, including behind the cards */ x: q.cx, y: q.y, vx: rand(-90, 90), vy: rand(-260, -120), s: q.s, kind: q.kind, rot: 0, vr: rand(-3, 3), bounces: 0, squash: 0, blink: q.blink, p: q.p, leaving: false });
        Object.assign(q, pal(false));
      }
      function hitPal(x, y) {
        for (let i = pals.length - 1; i >= 0; i--) {
          const q = pals[i];
          if (q.cx === undefined) continue;
          const dx = (x - q.cx) / (q.br * 1.15), dy = (y - q.by) / (q.br * 1.3);
          if (dx * dx + dy * dy <= 1 || Math.hypot(x - q.cx, y - q.y) < q.s * 1.1) return q;
        }
        return null;
      }
      function hitJumper(x, y) { return jumpers.find((j) => Math.hypot(x - j.x, y - j.y) < j.s * 1.3) || null; }
      function stepJumpers(dt) {
        const floor = matY();
        for (const j of jumpers) {
          j.vy += G * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.rot += j.vr * dt;
          j.squash = Math.max(0, j.squash - dt * 4);
          if (j.x < j.lo + j.s) { j.x = j.lo + j.s; j.vx = Math.abs(j.vx); }
          if (j.x > j.hi - j.s) { j.x = j.hi - j.s; j.vx = -Math.abs(j.vx); }
          if (!j.leaving && j.y < j.s) { j.y = j.s; j.vy = Math.abs(j.vy) * 0.4; }
          if (j.vy > 0 && j.y + j.s * 0.9 >= floor) {
            j.y = floor - j.s * 0.9;
            j.bounces++;
            if (j.bounces > 9) j.leaving = true; // after a while it boings off the top of the screen
            j.vy = -(j.leaving ? rand(1500, 1800) : rand(820, 1180));
            j.vx = Math.max(-260, Math.min(260, j.vx + rand(-140, 140)));
            j.vr = rand(-5, 5);
            j.squash = 1;
            dips.push({ x: j.x, d: 16 + j.s * 0.4, v: 0, life: 1.2 });
            if (Math.random() < 0.35) bits.push({ x: j.x, y: j.y - j.s, vx: rand(-40, 40), vy: rand(-160, -90), life: 1, c: '#FF7EB3', heart: true, rot: 0, vr: 0, s: rand(6, 9) });
          }
        }
        jumpers = jumpers.filter((j) => !(j.leaving && j.y < -j.s * 4));
        if (dips.length > 6) dips.splice(0, dips.length - 6);
        for (const d of dips) { d.life -= dt; d.v += (-d.d * 260 - d.v * 7) * dt; d.d += d.v * dt; }
        dips = dips.filter((d) => d.life > 0);
      }
      function trampoline() {
        const y = matY();
        const off = (x) => { let o = 0; for (const d of dips) { const k = (x - d.x) / 70; o += d.d * Math.exp(-k * k) * Math.min(1, d.life * 2); } return o; };
        // springs + frame
        ctx.fillStyle = '#6D5BD0'; ctx.fillRect(0, y + 8, W, H - y - 8);
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = 10; x < W; x += 34) { ctx.moveTo(x, y + 9); ctx.lineTo(x + 6, y + 3 + off(x) * 0.3); }
        ctx.stroke();
        // mat
        ctx.fillStyle = '#2E2547'; ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= W + 24; x += 24) ctx.lineTo(x, y + off(x));
        ctx.lineTo(W, y + 8); ctx.lineTo(0, y + 8); ctx.closePath(); ctx.fill();
        // padded edge
        ctx.fillStyle = '#FF9EC7'; ctx.fillRect(0, y + 8, W, 7);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 0; x < W; x += 40) ctx.fillRect(x, y + 8, 20, 7);
      }
      function drawBits(dt) {
        for (const r of rings) {
          r.life -= dt * 3.2; r.r += dt * 260;
          if (r.life <= 0) continue;
          ctx.globalAlpha = r.life; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(r.x + Math.cos(a) * r.r * 0.6, r.y + Math.sin(a) * r.r * 0.6); ctx.lineTo(r.x + Math.cos(a) * r.r * 0.95, r.y + Math.sin(a) * r.r * 0.95); ctx.stroke(); }
        }
        rings = rings.filter((r) => r.life > 0);
        for (const b of bits) {
          b.life -= dt * (b.heart ? 0.9 : 1.6);
          b.vy += (b.heart ? -30 : 700) * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
          if (b.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, b.life * 1.5); ctx.fillStyle = b.c;
          if (b.heart) { heartPath(b.x, b.y, b.s); ctx.fill(); continue; }
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillRect(-b.s / 2, -b.s / 3, b.s, b.s * 0.66); ctx.restore();
        }
        ctx.globalAlpha = 1;
        bits = bits.filter((b) => b.life > 0);
        if (bits.length > 160) bits.splice(0, bits.length - 160);
      }
      reset();
      return {
        resize: reset,
        hover(x, y) { return !!(hitPal(x, y) || hitJumper(x, y)); },
        tap(x, y) {
          const j = hitJumper(x, y);
          if (j) { j.vy = -rand(950, 1250); j.vx += rand(-200, 200); j.vr = rand(-8, 8); return true; }
          const q = hitPal(x, y);
          if (q) { popPal(q); return true; }
          return false;
        },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#FFE3F0'], [0.5, '#F6D3F5'], [1, '#D9D2FF']]);
          ctx.fillRect(0, 0, W, H);
          for (const w of twinkles) sparkle(w.x, w.y, w.s, '#FFFFFF', 0.25 + 0.6 * Math.abs(Math.sin(t * w.v + w.p)));
          for (const h of hearts) {
            h.y -= h.v * dt; if (h.y < -20) { h.y = H + 20; h.x = rand(0, W); }
            ctx.globalAlpha = 0.75; ctx.fillStyle = h.c; heartPath(h.x + Math.sin(t + h.p) * 12, h.y, h.s); ctx.fill(); ctx.globalAlpha = 1;
          }
          toFront();
          pals.sort((a, b) => a.s - b.s);
          for (const q of pals) {
            q.y -= q.v * dt;
            if (q.y < -q.s * 6) Object.assign(q, pal(false));
            const x = q.x + Math.sin(t * 0.8 + q.p) * 18, y = q.y;
            const br = q.s * 1.05, by = y - q.s * 3.1;
            q.cx = x; q.by = by; q.br = br; // remembered for tapping
            // string
            ctx.strokeStyle = 'rgba(120,90,130,.45)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x, by + br * 1.1); ctx.quadraticCurveTo(x + Math.sin(t * 2 + q.p) * 8, (by + y) / 2, x, y - q.s * 0.9); ctx.stroke();
            // balloon
            ctx.fillStyle = q.bal; ctx.beginPath(); ctx.ellipse(x, by, br, br * 1.15, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x - 4, by + br * 1.12); ctx.lineTo(x + 4, by + br * 1.12); ctx.lineTo(x, by + br * 1.0); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - br * 0.35, by - br * 0.4, br * 0.18, br * 0.3, -0.5, 0, TAU); ctx.fill();
            face(x, y, q.s, q.kind, t + q.p, q.blink);
          }
          trampoline(); // in front of new balloons rising from below, behind the bouncing animals
          stepJumpers(dt);
          for (const j of jumpers) {
            const sq = j.squash;
            ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(j.rot); ctx.scale(1 + sq * 0.25, 1 - sq * 0.22);
            face(0, 0, j.s, j.kind, t + j.p, j.blink);
            ctx.restore();
          }
          drawBits(dt);
        },
      };
    },
  };

  function use(name) {
    if (name === current) return;
    current = name;
    stopLoop();
    parts = [];
    if (!name || !SCENES[name]) {
      scene = null;
      if (canvas) { bctx.clearRect(0, 0, W, H); fctx.clearRect(0, 0, W, H); canvas.hidden = true; front.hidden = true; }
      return;
    }
    ensureCanvas();
    canvas.hidden = false; front.hidden = false;
    t0 = performance.now();
    scene = SCENES[name]();
    if (reduce) frame(performance.now()); else startLoop();
  }

  // Taps on the empty background (not on a card, button or menu) go to the animated scene, for
  // themes that can be played with (pop balloons, tap piano keys).
  const UI = '.card, button, a, input, select, textarea, label, .sheet-backdrop, .sheet, [role="dialog"], .toast, .pop-msg, .coffee-btn, ul, li, h2, h3, .card p';
  const onBackground = (e) => !(e.target && e.target.closest && e.target.closest(UI));
  let drag = null;
  window.addEventListener('pointerdown', (e) => {
    if (!scene || !scene.tap || reduce || !onBackground(e)) return;
    if (scene.pointer && e.pointerType !== 'mouse') scene.pointer(e.clientX, e.clientY, false, true);
    if (scene.press && e.button === 0) { // hold to keep doing something (Ember's lava stream)
      drag = { id: e.pointerId, press: true, scene };
      scene.press(e.clientX, e.clientY);
      document.documentElement.classList.add('fx-drawing');
      return;
    }
    if (scene.dragStart && e.button === 0) { // decide on release: tap, or a swipe that draws
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, len: 0, lx: e.clientX, ly: e.clientY, on: false, scene };
      document.documentElement.classList.add('fx-drawing');
      return;
    }
    const n = performance.now();
    if (n - lastTapAt < 70) return; // mashing can't pile up effects
    lastTapAt = n;
    scene.tap(e.clientX, e.clientY);
  }, { passive: true });
  let hoverOn = false, lastTapAt = 0;
  // Phones: a swipe on the background would scroll the page, and the browser then cancels the
  // touch (that's what cut Sakura's drawings short). For themes you draw on or hold, a touch that
  // starts on the empty background doesn't scroll; touches on the cards scroll as usual.
  document.addEventListener('touchstart', (e) => {
    if (!scene || reduce || !(scene.dragStart || scene.press)) return;
    if (e.touches.length !== 1 || !onBackground(e)) return;
    e.preventDefault();
  }, { passive: false });
  // If the phone still takes the swipe over (scrolling), the browser cancels the pointer; keep
  // following the finger through touch events instead, until it lifts.
  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    if (drag.cancelled && e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  document.addEventListener('touchend', () => { if (drag && drag.cancelled) { drag.cancelled = false; endDrag({ pointerId: drag.id, type: 'pointerup' }); } });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && scene && scene.pointer) scene.pointer(-99, -99, false); });
  function moveDrag(x, y) {
    if (!drag || drag.scene !== scene) return;
    if (drag.press) { scene.pressMove(x, y); return; }
    drag.len += Math.hypot(x - drag.lx, y - drag.ly); drag.lx = x; drag.ly = y;
    if (!drag.on && drag.len > 12) { drag.on = true; scene.dragStart(drag.x0, drag.y0); }
    if (drag.on) scene.dragMove(x, y);
  }
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    moveDrag(e.clientX, e.clientY);
  }, { passive: true });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    document.documentElement.classList.remove('fx-drawing');
    if (d.scene !== scene) return;
    if (d.press) { scene.pressEnd(); return; }
    if (d.on) scene.dragEnd(); else if (e && e.type === 'pointerup') scene.tap(d.x0, d.y0);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id && e.pointerType === 'touch') { drag.cancelled = true; return; } // touch events take over
    endDrag(e);
  });
  window.addEventListener('pointermove', (e) => {
    if (scene && scene.pointer && e.pointerType === 'mouse') scene.pointer(e.clientX, e.clientY, onBackground(e));
    if (e.pointerType !== 'mouse') return;
    const on = !!(scene && scene.hover && !reduce && onBackground(e) && scene.hover(e.clientX, e.clientY));
    const want = on ? (scene.cursor || 'pointer') : '';
    if (want !== hoverOn) { hoverOn = want; document.documentElement.style.cursor = want; }
  }, { passive: true });

  window.addEventListener('sliver:theme', (e) => use(e.detail && e.detail.fx));
  window.SliverFx = { scenes: Object.keys(SCENES), use, scene: () => scene };
  const start = () => use(document.documentElement.dataset.fx || null);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
