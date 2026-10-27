// Built-in song packs players can add with one tap.
//
// Genre/decade packs are Spotify's own public editorial playlists. If Spotify won't serve
// one (they occasionally change or restrict these), the pack falls back to a similar public
// Deezer playlist found by name, so the button always works.
// Artist packs are that artist's most popular songs (via Deezer's public API).

const PACKS = [
  // Hits & decades
  { id: 'top-hits', cat: 'Hits & decades', name: "Today's Top Hits", spotify: '37i9dQZF1DXcBWIGoYBM5M', backup: 'top hits 2026' },
  { id: '2010s', cat: 'Hits & decades', name: '2010s Hits', spotify: '37i9dQZF1DX5Ejj0EkURtP', backup: '2010s hits' },
  { id: '2000s', cat: 'Hits & decades', name: '2000s Hits', spotify: '37i9dQZF1DX4o1oenSJRJd', backup: '2000s hits' },
  { id: '90s', cat: 'Hits & decades', name: '90s Hits', spotify: '37i9dQZF1DXbTxeAdrVG2l', backup: '90s hits' },
  { id: '80s', cat: 'Hits & decades', name: '80s Hits', spotify: '37i9dQZF1DX4UtSsGT1Sbe', backup: '80s hits' },
  { id: 'throwbacks', cat: 'Hits & decades', name: 'Throwback Bangers', spotify: null, backup: 'throwback party hits' },

  // Genres
  { id: 'hiphop', cat: 'Genres', name: 'Hip-Hop', spotify: '37i9dQZF1DX0XUsuxWHRQd', backup: 'hip hop hits' },
  { id: 'pop', cat: 'Genres', name: 'Pop', spotify: '37i9dQZF1DXarRysLJmuju', backup: 'pop hits' },
  { id: 'rnb', cat: 'Genres', name: 'R&B', spotify: '37i9dQZF1DX4SBhb3fqCJd', backup: 'r&b hits' },
  { id: 'rock', cat: 'Genres', name: 'Rock Classics', spotify: '37i9dQZF1DWXRqgorJj26U', backup: 'rock classics' },
  { id: 'country', cat: 'Genres', name: 'Country', spotify: '37i9dQZF1DX1lVhptIYRda', backup: 'country hits' },
  { id: 'latin', cat: 'Genres', name: 'Latin', spotify: '37i9dQZF1DX10zKzsJ2jva', backup: 'latin hits reggaeton' },
  { id: 'dance', cat: 'Genres', name: 'Dance & EDM', spotify: '37i9dQZF1DX4dyzvuaRJ0n', backup: 'dance edm hits' },
  { id: 'indie', cat: 'Genres', name: 'Indie & Alt', spotify: '37i9dQZF1DX2Nc3B70tvx0', backup: 'indie alternative hits' },
  { id: 'kpop', cat: 'Genres', name: 'K-Pop', spotify: '37i9dQZF1DX9tPFwDMOaN1', backup: 'k-pop hits' },
  { id: 'afrobeats', cat: 'Genres', name: 'Afrobeats', spotify: null, backup: 'afrobeats hits' },
  { id: 'movies', cat: 'Genres', name: 'Movie & TV', spotify: null, backup: 'movie soundtrack hits' },

  // (spotify: null = no Spotify playlist I'm sure of; uses the Deezer search directly)

  // Artists
  ...[
    'Taylor Swift', 'Drake', 'The Weeknd', 'Bad Bunny', 'Beyoncé', 'Kendrick Lamar',
    'Billie Eilish', 'Ariana Grande', 'SZA', 'Travis Scott', 'Rihanna', 'Bruno Mars',
    'Ed Sheeran', 'Eminem', 'Michael Jackson', 'Queen', 'The Beatles', 'Coldplay',
  ].map((artist) => ({ id: 'artist-' + artist.toLowerCase().replace(/[^a-z0-9]+/g, '-'), cat: 'Artists', name: artist, artist })),
];

const byId = new Map(PACKS.map((p) => [p.id, p]));

function publicPacks() {
  return PACKS.map(({ id, cat, name }) => ({ id, cat, name }));
}

module.exports = { PACKS, byId, publicPacks };
