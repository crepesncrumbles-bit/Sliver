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
2. Add songs. Paste a **Spotify** or **Deezer** playlist or album link and click **Add**
   (in the app: ⋯ or Share → Copy link to playlist). Spotify playlists must be **public**.
   Each friend can add their own playlist too — they all go into one pool.
   Not online, or just want to try it? Type **`demo`** (or leave the box empty) and click **Add** for 12 built-in tunes.
3. Invite friends:
   - **Same Wi-Fi:** click **Copy invite link** and send it. It looks like
     `http://192.168.x.x:3000/?room=ABCD`. They open it on their phone or laptop.
   - **Testing alone:** open the link in a second browser window (or a private window) and play against yourself.
4. Pick rounds and seconds per round, then **Start game**.

### Adding songs
- Tap any pack (genres, decades, artists) to add it. Tap it again to remove it.
- Or paste a public Spotify/Deezer playlist link, or start typing an artist's name and pick them from the
  suggestions. Playlists can be longer than 100 songs (up to 2,000).
- Remove any single playlist with its **×**. The host can remove anything; others can remove what they added.

### Room controls
- **Leave room** (top left) takes you back to the home screen. Tap it twice to confirm.
- **End game** (top right, host only, during a game) stops the game and brings everyone back to the lobby.
  Songs and players stay; scores reset. Tap it twice to confirm.
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
- **Theme:** Cobalt, Sunset, Bubblegum, Jungle, Grape, GX Red, Midnight, Neon or Mono, plus holiday themes
  that only show up around their time of year: New Year, Valentine's, St. Patrick's, Fourth of July,
  Halloween, Thanksgiving and Christmas. When a holiday ends, its theme switches back to Cobalt.
- **Account:** log in, sign up, see your stats.

The host's lobby also has **Longest clip** (15, 20 or 30 s you can play while guessing) and
**Song after you guess** (15, 20 or 30 s). 30 s is the most there is: Spotify and Deezer previews are 30 s long.

### Game modes (host picks in the lobby)
Hard and Chaos can both be on at once for **1.875×** points. Tap Classic to turn them off.
- **Classic:** every clip starts at the top of the song, like Songless.
- **Hard (1.5× points):** each clip starts somewhere random in the song, and there's no list to pick from.
  You type the title yourself (small typos are fine).
- **Chaos (1.25× points):** every song gets a random twist: reversed, chipmunk, slow-mo, underwater, or a deep cut
  that starts mid-song. The 15-second listen afterwards is always the real song.

### Ranked play, leaderboards and stats
- Tap **Log in / Sign up** on the home screen. You need a username (doesn't have to be unique), an email
  (unique, never shown to anyone) and a password. Only ranked games need an account.
- In the lobby the host switches to **Ranked** and picks a genre or decade. Ranked games are always 5 songs
  from that genre, unlimited guesses, the full 30 s clip, no first-guess bonus. Hard and Chaos work as
  multipliers. Everyone in the room must be logged in.
- Each genre has its own **top 25** (your best ranked game there). Your **rating** works like osu! pp:
  each genre best is worth score ÷ 100, and they add up with each one after your best counting a bit less
  (×0.95, ×0.95², …). The trophy button opens the leaderboards; tap any name to see their stats
  (rating, rank, accuracy, first-try %, average time heard, best per genre, recent games).
- Ending a ranked game early saves nothing. Players who leave before the end aren't saved.
- There's no password reset (Sliver can't send email), so pick a password you'll remember.

### Scoring (same as Songless)
- Drag the slider (0.1 s up to the whole 30 s clip) or tap **+1s**, then play.
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
- After you guess (or give up), you hear 15 seconds of the song (the host can make it 20 or 30). It plays for everyone on the reveal screen too.
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

### Keep accounts and leaderboards (free database, 5 minutes)
Render's free server forgets its files whenever it sleeps, so accounts need a database. Upstash is free:
1. Sign up at **upstash.com** → **Redis** → **Create database** → any name, pick the region closest to
   your Render server (Ohio = us-east-2, Oregon = us-west-2), **Free** plan → **Create**.
2. On the database page, scroll to **REST API** and copy **UPSTASH_REDIS_REST_URL** and
   **UPSTASH_REDIS_REST_TOKEN**.
3. In Render: your service → **Environment** → **Add environment variable** → add both, with those exact
   names and values → **Save, rebuild and deploy**.

The Render log then says "Accounts: saved in your Upstash database". Upstash archives a free database
after 30 days with no use (it emails first, and you can restore it). On your laptop no setup is needed:
accounts save to `data/sliver-db.json`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Port 3000 is already in use" | Sliver is already running in another window — use that one, or close it first. |
| Friends' phones can't open the link | They must be on the **same Wi-Fi** as your laptop (not cellular, not a guest network). Allow Node through the firewall (see step 2). School and hotel Wi-Fi often block device-to-device connections — use a phone hotspot instead. |
| No sound on iPhone | Flip off the silent switch; iPhones mute web audio in silent mode. |
| "Couldn't reach Spotify/Deezer" | The laptop needs internet for playlists. Use `demo` to play offline. |
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
server/deezer.js    reads Deezer playlists, finds songs, fetches 30 s previews
server/demo.js      synthesizes the offline demo songs
public/             the game page (HTML/CSS/JS, Web Audio for precise clip timing)
test/               tests:  npm test   (Node 22+)
```

Song clips are Spotify's or Deezer's public 30-second previews, streamed through your laptop. Fine for playing
with friends; don't put this on the public internet.
