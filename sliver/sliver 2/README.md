# Sliver — guess the song from a sliver of it

A Songless-style party game you run on your own laptop. Everyone hears the same tiny clip
from a random spot in a song, drags a slider to hear more (0.1 s up to 15 s), and guesses.
The less you needed, the more points you get.

No accounts, no installs besides Node.js, nothing to deploy.

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
- Or paste a public Spotify/Deezer playlist link, or type an artist's name, and click **Add**.
- Remove any single playlist with its **×**. The host can remove anything; others can remove what they added.

### Game modes (host picks in the lobby)
- **Classic:** every clip starts at the top of the song, like Songless.
- **Hard (1.5× points):** each clip starts somewhere random in the song, and there's no list to pick from.
  You type the title yourself (small typos are fine).
- **Chaos (1.25× points):** every song gets a random twist: reversed, chipmunk, slow-mo, underwater, or a deep cut
  that starts mid-song. The 15-second listen afterwards is always the real song.

### Scoring (same as Songless)
- Drag the slider (0.1 s up to the whole 30 s clip) or tap **+1s**, then play.
  Your points depend on the **longest** clip you've played that song:

  | Heard | 0.1 s | 0.5 s | 1 s | 3 s | 10 s | 30 s |
  |---|---|---|---|---|---|---|
  | Points | 10,000 | 7,388 | 6,417 | 5,093 | 4,006 | 3,500 |

- Each wrong guess costs 500. Guesses are **unlimited** by default, like Songless;
  the host can cap them (1, 3, 5 or 10) in Settings.
- **Time per song** can be **No time limit** (the round ends when everyone's done, or the host taps
  *End round now*) or 30 s to 3 min.
- The guess box only suggests songs in this game's pool, and hides ones you've already tried.
  Type an artist's name to see **all** of their songs in the game.
- After you guess (or give up), you hear 15 seconds of the song. It plays for everyone on the reveal screen too.
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
server/game.js      rooms, rounds, scoring
server/spotify.js   reads public Spotify playlists (via Spotify's embed player page, no login)
server/deezer.js    reads Deezer playlists, finds songs, fetches 30 s previews
server/demo.js      synthesizes the offline demo songs
public/             the game page (HTML/CSS/JS, Web Audio for precise clip timing)
test/               tests:  npm test   (Node 22+)
```

Song clips are Spotify's or Deezer's public 30-second previews, streamed through your laptop. Fine for playing
with friends; don't put this on the public internet.
