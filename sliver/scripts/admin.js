#!/usr/bin/env node
// Prints Sliver's live numbers and stats in the terminal.
//
//   ADMIN_KEY=yourkey node scripts/admin.js                 (your Render site)
//   ADMIN_KEY=yourkey node scripts/admin.js http://localhost:3000
//   npm run admin -- https://your-site.onrender.com
//
// Same numbers as the admin page (open /admin.html on your site in a browser).

const site = (process.argv[2] || process.env.SLIVER_URL || 'https://sliver-k7f5.onrender.com').replace(/\/+$/, '');
const key = process.env.ADMIN_KEY || process.argv[3];
if (!key) {
  console.error('Set your admin key first, e.g.  ADMIN_KEY=yourkey node scripts/admin.js');
  process.exit(1);
}

const n = (v) => (v === null || v === undefined ? '–' : Number(v).toLocaleString());
const pad = (s, w) => String(s).padEnd(w);
const rpad = (s, w) => String(s).padStart(w);

(async () => {
  let res;
  try {
    const r = await fetch(`${site}/api/admin/stats`, { headers: { 'x-admin-key': key } });
    res = await r.json();
  } catch (err) {
    console.error(`Couldn't reach ${site} (${err.message}). A sleeping Render site can take ~50 s to wake up; try again.`);
    process.exit(1);
  }
  if (!res.ok) { console.error(res.error); process.exit(1); }
  const L = res.live, T = res.total, D = res.days[0];
  console.log(`\nSliver · ${site} · ${new Date(res.now).toLocaleString()}\n`);
  console.log('RIGHT NOW');
  console.log(`  ${n(L.players)} players connected in ${n(L.activeRooms)} rooms · ${n(L.playing)} games being played (${n(L.rankedNow)} ranked) · ${n(L.onlineAccounts)} accounts online`);
  console.log('\nTODAY');
  console.log(`  ${n(D.games)} games (${n(D.ranked)} ranked) · ${n(D.songs)} songs · ${n(D.signups)} new accounts · peak ${n(D.peak)} players`);
  console.log('\nALL TIME');
  console.log(`  ${n(T.accounts)} accounts · ${n(T.rankedPlayers)} on the leaderboard · ${n(T.games)} games (${n(T.ranked)} ranked) · ${n(T.songs)} songs · peak ${n(T.peak)} players`);
  if (L.roomList.length) {
    console.log('\nOPEN ROOMS');
    console.log(`  ${pad('Room', 6)}${pad('Status', 10)}${rpad('Players', 8)}  ${pad('Host', 16)}${pad('Type', 22)}${rpad('Songs', 7)}`);
    for (const r of L.roomList) {
      console.log(`  ${pad(r.code, 6)}${pad(r.phase === 'round' ? `song ${r.round}` : r.phase, 10)}${rpad(r.players, 8)}  ${pad(r.host || '–', 16)}${pad(`${r.ranked ? 'Ranked' : 'Casual'} · ${r.mode}`, 22)}${rpad(n(r.songs), 7)}`);
    }
  }
  console.log('\nLAST 7 DAYS');
  console.log(`  ${pad('Day', 12)}${rpad('Games', 7)}${rpad('Songs', 8)}${rpad('Sign-ups', 10)}${rpad('Peak', 6)}`);
  for (const d of res.days) console.log(`  ${pad(d.date, 12)}${rpad(n(d.games), 7)}${rpad(n(d.songs), 8)}${rpad(n(d.signups), 10)}${rpad(n(d.peak), 6)}`);
  if (res.top.length) {
    console.log('\nTOP RATINGS');
    for (const t of res.top) console.log(`  ${rpad(t.rank, 3)}. ${pad(`${t.name}${t.tag ? ' #' + t.tag : ''}`, 26)}${rpad(n(t.rating), 8)}`);
  }
  const S = res.server;
  console.log(`\nSERVER  up ${S.uptimeMin} min · ${S.memoryMB} MB · accounts in ${S.database} · email codes ${S.emailCodes}\n`);
})();
