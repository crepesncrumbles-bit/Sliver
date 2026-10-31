/* Player icons. Shared by the page (window.SliverIcons) and the server (require). */
(function (root) {
  const ICONS = [
    '🎧', '🎤', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻', '🪕', '📻', '💿', '🎵',
    '🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐨', '🐧', '🦁', '🐺', '🦉', '🐝',
    '🔥', '⚡', '🌙', '⭐', '👑', '💎', '🍕', '🍩', '🌵', '🚀', '👾', '🎃',
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ICONS;
  else root.SliverIcons = ICONS;
})(this);
