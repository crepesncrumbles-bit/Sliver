/* Sliver themes. Each theme sets the color tokens used by style.css.
 * Saved per device (localStorage), so everyone can pick their own look.
 * Loaded in <head> so the saved theme applies before the page draws. */
(function () {
  const light = {
    '--paper': '#FBFAFF', '--paper-2': '#F1F0FB', '--surface': '#FFFFFF',
    '--ink': '#14123A', '--ink-2': '#5E5B85', '--line': '#E2E0F2', '--placeholder': '#9895B8',
    '--stroke': '#14123A', '--inverse': '#14123A', '--inverse-ink': '#FFFFFF', '--inverse-2': '#D6D4F0',
    '--good-bg': '#DDF8EE', '--bad-bg': '#FFE8EC', '--bad-ink': '#A3172C', '--mint-ink': '#0B7A57',
    '--accent-ink': '#FFFFFF', '--pop-ink': '#14123A', '--on-page': '#FFFFFF',
  };
  const dark = {
    '--paper': '#17151F', '--paper-2': '#221F2D', '--surface': '#1D1A27',
    '--ink': '#F3F1FA', '--ink-2': '#A6A2BA', '--line': '#2F2B3D', '--placeholder': '#6F6A86',
    '--stroke': '#000000', '--inverse': '#F3F1FA', '--inverse-ink': '#14121C', '--inverse-2': '#4A4660',
    '--good-bg': '#103D2E', '--bad-bg': '#3D1620', '--bad-ink': '#FF9AAA', '--mint-ink': '#5CF0BE',
    '--accent-ink': '#FFFFFF', '--pop-ink': '#14121C', '--on-page': '#FFFFFF',
  };

  const THEMES = [
    { id: 'cobalt', name: 'Cobalt', vars: { ...light,
      '--page': '#2336E6', '--page-deep': '#1426B8', '--on-page-2': '#C7CDFF',
      '--glow-a': 'rgba(255,79,154,.30)', '--glow-b': 'rgba(255,212,59,.20)',
      '--brand': '#2336E6', '--accent': '#FF4F9A', '--accent-hover': '#FF63A7', '--accent-strong': '#D62F77',
      '--pop': '#FFD43B', '--pop-soft': '#FFE68A' } },

    { id: 'sunset', name: 'Sunset', vars: { ...light,
      '--page': '#FF6A3D', '--page-deep': '#C9431C', '--on-page-2': '#FFE1D4',
      '--glow-a': 'rgba(123,47,247,.30)', '--glow-b': 'rgba(255,214,63,.35)',
      '--brand': '#E2461A', '--accent': '#7A2BF5', '--accent-hover': '#8C45FF', '--accent-strong': '#6420D6',
      '--pop': '#FFD23F', '--pop-soft': '#FFE68A' } },

    { id: 'bubblegum', name: 'Bubblegum', vars: { ...light,
      '--page': '#FF6FB0', '--page-deep': '#D9428A', '--on-page-2': '#FFE0EF',
      '--glow-a': 'rgba(107,78,255,.30)', '--glow-b': 'rgba(255,240,107,.40)',
      '--brand': '#D6307A', '--accent': '#6B4EFF', '--accent-hover': '#7D63FF', '--accent-strong': '#5137E0',
      '--pop': '#FFF06B', '--pop-soft': '#FFF6A8' } },

    { id: 'jungle', name: 'Jungle', vars: { ...light,
      '--page': '#0E8F6A', '--page-deep': '#07664B', '--on-page-2': '#C6F2E2',
      '--glow-a': 'rgba(255,107,74,.30)', '--glow-b': 'rgba(246,224,94,.30)',
      '--brand': '#0B7A5A', '--accent': '#FF6B4A', '--accent-hover': '#FF7F61', '--accent-strong': '#D9472A',
      '--pop': '#F6E05E', '--pop-soft': '#FAEC9A' } },

    { id: 'grape', name: 'Grape', vars: { ...light,
      '--page': '#6C2BD9', '--page-deep': '#4A1A9E', '--on-page-2': '#DDCCFF',
      '--glow-a': 'rgba(255,79,154,.35)', '--glow-b': 'rgba(63,224,197,.25)',
      '--brand': '#6C2BD9', '--accent': '#FF4F9A', '--accent-hover': '#FF63A7', '--accent-strong': '#D62F77',
      '--pop': '#3FE0C5', '--pop-soft': '#8DF0DF' } },

    { id: 'gx', name: 'GX Red', dark: true, vars: { ...dark,
      '--page': '#0B0A10', '--page-deep': '#000000', '--on-page-2': '#9C97AE',
      '--glow-a': 'rgba(250,30,78,.32)', '--glow-b': 'rgba(250,30,78,.12)',
      '--brand': '#FF2E5B', '--accent': '#FA1E4E', '--accent-hover': '#FF3B66', '--accent-strong': '#FF4A72',
      '--pop': '#FF2E5B', '--pop-soft': '#FF7090', '--pop-ink': '#FFFFFF', '--mint': '#2FD6A0', '--red': '#FF4A5E' } },

    { id: 'midnight', name: 'Midnight', dark: true, vars: { ...dark,
      '--paper': '#121A33', '--paper-2': '#1B2547', '--surface': '#16203D', '--line': '#26325A',
      '--page': '#070C1D', '--page-deep': '#000000', '--on-page-2': '#8C9AC7',
      '--glow-a': 'rgba(63,224,197,.22)', '--glow-b': 'rgba(110,168,255,.22)',
      '--brand': '#7FB2FF', '--accent': '#3FE0C5', '--accent-hover': '#5BEBD3', '--accent-strong': '#5BEBD3', '--accent-ink': '#06201B',
      '--pop': '#FFD43B', '--pop-soft': '#FFE68A', '--mint': '#3FE0C5', '--red': '#FF5C70' } },

    { id: 'neon', name: 'Neon', dark: true, vars: { ...dark,
      '--page': '#0A0A0A', '--page-deep': '#000000', '--on-page-2': '#9A9A9A',
      '--glow-a': 'rgba(0,255,163,.20)', '--glow-b': 'rgba(186,0,255,.22)',
      '--brand': '#00FFA3', '--accent': '#BA00FF', '--accent-hover': '#C933FF', '--accent-strong': '#D466FF',
      '--pop': '#00FFA3', '--pop-soft': '#7DFFD0', '--mint': '#00FFA3', '--red': '#FF4060' } },

    { id: 'mono', name: 'Mono', vars: { ...light,
      '--page': '#1A1A1A', '--page-deep': '#000000', '--on-page-2': '#B5B5B5',
      '--glow-a': 'rgba(255,255,255,.08)', '--glow-b': 'rgba(255,255,255,.05)',
      '--paper': '#FFFFFF', '--paper-2': '#F2F2F2', '--ink': '#111111', '--ink-2': '#666666', '--line': '#E3E3E3', '--placeholder': '#9A9A9A',
      '--stroke': '#111111', '--inverse': '#111111', '--inverse-2': '#BBBBBB',
      '--brand': '#111111', '--accent': '#111111', '--accent-hover': '#333333', '--accent-strong': '#111111',
      '--pop': '#FFFFFF', '--pop-soft': '#EDEDED', '--pop-ink': '#111111', '--mint': '#2FD6A0' } },

    // ---- Holiday themes: only offered around their time of year (from/to are MM-DD, inclusive) ----
    { id: 'newyear', name: 'New Year', deco: '🥂', season: { from: '12-27', to: '01-03' }, dark: true, vars: { ...dark,
      '--page': '#0B0B14', '--page-deep': '#000000', '--on-page-2': '#C9BE96',
      '--paper': '#16151F', '--paper-2': '#21202C', '--surface': '#1B1A25', '--line': '#2E2C3B',
      '--glow-a': 'rgba(212,175,55,.28)', '--glow-b': 'rgba(150,120,255,.20)',
      '--brand': '#E8C766', '--accent': '#D4AF37', '--accent-hover': '#E2BF4C', '--accent-strong': '#F0D27A', '--accent-ink': '#1A1400',
      '--pop': '#F5D76E', '--pop-soft': '#FAE7A5', '--pop-ink': '#1A1400', '--mint': '#5CE0B8', '--red': '#FF5C70' } },

    { id: 'valentine', name: 'Valentine’s', deco: '💘', season: { from: '02-01', to: '02-15' }, vars: { ...light,
      '--page': '#E8336F', '--page-deep': '#B01E50', '--on-page-2': '#FFDCE8',
      '--glow-a': 'rgba(255,255,255,.28)', '--glow-b': 'rgba(155,27,79,.35)',
      '--paper': '#FFF8FA', '--paper-2': '#FCEAF0', '--line': '#F6D3DF',
      '--brand': '#C21F59', '--accent': '#9B1B4F', '--accent-hover': '#B02160', '--accent-strong': '#9B1B4F',
      '--pop': '#FFC2D6', '--pop-soft': '#FFDCE8', '--pop-ink': '#5A0F2A' } },

    { id: 'stpatricks', name: 'St. Patrick’s', deco: '☘️', season: { from: '03-10', to: '03-18' }, vars: { ...light,
      '--page': '#11904B', '--page-deep': '#0A6635', '--on-page-2': '#CFF5DD',
      '--glow-a': 'rgba(242,169,0,.32)', '--glow-b': 'rgba(184,243,90,.25)',
      '--brand': '#0E7A40', '--accent': '#E8A300', '--accent-hover': '#F5B10D', '--accent-strong': '#A86F00', '--accent-ink': '#1A1300',
      '--pop': '#B8F35A', '--pop-soft': '#D6F99E', '--pop-ink': '#0F2A12' } },

    { id: 'july4', name: 'Fourth of July', deco: '🎆', season: { from: '06-28', to: '07-05' }, vars: { ...light,
      '--page': '#1C3D8F', '--page-deep': '#10275E', '--on-page-2': '#CBD7FF',
      '--glow-a': 'rgba(215,38,61,.38)', '--glow-b': 'rgba(255,255,255,.18)',
      '--brand': '#1C3D8F', '--accent': '#D7263D', '--accent-hover': '#E3394F', '--accent-strong': '#B81D31',
      '--pop': '#FFFFFF', '--pop-soft': '#E6ECFF', '--pop-ink': '#10275E' } },

    { id: 'halloween', name: 'Halloween', deco: '🎃', season: { from: '10-01', to: '11-01' }, dark: true, vars: { ...dark,
      '--page': '#170B22', '--page-deep': '#000000', '--on-page-2': '#B9A6CF',
      '--paper': '#22152F', '--paper-2': '#2E1E3E', '--surface': '#271A35', '--line': '#3A2A4C',
      '--glow-a': 'rgba(255,122,26,.32)', '--glow-b': 'rgba(140,80,255,.25)',
      '--brand': '#B98CFF', '--accent': '#FF7A1A', '--accent-hover': '#FF8E3A', '--accent-strong': '#FF9A4D', '--accent-ink': '#1A0E00',
      '--pop': '#FF7A1A', '--pop-soft': '#FFB27A', '--pop-ink': '#1A0E00', '--mint': '#7CFF6B', '--red': '#FF4F6A' } },

    { id: 'thanksgiving', name: 'Thanksgiving', deco: '🦃', season: { from: '11-10', to: '11-30' }, vars: { ...light,
      '--page': '#A8521E', '--page-deep': '#7A3912', '--on-page-2': '#FFE2CC',
      '--glow-a': 'rgba(242,177,52,.35)', '--glow-b': 'rgba(122,46,14,.40)',
      '--paper': '#FFFAF4', '--paper-2': '#F8EDE1', '--line': '#EED9C4',
      '--brand': '#A8521E', '--accent': '#7A2E0E', '--accent-hover': '#8E3712', '--accent-strong': '#7A2E0E',
      '--pop': '#F2B134', '--pop-soft': '#F8CF7A', '--pop-ink': '#2A1606' } },

    { id: 'christmas', name: 'Christmas', deco: '🎄', season: { from: '12-01', to: '12-26' }, vars: { ...light,
      '--page': '#B3132B', '--page-deep': '#7A0B1C', '--on-page-2': '#FFD6DC',
      '--glow-a': 'rgba(255,255,255,.20)', '--glow-b': 'rgba(15,122,67,.38)',
      '--brand': '#B3132B', '--accent': '#0F7A43', '--accent-hover': '#13904F', '--accent-strong': '#0B6637',
      '--pop': '#F4C542', '--pop-soft': '#F9DC85', '--pop-ink': '#2A1A00' } },
  ];

  // Is a holiday theme in season? Uses this device's date.
  const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function inSeason(t, date = new Date()) {
    if (!t.season) return true;
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

  const KEY = 'sliver.theme';
  function apply(id) {
    let t = THEMES.find((x) => x.id === id) || THEMES[0];
    if (!inSeason(t)) t = THEMES[0]; // holiday's over: back to the default look
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
    root.dataset.theme = t.id;
    root.style.setProperty('--deco', t.deco ? `"${t.deco} "` : '""');
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.vars['--page']);
    return t;
  }
  function saved() { try { return localStorage.getItem(KEY) || 'cobalt'; } catch { return 'cobalt'; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch {} }

  const current = () => { const id = saved(); const t = THEMES.find((x) => x.id === id); return t && inSeason(t) ? id : 'cobalt'; };
  window.SliverThemes = { THEMES, available, inSeason, seasonEnds, apply, current, set(id) { save(id); return apply(id); } };
  apply(saved());
})();
