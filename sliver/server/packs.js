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

  // Arabic & Middle East. Public playlists found by search mixed in Western artists, so these
  // are built from hand-picked artists instead: each artist's own top songs, nobody else's.
  { id: 'arabic-hits', cat: 'Arabic & Middle East', name: 'Arabic Hits', roster: [
    'Nancy Ajram', 'Elissa', 'Haifa Wehbe', 'Myriam Fares', 'Ragheb Alama', 'Wael Kfoury', 'Assala', 'Amr Diab',
    'Tamer Hosny', 'Mohamed Hamaki', 'Sherine', 'Saad Lamjarred', 'Balqees', 'Hussain Al Jassmi', 'Kadim Al Sahir',
    'Nawal Al Zoghbi', 'Wael Jassar', 'Carole Samaha', 'Najwa Karam', 'Ahlam', 'Rahma Riad', 'Ahmed Saad'] },
  { id: 'khaleeji', cat: 'Arabic & Middle East', name: 'Khaleeji', roster: [
    'Mohammed Abdu', 'Abdul Majeed Abdullah', 'Rashed Al Majed', 'Majid Al Mohandis', 'Hussain Al Jassmi', 'Ahlam',
    'Balqees', 'Aseel Hameem', 'Nawal Al Kuwaitia', 'Rabeh Saqer', 'Abdallah Al Rowaished', 'Mohammed Al Salem',
    'Fouad Abdulwahed', 'Eida Al Menhali', 'Rahma Riad', 'Diana Haddad'] },
  { id: 'egyptian', cat: 'Arabic & Middle East', name: 'Egyptian Pop', roster: [
    'Amr Diab', 'Tamer Hosny', 'Mohamed Hamaki', 'Sherine', 'Angham', 'Ruby', 'Mohamed Fouad', 'Ehab Tawfik',
    'Hesham Abbas', 'Bahaa Sultan', 'Ahmed Saad', 'Hamza Namira', 'Mohamed Mohie', 'Amr Mostafa', 'Tamer Ashour',
    'Ramy Sabry', 'Ahmed Gamal', 'Medhat Saleh', 'Hakim', 'Mohamed Mounir', 'Mostafa Hagag'] },
  { id: 'egyptian-classics', cat: 'Arabic & Middle East', name: 'Egyptian Classics', roster: [
    'Umm Kulthum', 'Abdel Halim Hafez', 'Mohamed Abdel Wahab', 'Warda', 'Shadia', 'Farid Al Atrache',
    'Najat Al Saghira', 'Mohamed Fawzi', 'Fayza Ahmed', 'Leila Mourad', 'Sayed Darwish', 'Mohamed Roshdy',
    'Hany Shaker', 'Mohamed Mounir', 'Ali El Haggar'] },
  { id: 'arabic-classics', cat: 'Arabic & Middle East', name: 'Arabic Classics (Tarab)', roster: [
    'Umm Kulthum', 'Fairuz', 'Abdel Halim Hafez', 'Warda', 'Wadih El Safi', 'Sabah', 'Farid Al Atrache',
    'Mohamed Abdel Wahab', 'Kadim Al Sahir', 'Najat Al Saghira', 'Majida El Roumi', 'George Wassouf',
    'Melhem Barakat', 'Asmahan', 'Sabah Fakhri'] },
  { id: 'arabic-rap', cat: 'Arabic & Middle East', name: 'Arabic Rap & Mahraganat', roster: [
    'Wegz', 'Marwan Pablo', 'Marwan Moussa', 'Abyusif', 'Afroto', 'Lil Baba', 'Hassan Shakosh', 'Essam Sasa',
    'Oka Wi Ortega', 'Mohamed Ramadan', 'ElGrandeToto', 'Shabjdeed', 'Balti', 'Muslim', 'Abo El Anwar', 'Ziad Zaza'] },
  { id: 'maghreb', cat: 'Arabic & Middle East', name: 'Raï & Maghreb', roster: [
    'Khaled', 'Cheb Mami', 'Cheb Hasni', 'Faudel', 'Rachid Taha', 'Saad Lamjarred', 'Douzi', 'Hatim Ammor',
    'Cheb Bilal', 'Cheba Zahouania', 'Najat Aatabou', 'Zouhair Bahaoui', 'Cheb Khalass', 'Hamid El Kasri'] },
  { id: 'turkish', cat: 'Arabic & Middle East', name: 'Turkish Pop', roster: [
    'Tarkan', 'Sezen Aksu', 'Hadise', 'Mabel Matiz', 'Edis', 'Simge', 'Murat Boz', 'Aleyna Tilki', 'Mustafa Sandal',
    'Gülşen', 'Sertab Erener', 'Ezhel', 'Sıla', 'Kenan Doğulu', 'Hande Yener', 'Mert Demir'] },

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


