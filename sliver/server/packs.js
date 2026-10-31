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
  { id: 'metal', cat: 'Genres', name: 'Metal', spotify: null, backup: ['metal hits', 'heavy metal classics', 'metalcore hits'] },
  { id: 'country', cat: 'Genres', name: 'Country', spotify: '37i9dQZF1DX1lVhptIYRda', backup: 'country hits' },
  { id: 'latin', cat: 'Genres', name: 'Latin', spotify: '37i9dQZF1DX10zKzsJ2jva', backup: 'latin hits reggaeton' },
  { id: 'dance', cat: 'Genres', name: 'Dance & EDM', spotify: '37i9dQZF1DX4dyzvuaRJ0n', backup: 'dance edm hits' },
  { id: 'indie', cat: 'Genres', name: 'Indie & Alt', spotify: '37i9dQZF1DX2Nc3B70tvx0', backup: 'indie alternative hits' },
  { id: 'kpop', cat: 'Genres', name: 'K-Pop', spotify: '37i9dQZF1DX9tPFwDMOaN1', backup: 'k-pop hits' },
  { id: 'afrobeats', cat: 'Genres', name: 'Afrobeats', spotify: null, backup: 'afrobeats hits' },
  { id: 'movies', cat: 'Genres', name: 'Movie & TV', spotify: null, backup: 'movie soundtrack hits' },

  // Arabic & Middle East (Deezer playlists found by search)
  { id: 'arabic-hits', cat: 'Arabic & Middle East', name: 'Arabic Hits', spotify: null, backup: 'arabic hits' },
  { id: 'khaleeji', cat: 'Arabic & Middle East', name: 'Khaleeji', spotify: null, backup: 'khaleeji hits' },
  // Egyptian packs merge several public playlists (Arabic and English searches) for more songs.
  { id: 'egyptian', cat: 'Arabic & Middle East', name: 'Egyptian Pop', spotify: null, backup: ['egyptian pop hits', 'اغاني مصرية', 'top egypt', 'amr diab tamer hosny hits'] },
  { id: 'egyptian-classics', cat: 'Arabic & Middle East', name: 'Egyptian Classics', spotify: null, backup: ['egyptian classics', 'اغاني زمن الفن الجميل', 'abdel halim umm kulthum'] },
  { id: 'arabic-classics', cat: 'Arabic & Middle East', name: 'Arabic Classics (Tarab)', spotify: null, backup: 'arabic classics tarab' },
  { id: 'arabic-rap', cat: 'Arabic & Middle East', name: 'Arabic Rap & Mahraganat', spotify: null, backup: ['arabic rap hits', 'mahraganat', 'مهرجانات', 'egyptian rap'] },
  { id: 'maghreb', cat: 'Arabic & Middle East', name: 'Raï & Maghreb', spotify: null, backup: 'rai maghreb hits' },
  { id: 'turkish', cat: 'Arabic & Middle East', name: 'Turkish Pop', spotify: null, backup: 'turkish pop hits' },

  // (spotify: null = no Spotify playlist I'm sure of; uses the Deezer search directly)

  // Artists: every song they have on Deezer (albums, EPs, singles); popular songs come up more often.
  ...artists('Pop artists', [
    'Taylor Swift', 'Ariana Grande', 'Billie Eilish', 'Dua Lipa', 'Ed Sheeran', 'Bruno Mars', 'Rihanna',
    'Beyoncé', 'The Weeknd', 'Justin Bieber', 'Harry Styles', 'Olivia Rodrigo', 'Sabrina Carpenter',
    'Lady Gaga', 'Katy Perry', 'Adele', 'Lana Del Rey', 'Miley Cyrus', 'Selena Gomez', 'Shawn Mendes',
    'Post Malone', 'Doja Cat', 'Chappell Roan', 'Charli xcx', 'Maroon 5', 'One Direction', 'Michael Jackson',
    'Shakira', 'Bad Bunny',
  ]),
  ...artists('Hip-hop & R&B artists', [
    'Drake', 'Kendrick Lamar', 'Travis Scott', 'SZA', 'Eminem', 'Kanye West', 'J. Cole', 'Future',
    '21 Savage', 'Lil Baby', 'Juice WRLD', 'XXXTENTACION', 'Nicki Minaj', 'Cardi B', 'Chris Brown',
    'Frank Ocean', 'Tyler, The Creator', 'Playboi Carti', 'Lil Uzi Vert', 'Metro Boomin', 'Lil Wayne',
    'Usher', '2Pac', 'The Notorious B.I.G.', '50 Cent', 'Daniel Caesar', 'Brent Faiyaz',
  ]),
  ...artists('Rock, alt & country artists', [
    'Queen', 'The Beatles', 'Coldplay', 'Imagine Dragons', 'Linkin Park', 'Arctic Monkeys', 'Nirvana',
    'Red Hot Chili Peppers', 'Fleetwood Mac', 'AC/DC', "Guns N' Roses", 'Green Day', 'Twenty One Pilots',
    'Tame Impala', 'The Neighbourhood', 'Radiohead', 'Oasis', 'Paramore', 'Fall Out Boy',
    'Morgan Wallen', 'Zach Bryan', 'Luke Combs',
  ]),
  ...artists('Metal artists', [
    'Metallica', 'Iron Maiden', 'Slipknot', 'System of a Down', 'Black Sabbath', 'Megadeth',
    'Avenged Sevenfold', 'Bring Me The Horizon', 'Rammstein', 'Pantera', 'Judas Priest', 'Ghost',
    'Korn', 'Disturbed', 'Tool', 'Gojira', 'Sleep Token', 'Motörhead',
  ]),
  // Egyptian and Arabic artists also pull songs from Apple's catalogue (Deezer misses many).
  ...artists('Egyptian artists', [
    'Amr Diab', 'Tamer Hosny', 'Mohamed Hamaki', 'Sherine', 'Angham', 'Mohamed Mounir', 'Ruby',
    'Hany Shaker', 'Mohamed Fouad', 'Ehab Tawfik', 'Hesham Abbas', 'Bahaa Sultan', 'Ahmed Saad',
    'Hamza Namira', 'Mohamed Mohie', 'Hakim', 'Amr Mostafa', 'Mohamed Ramadan', 'Wegz', 'Marwan Pablo',
    'Marwan Moussa', 'Abyusif', 'Cairokee', 'Wust El Balad', 'Massar Egbari', 'Hassan Shakosh',
    'Essam Sasa', 'Ahmed Sheba', 'Umm Kulthum', 'Abdel Halim Hafez', 'Mohamed Abdel Wahab', 'Warda',
  ], { arabic: true }),
  ...artists('Arabic artists', [
    'Nancy Ajram', 'Elissa', 'Haifa Wehbe', 'Myriam Fares', 'Ragheb Alama', 'Wael Kfoury', 'Assala',
    'Kadim Al Sahir', 'Mohammed Abdu', 'Majid Al Mohandis', 'Rashed Al Majed', 'Hussain Al Jassmi',
    'Balqees', 'Fairuz', 'Saint Levant', 'ElGrandeToto', 'Saad Lamjarred', 'Nawal Al Zoghbi',
  ], { arabic: true }),
  ...artists('K-pop artists', ['BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'TWICE', 'Jungkook', 'ROSÉ', 'aespa']),
];

function artists(cat, names, extra = {}) {
  return names.map((artist) => ({
    id: 'artist-' + artist.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    cat, name: artist, artist, ...extra,
  }));
}

const byId = new Map(PACKS.map((p) => [p.id, p]));

// Ranked play uses the genre and decade packs; each one has its own leaderboard.
for (const p of PACKS) p.ranked = !p.artist;
const RANKED = PACKS.filter((p) => p.ranked);

function publicPacks() {
  return PACKS.map(({ id, cat, name, ranked, artist }) => ({ id, cat, name, ranked, ...(artist ? { artist: true } : {}) }));
}

module.exports = { PACKS, RANKED, byId, publicPacks };
