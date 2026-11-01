// Speedrun mode: everyone plays the same songs at their own pace.
const assert = require('assert');
let pass = 0, fail = 0;
const check = (ok, name) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const { RoomManager } = require('../server/game');
const events = [];
const io = { to: (to) => ({ emit: (e, d) => events.push({ to, e, d }) }) };

(async () => {
  console.log('speedrun');
  const room = new RoomManager(io).create();
  const a = room.addPlayer('Ash', { id: 's1' });
  const b = room.addPlayer('Bo', { id: 's2' });
  room.sources.push({ key: 'demo', name: 'Demo', tracks: Array.from({ length: 6 }, (_, i) => ({ source: 'demo', sourceId: String(i), title: `Song ${i}`, artist: 'Band' })) });
  room.rebuildPool();
  room.updateSettings({ rounds: 3, speedrun: true });
  await room.start();
  await new Promise((r) => setTimeout(r, 50));
  check(room.phase === 'round' && room.game.speedrun, 'game starts in speedrun');
  const sa = room.publicState(a.id), sb = room.publicState(b.id);
  check(sa.round.num === 1 && sb.round.num === 1 && sa.round.clipUrl === sb.round.clipUrl, 'both start on song 1');
  check(!!room.clipFor(sa.round.clipUrl.split('/').pop()), 'clip served for a speedrun song');
  const ans = (pid) => room.roundOf(pid).track.poolId;
  const r1 = room.guess(a.id, ans(a.id));
  check(r1.correct && r1.bonus > 0, 'Ash gets song 1 first (bonus)');
  check(room.publicState(a.id).round.answer.title === room.roundOf(a.id).track.title, 'Ash sees the answer right away');
  await assert.rejects(room.srNext(b.id), /Finish this song first/);
  check(true, "Bo can't skip ahead without finishing");
  await room.srNext(a.id);
  const sa2 = room.publicState(a.id), sb2 = room.publicState(b.id);
  check(sa2.round.num === 2 && sb2.round.num === 1 && sa2.round.my.status === 'playing', 'Ash moves to song 2 while Bo is still on song 1');
  check(sa2.players.find((p) => p.id === a.id).progress === 1, 'progress shown to others');
  const rb = room.guess(b.id, ans(b.id));
  check(rb.correct && !rb.bonus, 'Bo gets song 1 second (no bonus)');
  // Ash finishes everything
  room.giveUp(a.id); await room.srNext(a.id);
  room.guess(a.id, ans(a.id)); await room.srNext(a.id);
  check(room.publicState(a.id).speedrun.done && room.phase === 'round', 'Ash done, waits for Bo');
  // Bo finishes
  await room.srNext(b.id); room.giveUp(b.id); await room.srNext(b.id); room.giveUp(b.id); await room.srNext(b.id);
  check(room.phase === 'results', 'results when everyone is done');
  check(room.lastGame.speedrun && room.lastGame.songs.length === 3, 'results list the 3 songs');
  check(a.score > b.score, 'scores add up');

  console.log('host ends a speedrun');
  room.updateSettings({ speedrun: true });
  await room.start(); await new Promise((r) => setTimeout(r, 30));
  room.endRound();
  check(room.phase === 'results', '"End this song now" ends the speedrun for everyone');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
