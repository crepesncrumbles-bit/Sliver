/* Holiday decorations: animated figures drawn around the edges of the page while a holiday
 * theme is on (Halloween bats, ghosts and pumpkins; Christmas snow and ornaments; …).
 * Back layer sits behind the cards; the front layer only uses the top strip and is hidden
 * during a song. Settings → "Holiday decorations" turns them off on this device.
 * All shapes are drawn here as SVG. */
(function () {
  const KEY = 'sliver.decor';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (list) => list[Math.floor(rnd() * list.length)];

  // ---------- shapes ----------
  const svg = (vb, body, cls = '', style = '') => `<svg class="${cls}" style="${style}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

  const pumpkin = (w, glow = true) => svg('0 0 100 92', `
    <path d="M51 18c-1-7 1-12 7-15l3 4c-4 2-5 6-4 11z" fill="#4E7D2A"/>
    <ellipse cx="29" cy="55" rx="25" ry="33" fill="#D9480F"/>
    <ellipse cx="71" cy="55" rx="25" ry="33" fill="#D9480F"/>
    <ellipse cx="50" cy="55" rx="27" ry="36" fill="#F76707"/>
    <path d="M50 20c-8 10-8 60 0 71M50 20c8 10 8 60 0 71M30 24c-12 12-12 52 0 64M70 24c12 12 12 52 0 64" fill="none" stroke="#C2410C" stroke-width="2.2" opacity=".75"/>
    ${glow ? `<g class="pk-face" fill="#FFE066">
      <path d="M30 46l10-12 8 12z"/><path d="M52 46l8-12 10 12z"/><path d="M46 56l4-7 4 7z"/>
      <path d="M24 64c8 9 44 9 52 0l-6 12-6-5-6 7-6-6-6 6-6-7-6 5z"/>
    </g>` : ''}`, 'fig pumpkin', `width:${w}px`);

  const bat = (w) => svg('0 0 100 52', `
    <g fill="#140B1E">
      <path class="wing wing-l" d="M50 24C42 10 26 5 4 13c8 4 10 11 6 18 8-4 15-1 18 6 4-6 11-7 17-3 2-3 3-6 5-10z"/>
      <path class="wing wing-r" d="M50 24c8-14 24-19 46-11-8 4-10 11-6 18-8-4-15-1-18 6-4-6-11-7-17-3-2-3-3-6-5-10z"/>
      <ellipse cx="50" cy="27" rx="6.5" ry="10"/>
      <path d="M45 19l1-7 4 5 4-5 1 7z"/>
    </g>
    <circle cx="47.6" cy="23" r="1.2" fill="#FFB347"/><circle cx="52.4" cy="23" r="1.2" fill="#FFB347"/>`, 'fig bat', `width:${w}px`);

  const ghost = (w) => svg('0 0 60 80', `
    <path d="M30 3C14 3 6 16 6 33v38l8-8 8 10 8-10 8 10 8-10 8 8V33C54 16 46 3 30 3z" fill="#F4F1FF" opacity=".93"/>
    <ellipse cx="22" cy="31" rx="4" ry="6" fill="#1B1230"/><ellipse cx="38" cy="31" rx="4" ry="6" fill="#1B1230"/>
    <ellipse cx="30" cy="46" rx="4" ry="5" fill="#1B1230"/>
    <ellipse cx="15" cy="40" rx="3" ry="2" fill="#FF9EC7" opacity=".55"/><ellipse cx="45" cy="40" rx="3" ry="2" fill="#FF9EC7" opacity=".55"/>`, 'fig ghost', `width:${w}px`);

  const web = (w, flip) => {
    const lines = [];
    for (let a = 0; a <= 90; a += 15) {
      const rad = (a * Math.PI) / 180;
      lines.push(`<path d="M0 0L${(Math.cos(rad) * 130).toFixed(1)} ${(Math.sin(rad) * 130).toFixed(1)}"/>`);
    }
    for (const R of [22, 44, 68, 94, 122]) {
      let d = '';
      for (let a = 0; a < 90; a += 15) {
        const p = (deg, rr) => [Math.cos((deg * Math.PI) / 180) * rr, Math.sin((deg * Math.PI) / 180) * rr].map((v) => v.toFixed(1)).join(' ');
        d += `${a === 0 ? 'M' + p(a, R) : ''}Q${p(a + 7.5, R * 0.86)} ${p(a + 15, R)}`;
      }
      lines.push(`<path d="${d}"/>`);
    }
    return svg('0 0 130 130', `<g fill="none" stroke="#FFFFFF" stroke-width="1.1" opacity=".38">${lines.join('')}</g>`, 'fig web', `width:${w}px;${flip ? 'transform:scaleX(-1)' : ''}`);
  };

  const spider = (len) => svg(`0 0 40 ${len + 40}`, `
    <path d="M20 0V${len}" stroke="#FFFFFF" stroke-width="1" opacity=".5"/>
    <g transform="translate(20 ${len + 14})" stroke="#140B1E" stroke-width="2.2" fill="none" stroke-linecap="round">
      <path d="M-4 -2l-9 -7-4 4M-4 1l-11 -1-3 5M-4 3l-9 6-2 6M-3 5l-6 9"/>
      <path d="M4 -2l9 -7 4 4M4 1l11 -1 3 5M4 3l9 6 2 6M3 5l6 9"/>
    </g>
    <g transform="translate(20 ${len + 14})"><ellipse rx="6" ry="7.5" cy="2" fill="#140B1E"/><circle r="4.5" cy="-6" fill="#140B1E"/>
    <circle cx="-1.6" cy="-6.5" r="1" fill="#FF6B6B"/><circle cx="1.6" cy="-6.5" r="1" fill="#FF6B6B"/></g>`, 'fig spider', `width:40px`);

  const moon = (w) => svg('0 0 100 100', `
    <circle cx="50" cy="50" r="46" fill="#FFF3C4"/>
    <circle cx="34" cy="38" r="9" fill="#EAD9A0" opacity=".7"/><circle cx="62" cy="62" r="12" fill="#EAD9A0" opacity=".6"/>
    <circle cx="66" cy="30" r="5" fill="#EAD9A0" opacity=".6"/><circle cx="36" cy="70" r="4" fill="#EAD9A0" opacity=".6"/>`, 'fig moon', `width:${w}px`);

  const tomb = (w) => svg('0 0 70 80', `
    <path d="M10 80V30C10 14 22 4 35 4s25 10 25 26v50z" fill="#4B4560"/>
    <path d="M10 80V30C10 14 22 4 35 4" fill="none" stroke="#6E6788" stroke-width="3"/>
    <text x="35" y="40" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="14" fill="#2A2638">RIP</text>
    <path d="M2 80c3-8 6-8 8-2 2-7 5-8 7-1 2-6 5-7 7 0h22c2-7 5-6 7 0 2-7 5-6 7 1 2-6 5-6 8 2z" fill="#3E6B2A"/>`, 'fig tomb', `width:${w}px`);

  const candy = (w) => svg('0 0 40 50', `<path d="M20 2C14 2 2 40 4 44c4 6 28 6 32 0 2-4-10-42-16-42z" fill="#FFFFFF"/>
    <path d="M9 28c6 3 16 3 22 0l5 16c-4 6-28 6-32 0z" fill="#F59F00"/><path d="M14 15c4 2 8 2 12 0l5 13c-6 3-16 3-22 0z" fill="#FF922B"/>`, 'fig candy', `width:${w}px`);

  const tree = (w) => svg('0 0 80 110', `
    <rect x="34" y="88" width="12" height="18" rx="2" fill="#7A4A21"/>
    <path d="M40 8L8 52h14L4 78h20L2 96h76L56 78h20L58 52h14z" fill="#1F7A3D"/>
    <path d="M40 8L22 34h8" fill="none" stroke="#2E9E54" stroke-width="3" opacity=".7"/>
    <circle cx="26" cy="62" r="3.5" fill="#F4C542"/><circle cx="52" cy="70" r="3.5" fill="#FF6B6B"/><circle cx="40" cy="44" r="3" fill="#74C0FC"/>
    <circle cx="20" cy="88" r="3.5" fill="#FF6B6B"/><circle cx="58" cy="88" r="3.5" fill="#F4C542"/>
    <path d="M40 0l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#F4C542"/>`, 'fig tree', `width:${w}px`);

  const ornament = (len, color) => svg(`0 0 40 ${len + 46}`, `
    <path d="M20 0V${len}" stroke="#F4C542" stroke-width="1.4" opacity=".8"/>
    <rect x="15" y="${len}" width="10" height="7" rx="1.5" fill="#C9A227"/>
    <circle cx="20" cy="${len + 25}" r="16" fill="${color}"/>
    <path d="M10 ${len + 22}q10 6 20 0" stroke="#FFFFFF" stroke-width="2" fill="none" opacity=".5"/>
    <circle cx="14" cy="${len + 18}" r="4" fill="#FFFFFF" opacity=".35"/>`, 'fig ornament', `width:40px`);

  const heart = (w, color) => svg('0 0 24 22', `<path d="M12 21S2.5 15 1 9.2A5.6 5.6 0 0 1 12 5.6 5.6 5.6 0 0 1 23 9.2C21.5 15 12 21 12 21z" fill="${color}"/>
    <path d="M6 7.5a3 3 0 0 1 3-1.2" stroke="#FFFFFF" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round"/>`, 'fig heart', `width:${w}px`);

  const clover = (w) => svg('0 0 40 44', `<g fill="#C3FAE8" stroke="#2B8A3E" stroke-width="1">
    <path d="M20 20C14 20 8 15 10 9s9-6 10 1c1-7 8-7 10-1s-4 11-10 11z"/>
    <path d="M20 20C20 26 15 32 9 30s-6-9 1-10c-7-1-7-8-1-10s11 4 11 10z" transform="rotate(-8 20 20)"/>
    <path d="M20 20c0 6 5 12 11 10s6-9-1-10c7-1 7-8 1-10s-11 4-11 10z" transform="rotate(8 20 20)"/></g>
    <path d="M20 22c1 8 3 14 8 20" stroke="#2B8A3E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, 'fig clover', `width:${w}px`);

  const coin = (w) => svg('0 0 30 30', `<circle cx="15" cy="15" r="13" fill="#F4C542" stroke="#C9A227" stroke-width="2"/><circle cx="15" cy="15" r="8" fill="none" stroke="#FFE066" stroke-width="1.6"/>`, 'fig coin', `width:${w}px`);

  const leaf = (w, color) => svg('0 0 40 44', `<path d="M20 2l4 9 7-4-1 9 8 1-6 7 6 5-9 2 1 9-7-5-3 8-3-8-7 5 1-9-9-2 6-5-6-7 8-1-1-9 7 4z" fill="${color}"/>
    <path d="M20 12v30M20 26l-7-6M20 26l7-6" stroke="rgba(0,0,0,.25)" stroke-width="1.4" fill="none"/>`, 'fig leaf', `width:${w}px`);

  const acorn = (w) => svg('0 0 30 40', `<path d="M15 4v-3" stroke="#6B4423" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M3 14C3 7 27 7 27 14c0 2-24 2-24 0z" fill="#8B5A2B"/><path d="M5 15c0 12 6 22 10 22s10-10 10-22z" fill="#C68B3C"/>`, 'fig acorn', `width:${w}px`);

  const burst = (w, color) => {
    const rays = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      rays.push(`<path d="M${(50 + Math.cos(a) * 14).toFixed(1)} ${(50 + Math.sin(a) * 14).toFixed(1)}L${(50 + Math.cos(a) * 46).toFixed(1)} ${(50 + Math.sin(a) * 46).toFixed(1)}"/>`);
      rays.push(`<circle cx="${(50 + Math.cos(a) * 49).toFixed(1)}" cy="${(50 + Math.sin(a) * 49).toFixed(1)}" r="2"/>`);
    }
    return svg('0 0 100 100', `<g stroke="${color}" fill="${color}" stroke-width="2.6" stroke-linecap="round">${rays.join('')}</g>`, 'fig burst', `width:${w}px`);
  };

  const star = (w, color) => svg('0 0 24 24', `<path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6 5.6 21.1 7 14l-5.3-5 7.2-.9z" fill="${color}"/>`, 'fig star', `width:${w}px`);
  const flake = (w) => `<i class="fig flake" style="width:${w}px;height:${w}px"></i>`;
  const streamer = (h, color) => svg(`0 0 20 ${h}`, `<path d="M10 0c8 ${h / 8} -8 ${h / 4} 0 ${h * 3 / 8}s-8 ${h / 4} 0 ${h * 5 / 8}" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>`, 'fig streamer', `width:20px`);

  // Place a figure: where (CSS), animation class, and timing.
  const put = (html, pos, anim = '', dur = 0, delay = 0, extra = '') =>
    `<div class="deco-item ${anim}" style="${pos};${dur ? `animation-duration:${dur.toFixed(1)}s;` : ''}${delay ? `animation-delay:${delay.toFixed(1)}s;` : ''}${extra}">${html}</div>`;

  // Things drifting down (snow, leaves, clovers) or up (hearts) across the whole page.
  function drift(n, make, dir = 'fall') {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += put(make(i), `left:${r(0, 98).toFixed(1)}%;${dir === 'fall' ? 'top:-60px' : 'bottom:-60px'}`, dir === 'fall' ? 'a-fall' : 'a-rise', r(10, 22), -r(0, 22), `--sway:${r(-60, 60).toFixed(0)}px;--spin:${r(-360, 360).toFixed(0)}deg`);
    }
    return out;
  }

  // ---------- one scene per holiday: [back layer, front layer] ----------
  const SCENES = {
    halloween() {
      const back = [
        put(moon(150), 'right:-38px;top:70px', 'a-glow', 6),
        put(web(150, false), 'left:-4px;top:-4px'),
        put(web(110, true), 'right:-4px;top:-4px'),
        put(spider(r(90, 150)), 'left:9%;top:0', 'a-dangle', 5.5),
        put(spider(r(160, 230)), 'right:13%;top:0', 'a-dangle', 7, -2),
        put(ghost(64), 'left:3%;top:34%', 'a-float', 6),
        put(ghost(48), 'right:4%;top:52%', 'a-float', 7.5, -3),
        put(ghost(40), 'left:6%;top:72%', 'a-float', 8, -5, 'opacity:.75'),
        put(tomb(70), 'left:2%;bottom:0'),
        put(tomb(54), 'left:calc(2% + 62px);bottom:0', '', 0, 0, 'opacity:.85'),
        put(tomb(60), 'right:calc(2% + 96px);bottom:0', '', 0, 0, 'opacity:.85'),
        put(pumpkin(110), 'right:1%;bottom:2px', 'a-flicker', 3),
        put(pumpkin(70), 'left:calc(2% + 112px);bottom:2px', 'a-flicker', 2.6, -1),
        put(candy(26), 'right:calc(1% + 112px);bottom:6px', '', 0, 0, 'transform:rotate(18deg)'),
        put(candy(22), 'left:calc(2% + 180px);bottom:4px', '', 0, 0, 'transform:rotate(-24deg)'),
      ];
      let front = '';
      for (let i = 0; i < 4; i++) front += put(bat(r(38, 64)), `top:${r(10, 120).toFixed(0)}px;left:-80px`, 'a-fly', r(11, 17), -r(0, 16) + i * 3);
      return [back.join(''), front];
    },
    christmas() {
      const colors = ['#FF6B6B', '#F4C542', '#74C0FC', '#FFFFFF', '#2FB344'];
      let orns = '';
      [4, 16, 30, 70, 84, 96].forEach((x, i) => { orns += put(ornament(r(20, 80), colors[i % colors.length]), `left:${x}%;top:0`, 'a-swing', r(4, 6), -r(0, 3)); });
      const back = drift(36, () => flake(r(4, 9))) + orns +
        put(tree(110), 'left:1%;bottom:0') + put(tree(80), 'left:calc(1% + 90px);bottom:0', '', 0, 0, 'opacity:.9') +
        put(tree(120), 'right:1%;bottom:0') + put(star(24, '#F4C542'), 'right:22%;top:110px', 'a-twinkle', 2.4);
      return [back, ''];
    },
    valentine() {
      const shades = ['#FFFFFF', '#FFC2D6', '#FF8FB1', '#FF4D8D'];
      return [drift(18, () => heart(r(14, 34), pick(shades)), 'rise'),
        put(heart(30, '#FFFFFF'), 'top:28px;left:-60px', 'a-fly', 16) + put(heart(22, '#FFC2D6'), 'top:80px;left:-60px', 'a-fly', 19, -8)];
    },
    newyear() {
      const golds = ['#F5D76E', '#FFFFFF', '#E8C766', '#B197FC'];
      let back = '';
      for (let i = 0; i < 6; i++) back += put(burst(r(70, 130), pick(golds)), `left:${pick([r(1, 18), r(78, 92)]).toFixed(0)}%;top:${r(4, 70).toFixed(0)}%`, 'a-burst', r(2.6, 4.2), -r(0, 4));
      for (let i = 0; i < 10; i++) back += put(star(r(8, 16), pick(golds)), `left:${r(0, 98).toFixed(0)}%;top:${r(0, 95).toFixed(0)}%`, 'a-twinkle', r(1.6, 3.4), -r(0, 3));
      let front = '';
      for (let i = 0; i < 9; i++) front += put(streamer(r(50, 110), pick(['#F5D76E', '#B197FC', '#FF8FB1', '#63E6BE'])), `left:${(i * 11 + r(0, 6)).toFixed(0)}%;top:-6px`, 'a-swing', r(3, 5), -r(0, 3));
      return [back, front];
    },
    july4() {
      const cols = ['#FF4D5E', '#FFFFFF', '#74C0FC'];
      let back = '';
      for (let i = 0; i < 7; i++) back += put(burst(r(70, 140), cols[i % 3]), `left:${pick([r(0, 16), r(80, 94)]).toFixed(0)}%;top:${r(2, 75).toFixed(0)}%`, 'a-burst', r(2.4, 4), -r(0, 4));
      for (let i = 0; i < 12; i++) back += put(star(r(10, 18), pick(cols)), `left:${r(0, 98).toFixed(0)}%;top:${r(0, 95).toFixed(0)}%`, 'a-twinkle', r(1.6, 3.2), -r(0, 3));
      return [back, ''];
    },
    stpatricks() {
      let back = drift(16, () => clover(r(16, 30)));
      for (let i = 0; i < 7; i++) back += put(coin(r(16, 26)), `left:${pick([r(0, 14), r(84, 96)]).toFixed(0)}%;bottom:${r(0, 30).toFixed(0)}px`);
      return [back, ''];
    },
    thanksgiving() {
      const leaves = ['#E8590C', '#F59F00', '#C92A2A', '#B5651D'];
      const back = drift(18, () => leaf(r(18, 32), pick(leaves))) +
        put(pumpkin(90, false), 'right:1%;bottom:2px') + put(pumpkin(60, false), 'left:1%;bottom:2px') +
        put(acorn(24), 'left:calc(1% + 64px);bottom:4px') + put(acorn(20), 'right:calc(1% + 92px);bottom:4px', '', 0, 0, 'transform:rotate(-18deg)');
      return [back, ''];
    },
  };

  // Two layers (separate elements so the front one can sit above the cards).
  let backEl = null, frontEl = null;
  function layer(id) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'decor';
    el.setAttribute('aria-hidden', 'true');
    document.body.prepend(el);
    return el;
  }
  function render(decor) {
    if (!document.body) return;
    if (!backEl) { frontEl = layer('decor-front'); backEl = layer('decor-back'); }
    const scene = decor && enabled() && SCENES[decor];
    for (const el of [backEl, frontEl]) { el.dataset.scene = scene ? decor : ''; el.classList.toggle('still', !!reduce); }
    if (!scene) { backEl.innerHTML = ''; frontEl.innerHTML = ''; return; }
    seed = 7;
    const [back, front] = scene();
    backEl.innerHTML = back;
    frontEl.innerHTML = front;
  }

  const currentDecor = () => document.documentElement.dataset.decor || '';
  window.addEventListener('sliver:theme', (e) => render(e.detail && e.detail.decor));
  window.SliverDecor = {
    enabled,
    setEnabled(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} render(currentDecor()); },
    scenes: Object.keys(SCENES),
    render,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(currentDecor()));
  else render(currentDecor());
})();
