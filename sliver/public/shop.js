/* Premium themes for sale. Shared by the page (window.SliverShop) and the server (require).
 * The looks themselves (colours + animations) are in themes.js and fx.js. */
(function (root) {
  const PRICE = 2.5; // US dollars each
  const PREMIUM = [
    { id: 'sakura', name: 'Sakura Drift', blurb: 'Cherry blossom petals swirl down through soft pink light.', buy: 'https://buymeacoffee.com/asher05/e/593667' },
    { id: 'cottoncandy', name: 'Cotton Candy', blurb: 'Pastel clouds drift by, with floating hearts and twinkling stars.', buy: 'https://buymeacoffee.com/asher05/e/593668' },
    { id: 'lagoon', name: 'Mermaid Lagoon', blurb: 'Bubbles rise through shimmering underwater light rays.', buy: 'https://buymeacoffee.com/asher05/e/593669' },
    { id: 'aurora', name: 'Aurora', blurb: 'Northern lights ripple across a starry night sky.', buy: 'https://buymeacoffee.com/asher05/e/593670' },
    { id: 'nebula', name: 'Nebula', blurb: 'Fly through a galaxy: drifting stars, glowing nebulae, shooting stars.', buy: 'https://buymeacoffee.com/asher05/e/593671' },
    { id: 'synthwave', name: 'Synthwave', blurb: 'An endless neon grid racing toward a glowing striped sun.', buy: 'https://buymeacoffee.com/asher05/e/593672' },
    { id: 'ember', name: 'Ember Forge', blurb: 'Sparks and embers rise from a glowing forge.', buy: 'https://buymeacoffee.com/asher05/e/593673' },
    { id: 'storm', name: 'Thunderstorm', blurb: 'Driving rain with lightning that cracks across the sky.', buy: 'https://buymeacoffee.com/asher05/e/593674' },
    { id: 'blackgold', name: 'Black Gold', blurb: 'Gold dust drifts over black marble, with a shine that sweeps your buttons.', buy: 'https://buymeacoffee.com/asher05/e/593675' },
  ];
  // Buy Me a Coffee: one coffee of $2 or more gives a random premium theme you don't own yet.
  const COFFEE_MIN = 2;
  const api = { PRICE, PREMIUM, COFFEE_MIN, ids: PREMIUM.map((t) => t.id), byId: Object.fromEntries(PREMIUM.map((t) => [t.id, t])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SliverShop = api;
})(this);
