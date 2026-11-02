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
  room.updateSettings({ rounds: 3 }); a.wantSr = b.wantSr = true;
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
  check(rb.correct && rb.bonus === 400 && rb.place === 2, 'Bo gets song 1 second (+400)');
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
  await room.start(); await new Promise((r) => setTimeout(r, 30));
  room.endRound();
  check(room.phase === 'results', '"End this song now" ends the speedrun for everyone');

  console.log('speedrun just for one player');
  {
    b.wantSr = false;
    await room.start(); await new Promise((r) => setTimeout(r, 50));
    check(room.game.mixed && room.isSr(a) && !room.isSr(b), 'only Ash is speedrunning');
    const ansOf = (pid) => room.roundOf(pid).track.poolId;
    // Ash races through all 3 songs while Bo is on song 1
    for (let i = 0; i < 3; i++) { room.guess(a.id, ansOf(a.id)); await room.srNext(a.id); }
    check(room.publicState(a.id).speedrun.done && room.phase === 'round' && room.round.num === 1, 'Ash done, Bo still on song 1');
    check(room.publicState(b.id).round.num === 1 && !room.publicState(b.id).speedrun, 'Bo plays normally');
    // Bo plays the same songs with normal reveals
    for (let i = 0; i < 3; i++) {
      check(room.round.track.title === room.game.srLoaded[i].track.title, `Bo gets the same song ${i + 1}`);
      room.giveUp(b.id);
      check(room.phase === 'reveal', `reveal after song ${i + 1}`);
      await room.nextRound();
    }
    check(room.phase === 'results', 'results once both are done');
    check(a.score > 0 && b.score === 0, 'scores kept for both');
    check(room.lastGame && room.casualEntries ? true : false, 'game wrapped up');
  }
  {
    // Bo (normal) finishes first, waits for the speedrunner
    await room.start(); await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 3; i++) { room.giveUp(b.id); await room.nextRound(); }
    check(room.phase === 'round' && room.publicState(b.id).speedrun.done, 'Bo waits for the speedrunner');
    for (let i = 0; i < 3; i++) { room.giveUp(a.id); await room.srNext(a.id); }
    check(room.phase === 'results', 'results when the speedrunner finishes');
  }

  console.log('no repeats within a room');
  {
    const r2 = new RoomManager(io).create();
    r2.addPlayer('Solo', { id: 's9' });
    r2.sources.push({ key: 'demo', name: 'Demo', tracks: Array.from({ length: 6 }, (_, i) => ({ source: 'demo', sourceId: String(i), title: `Tune ${i}`, artist: 'Band' })) });
    r2.rebuildPool();
    r2.updateSettings({ rounds: 3 });
    const seen = [];
    for (let g = 0; g < 2; g++) {
      await r2.start();
      for (let k = 0; k < 3; k++) { seen.push(r2.round.track.title); r2.endRound(); await r2.nextRound(); }
    }
    check(new Set(seen).size === 6, `6 songs over two 3-song games, no repeats (${seen.join(', ')})`);
    await r2.start();
    check(r2.round && r2.round.track, 'once all are played, it starts over instead of getting stuck');
    r2.clearTimers();
  }

  console.log('admins see hidden accounts in rooms');
  {
    const r3 = new RoomManager(io).create();
    const shy = r3.addPlayer('Shy', { id: 'h1' }), boss = r3.addPlayer('Boss', { id: 'h2' }), pal = r3.addPlayer('Pal', { id: 'h3' });
    r3.setAccount(shy.id, { id: 'u-shy', hidden: true });
    r3.setAccount(boss.id, { id: 'u-boss', admin: true });
    r3.setAccount(pal.id, { id: 'u-pal' });
    const seenBy = (pid) => r3.publicState(pid).players.find((x) => x.id === shy.id);
    check(seenBy(pal.id).userId === null && !seenBy(pal.id).hiddenAcct, 'a normal player can\'t see the hidden account');
    check(seenBy(boss.id).userId === 'u-shy' && seenBy(boss.id).hiddenAcct, 'an admin sees it (marked hidden)');
  }

  console.log('Arabic packs: only the listed artists');
  {
    const realFetch = global.fetch;
    const artistsDb = {
      'amr diab': [{ id: 1, name: 'Amr Diab', nb_fan: 5e6 }, { id: 9, name: 'Amr Diab Tribute Band', nb_fan: 9e6 }],
      'ruby': [{ id: 7, name: 'Ruby Rose', nb_fan: 3e6 }, { id: 2, name: 'Ruby', nb_fan: 4e5 }],
      'hakim': [{ id: 8, name: 'Hakim Ziyech FC', nb_fan: 1e6 }],
    };
    global.fetch = async (url) => {
      url = String(url);
      const j = (o) => ({ ok: true, status: 200, json: async () => o });
      const q = decodeURIComponent((url.match(/search\/artist\?q=([^&]+)/) || [])[1] || '').toLowerCase();
      if (url.includes('/search/artist')) return j({ data: artistsDb[q] || [] });
      const m = url.match(/artist\/(\d+)\/top/);
      if (m) { const id = Number(m[1]); return j({ data: Array.from({ length: 8 }, (_, i) => ({ id: id * 100 + i, title: `Song ${id}-${i}`, preview: 'p', readable: true, rank: 900000 - i * 1000, artist: { id, name: id === 1 ? 'Amr Diab' : id === 2 ? 'Ruby' : 'Other' } })) }); }
      throw new Error('unexpected ' + url);
    };
    const { loadRoster } = require('../server/deezer');
    const pk = await loadRoster(['Amr Diab', 'Ruby', 'Hakim'], 'Egyptian Pop', { perArtist: 8 });
    const who = new Set(pk.tracks.map((t) => t.artist));
    check(who.has('Amr Diab') && who.has('Ruby') && who.size === 2, `only real roster artists (${[...who].join(', ')})`);
    check(!pk.artists.includes('Ruby Rose') && !pk.artists.includes('Amr Diab Tribute Band') && !pk.artists.some((a) => /Ziyech/.test(a)), 'namesakes and tribute acts are skipped');
    const packs = require('../server/packs');
    check(['arabic-hits', 'khaleeji', 'egyptian', 'egyptian-classics', 'arabic-classics', 'arabic-rap', 'maghreb', 'turkish'].every((id) => (packs.byId.get(id).roster || []).length >= 12), 'every Arabic & Middle East pack is a hand-picked artist list');
    global.fetch = realFetch;
  }

  console.log('admin: list of every account');
  {
    const { Accounts } = require('../server/accounts');
    const { MiniRedis } = require('../server/store');
    const st = new MiniRedis(); const acc = new Accounts(st, null, { adminEmails: 'boss@x.co' });
    for (const [n, e] of [['Boss', 'boss@x.co'], ['Zed', 'zed@x.co'], ['Amy', 'amy@x.co']]) await acc.signup({ name: n, email: e, password: 'secret1' });
    const list = await acc.listUsers();
    check(list.length === 3 && list.every((u) => u.id && u.tag && u.email) && list.some((u) => u.name === 'Zed'), `lists every account with name, #tag and email (${list.map((u) => u.name).join(', ')})`);
  }

  console.log('referrals: 5 friends sign up and play -> Campfire Crew');
  {
    const { Accounts } = require('../server/accounts');
    const { MiniRedis } = require('../server/store');
    const SHOP = require('../public/shop');
    const st = new MiniRedis(); const acc = new Accounts(st, null, {});
    const host = (await acc.signup({ name: 'Host', email: 'host@x.co', password: 'secret1' })).user;
    const code = await acc.friendCode(host.id);
    check(!SHOP.ids.includes('campfire') && SHOP.allIds.includes('campfire'), 'Campfire Crew exists but is not for sale');
    const friends = [];
    for (let i = 0; i < 5; i++) friends.push((await acc.signup({ name: 'F' + i, email: `f${i}@x.co`, password: 'secret1', ref: code.toLowerCase() })).user);
    await acc.signup({ name: 'Self', email: 'self@x.co', password: 'secret1', ref: 'BADBAD' });
    let info = await acc.referralInfo(host.id);
    check(info.joined === 5 && info.played === 0 && !info.unlocked && info.code === code, 'sign-ups through the link are counted');
    let last = null;
    for (let i = 0; i < 4; i++) last = await acc.creditReferral(friends[i].id);
    check(last.played === 4 && !last.unlocked, 'each first game counts (4/5)');
    check((await acc.creditReferral(friends[0].id)) === null, 'a second game by the same friend doesn\'t count again');
    last = await acc.creditReferral(friends[4].id);
    info = await acc.referralInfo(host.id);
    check(last.unlocked && info.unlocked && (await acc.ownedThemes(host.id)).includes('campfire'), 'the 5th friend\'s game unlocks Campfire Crew');
    for (let i = 0; i < 30; i++) await acc.grantTheme(host.id, 'random');
    check((await acc.ownedThemes(host.id)).length === SHOP.allIds.length, 'random coffee gifts never hand out the referral theme (only the paid ones)');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
