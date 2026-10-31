# Sliver — guess the song from a sliver of it

A Songless-style party game for you and your friends. Everyone hears the same tiny clip
from the start of a song, drags a slider to hear more (0.1 s up to 30 s), and guesses.
The less you needed, the more points you get.

Runs on your laptop with just Node.js, or online for free on Render. Accounts are optional
and only needed for ranked play and leaderboards.

---

## 1. One-time setup

1. Install **Node.js** (the "LTS" button) from <https://nodejs.org>. Just click through the installer.
2. Unzip this folder somewhere easy, like your Desktop.

That's it — there's no `npm install` step. The game uses only what comes with Node.

## 2. Start the game

- **Windows:** double-click **`Start Sliver (Windows).bat`**.
  If Windows asks whether to allow Node.js on networks, tick **Private networks** and click **Allow**
  (that's what lets friends' phones connect).
- **Mac:** right-click **`Start Sliver (Mac).command`** → **Open** → **Open**
  (the right-click is only needed the first time, because macOS is cautious about downloaded scripts).
  If macOS asks to allow incoming connections for `node`, click **Allow**.
- **Any computer, from a terminal:** `cd` into this folder and run `node server/index.js`.

A black window opens and your browser goes to <http://localhost:3000>.
**Keep the black window open while you play** — closing it stops the game.

## 3. Play

1. Type your name and click **Create a room**.
2. Add songs. Paste a **Spotify**, **Deezer** or **Anghami** playlist or album link and click **Add**
   (in the app: ⋯ or Share → Copy link to playlist). Playlists must be **public**.
   Each friend can add their own playlist too — they all go into one pool.
   Not online, or just want to try it? Type **`demo`** (or leave the box empty) and click **Add** for 12 built-in tunes.
3. Invite friends:
   - **Same Wi-Fi:** click **Copy invite link** and send it. It looks like
     `http://192.168.x.x:3000/?room=ABCD`. They open it on their phone or laptop.
   - **Testing alone:** open the link in a second browser window (or a private window) and play against yourself.
4. Pick rounds and seconds per round, then **Start game**.

### Adding songs
- Tap any pack (genres incl. **Metal**, decades, Arabic & Middle East, Egyptian, artists) to add it. Tap it again to remove it.
- **Artists: All songs / Top 20** (under the link box) picks how much of an artist you get, for artist packs
  and typed artist names. *All songs* = every song on Deezer (albums, EPs, singles, no live/remix versions);
  popular songs come up more often. Egyptian and Arabic artists (and anyone with under 150 songs on Deezer)
  also get the songs Deezer is missing from Apple's iTunes catalogue. *Top 20* = their 20 biggest songs.
- Or paste a public Spotify/Deezer/Anghami playlist link, or start typing an artist's name and pick them from
  the suggestions (most popular artists first). One playlist adds up to **500** songs.
  Anghami: songs are read from Anghami's public playlist page; each song's audio comes from Deezer or iTunes.
- Remove any single playlist with its **×**. The host can remove anything; others can remove what they added.
- **Only the host adds songs** (checkbox, host only): guests can't add or remove songs while it's on.
- The guess box lists the most popular songs first (Spotify/Anghami songs get their popularity looked up
  in the background, so the order settles a minute after adding a big playlist).

### Room controls
- **Leave room** (top left) takes you back to the home screen. Tap it twice to confirm.
- **End game** (top right, host only, during a game) stops the game and brings everyone back to the lobby.
  Songs and players stay; scores reset. Tap it twice to confirm.
- The **room code** is hidden (••••) until you tap the eye next to it (handy when streaming). Copy invite
  link always works.
- The host can remove a player with the **×** next to their name (tap twice to confirm). Removed players
  can't get back in by refreshing; they'd have to rejoin with the code.
- **Players** button (top right, also tap a name during a song): the host can **Make host** or **Remove**
  anyone, any time, even mid-game. Tap twice to confirm.
- When someone else gets the song right, a pop-up at the top shows their name and points.
- With 2 or more players, the **first** person to get each song gets **+500** (not in ranked).
- After each song you see how many plays it has on Spotify (when Spotify shares it).

### Settings
The gear (top right) opens Settings (saved on that device only):
- **Sound:** volume slider, mute, and a test sound.
- **Your icon:** pick an icon that shows next to your name everywhere (or keep your initial). Also on the
  home screen, left of your name. Logged in, it's saved to your account.
