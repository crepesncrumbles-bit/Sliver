// Arriving from the old address: restore the login/settings it handed over (never overwrites what's here).
(function () {
  var m = location.hash.match(/^#carry=(.+)$/);
  if (!m) return;
  try {
    var o = JSON.parse(decodeURIComponent(m[1]));
    for (var k in o) if (k.indexOf('sliver.') === 0 && localStorage.getItem(k) === null) localStorage.setItem(k, o[k]);
  } catch (e) {}
  history.replaceState(null, '', location.pathname + location.search);
})();
/* Animations setting: "on" (the default) or "off". The device's own "reduce motion" setting is
 * ignored, so animated backgrounds always play unless the player turns them off here. */
(function () {
  const KEY = 'sliver.motion';
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  let pref = 'on';
  try { pref = localStorage.getItem(KEY) === 'off' ? 'off' : 'on'; } catch {}
  const api = {
    pref: () => pref,
    deviceReduced: () => !!mq.matches,
    reduced: () => pref === 'off',
    set(v) {
      pref = v === 'off' ? 'off' : 'on';
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
