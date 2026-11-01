/* Animated backgrounds for the premium themes (see shop.js / themes.js).
 * One canvas behind the page, redrawn every frame by the theme's scene. Everything is drawn
 * here from scratch (no images). Pauses when the tab is hidden; with "reduce motion" turned on
 * it draws one still frame. */
(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let canvas = null, ctx = null, W = 0, H = 0, DPR = 1, scene = null, raf = 0, last = 0, t0 = 0, current = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else if (scene) startLoop(); });
    resize();
  }
  function resize() {
    if (!canvas) return;
    DPR = light ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (scene && scene.resize) scene.resize();
    if (scene && reduce) frame(performance.now());
  }
  const density = () => Math.max(0.45, Math.min(1.6, (W * H) / (1366 * 768)));

  // Phones and small screens: 30 fps and 1x resolution, so the background never slows the game down.
  const light = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.hardwareConcurrency || 8) <= 4;
  function frame(now) {
    raf = 0;
    if (!scene) return;
    if (light && last && now - last < 31) { if (!reduce && !document.hidden) raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    scene.draw(dt, (now - t0) / 1000);
    drawParts(dt);
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
      reset();
      return {
        resize: reset,
        hover: () => true,
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
          for (const q of petals) {
            q.y += q.vy * dt; q.x += Math.sin(t * 0.9 + q.p) * q.sway * dt + 12 * dt; q.rot += q.spin * dt;
            if (q.y > H + 30) Object.assign(q, newPetal(false));
            petal(q, t);
          }
        },
      };
    },

    // Pastel sky: puffy clouds drifting at different depths, hearts floating up, twinkles.
    cottoncandy() {
      let clouds = [], hearts = [], stars = [], cloudsNow = [];
      const hitCloud = (x, y) => cloudsNow.slice().reverse().find((c) => c.puffs.some(([dx, dy, r]) => Math.hypot(x - (c.x + dx * c.s), y - (c.y + dy * c.s)) < r * c.s * 1.1));
      const cloud = (any) => ({ x: any ? rand(-200, W) : -320, y: rand(20, H * 0.85), s: rand(0.5, 1.5), v: rand(8, 26), puffs: Array.from({ length: 6 }, (_, i) => [i * 34 - 85 + rand(-8, 8), rand(-24, 6), rand(26, 48)]) });
      const heart = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + 30, s: rand(8, 18), v: rand(18, 40), p: rand(0, TAU), col: pick(['#FF8FC8', '#FFB6D9', '#FFFFFF', '#F472B6', '#C4B5FD']) });
      const reset = () => {
        clouds = Array.from({ length: Math.round(9 * density()) }, () => cloud(true)).sort((a, b) => a.s - b.s);
        hearts = Array.from({ length: Math.round(18 * density()) }, () => heart(true));
        stars = Array.from({ length: Math.round(40 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(3, 7), p: rand(0, TAU), v: rand(1.5, 3.5) }));
      };
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap a cloud: it boings and rains hearts. Anywhere else: a pop of hearts and twinkles.
        tap(x, y) {
          const c = hitCloud(x, y);
          if (c) { c.boing = 1; return true; }
          burst(x, y, 12, (i, a) => { const v = rand(90, 220); return { kind: 'heart', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, drag: 2, g: -20, s: rand(6, 12), decay: 0.8, c: pick(['#FF8FC8', '#FFB6D9', '#FFFFFF', '#F472B6', '#C4B5FD']) }; });
          burst(x, y, 6, () => ({ kind: 'star', x: x + rand(-40, 40), y: y + rand(-40, 40), s: rand(4, 8), decay: 1.4, c: '#FFFFFF' }));
          return true;
        },
        draw(dt, t) {
          const shift = (Math.sin(t * 0.08) + 1) / 2;
          cloudsNow = clouds;
          ctx.fillStyle = grad(0, H, [[0, `hsl(${330 - shift * 20},90%,84%)`], [0.5, `hsl(${265 + shift * 10},85%,82%)`], [1, `hsl(${200 + shift * 15},90%,80%)`]]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) sparkle(s.x, s.y, s.s, '#FFFFFF', 0.25 + 0.75 * Math.abs(Math.sin(t * s.v + s.p)));
          for (const c of clouds) {
            c.x += c.v * c.s * dt; if (c.x > W + 260) Object.assign(c, cloud(false));
            c.boing = Math.max(0, (c.boing || 0) - dt * 1.6);
            const sq = c.boing ? Math.sin(c.boing * 18) * c.boing * 0.18 : 0; // wobbly squash after a tap
            if (c.boing && Math.random() < dt * 14) emit({ kind: 'heart', x: c.x + rand(-80, 80) * c.s, y: c.y + 20 * c.s, vy: rand(60, 120), vx: rand(-15, 15), s: rand(5, 9), decay: 0.7, c: pick(['#FF8FC8', '#F472B6', '#C4B5FD']) });
            for (const [dx0, dy0, r] of c.puffs) {
              const dx = dx0 * (1 + sq), dy = dy0 * (1 - sq);
              const g = ctx.createRadialGradient(c.x + dx * c.s, c.y + dy * c.s, 0, c.x + dx * c.s, c.y + dy * c.s, r * c.s * 1.6);
              g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x + dx * c.s, c.y + dy * c.s, r * c.s * 1.6, 0, TAU); ctx.fill();
            }
          }
          for (const h of hearts) {
            h.y -= h.v * dt; if (h.y < -30) Object.assign(h, heart(false));
            ctx.globalAlpha = 0.75; ctx.fillStyle = h.col;
            heartPath(h.x + Math.sin(t * 1.2 + h.p) * 18, h.y, h.s * (1 + 0.08 * Math.sin(t * 4 + h.p))); ctx.fill();
            ctx.globalAlpha = 1;
          }
        },
      };
    },

    // Underwater: swaying light rays, bubbles, little fish and glittering scales.
    lagoon() {
      let bubbles = [], fish = [], glints = [];
      const bubble = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + 20, r: rand(2, 9), v: rand(25, 70), p: rand(0, TAU) });
      const newFish = () => ({ x: Math.random() < 0.5 ? -60 : W + 60, y: rand(H * 0.25, H * 0.9), s: rand(0.6, 1.3), v: rand(30, 60), col: pick(['#5EEAD4', '#A78BFA', '#F0ABFC', '#FDE68A']), p: rand(0, TAU) });
      const reset = () => {
        bubbles = Array.from({ length: Math.round(45 * density()) }, () => bubble(true));
        fish = Array.from({ length: Math.round(5 * density()) }, newFish).map((f) => ({ ...f, x: rand(0, W) }));
        glints = Array.from({ length: Math.round(30 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), p: rand(0, TAU), v: rand(2, 5) }));
      };
      const hitBubble = (x, y) => bubbles.find((b) => Math.hypot(x - b.x, y - b.y) < Math.max(14, b.r + 8));
      const hitFish = (x, y) => fish.find((f) => Math.abs(x - f.x) < 34 * f.s && Math.abs(y - f.y) < 18 * f.s);
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap a bubble to pop it, tap a fish and it darts off, anywhere else blows a stream of bubbles.
        tap(x, y) {
          const b = hitBubble(x, y);
          if (b) {
            ring(b.x, b.y, 'rgba(224,255,251,.9)', { s: b.r, grow: 120, decay: 3, w: 1.5 });
            burst(b.x, b.y, 8, (i, a) => ({ x: b.x, y: b.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 3, s: 1.6, decay: 2.2, c: '#E0FFFB' }));
            Object.assign(b, bubble(false));
            return true;
          }
          const f = hitFish(x, y);
          if (f) { f.v = 420; f.dash = 1; burst(f.x, f.y, 6, () => ({ kind: 'bubble', x: f.x, y: f.y, vx: rand(-30, 30), vy: -rand(40, 90), s: rand(2, 4), vr: 6, decay: 0.8, c: 'rgba(224,255,251,.8)' })); return true; }
          burst(x, y, 14, () => ({ kind: 'bubble', x: x + rand(-14, 14), y: y + rand(-6, 6), vx: rand(-25, 25), vy: -rand(70, 170), s: rand(3, 10), vr: rand(3, 7), decay: rand(0.35, 0.6), c: 'rgba(224,255,251,.8)' }));
          return true;
        },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#22B8C9'], [0.45, '#0E7490'], [1, '#083344']]);
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 7; i++) { // light rays from the surface
            const x = (i + 0.5) * (W / 7) + Math.sin(t * 0.4 + i) * 60, w = 40 + 30 * Math.sin(t * 0.7 + i * 2);
            const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
            g.addColorStop(0, 'rgba(200,255,250,.16)'); g.addColorStop(1, 'rgba(200,255,250,0)');
            ctx.fillStyle = g; ctx.beginPath();
            ctx.moveTo(x - w, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 3 + 80, H * 0.9); ctx.lineTo(x + w * 1.5 + 80, H * 0.9); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const g of glints) sparkle(g.x, g.y, 3, '#E0FFFB', 0.6 * Math.max(0, Math.sin(t * g.v + g.p)));
          for (const f of fish) {
            const dir = f.vx || (f.x < 0 ? 1 : -1); f.vx = dir;
            f.x += dir * f.v * dt; f.y += Math.sin(t * 1.5 + f.p) * 6 * dt;
            if (f.dash) { f.dash = Math.max(0, f.dash - dt); if (!f.dash) f.v = rand(30, 60); }
            if (f.x < -80 || f.x > W + 80) Object.assign(f, newFish(), { vx: 0 });
            ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir * f.s, f.s); ctx.globalAlpha = 0.55; ctx.fillStyle = f.col;
            ctx.beginPath(); ctx.ellipse(0, 0, 18, 8, 0, 0, TAU); ctx.fill();
            const wag = Math.sin(t * 8 + f.p) * 4;
            ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-28, -8 + wag); ctx.lineTo(-28, 8 + wag); ctx.fill();
            ctx.restore(); ctx.globalAlpha = 1;
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

    // Northern lights rippling over mountains under the stars.
    aurora() {
      let stars = [];
      const reset = () => { stars = Array.from({ length: Math.round(140 * density()) }, () => ({ x: rand(0, W), y: rand(0, H * 0.75), r: rand(0.4, 1.6), p: rand(0, TAU), v: rand(0.5, 2) })); };
      reset();
      const bands = [
        { hue: 150, y: 0.28, amp: 70, f: 0.004, s: 0.25, h: 170 },
        { hue: 175, y: 0.36, amp: 55, f: 0.006, s: -0.18, h: 130 },
        { hue: 275, y: 0.22, amp: 80, f: 0.003, s: 0.12, h: 120 },
      ];
      let surge = 0, surgeX = 0, low = null, lctx = null;
      // Each band's colour fade is drawn once into a tiny sprite and stretched per column
      // (much cheaper than building a gradient for every column every frame).
      for (const b of bands) {
        const c = document.createElement('canvas'); c.width = 1; c.height = 128;
        const g = c.getContext('2d'), lg = g.createLinearGradient(0, 0, 0, 128);
        lg.addColorStop(0, `hsla(${b.hue + 40},90%,65%,0)`); lg.addColorStop(0.7 * (108 / 128), `hsla(${b.hue},90%,60%,.10)`); lg.addColorStop(1, `hsla(${b.hue - 10},95%,70%,.22)`);
        g.fillStyle = lg; g.fillRect(0, 0, 1, 128); b.sprite = c;
      }
      return {
        resize: reset,
        hover: () => true,
        // Tap: the lights flare up around where you tapped, with a shower of green/violet sparkles.
        tap(x, y) {
          surge = 1; surgeX = x;
          burst(x, y, 18, (i, a) => { const v = rand(60, 200); return { kind: 'glow', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.8, g: 25, s: rand(1.2, 2.6), decay: rand(0.5, 0.9), add: true, c: pick(['#6EE7B7', '#34D399', '#A78BFA', '#67E8F9']) }; });
          return true;
        },
        draw(dt, t) {
          surge = Math.max(0, surge - dt * 0.45);
          ctx.fillStyle = grad(0, H, [[0, '#020617'], [0.6, '#0B1430'], [1, '#111C3A']]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.v + s.p)); ctx.fillStyle = '#E0F2FE'; ctx.fillRect(s.x, s.y, s.r, s.r); }
          ctx.globalAlpha = 1;
          // The lights are soft anyway, so they're drawn at quarter size and scaled up (much lighter).
          const Q = 4;
          if (!low || low.width !== Math.ceil(W / Q) || low.height !== Math.ceil(H / Q)) { low = document.createElement('canvas'); low.width = Math.ceil(W / Q); low.height = Math.ceil(H / Q); lctx = low.getContext('2d'); }
          lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, low.width, low.height);
          lctx.globalCompositeOperation = 'lighter'; lctx.setTransform(1 / Q, 0, 0, 1 / Q, 0, 0);
          for (const b of bands) {
            for (let x = -10; x < W + 10; x += 8) {
              const y = H * b.y + Math.sin(x * b.f + t * b.s * 2) * b.amp + Math.sin(x * b.f * 2.7 - t * b.s * 3) * b.amp * 0.35;
              const boost = surge ? 1 + surge * 1.4 * Math.exp(-(((x - surgeX) / (W * 0.25)) ** 2)) : 1;
              const h = b.h * (0.6 + 0.4 * Math.sin(x * 0.01 + t * 0.8 + b.hue)) * boost;
              lctx.globalAlpha = Math.min(1, boost);
              lctx.drawImage(b.sprite, x, y - h, 8, h + 20);
            }
          }
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(low, 0, 0, W, H);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#050A18';
          ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H - 60 - Math.abs(Math.sin(x * 0.006) * 120) - Math.abs(Math.sin(x * 0.017 + 1) * 40));
          ctx.lineTo(W, H); ctx.fill();
        },
      };
    },

    // Deep space: three layers of stars drifting, glowing nebulae, shooting stars.
    nebula() {
      let layers = [], clouds = [], shoot = null, nextShot = 2, warp = 0;
      const reset = () => {
        layers = [0.25, 0.6, 1.2].map((speed, i) => ({ speed, stars: Array.from({ length: Math.round([160, 80, 30][i] * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: [0.7, 1.2, 2][i] * rand(0.6, 1.2), p: rand(0, TAU) })) }));
        clouds = Array.from({ length: 5 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), r: rand(180, 380), hue: pick([320, 280, 210, 190, 340]), p: i }));
      };
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap: a supernova where you tapped, and the stars jump to warp speed for a moment.
        tap(x, y) {
          warp = 1;
          ring(x, y, 'rgba(255,255,255,.9)', { grow: 420, decay: 1.6, w: 3, add: true });
          ring(x, y, 'rgba(244,114,182,.8)', { grow: 260, decay: 1.2, w: 6, add: true });
          burst(x, y, 26, (i, a) => { const v = rand(80, 380); return { kind: 'glow', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.4, s: rand(1, 2.4), decay: rand(0.5, 0.9), add: true, c: pick(['#FFFFFF', '#F9A8D4', '#93C5FD', '#C4B5FD']) }; });
          return true;
        },
        draw(dt, t) {
          warp = Math.max(0, warp - dt * 0.7);
          const wf = 1 + warp * warp * 30;
          ctx.fillStyle = '#05031A'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (const c of clouds) {
            const x = c.x + Math.sin(t * 0.05 + c.p) * 60, y = c.y + Math.cos(t * 0.04 + c.p) * 40;
            const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
            g.addColorStop(0, `hsla(${c.hue},80%,55%,.22)`); g.addColorStop(0.5, `hsla(${c.hue + 30},80%,45%,.08)`); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, c.r, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const L of layers) {
            for (const s of L.stars) {
              s.x -= L.speed * 12 * wf * dt; if (s.x < -2) { s.x = W + 2; s.y = rand(0, H); }
              ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
              ctx.fillStyle = '#F8FAFF';
              if (wf > 3) ctx.fillRect(s.x, s.y - s.r / 2, Math.min(80, L.speed * wf * 1.4), s.r); // stretched into streaks
              else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
            }
          }
          ctx.globalAlpha = 1;
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

    // Retro neon: striped sun, mountains and a grid racing toward you.
    synthwave() {
      let turbo = 0, pos = 0, sunPulse = 0;
      return {
        hover: () => true,
        // Tap: turbo! The grid rushes toward you, the sun pulses, and a neon ring shoots out.
        tap(x, y) {
          turbo = 1; sunPulse = 1;
          ring(x, y, '#FF2E97', { grow: 520, decay: 1.5, w: 3, add: true });
          ring(x, y, '#22D3EE', { grow: 340, decay: 1.5, w: 2, add: true });
          burst(x, y, 16, (i, a) => { const v = rand(200, 460); return { kind: 'streak', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2, s: 2, decay: 1.6, add: true, c: pick(['#FF2E97', '#22D3EE', '#FDE047']) }; });
          return true;
        },
        draw(dt, t) {
          turbo = Math.max(0, turbo - dt * 0.5); sunPulse = Math.max(0, sunPulse - dt * 2);
          pos += dt * 0.6 * (1 + turbo * turbo * 7);
          const horizon = H * 0.58;
          ctx.fillStyle = grad(0, horizon, [[0, '#0B0024'], [0.6, '#3B0764'], [1, '#9D174D']]);
          ctx.fillRect(0, 0, W, horizon);
          // sun with stripes sliding down
          const r = Math.min(W, H) * 0.22 * (1 + sunPulse * 0.08), cx = W / 2, cy = horizon - r * 0.35;
          ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
          ctx.fillStyle = grad(cy - r, cy + r, [[0, '#FDE047'], [0.5, '#FB7185'], [1, '#C026D3']]);
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
          ctx.fillStyle = '#2A0550';
          for (let i = 0; i < 7; i++) {
            const k = ((i + (t * 0.25) % 1) / 7);
            const y = cy + k * r, h = 2 + k * 9;
            if (y > cy) ctx.fillRect(cx - r, y, r * 2, h);
          }
          ctx.restore();
          glowDot(cx, cy, r * 1.8, 'rgba(251,113,133,.35)');
          // mountains
          ctx.fillStyle = '#1E0638'; ctx.strokeStyle = '#FF2E97'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(0, horizon);
          const peaks = [[0, 0.3], [0.08, 0.55], [0.17, 0.25], [0.27, 0.62], [0.36, 0.2], [0.64, 0.25], [0.72, 0.6], [0.82, 0.3], [0.9, 0.5], [1, 0.25]];
          for (const [px, ph] of peaks) ctx.lineTo(px * W, horizon - ph * H * 0.16);
          ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill(); ctx.stroke();
          // floor + grid
          ctx.fillStyle = grad(horizon, H, [[0, '#1A0033'], [1, '#05000F']]);
          ctx.fillRect(0, horizon, W, H - horizon);
          ctx.strokeStyle = 'rgba(34,211,238,.75)'; ctx.lineWidth = 1.4;
          const speed = pos % 1;
          for (let i = 0; i < 18; i++) {
            const z = (i + 1 - speed) / 18; // 0 far .. 1 near
            const y = horizon + Math.pow(z, 2.2) * (H - horizon);
            ctx.globalAlpha = Math.min(1, z * 1.6);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          for (let i = -16; i <= 16; i++) {
            ctx.beginPath(); ctx.moveTo(cx + i * (W / 60), horizon); ctx.lineTo(cx + i * (W / 6), H); ctx.stroke();
          }
          ctx.fillStyle = grad(horizon - 2, horizon + 30, [[0, 'rgba(255,46,151,.55)'], [1, 'rgba(255,46,151,0)']]);
          ctx.fillRect(0, horizon - 2, W, 32);
        },
      };
    },

    // Forge: a glow at the bottom, embers and sparks rising and flickering.
    ember() {
      let embers = [];
      const ember = (any) => ({ x: rand(0, W), y: any ? rand(0, H) : H + rand(0, 40), r: rand(0.8, 2.6), vy: rand(40, 120), sway: rand(10, 40), p: rand(0, TAU), life: rand(0.6, 1), hot: Math.random() < 0.15 });
      const reset = () => { embers = Array.from({ length: Math.round(110 * density()) }, () => ember(true)); };
      let heat = 0;
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap: like a hammer on an anvil, a fountain of sparks flies out and the forge flares.
        tap(x, y) {
          heat = 1;
          ring(x, y, 'rgba(255,200,120,.9)', { grow: 300, decay: 3, w: 2, add: true });
          burst(x, y, 34, () => { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(220, 620); return { kind: 'streak', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, s: rand(1.2, 2.4), decay: rand(0.7, 1.3), add: true, c: pick(['#FFE7A3', '#FDBA74', '#FB923C', '#FFFFFF']) }; });
          return true;
        },
        draw(dt, t) {
          heat = Math.max(0, heat - dt * 1.2);
          ctx.fillStyle = grad(0, H, [[0, '#0A0503'], [0.65, '#1C0D06'], [1, '#3A1405']]);
          ctx.fillRect(0, 0, W, H);
          const pulse = 0.85 + 0.15 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 7.1) + heat * 0.35;
          glowDot(W / 2, H + 80, Math.max(W, H) * 0.75 * pulse, 'rgba(249,115,22,.55)');
          glowDot(W * 0.2, H + 40, W * 0.35, 'rgba(234,88,12,.35)');
          glowDot(W * 0.8, H + 40, W * 0.35, 'rgba(251,191,36,.25)');
          ctx.globalCompositeOperation = 'lighter';
          for (const e of embers) {
            e.y -= e.vy * dt; e.x += Math.sin(t * 2 + e.p) * e.sway * dt;
            const k = e.y / H;
            if (e.y < -10 || Math.random() < 0.0008) Object.assign(e, ember(false));
            const a = Math.max(0, Math.min(1, k * 1.4)) * (0.6 + 0.4 * Math.sin(t * 15 + e.p));
            const col = e.hot ? `rgba(255,236,170,${a})` : `rgba(255,${Math.round(110 + 80 * k)},40,${a})`;
            glowDot(e.x, e.y, e.r * 4, col, 0.9);
            if (e.hot) { ctx.strokeStyle = `rgba(255,200,120,${a * 0.6})`; ctx.lineWidth = e.r; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x, e.y + 14); ctx.stroke(); }
          }
          ctx.globalCompositeOperation = 'source-over';
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

    // Black marble with gold veins, drifting gold dust, a slow shine sweeping across.
    blackgold() {
      let marble = null, dust = [];
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
      let shine = null;
      const reset = () => { paintMarble(); dust = Array.from({ length: Math.round(90 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 2.2), vx: rand(-6, 6), vy: rand(-10, -3), p: rand(0, TAU), v: rand(1, 3) })); };
      reset();
      return {
        resize: reset,
        hover: () => true,
        // Tap: a shower of spinning gold coins that bounce off the bottom, and a gold shine ripples out.
        tap(x, y) {
          shine = { x, y, r: 0, life: 1 };
          burst(x, y, 9, () => { const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), v = rand(260, 560); return { kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1300, s: rand(6, 10), rot: rand(0, TAU), vr: rand(8, 16), decay: 0.45, floor: H - 8, c: pick(['#E8C25A', '#D4AF37', '#F5D77A']) }; });
          burst(x, y, 10, () => ({ kind: 'star', x: x + rand(-30, 30), y: y + rand(-30, 30), s: rand(4, 9), decay: 1.5, c: '#FFF3C4' }));
          return true;
        },
        draw(dt, t) {
          ctx.drawImage(marble, 0, 0, W, H);
          if (shine) {
            shine.r += dt * 700; shine.life -= dt * 0.9;
            const g2 = ctx.createRadialGradient(shine.x, shine.y, Math.max(0, shine.r - 90), shine.x, shine.y, shine.r);
            g2.addColorStop(0, 'rgba(245,230,168,0)'); g2.addColorStop(0.7, `rgba(245,230,168,${0.16 * shine.life})`); g2.addColorStop(1, 'rgba(245,230,168,0)');
            ctx.fillStyle = g2; ctx.fillRect(shine.x - shine.r, shine.y - shine.r, shine.r * 2, shine.r * 2);
            if (shine.life <= 0 || shine.r > Math.hypot(W, H)) shine = null;
          }
          const sweep = ((t * 0.12) % 1.6) - 0.3; // a band of light every ~13 s
          const sx = sweep * (W + H);
          const g = ctx.createLinearGradient(sx - 220, 0, sx + 220, H * 0.6);
          g.addColorStop(0, 'rgba(245,230,168,0)'); g.addColorStop(0.5, 'rgba(245,230,168,.07)'); g.addColorStop(1, 'rgba(245,230,168,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (const d of dust) {
            d.x += d.vx * dt; d.y += d.vy * dt;
            if (d.y < -5) { d.y = H + 5; d.x = rand(0, W); }
            const a = 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(t * d.v + d.p)), 3);
            glowDot(d.x, d.y, d.r * 4, `rgba(232,196,90,${a})`);
            if (a > 0.9 && d.r > 1.6) sparkle(d.x, d.y, d.r * 3, '#FFF3C4', 0.8);
          }
          ctx.globalCompositeOperation = 'source-over';
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
      };
      const hue = (m) => { const k = (m - LO) / (HI - LO); return `hsl(${Math.round(38 + k * 190)}, 85%, ${68 - k * 6}%)`; };
      let now = 0;
      const MAX_BARS = 70;
      function press(k, amt) {
        k.glow = Math.max(k.glow, amt);
        k.off = 0;
        // A new note only if this key wasn't just played, and never more than MAX_BARS on screen.
        if (!k.held && now - k.last > 0.18 && bars.length < MAX_BARS && (k.live || 0) < 3) { bars.push({ k, y: kbY, h: 0, growing: true, a: Math.min(1, 0.5 + amt) }); k.last = now; k.live = (k.live || 0) + 1; }
        k.held = true;
      }
      // A key lets go only after it's been quiet for a moment (the analysis flickers frame to frame).
      function release(k, dt) { k.off += dt; if (k.off > 0.12 && now > (k.tapUntil || 0)) k.held = false; }
      // Tapping a key: it lights up and music notes and sparkles burst out of it.
      let notes = [];
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
      let lastListen = 0, heard = false;
      function listen(dt) {
        if (now - lastListen < 1 / 30) return heard; // analyse at most 30 times a second
        const step = now - lastListen;
        lastListen = now;
        const A = window.SliverAudio && window.SliverAudio.spectrum && window.SliverAudio.spectrum();
        heard = !!A;
        if (!A) return false;
        dt = step;
        const { data, rate, size } = A;
        // Music has much more energy in the bass, so higher keys get a boost; each key is then
        // compared with the keys around it (not the whole keyboard), so treble notes register too.
        const raw = keys.map((k) => {
          const b = Math.round((k.f * size) / rate);
          return Math.max(data[b] || 0, data[b - 1] || 0, data[b + 1] || 0) / 255;
        });
        if (Math.max(...raw) < 0.12) { keys.forEach((k) => release(k, dt)); return true; }
        const vals = raw.map((v, i) => Math.min(1, v * (1 + (i / (keys.length - 1)) * 0.9)));
        keys.forEach((k, i) => {
          const v = vals[i];
          let sum = 0, n = 0;
          for (let j = Math.max(0, i - 6); j <= Math.min(keys.length - 1, i + 6); j++) if (j !== i) { sum += vals[j]; n++; }
          const local = sum / n;
          const peak = v >= (vals[i - 1] || 0) && v >= (vals[i + 1] || 0);
          const on = peak && v > 0.28 && v > local * 1.18 + 0.04;
          if (on) press(k, Math.min(1, (v - local) * 2.4 + 0.35)); else release(k, dt);
        });
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
        tap(x, y) { const k = keyAt(x, y); if (!k) return false; burst(k); return true; },
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#07070C'], [0.6, '#0F0F1A'], [1, '#17131F']]);
          ctx.fillRect(0, 0, W, H);
          glowDot(W * 0.5, -H * 0.15, H * 0.9, 'rgba(232,194,122,.10)');
          now = t;
          ctx.fillStyle = 'rgba(255,240,210,.35)';
          for (const d of dust) { d.y -= d.v * dt; if (d.y < 0) { d.y = kbY; d.x = rand(0, W); } ctx.fillRect(d.x + Math.sin(t * 0.4 + d.p) * 10, d.y, d.r, d.r); }
          if (!listen(dt)) idle(dt);
          // rising notes
          ctx.globalCompositeOperation = 'lighter';
          const speed = 70;
          bars = bars.filter((b) => { const keep = b.y - b.h > -20 && b.a > 0.03; if (!keep) b.k.live--; return keep; });
          for (const b of bars) {
            if (b.growing && b.k.held && b.h < kbH * 1.6) b.h += speed * dt; else { b.growing = false; b.y -= speed * dt; }
            b.a -= dt * 0.16;
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
          ctx.fillStyle = '#5A0F1C'; ctx.fillRect(0, kbY - 5, W, 5);
          for (const k of keys) {
            k.glow = Math.max(0, k.glow - dt * (k.held ? 0.4 : 2.6));
            if (k.black) continue;
            const press = k.glow * 3;
            ctx.fillStyle = grad(kbY, H, [[0, '#FFFDF6'], [1, '#E9E2D0']]);
            ctx.fillRect(k.x + 0.5, kbY + press, k.w - 1, kbH - press);
            if (k.glow > 0.02) { ctx.globalAlpha = k.glow * 0.85; ctx.fillStyle = k.col; ctx.fillRect(k.x + 0.5, kbY + press, k.w - 1, kbH - press); ctx.globalAlpha = 1; if (k.glow > 0.15) glowDot(k.x + k.w / 2, kbY, k.w * 1.6, k.col, k.glow * 0.7); }
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(k.x + k.w - 1, kbY, 1, kbH);
          }
          for (const k of keys) {
            if (!k.black) continue;
            const bh = kbH * 0.62, press = k.glow * 2;
            ctx.fillStyle = grad(kbY, kbY + bh, [[0, '#2A2A30'], [1, '#0B0B0E']]);
            ctx.fillRect(k.x, kbY + press, k.w, bh);
            if (k.glow > 0.02) { ctx.globalAlpha = k.glow; ctx.fillStyle = k.col; ctx.fillRect(k.x, kbY + press, k.w, bh); ctx.globalAlpha = 1; if (k.glow > 0.15) glowDot(k.x + k.w / 2, kbY, k.w * 2.2, k.col, k.glow * 0.7); }
          }
          ctx.fillStyle = grad(kbY, kbY + 14, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]);
          ctx.fillRect(0, kbY, W, 14);
          drawNotes(dt);
        },
      };
    },

    // Crimson city: a red-lit skyline at night, flickering neon, rain and fog.
    crimson() {
      let far = [], near = [], rain = [], span = 0, glitch = 0;
      const nearSeen = []; // where the near buildings were drawn this frame (for tapping)
      const city = (n, minH, maxH, minW, maxW) => {
        const out = []; let x = 0;
        while (x < span) {
          const w = rand(minW, maxW), h = rand(minH, maxH);
          const wins = [];
          for (let wy = 14; wy < h - 10; wy += 13) for (let wx = 7; wx < w - 8; wx += 11) if (Math.random() < 0.38) wins.push({ x: wx, y: wy, on: Math.random() < 0.7, f: rand(0.2, 2), c: pick(['#FF3B4E', '#FF6A3D', '#FFB199', '#FF2D6A']) });
          out.push({ x, w, h, wins, sign: Math.random() < n ? { y: rand(0.2, 0.6) * h, h: rand(30, 70), c: pick(['#FF2847', '#FF2D9A', '#FF5A36']), p: rand(0, TAU) } : null, antenna: Math.random() < 0.3 });
          x += w + rand(2, 10);
        }
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
        // Tap a building: a wave of light runs up it and its neon outline flares. Anywhere: a red
        // hologram ring and a quick glitch across the screen.
        tap(x, y) {
          const hit = nearSeen.slice().reverse().find((n) => x >= n.x && x <= n.x + n.b.w && y >= n.top);
          if (hit) hit.b.lit = 1;
          glitch = 1;
          ring(x, y, '#FF2847', { grow: 360, decay: 1.8, w: 2.5, add: true });
          ring(x, y, '#FF8A3D', { s: 2, grow: 200, decay: 2.4, w: 1.5, add: true });
          burst(x, y, 12, (i, a) => ({ kind: 'streak', x, y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, drag: 3, s: 1.5, decay: 2, add: true, c: pick(['#FF2847', '#FF5A36', '#FFD1D6']) }));
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
      const pal = (any) => ({ x: rand(40, W - 40), y: any ? rand(0, H + 200) : H + rand(60, 200), s: rand(20, 34), v: rand(18, 34), p: rand(0, TAU), kind: pick(Object.keys(KINDS)), bal: pick(BALLOONS), blink: rand(2, 6) });
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
        jumpers.push({ x: q.cx, y: q.y, vx: rand(-90, 90), vy: rand(-260, -120), s: q.s, kind: q.kind, rot: 0, vr: rand(-3, 3), bounces: 0, squash: 0, blink: q.blink, p: q.p, leaving: false });
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
          if (j.x < j.s) { j.x = j.s; j.vx = Math.abs(j.vx); }
          if (j.x > W - j.s) { j.x = W - j.s; j.vx = -Math.abs(j.vx); }
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
      if (canvas) { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
      return;
    }
    ensureCanvas();
    canvas.hidden = false;
    t0 = performance.now();
    scene = SCENES[name]();
    if (reduce) frame(performance.now()); else startLoop();
  }

  // Taps on the empty background (not on a card, button or menu) go to the animated scene, for
  // themes that can be played with (pop balloons, tap piano keys).
  const UI = '.card, button, a, input, select, textarea, label, .sheet-backdrop, .sheet, [role="dialog"], .toast, .pop-msg, .coffee-btn, .brand, ul, li, h1, h2, h3, p';
  const onBackground = (e) => !(e.target && e.target.closest && e.target.closest(UI));
  window.addEventListener('pointerdown', (e) => {
    if (!scene || !scene.tap || reduce || !onBackground(e)) return;
    const n = performance.now();
    if (n - lastTapAt < 70) return; // mashing can't pile up effects
    lastTapAt = n;
    scene.tap(e.clientX, e.clientY);
  }, { passive: true });
  let hoverOn = false, lastTapAt = 0;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const on = !!(scene && scene.hover && !reduce && onBackground(e) && scene.hover(e.clientX, e.clientY));
    if (on !== hoverOn) { hoverOn = on; document.documentElement.style.cursor = on ? 'pointer' : ''; }
  }, { passive: true });

  window.addEventListener('sliver:theme', (e) => use(e.detail && e.detail.fx));
  window.SliverFx = { scenes: Object.keys(SCENES), use };
  const start = () => use(document.documentElement.dataset.fx || null);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