- **Theme:** Blue Hour, Golden Hour, Bubblegum Pop, Greenroom, Velvet, On Air, Night Drive, Laser Show or Vinyl,
  plus holiday themes that only show up around their time of year: Countdown (New Year), Love Song
  (Valentine's), Lucky Clover (St. Patrick's), Fireworks (Fourth of July), Graveyard Shift (Halloween),
  Harvest (Thanksgiving) and Jingle (Christmas). Holiday themes come with animated decorations (bats, ghosts,
  pumpkins, snow, ornaments, hearts, fireworks, clovers, leaves); **Holiday decorations** turns them off.
- **Make your own theme:** pick 4 colors (background, cards, buttons, highlights); the rest is worked out
  so text stays readable. It gets a **share code** like `SLV-28T5D-YQTZB-GHTJ1-2TFQ0-HB`: send it to a
  friend, they paste it under *Use code* and get the same theme.
- **Account:** log in, sign up, see your stats, and **Hide my account**: other players can't open your stats,
  you show as "Hidden player" on leaderboards, and rooms don't say which account you are. Friends still can.

Clips go up to **15 seconds** while you guess, and after you guess the song plays for **30 seconds**.

### Game modes (host picks in the lobby)
Hard and Chaos can both be on at once for **2×** points. Tap Classic to turn them off.
- **Classic:** every clip starts at the top of the song, like Songless.
- **Hard (1.5× points):** each clip starts somewhere random in the song, and there's no list to pick from.
  You type the title yourself (small typos are fine).
- **Chaos (1.25× points):** every song gets a random twist: reversed, chipmunk, slow-mo, underwater, or a deep cut
  that starts mid-song. The 30-second listen afterwards is always the real song.

