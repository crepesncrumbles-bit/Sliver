/* Sliver themes. Each theme sets the color tokens used by style.css.
 * Saved per device (localStorage), so everyone can pick their own look.
 * Loaded in <head> so the saved theme applies before the page draws.
 * "My theme": four colors you pick; everything else is worked out from them, and it can be
 * shared as a code (SLV-XXXXX-XXXXX-XXXXX-XXXXX-XX). */
(function () {
  const light = {
    '--paper': '#FBFAFF', '--paper-2': '#F1F0FB', '--surface': '#FFFFFF',
    '--ink': '#14123A', '--ink-2': '#5E5B85', '--line': '#E2E0F2', '--placeholder': '#9895B8',
    '--stroke': '#14123A', '--inverse': '#14123A', '--inverse-ink': '#FFFFFF', '--inverse-2': '#D6D4F0',
    '--good-bg': '#DDF8EE', '--bad-bg': '#FFE8EC', '--bad-ink': '#A3172C', '--mint': '#2FD6A0', '--mint-ink': '#0B7A57', '--red': '#F0445A',
    '--accent-ink': '#FFFFFF', '--pop-ink': '#14123A', '--on-page': '#FFFFFF',
  };
  const dark = {
    '--paper': '#17151F', '--paper-2': '#221F2D', '--surface': '#1D1A27',
    '--ink': '#F3F1FA', '--ink-2': '#A6A2BA', '--line': '#2F2B3D', '--placeholder': '#6F6A86',
    '--stroke': '#000000', '--inverse': '#F3F1FA', '--inverse-ink': '#14121C', '--inverse-2': '#4A4660',
    '--good-bg': '#103D2E', '--bad-bg': '#3D1620', '--bad-ink': '#FF9AAA', '--mint': '#2FD6A0', '--mint-ink': '#5CF0BE', '--red': '#FF5C70',
    '--accent-ink': '#FFFFFF', '--pop-ink': '#14121C', '--on-page': '#FFFFFF',
  };

  // ids stay the same as before so saved choices keep working (except gx → onair).
  const THEMES = [
    { id: 'cobalt', name: 'Blue Hour', vars: { ...light,
      '--page': '#2336E6', '--page-deep': '#1426B8', '--on-page-2': '#C7CDFF',
      '--glow-a': 'rgba(255,79,154,.30)', '--glow-b': 'rgba(255,212,59,.20)',
      '--brand': '#2336E6', '--accent': '#FF4F9A', '--accent-hover': '#FF63A7', '--accent-strong': '#D62F77',
      '--pop': '#FFD43B', '--pop-soft': '#FFE68A' } },

    { id: 'sunset', name: 'Golden Hour', vars: { ...light,
      '--page': '#FF6A3D', '--page-deep': '#C9431C', '--on-page-2': '#FFE1D4',
      '--glow-a': 'rgba(123,47,247,.30)', '--glow-b': 'rgba(255,214,63,.35)',
      '--brand': '#E2461A', '--accent': '#7A2BF5', '--accent-hover': '#8C45FF', '--accent-strong': '#6420D6',
      '--pop': '#FFD23F', '--pop-soft': '#FFE68A' } },

    { id: 'bubblegum', name: 'Bubblegum Pop', vars: { ...light,
      '--page': '#FF6FB0', '--page-deep': '#D9428A', '--on-page-2': '#FFE0EF',
      '--glow-a': 'rgba(107,78,255,.30)', '--glow-b': 'rgba(255,240,107,.40)',
      '--brand': '#D6307A', '--accent': '#6B4EFF', '--accent-hover': '#7D63FF', '--accent-strong': '#5137E0',
      '--pop': '#FFF06B', '--pop-soft': '#FFF6A8' } },

    { id: 'jungle', name: 'Greenroom', vars: { ...light,
      '--page': '#0E8F6A', '--page-deep': '#07664B', '--on-page-2': '#C6F2E2',
      '--glow-a': 'rgba(255,107,74,.30)', '--glow-b': 'rgba(246,224,94,.30)',
      '--brand': '#0B7A5A', '--accent': '#FF6B4A', '--accent-hover': '#FF7F61', '--accent-strong': '#D9472A',
      '--pop': '#F6E05E', '--pop-soft': '#FAEC9A' } },

    { id: 'grape', name: 'Velvet', vars: { ...light,
      '--page': '#6C2BD9', '--page-deep': '#4A1A9E', '--on-page-2': '#DDCCFF',
      '--glow-a': 'rgba(255,79,154,.35)', '--glow-b': 'rgba(63,224,197,.25)',
      '--brand': '#6C2BD9', '--accent': '#FF4F9A', '--accent-hover': '#FF63A7', '--accent-strong': '#D62F77',
      '--pop': '#3FE0C5', '--pop-soft': '#8DF0DF' } },

    { id: 'onair', name: 'On Air', dark: true, vars: { ...dark,
      '--page': '#0B0A10', '--page-deep': '#000000', '--on-page-2': '#9C97AE',
      '--glow-a': 'rgba(250,30,78,.32)', '--glow-b': 'rgba(250,30,78,.12)',
      '--brand': '#FF2E5B', '--accent': '#FA1E4E', '--accent-hover': '#FF3B66', '--accent-strong': '#FF4A72',
      '--pop': '#FF2E5B', '--pop-soft': '#FF7090', '--pop-ink': '#FFFFFF', '--mint': '#2FD6A0', '--red': '#FF4A5E' } },

    { id: 'midnight', name: 'Night Drive', dark: true, vars: { ...dark,
      '--paper': '#121A33', '--paper-2': '#1B2547', '--surface': '#16203D', '--line': '#26325A',
      '--page': '#070C1D', '--page-deep': '#000000', '--on-page-2': '#8C9AC7',
      '--glow-a': 'rgba(63,224,197,.22)', '--glow-b': 'rgba(110,168,255,.22)',
      '--brand': '#7FB2FF', '--accent': '#3FE0C5', '--accent-hover': '#5BEBD3', '--accent-strong': '#5BEBD3', '--accent-ink': '#06201B',
      '--pop': '#FFD43B', '--pop-soft': '#FFE68A', '--mint': '#3FE0C5', '--red': '#FF5C70' } },

    { id: 'neon', name: 'Laser Show', dark: true, vars: { ...dark,
      '--page': '#0A0A0A', '--page-deep': '#000000', '--on-page-2': '#9A9A9A',
      '--glow-a': 'rgba(0,255,163,.20)', '--glow-b': 'rgba(186,0,255,.22)',
      '--brand': '#00FFA3', '--accent': '#BA00FF', '--accent-hover': '#C933FF', '--accent-strong': '#D466FF',
      '--pop': '#00FFA3', '--pop-soft': '#7DFFD0', '--mint': '#00FFA3', '--red': '#FF4060' } },

    { id: 'mono', name: 'Vinyl', vars: { ...light,
      '--page': '#1A1A1A', '--page-deep': '#000000', '--on-page-2': '#B5B5B5',
      '--glow-a': 'rgba(255,255,255,.08)', '--glow-b': 'rgba(255,255,255,.05)',
      '--paper': '#FFFFFF', '--paper-2': '#F2F2F2', '--ink': '#111111', '--ink-2': '#666666', '--line': '#E3E3E3', '--placeholder': '#9A9A9A',
      '--stroke': '#111111', '--inverse': '#111111', '--inverse-2': '#BBBBBB',
      '--brand': '#111111', '--accent': '#111111', '--accent-hover': '#333333', '--accent-strong': '#111111',
      '--pop': '#FFFFFF', '--pop-soft': '#EDEDED', '--pop-ink': '#111111', '--mint': '#2FD6A0' } },

    // ---- Holiday themes: only offered around their time of year (from/to are MM-DD, inclusive).
    // decor = which holiday decorations (decor.js) to draw.
    { id: 'newyear', name: 'Countdown', deco: '🥂', decor: 'newyear', season: { from: '12-27', to: '01-03' }, dark: true, vars: { ...dark,
      '--page': '#0B0B14', '--page-deep': '#000000', '--on-page-2': '#C9BE96',
      '--paper': '#16151F', '--paper-2': '#21202C', '--surface': '#1B1A25', '--line': '#2E2C3B',
      '--glow-a': 'rgba(212,175,55,.28)', '--glow-b': 'rgba(150,120,255,.20)',
      '--brand': '#E8C766', '--accent': '#D4AF37', '--accent-hover': '#E2BF4C', '--accent-strong': '#F0D27A', '--accent-ink': '#1A1400',
      '--pop': '#F5D76E', '--pop-soft': '#FAE7A5', '--pop-ink': '#1A1400', '--mint': '#5CE0B8', '--red': '#FF5C70' } },

    { id: 'valentine', name: 'Love Song', deco: '💘', decor: 'valentine', season: { from: '02-01', to: '02-15' }, vars: { ...light,
      '--page': '#E8336F', '--page-deep': '#B01E50', '--on-page-2': '#FFDCE8',
      '--glow-a': 'rgba(255,255,255,.28)', '--glow-b': 'rgba(155,27,79,.35)',
      '--paper': '#FFF8FA', '--paper-2': '#FCEAF0', '--line': '#F6D3DF',
      '--brand': '#C21F59', '--accent': '#9B1B4F', '--accent-hover': '#B02160', '--accent-strong': '#9B1B4F',
      '--pop': '#FFC2D6', '--pop-soft': '#FFDCE8', '--pop-ink': '#5A0F2A' } },

    { id: 'stpatricks', name: 'Lucky Clover', deco: '☘️', decor: 'stpatricks', season: { from: '03-10', to: '03-18' }, vars: { ...light,
      '--page': '#11904B', '--page-deep': '#0A6635', '--on-page-2': '#CFF5DD',
      '--glow-a': 'rgba(242,169,0,.32)', '--glow-b': 'rgba(184,243,90,.25)',
      '--brand': '#0E7A40', '--accent': '#E8A300', '--accent-hover': '#F5B10D', '--accent-strong': '#A86F00', '--accent-ink': '#1A1300',
      '--pop': '#B8F35A', '--pop-soft': '#D6F99E', '--pop-ink': '#0F2A12' } },

    { id: 'july4', name: 'Fireworks', deco: '🎆', decor: 'july4', season: { from: '06-28', to: '07-05' }, vars: { ...light,
      '--page': '#1C3D8F', '--page-deep': '#10275E', '--on-page-2': '#CBD7FF',
      '--glow-a': 'rgba(215,38,61,.38)', '--glow-b': 'rgba(255,255,255,.18)',
      '--brand': '#1C3D8F', '--accent': '#D7263D', '--accent-hover': '#E3394F', '--accent-strong': '#B81D31',
      '--pop': '#FFFFFF', '--pop-soft': '#E6ECFF', '--pop-ink': '#10275E' } },

    { id: 'halloween', name: 'Graveyard Shift', deco: '🎃', decor: 'halloween', season: { from: '10-01', to: '11-01' }, dark: true, vars: { ...dark,
      '--page': '#170B22', '--page-deep': '#000000', '--on-page-2': '#B9A6CF',
      '--paper': '#22152F', '--paper-2': '#2E1E3E', '--surface': '#271A35', '--line': '#3A2A4C',
      '--glow-a': 'rgba(255,122,26,.32)', '--glow-b': 'rgba(140,80,255,.25)',
      '--brand': '#B98CFF', '--accent': '#FF7A1A', '--accent-hover': '#FF8E3A', '--accent-strong': '#FF9A4D', '--accent-ink': '#1A0E00',
      '--pop': '#FF7A1A', '--pop-soft': '#FFB27A', '--pop-ink': '#1A0E00', '--mint': '#7CFF6B', '--red': '#FF4F6A' } },

    { id: 'thanksgiving', name: 'Harvest', deco: '🦃', decor: 'thanksgiving', season: { from: '11-10', to: '11-30' }, vars: { ...light,
      '--page': '#A8521E', '--page-deep': '#7A3912', '--on-page-2': '#FFE2CC',
      '--glow-a': 'rgba(242,177,52,.35)', '--glow-b': 'rgba(122,46,14,.40)',
      '--paper': '#FFFAF4', '--paper-2': '#F8EDE1', '--line': '#EED9C4',
      '--brand': '#A8521E', '--accent': '#7A2E0E', '--accent-hover': '#8E3712', '--accent-strong': '#7A2E0E',
      '--pop': '#F2B134', '--pop-soft': '#F8CF7A', '--pop-ink': '#2A1606' } },

    { id: 'christmas', name: 'Jingle', deco: '🎄', decor: 'christmas', season: { from: '12-01', to: '12-26' }, vars: { ...light,
      '--page': '#B3132B', '--page-deep': '#7A0B1C', '--on-page-2': '#FFD6DC',
      '--glow-a': 'rgba(255,255,255,.20)', '--glow-b': 'rgba(15,122,67,.38)',
      '--brand': '#B3132B', '--accent': '#0F7A43', '--accent-hover': '#13904F', '--accent-strong': '#0B6637',
      '--pop': '#F4C542', '--pop-soft': '#F9DC85', '--pop-ink': '#2A1A00' } },
  ];
  const RENAMED = { gx: 'onair' };

  // ---------- colour maths for "My theme" ----------
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const rgba = (h, a) => `rgba(${toRgb(h).join(',')},${a})`;
  function lum(h) {
    const c = toRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bestText = (bg, darkInk = '#14123A') => (contrast(bg, '#FFFFFF') >= contrast(bg, darkInk) ? '#FFFFFF' : darkInk);

  const DEFAULT_CUSTOM = { page: '#1E1B4B', card: '#FFFFFF', accent: '#F43F5E', pop: '#FACC15' };

  // Four colors in, a full theme out.
  function buildCustom(c) {
    c = { ...DEFAULT_CUSTOM, ...(c || {}) };
    for (const k of Object.keys(DEFAULT_CUSTOM)) if (!hexOk(c[k])) c[k] = DEFAULT_CUSTOM[k];
    const isDark = lum(c.card) < 0.3;
    const base = isDark ? dark : light;
    const ink = isDark ? '#F3F1FA' : '#14123A';
    const onPage = bestText(c.page);
    const pageDark = lum(c.page) < 0.25;
    const vars = { ...base,
      '--page': c.page,
      '--page-deep': mix(c.page, '#000000', pageDark ? 0.55 : 0.3),
      '--on-page': onPage,
      '--on-page-2': mix(onPage, c.page, 0.3),
      '--glow-a': rgba(c.accent, 0.3),
      '--glow-b': rgba(c.pop, 0.22),
      '--paper': c.card,
      '--paper-2': mix(c.card, ink, 0.06),
      '--surface': isDark ? mix(c.card, '#FFFFFF', 0.04) : mix(c.card, '#FFFFFF', 0.6),
      '--ink': ink,
      '--ink-2': mix(ink, c.card, 0.38),
      '--line': mix(c.card, ink, 0.13),
      '--placeholder': mix(c.card, ink, 0.45),
      '--stroke': isDark ? '#000000' : '#14123A',
      '--inverse': ink,
      '--inverse-ink': c.card,
      '--inverse-2': mix(c.card, ink, 0.25),
      '--brand': contrast(c.accent, c.card) >= 2.2 ? c.accent : (isDark ? mix(c.accent, '#FFFFFF', 0.4) : mix(c.accent, '#000000', 0.35)),
      '--accent': c.accent,
      '--accent-hover': mix(c.accent, '#FFFFFF', 0.1),
      '--accent-strong': contrast(c.accent, c.card) >= 3 ? c.accent : (isDark ? mix(c.accent, '#FFFFFF', 0.35) : mix(c.accent, '#000000', 0.3)),
      '--accent-ink': bestText(c.accent),
      '--pop': c.pop,
      '--pop-soft': mix(c.pop, '#FFFFFF', 0.45),
      '--pop-ink': bestText(c.pop),
    };
    return { id: 'custom', name: 'My theme', dark: isDark, vars, colors: c };
  }

  // ---------- share codes ----------
  // 12 bytes (4 colors) + a 10-bit check, written in Crockford base32: SLV-XXXXX-XXXXX-XXXXX-XXXXX-XX
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const ORDER = ['page', 'card', 'accent', 'pop'];
  function check10(bytes) { let h = 7; for (const b of bytes) h = (h * 31 + b) % 1021; return h; }
  function encode(c) {
    c = buildCustom(c).colors;
    const bytes = ORDER.flatMap((k) => toRgb(c[k]));
    let bits = bytes.map((b) => b.toString(2).padStart(8, '0')).join('') + '0000';
    bits += check10(bytes).toString(2).padStart(10, '0');
    let out = '';
    for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return `SLV-${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}-${out.slice(20, 22)}`;
  }
  function decode(code) {
    let s = String(code || '').toUpperCase().replace(/^\s*SLV/, '').replace(/[\s-]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1');
    if (s.length !== 22 || [...s].some((ch) => !B32.includes(ch))) return null;
    const bits = [...s].map((ch) => B32.indexOf(ch).toString(2).padStart(5, '0')).join('');
    const bytes = [];
    for (let i = 0; i < 96; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    if (parseInt(bits.slice(100, 110), 2) !== check10(bytes)) return null;
    const c = {};
    ORDER.forEach((k, i) => { c[k] = toHex(bytes.slice(i * 3, i * 3 + 3)); });
    return c;
  }

  // ---------- seasons ----------
  const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function inSeason(t, date = new Date()) {
    if (!t || !t.season) return true;
    const today = mmdd(date), { from, to } = t.season;
    return from <= to ? today >= from && today <= to : today >= from || today <= to; // wraps past New Year
  }
  // What the settings page shows: holidays happening now first, then the regular themes.
  function available(date = new Date()) {
    return THEMES.filter((t) => t.season && inSeason(t, date)).concat(THEMES.filter((t) => !t.season));
  }
  function seasonEnds(t) {
    if (!t.season) return null;
    const [m, d] = t.season.to.split('-').map(Number);
    return new Date(2000, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------- saving & applying ----------
  const KEY = 'sliver.theme', CUSTOM_KEY = 'sliver.customTheme';
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  function savedCustom() { try { return JSON.parse(get(CUSTOM_KEY)) || null; } catch { return null; } }
  function saveCustom(c) { const t = buildCustom(c); put(CUSTOM_KEY, JSON.stringify(t.colors)); return t.colors; }

  function resolve(id) {
    id = RENAMED[id] || id;
    if (id === 'custom') return buildCustom(savedCustom() || DEFAULT_CUSTOM);
    const t = THEMES.find((x) => x.id === id);
    return t && inSeason(t) ? t : THEMES[0]; // holiday's over: back to the default look
  }
  function apply(id) {
    const t = resolve(id);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
    root.dataset.theme = t.id;
    root.dataset.decor = t.decor || '';
    root.style.setProperty('--deco', t.deco ? `"${t.deco} "` : '""');
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.vars['--page']);
    try { window.dispatchEvent(new CustomEvent('sliver:theme', { detail: { id: t.id, decor: t.decor || null } })); } catch {}
    return t;
  }
  function saved() { return RENAMED[get(KEY)] || get(KEY) || 'cobalt'; }
  const current = () => resolve(saved()).id;

  window.SliverThemes = {
    THEMES, available, inSeason, seasonEnds, apply, current, encode, decode, buildCustom, contrast,
    savedCustom, DEFAULT_CUSTOM,
    set(id) { put(KEY, id); return apply(id); },
    // Save "My theme" colors and switch to it.
    setCustom(colors) { saveCustom(colors); put(KEY, 'custom'); return apply('custom'); },
  };
  apply(saved());
})();
