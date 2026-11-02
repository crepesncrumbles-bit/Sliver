// Placement bonus (500/400/300/200/100), party mode (host's screen plays, 70% votes), theme try-on counter.
let pass = 0, fail = 0;
const check = (ok, name) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const { RoomManager, pointsForLength, PARTY_STAGES } = require('../server/game');
const { MiniRedis } = require('../server/store');
const { Accounts } = require('../server/accounts');
const events = [];
const io = { to: (to) => ({ emit: (e, d) => events.push({ to, e, d }) }) };
const tracks = (n) => Array.from({ length: n }, (_, i) => ({ source: 'demo', sourceId: String(i % 4), title: `Song ${i}`, artist: 'Band' }));
const sock = (i) => ({ id: 'sock' + i });

function roomWith(names) {
  const room = new RoomManager(io).create();
  const ps = names.map((n, i) => room.addPlayer(n, sock(i)));
  room.sources.push({ key: 'demo', name: 'Demo', tracks: tracks(8) });
  room.rebuildPool();
  return { room, ps };
}
const tryErr = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

(async () => {
  console.log('placement bonus');
  {
    const { room, ps } = roomWith(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    room.updateSettings({ rounds: 3 });
    await room.start();
    const ans = room.round.track.poolId;
    const got = ps.map((p) => { room.reportListen(p.id, 1); return room.guess(p.id, ans); });
    const bonuses = got.map((r) => r.bonus);
    check(JSON.stringify(bonuses) === JSON.stringify([500, 400, 300, 200, 100, 0, 0]), `bonuses by order: ${bonuses.join(', ')}`);
    check(got[2].points === pointsForLength(1) + 300 && got[2].place === 3, '3rd gets heard points + 300');
    check(got[6].points === pointsForLength(1) && got[6].place === 7, 'after 5th: no bonus');
    const pops = events.filter((x) => x.e === 'gotIt').slice(-7);
    check(pops[0].d.first && pops[1].d.place === 2 && !pops[1].d.first, 'pop-ups carry the place');
    const rev = room.reveal.results;
    check(rev.find((x) => x.id === ps[1].id).place === 2 && rev.find((x) => x.id === ps[1].id).bonus === 400, 'reveal shows places');
  }
  {
    const { room, ps } = roomWith(['A', 'B']);
    room.updateSettings({ ranked: true });
    check(room.settings.ranked && !room.settings.party, 'ranked turns party off');
    room.updateSettings({ party: true });
    check(!room.settings.ranked && room.settings.party, 'party turns ranked off');
    room.updateSettings({ ranked: false, party: false });
    check(!room.settings.ranked && !room.settings.party, 'back to casual');
    void ps;
  }

  console.log('party mode');
  {
    const { room } = roomWith(['Host']);
    room.updateSettings({ party: true, rounds: 3 });
    check(/needs friends/.test(await room.start().then(() => '', (e) => e.message)), 'party needs at least one other player');
  }
  {
    const { room, ps } = roomWith(['Host', 'A', 'B', 'C']);
    const [h, a, b, c] = ps;
    a.wantSr = true; // speedrun is off in party
    room.updateSettings({ party: true, rounds: 3 });
    await room.start();
    check(room.phase === 'round' && room.game.party && !room.game.mixed && !room.game.speedrun, 'party game starts together (no speedrun)');
    const sh = room.publicState(h.id), sa = room.publicState(a.id);
    check(sh.round.party.presenter && !sa.round.party.presenter, 'the host is the screen, the others guess');
    check(sh.round.party.len === PARTY_STAGES[0] && sa.round.party.stage === 0, `clip starts at ${PARTY_STAGES[0]}s`);
    check(sa.round.party.voters === 3 && sa.round.party.need === 3, '3 guessing: 70% means all 3');
    check(/screen doesn't vote/.test(tryErr(() => room.vote(h.id, 'more'))), 'the screen can\'t vote');
    check(/No song is playing/.test(tryErr(() => room.guess(h.id, room.round.track.poolId))), 'the screen can\'t guess');
    room.vote(a.id, 'more'); room.vote(b.id, 'more');
    check(room.round.stage === 0 && room.publicState(a.id).round.party.more === 2, '2 of 3 isn\'t enough');
    room.vote(b.id, 'more'); // tap again = take it back
    check(room.publicState(a.id).round.party.more === 1, 'tapping again takes the vote back');
    room.vote(b.id, 'more'); room.vote(c.id, 'more');
    check(room.round.stage === 1 && room.publicState(a.id).round.party.len === PARTY_STAGES[1], 'all 3 want more: the clip grows');
    check(room.publicState(a.id).round.party.more === 0, '"more" votes start over at each step');
    // A gets it: heard = the room's clip, and the players still guessing shrink to 2 (70% → 2)
    const ra = room.guess(a.id, room.round.track.poolId);
    check(ra.correct && ra.points === pointsForLength(PARTY_STAGES[1]) + 500, 'points for the room\'s clip length, +500 for first');
    const sb = room.publicState(b.id).round.party;
    check(sb.voters === 2 && sb.need === 2, 'solved players don\'t vote any more');
    check(/done with this song/.test(tryErr(() => room.vote(a.id, 'more'))), 'A can\'t vote after getting it');
    room.vote(b.id, 'skip');
    check(room.phase === 'round', '1 of 2 to give up: keep going');
    room.giveUp(c.id); // in party, giving up is a vote
    check(room.phase === 'reveal', 'both left vote to give up: the song ends');
    const rev = room.reveal.results;
    check(!rev.some((x) => x.id === h.id) && rev.length === 3, 'the screen isn\'t in the results');
    check(rev.find((x) => x.id === b.id).status === 'gave-up', 'the others gave up');
    check(!room.game.history[0].results.has(h.id), 'the screen isn\'t in the game history');
    // host plays more right away; full clip can't grow
    await room.nextRound();
    for (let i = 1; i < PARTY_STAGES.length; i++) room.nextStage();
    check(room.round.stage === PARTY_STAGES.length - 1, 'host can step the clip up to the full 15 s');
    check(/whole clip/.test(tryErr(() => room.nextStage())) && /whole clip/.test(tryErr(() => room.vote(a.id, 'more'))), 'no more steps after the full clip');
    // someone leaving can tip a vote over
    room.vote(a.id, 'skip'); room.vote(b.id, 'skip');
    check(room.phase === 'round', '2 of 3 to give up: not yet');
    room.leave(c.id);
    check(room.phase === 'reveal', 'C leaves: 2 of 2 agree, the song ends');
    await room.nextRound();
    const ans = room.round.track.poolId;
    room.guess(a.id, ans); room.guess(b.id, ans);
    check(room.phase === 'reveal', 'everyone got it: the song ends (the screen doesn\'t count)');
    await room.nextRound();
    check(room.phase === 'results' && room.lastGame.party && room.lastGame.watchers.includes(h.id) && !room.lastGame.watchers.includes(a.id), 'results: the screen is left off the podium');
    check(room.publicState(a.id).players.find((p) => p.id === h.id).presenter === false, 'not the screen any more after the game');
  }

  console.log('theme try-on counter');
  {
    const acc = new Accounts(new MiniRedis(), null);
    const u = (await acc.signup({ name: 'Try', email: 'try@x.co', password: 'secret1' })).user;
    check(u.promo && u.promo.games === 0 && u.promo.shown === 0, 'new accounts start at 0 games, 0 try-ons');
    let r = await acc.updateSettings(u.id, { promo: { games: 1, shown: 1 } });
    check(r.user.promo.games === 1 && r.user.promo.shown === 1, 'saved to the account');
    r = await acc.updateSettings(u.id, { promo: { games: 0, shown: 0 } });
    check(r.user.promo.games === 1 && r.user.promo.shown === 1, 'never goes down (another device can\'t reset it)');
    r = await acc.updateSettings(u.id, { promo: { games: 'x', shown: -5 } });
    check(r.user.promo.games === 1 && r.user.promo.shown === 1, 'junk is ignored');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