### Ranked play, leaderboards and stats
- Tap **Log in / Sign up** on the home screen. You need a username (doesn't have to be unique), an email
  (unique, never shown to anyone) and a password. Only ranked games need an account.
- In the lobby the host switches to **Ranked** and picks a genre or decade. Ranked games are always 5 songs
  from that genre, **90 seconds per song**, unlimited guesses, no first-guess bonus. Hard and Chaos work as
  multipliers (both = 2×). Everyone in the room must be logged in.
- Each genre has its own **top 25** (your best ranked game there). Your **rating** works like osu! pp:
  each genre best is worth score ÷ 100, and they add up with each one after your best counting a bit less
  (×0.95, ×0.95², …). The trophy button opens the leaderboards; tap any name to see their stats
  (rating, rank, accuracy, first-try %, average time heard, best per genre, recent games).
- Ending a ranked game early saves nothing. Players who leave before the end aren't saved.
- With email codes turned on (below), sign-up sends a 6-digit code to your email, and **Forgot password?**
  sends a code to set a new password (this logs out your other devices). Without them, accounts are created
  right away and there's no password reset.

### Scoring (same as Songless)
- Drag the slider (0.1 s up to 15 s) or tap **+0.1 second** / **+1 second**, then play.
  Your points depend on the **longest** clip you've played that song:

  | Heard | 0.1 s | 0.5 s | 1 s | 3 s | 10 s | 30 s |
  |---|---|---|---|---|---|---|
  | Points | 10,000 | 7,388 | 6,417 | 5,093 | 4,006 | 3,500 |

- Each wrong guess costs 500. Guesses are **unlimited** by default, like Songless;
  the host can cap them (1, 3, 5 or 10) in Settings.
- **Time per song** defaults to **No time limit** (the round ends when everyone's done, or the host taps
  *End round now*) or 30 s to 3 min.
- The guess box only suggests songs in this game's pool, and hides ones you've already tried.
  Type an artist's name to see **all** of their songs in the game.
- After you guess (or give up), you hear 30 seconds of the song. It plays for everyone on the reveal screen too.
- Press **space** to play the clip on a laptop.

---

## Put it online (works with your laptop off)

Free hosting on Render, deployed from GitHub. One-time setup, about 10 minutes.

1. **GitHub:** sign up at github.com → **+** (top right) → **New repository** → name it `sliver`,
   **Public** → **Create repository** → click **uploading an existing file**.
   Open the `sliver` folder in Finder, press **Cmd+A**, drag everything into the page → **Commit changes**.
2. **Render:** sign up at render.com with **GitHub** → **New +** → **Web Service** → pick your `sliver` repo.
   Settings: Build command `npm install`, Start command `npm start`, Instance type **Free** → **Deploy**.
3. After a few minutes you get a permanent link like `https://sliver-xxxx.onrender.com`. Send that to friends.

Notes: if nobody has the page open for 15 minutes, the free server sleeps; the next visit takes about
a minute to wake it. Rooms reset when it sleeps or restarts. To update the game later, upload the
changed files to GitHub the same way; Render redeploys automatically.

### Email verification codes (optional, free, 5 minutes)
1. Sign up at **brevo.com** (free plan: 300 emails a day).
2. **Senders, domains & dedicated IPs → Senders → Add a sender**: your Gmail address. Click the link Brevo emails you.
3. **SMTP & API → API keys → Generate a new API key**, copy it.
4. In Render → **Environment**, add `BREVO_API_KEY` (the key) and `MAIL_FROM` (that Gmail address) →
   **Save, rebuild and deploy**. The log says "Email codes: on (brevo, from …)".

Codes sent from a Gmail address through Brevo sometimes land in spam; tell friends to check there.

### Admin page: live players and stats (optional, 1 minute)
In Render → **Environment**, add `ADMIN_KEY` with a long password of your choice → **Save, rebuild and deploy**.
Then open `https://your-site.onrender.com/admin.html` and enter that key. It shows players online right now,
open rooms, games and songs played today and all-time, sign-ups, the most players at once, the last 7 days
and the top ratings, refreshing every 10 seconds. From a terminal: `ADMIN_KEY=yourkey npm run admin`.
Without `ADMIN_KEY` the admin page is off.

### Keep accounts and leaderboards (free database, 5 minutes)
Render's free server forgets its files whenever it sleeps, so accounts need a database. Upstash is free:
1. Sign up at **upstash.com** → **Redis** → **Create database** → any name, pick the region closest to
   your Render server (Ohio = us-east-2, Oregon = us-west-2), **Free** plan → **Create**.
2. On the database page, scroll to **REST API** and copy **UPSTASH_REDIS_REST_URL** and
   **UPSTASH_REDIS_REST_TOKEN**.
3. In Render: your service → **Environment** → **Add environment variable** → add both, with those exact
   names and values → **Save, rebuild and deploy**.

The Render log then says "Accounts: saved in your Upstash database" and "Database check: connected ✓".
If it says "Database check FAILED", the message says what's wrong (usually the token was pasted with quotes
or the read-only token was used). Upstash archives a free database
after 30 days with no use (it emails first, and you can restore it). On your laptop no setup is needed:
accounts save to `data/sliver-db.json`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Port 3000 is already in use" | Sliver is already running in another window — use that one, or close it first. |
| Friends' phones can't open the link | They must be on the **same Wi-Fi** as your laptop (not cellular, not a guest network). Allow Node through the firewall (see step 2). School and hotel Wi-Fi often block device-to-device connections — use a phone hotspot instead. |
| No sound on iPhone | Flip off the silent switch; iPhones mute web audio in silent mode. |
| "Couldn't reach Spotify/Deezer/Anghami" | The laptop needs internet for playlists. Use `demo` to play offline. |
| An Anghami playlist adds fewer songs than it has | Anghami's public page may only list part of a long playlist. Open the same playlist on Spotify or Deezer and paste that link instead. |
| A Deezer playlist adds fewer songs than it has | Songs without a preview clip in your region are skipped. |
| "Make sure it's public" (Spotify) | In Spotify, open the playlist → ⋯ → make it public (or Add to profile). Private playlists, Blends and some Spotify-made mixes can't be read without logging in. |
| A Spotify song gets skipped during a game | Its audio is found on Deezer by title/artist; a few songs have no match. The game just picks another. |

Rooms live in memory: if you close the window, rooms reset. Refreshing the page in a browser is fine — you rejoin as the same player.

## For the curious

```
server/index.js     web server + game events
server/realtime.js  tiny WebSocket server (Node standard library only)
server/game.js      rooms, rounds, scoring, ranked games
server/accounts.js  accounts, ranked scores, leaderboards, stats
server/store.js     saves accounts (Upstash Redis online, a JSON file on a laptop)
server/spotifyweb.js  Spotify playlists past 100 songs + play counts (best effort)
server/spotify.js   reads public Spotify playlists (via Spotify's embed player page, no login)
server/deezer.js    reads Deezer playlists and artists, finds songs, fetches 30 s previews
server/itunes.js    Apple's catalogue: extra songs for Egyptian/Arabic artists, backup audio
server/anghami.js   reads public Anghami playlists
server/popularity.js  looks up how popular songs are (guess list order)
server/stats.js     counters for the admin page
public/themes.js    themes + "make your own" share codes
public/decor.js     holiday decorations
public/admin.html   admin page (needs ADMIN_KEY)
server/demo.js      synthesizes the offline demo songs
public/             the game page (HTML/CSS/JS, Web Audio for precise clip timing)
test/               tests:  npm test   (Node 22+)
```

Song clips are Deezer's, Spotify's or Apple's public 30-second previews, streamed through your laptop. Fine for playing
with friends; don't put this on the public internet.
