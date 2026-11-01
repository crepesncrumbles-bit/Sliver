/* Animations setting. Many computers (Windows: Settings > Accessibility > Visual effects >
 * "Animation effects" off) ask websites to reduce motion; we follow that by default, which freezes
 * the animated backgrounds. Players can override it: "auto" (follow the device), "on" or "off". */
(function () {
  const KEY = 'sliver.motion';
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  let pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch {}
  const api = {
    pref: () => pref,
    deviceReduced: () => !!mq.matches,
    reduced: () => pref === 'off' || (pref !== 'on' && !!mq.matches),
    set(v) {
      pref = ['auto', 'on', 'off'].includes(v) ? v : 'auto';
      try { localStorage.setItem(KEY, pref); } catch {}
      apply();
    },
  };
  function apply() {
    document.documentElement.dataset.motion = api.reduced() ? 'reduce' : 'full';
    try { window.dispatchEvent(new CustomEvent('sliver:motion', { detail: { reduced: api.reduced() } })); } catch {}
  }
  try { mq.addEventListener('change', apply); } catch {}
  window.SliverMotion = api;
  apply();
})();
