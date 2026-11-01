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
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (scene && scene.resize) scene.resize();
    if (scene && reduce) frame(performance.now());
  }
  const density = () => Math.max(0.45, Math.min(1.6, (W * H) / (1366 * 768)));

  function frame(now) {
    raf = 0;
    if (!scene) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    scene.draw(dt, (now - t0) / 1000);
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
      let clouds = [], hearts = [], stars = [];
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
        draw(dt, t) {
          const shift = (Math.sin(t * 0.08) + 1) / 2;
          ctx.fillStyle = grad(0, H, [[0, `hsl(${330 - shift * 20},90%,84%)`], [0.5, `hsl(${265 + shift * 10},85%,82%)`], [1, `hsl(${200 + shift * 15},90%,80%)`]]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) sparkle(s.x, s.y, s.s, '#FFFFFF', 0.25 + 0.75 * Math.abs(Math.sin(t * s.v + s.p)));
          for (const c of clouds) {
            c.x += c.v * c.s * dt; if (c.x > W + 260) Object.assign(c, cloud(false));
            for (const [dx, dy, r] of c.puffs) {
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
      reset();
      return {
        resize: reset,
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
      return {
        resize: reset,
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#020617'], [0.6, '#0B1430'], [1, '#111C3A']]);
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.v + s.p)); ctx.fillStyle = '#E0F2FE'; ctx.fillRect(s.x, s.y, s.r, s.r); }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'lighter';
          for (const b of bands) {
            for (let x = -10; x < W + 10; x += 4) {
              const y = H * b.y + Math.sin(x * b.f + t * b.s * 2) * b.amp + Math.sin(x * b.f * 2.7 - t * b.s * 3) * b.amp * 0.35;
              const h = b.h * (0.6 + 0.4 * Math.sin(x * 0.01 + t * 0.8 + b.hue));
              const g = ctx.createLinearGradient(0, y - h, 0, y + 20);
              g.addColorStop(0, `hsla(${b.hue + 40},90%,65%,0)`);
              g.addColorStop(0.7, `hsla(${b.hue},90%,60%,.10)`);
              g.addColorStop(1, `hsla(${b.hue - 10},95%,70%,.22)`);
              ctx.fillStyle = g; ctx.fillRect(x, y - h, 4, h + 20);
            }
          }
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
      let layers = [], clouds = [], shoot = null, nextShot = 2;
      const reset = () => {
        layers = [0.25, 0.6, 1.2].map((speed, i) => ({ speed, stars: Array.from({ length: Math.round([160, 80, 30][i] * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: [0.7, 1.2, 2][i] * rand(0.6, 1.2), p: rand(0, TAU) })) }));
        clouds = Array.from({ length: 5 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), r: rand(180, 380), hue: pick([320, 280, 210, 190, 340]), p: i }));
      };
      reset();
      return {
        resize: reset,
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
          for (const L of layers) {
            for (const s of L.stars) {
              s.x -= L.speed * 12 * dt; if (s.x < -2) { s.x = W + 2; s.y = rand(0, H); }
              ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
              ctx.fillStyle = '#F8FAFF'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
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
      return {
        draw(dt, t) {
          const horizon = H * 0.58;
          ctx.fillStyle = grad(0, horizon, [[0, '#0B0024'], [0.6, '#3B0764'], [1, '#9D174D']]);
          ctx.fillRect(0, 0, W, horizon);
          // sun with stripes sliding down
          const r = Math.min(W, H) * 0.22, cx = W / 2, cy = horizon - r * 0.35;
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
          const speed = (t * 0.6) % 1;
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
      reset();
      return {
        resize: reset,
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#0A0503'], [0.65, '#1C0D06'], [1, '#3A1405']]);
          ctx.fillRect(0, 0, W, H);
          const pulse = 0.85 + 0.15 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 7.1);
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
      function makeBolt() {
        const pts = [[rand(W * 0.15, W * 0.85), 0]];
        while (pts[pts.length - 1][1] < H * rand(0.45, 0.8)) {
          const [x, y] = pts[pts.length - 1];
          pts.push([x + rand(-45, 45), y + rand(25, 60)]);
        }
        const forks = [];
        for (let i = 2; i < pts.length - 2; i += 3) if (Math.random() < 0.5) {
          const f = [pts[i]];
          for (let k = 0; k < 4; k++) { const [x, y] = f[f.length - 1]; f.push([x + rand(-50, 50), y + rand(20, 45)]); }
          forks.push(f);
        }
        return { pts, forks, life: 0.35 };
      }
      reset();
      return {
        resize: reset,
        draw(dt, t) {
          ctx.fillStyle = grad(0, H, [[0, '#050913'], [0.5, '#0B1220'], [1, '#111B2E']]);
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < 4; i++) glowDot(W * (i / 3) + Math.sin(t * 0.1 + i) * 80, 0, W * 0.4, 'rgba(71,85,105,.35)'); // clouds
          next -= dt;
          if (next <= 0) {
            bolt = makeBolt(); flash = 1; next = rand(3, 8);
            document.documentElement.classList.add('fx-flash');
            setTimeout(() => document.documentElement.classList.remove('fx-flash'), 140);
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
      const reset = () => { paintMarble(); dust = Array.from({ length: Math.round(90 * density()) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 2.2), vx: rand(-6, 6), vy: rand(-10, -3), p: rand(0, TAU), v: rand(1, 3) })); };
      reset();
      return {
        resize: reset,
        draw(dt, t) {
          ctx.drawImage(marble, 0, 0, W, H);
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
  };

  function use(name) {
    if (name === current) return;
    current = name;
    stopLoop();
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

  window.addEventListener('sliver:theme', (e) => use(e.detail && e.detail.fx));
  window.SliverFx = { scenes: Object.keys(SCENES), use };
  const start = () => use(document.documentElement.dataset.fx || null);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
