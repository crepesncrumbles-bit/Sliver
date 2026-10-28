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
  ];

  const KEY = 'sliver.theme';
  function apply(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
    root.dataset.theme = t.id;
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.vars['--page']);
    return t;
  }
  function saved() { try { return localStorage.getItem(KEY) || 'cobalt'; } catch { return 'cobalt'; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch {} }

  window.SliverThemes = { THEMES, apply, current: saved, set(id) { save(id); return apply(id); } };
  apply(saved());
})();