// When Deezer turns the server away (it has been blocking Render), these packs are rebuilt
// from Apple's catalogue: each listed artist's songs, kept to the pack's years where it has any.
const FALLBACK = {
  'top-hits': { chart: true, roster: ['Sabrina Carpenter', 'Chappell Roan', 'Billie Eilish', 'Kendrick Lamar', 'SZA', 'Benson Boone', 'Teddy Swims', 'Lady Gaga', 'Bruno Mars', 'ROSÉ', 'Morgan Wallen', 'Post Malone', 'Tate McRae', 'Gracie Abrams', 'Alex Warren', 'The Weeknd', 'Doechii'], years: [2023, 2030] },
  '2010s': { roster: ['Rihanna', 'Katy Perry', 'Bruno Mars', 'Taylor Swift', 'Adele', 'Ed Sheeran', 'Drake', 'Justin Bieber', 'Ariana Grande', 'The Weeknd', 'Maroon 5', 'Lady Gaga', 'Calvin Harris', 'Pharrell Williams', 'Imagine Dragons', 'Sia', 'LMFAO', 'Post Malone', 'Shawn Mendes', 'Dua Lipa'], years: [2010, 2019] },
  '2000s': { roster: ['Beyoncé', 'Usher', 'Rihanna', 'Britney Spears', 'Eminem', '50 Cent', 'OutKast', 'Nelly', 'Kelly Clarkson', 'Black Eyed Peas', 'Justin Timberlake', 'Christina Aguilera', 'Avril Lavigne', 'Shakira', 'Gwen Stefani', 'The Killers', 'Coldplay', 'Lady Gaga', 'Akon', 'Destiny’s Child'], years: [2000, 2009] },
  '90s': { roster: ['Mariah Carey', 'Whitney Houston', 'Backstreet Boys', 'Spice Girls', 'TLC', 'Britney Spears', 'Nirvana', 'Oasis', 'Alanis Morissette', 'Celine Dion', 'No Doubt', 'Green Day', 'Coolio', '2Pac', 'Destiny’s Child', 'Ace of Base', 'Shania Twain', 'Boyz II Men', 'Madonna', 'Red Hot Chili Peppers'], years: [1990, 1999] },
  '80s': { roster: ['Michael Jackson', 'Madonna', 'Prince', 'Whitney Houston', 'Bon Jovi', 'a-ha', 'Queen', 'Cyndi Lauper', 'Wham!', 'Duran Duran', 'Tears for Fears', 'Toto', 'Journey', 'Bruce Springsteen', 'Eurythmics', 'Lionel Richie', 'The Police', 'Phil Collins', 'Hall & Oates', 'Def Leppard'], years: [1980, 1989] },
  'throwbacks': { roster: ['Usher', 'Rihanna', 'Black Eyed Peas', 'Britney Spears', 'Nelly', 'OutKast', 'Kesha', 'LMFAO', 'Flo Rida', 'Pitbull', 'Beyoncé', 'Lady Gaga', 'Katy Perry', 'Chris Brown', 'Sean Paul', 'Shakira', 'Taio Cruz', 'Jason Derulo'], years: [1998, 2014] },
  'hiphop': { roster: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Future', 'Lil Baby', '21 Savage', 'J. Cole', 'Gunna', 'Playboi Carti', 'Metro Boomin', 'Lil Uzi Vert', 'Tyler, The Creator', 'Doja Cat', 'Megan Thee Stallion', 'Nicki Minaj', 'Cardi B', 'Lil Wayne', 'Eminem', 'Kanye West', 'GloRilla'] },
  'pop': { roster: ['Taylor Swift', 'Sabrina Carpenter', 'Ariana Grande', 'Billie Eilish', 'Dua Lipa', 'Olivia Rodrigo', 'Harry Styles', 'Ed Sheeran', 'Bruno Mars', 'Lady Gaga', 'Chappell Roan', 'Justin Bieber', 'The Weeknd', 'Miley Cyrus', 'Tate McRae', 'Charli xcx', 'Selena Gomez', 'Shawn Mendes'] },
  'rnb': { roster: ['SZA', 'Usher', 'Beyoncé', 'Chris Brown', 'Frank Ocean', 'Daniel Caesar', 'Brent Faiyaz', 'H.E.R.', 'Summer Walker', 'Jhené Aiko', 'Kehlani', 'Giveon', 'The Weeknd', 'Alicia Keys', 'Bryson Tiller', 'Miguel', 'Tems', 'Victoria Monét'] },
  'rock': { roster: ['Queen', 'AC/DC', "Guns N' Roses", 'Led Zeppelin', 'The Rolling Stones', 'Bon Jovi', 'Aerosmith', 'Nirvana', 'Fleetwood Mac', 'Eagles', 'The Beatles', 'Pink Floyd', 'Journey', 'Def Leppard', 'Lynyrd Skynyrd', 'Red Hot Chili Peppers', 'Foo Fighters', 'Kiss'] },
  'metal': { roster: ['Metallica', 'Iron Maiden', 'Slipknot', 'System of a Down', 'Black Sabbath', 'Megadeth', 'Avenged Sevenfold', 'Bring Me The Horizon', 'Rammstein', 'Pantera', 'Judas Priest', 'Ghost', 'Korn', 'Disturbed', 'Sleep Token', 'Linkin Park'] },
  'country': { roster: ['Morgan Wallen', 'Zach Bryan', 'Luke Combs', 'Chris Stapleton', 'Kane Brown', 'Jason Aldean', 'Carrie Underwood', 'Luke Bryan', 'Florida Georgia Line', 'Lainey Wilson', 'Thomas Rhett', 'Blake Shelton', 'Shaboozey', 'Post Malone', 'Kenny Chesney', 'Miranda Lambert', 'Jelly Roll'] },
  'latin': { roster: ['Bad Bunny', 'Karol G', 'J Balvin', 'Daddy Yankee', 'Ozuna', 'Feid', 'Peso Pluma', 'Rauw Alejandro', 'Shakira', 'Maluma', 'Anuel AA', 'Myke Towers', 'Becky G', 'Sech', 'Grupo Frontera', 'Luis Fonsi'] },
  'dance': { roster: ['Calvin Harris', 'David Guetta', 'Avicii', 'Martin Garrix', 'Marshmello', 'The Chainsmokers', 'Kygo', 'Zedd', 'Swedish House Mafia', 'Tiësto', 'Fred again..', 'Fisher', 'Disclosure', 'Clean Bandit', 'Alan Walker', 'Major Lazer'] },
  'indie': { roster: ['Arctic Monkeys', 'Tame Impala', 'The Neighbourhood', 'Cage The Elephant', 'Glass Animals', 'Foster The People', 'The 1975', 'Mac DeMarco', 'Phoebe Bridgers', 'Hozier', 'Lorde', 'Vampire Weekend', 'The Strokes', 'MGMT', 'Florence + The Machine', 'Mitski', 'Wallows', 'Beach House'] },
  'kpop': { roster: ['BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'TWICE', 'SEVENTEEN', 'aespa', 'IVE', 'LE SSERAFIM', 'Jungkook', 'ROSÉ', 'Jimin', 'ITZY', '(G)I-DLE', 'ENHYPEN', 'Red Velvet', 'EXO', 'BIGBANG'] },
  'afrobeats': { roster: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Tems', 'Ayra Starr', 'Asake', 'CKay', 'Fireboy DML', 'Omah Lay', 'Tyla', 'Kizz Daniel', 'Olamide', 'Mr Eazi', 'Tiwa Savage', 'Joeboy'] },
  'movies': { roster: ['Hans Zimmer', 'John Williams', 'Ludwig Göransson', 'Alan Menken', 'Lin-Manuel Miranda', 'Idina Menzel', 'Hugh Jackman', 'Lady Gaga', 'Whitney Houston', 'Celine Dion', 'Survivor', 'Kenny Loggins', 'Ray Parker Jr.', 'Danny Elfman', 'Howard Shore', 'Ramin Djawadi'] },
};
for (const p of PACKS) if (FALLBACK[p.id]) p.fallback = FALLBACK[p.id];

const byId = new Map(PACKS.map((p) => [p.id, p]));

// Ranked play uses the genre and decade packs; each one has its own leaderboard.
for (const p of PACKS) p.ranked = !p.artist;
const RANKED = PACKS.filter((p) => p.ranked);

function publicPacks() {
  return PACKS.map(({ id, cat, name, ranked, artist }) => ({ id, cat, name, ranked, ...(artist ? { artist: true } : {}) }));
}

module.exports = { PACKS, RANKED, byId, publicPacks };
