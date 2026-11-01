/* Premium themes for sale. Shared by the page (window.SliverShop) and the server (require).
 * The looks themselves (colours + animations) are in themes.js and fx.js. */
(function (root) {
  const PRICE = 2.5; // US dollars each
  const PREMIUM = [
    { id: 'sakura', name: 'Sakura Drift', blurb: 'Cherry blossom petals swirl down through soft pink light. Tap for a gust of blossoms.', buy: 'https://buymeacoffee.com/asher05/e/593667' },
    { id: 'cottoncandy', name: 'Cotton Candy', blurb: 'Pastel clouds, floating hearts and twinkling stars. Tap a cloud to make it wobble and rain hearts.', buy: 'https://buymeacoffee.com/asher05/e/593668' },
    { id: 'lagoon', name: 'Mermaid Lagoon', blurb: 'Bubbles rise through shimmering underwater light. Pop bubbles, startle the fish, or blow your own bubbles.', buy: 'https://buymeacoffee.com/asher05/e/593669' },
    { id: 'aurora', name: 'Aurora', blurb: 'Northern lights ripple across a starry sky. Tap to make them flare up.', buy: 'https://buymeacoffee.com/asher05/e/593670' },
    { id: 'nebula', name: 'Nebula', blurb: 'Drifting stars, glowing nebulae and shooting stars. Tap for a supernova and a jump to warp speed.', buy: 'https://buymeacoffee.com/asher05/e/593671' },
    { id: 'synthwave', name: 'Synthwave', blurb: 'An endless neon grid racing toward a glowing striped sun. Tap for a turbo boost.', buy: 'https://buymeacoffee.com/asher05/e/593672' },
    { id: 'ember', name: 'Ember Forge', blurb: 'Sparks and embers rise from a glowing forge. Tap to strike the anvil and send sparks flying.', buy: 'https://buymeacoffee.com/asher05/e/593673' },
    { id: 'storm', name: 'Thunderstorm', blurb: 'Driving rain and lightning across the sky. Tap to call lightning down right where you tap.', buy: 'https://buymeacoffee.com/asher05/e/593674' },
    { id: 'blackgold', name: 'Black Gold', blurb: 'Gold dust over black marble, with a shine that sweeps your buttons. Tap for a shower of gold coins.', buy: 'https://buymeacoffee.com/asher05/e/593675' },
    { id: 'piano', name: 'Grand Piano', blurb: 'A piano keyboard that plays along: keys light up with the song and glowing notes rise off them.', buy: 'https://buymeacoffee.com/asher05/e/593744' },
    { id: 'crimson', name: 'Crimson City', blurb: 'A red-lit skyline at night: flickering neon, rain and fog. Tap a building to light it up.', buy: 'https://buymeacoffee.com/asher05/e/593742' },
    { id: 'critters', name: 'Critter Club', blurb: 'Little bunnies, kittens, bears and chicks float by on balloons, with hearts and sparkles.', buy: 'https://buymeacoffee.com/asher05/e/593743' },
  ];
  // Buy Me a Coffee: one coffee of $2 or more gives a random premium theme you don't own yet.
  const COFFEE_MIN = 2;
  const api = { PRICE, PREMIUM, COFFEE_MIN, ids: PREMIUM.map((t) => t.id), byId: Object.fromEntries(PREMIUM.map((t) => [t.id, t])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SliverShop = api;
})(this);
