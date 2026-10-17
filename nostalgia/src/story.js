/* NOSTALGIA — story.js
 * DEMO — replaced by the story agent.
 * One short mission that exercises every mission-runner API (goto, talk, choice, spawn a
 * vehicle, until, checkpoint, timer race on a cycle, minigame + cutscene passthrough, give,
 * money, flag, wait) so tests/core_systems.cjs can drive the runner end to end.
 * The real chapters (story bible in design/) replace this whole file.
 */
(() => {
  'use strict';
  const N = window.N;

  // DEMO — replaced by the story agent
  const DEMO_ID = 'demo_chai_run';

  function defineSpeakers() {
    N.dialogue.define('saleem', {
      name: 'Saleem bhai', color: '#2a8c82', voice: 0.9,
      look: { skin: '#9a6040', hair: '#1a1412', hairStyle: 'oiled', moustache: 'thick', cap: 'skull', shirt: '#efe9dc', bg: '#1e3a36' },
    });
    N.dialogue.define('cafe', {
      name: 'Café uncle', color: '#f2c230', voice: 0.8,
      look: { skin: '#d29a6a', hair: '#e8e4dc', hairStyle: 'bald', moustache: 'thick', specs: 'round', cap: 'topi', shirt: '#efe9dc', age: 'old', bg: '#3a2a1a' },
    });
  }

  function register() {
    N.missions.register({
      id: DEMO_ID,
      chapter: 'Demo',
      title: 'Chai Before Sunset',
      giver: { place: 'giver_himayatnagar', r: 16 },
      reward: { money: 500 },
      passText: 'Respect + Osmania biscuits',
      script: async (m) => {
        // 1) walk to the cycle stand
        await m.goto('cycle_rent_5', { label: 'Saleem bhai rents cycles at the stand. Go see him.', r: 26, onFoot: true });
        await m.talk([
          { s: 'saleem', t: 'Arre, *pilla*! Your Ammamma wants her *Irani chai*, and the café closes its kettle at sunset.', mood: 'happy' },
          { s: 'you', t: 'I need wheels, Saleem bhai. Fast ones.' },
        ]);
        const pick = await m.choice('saleem', 'Hero cycle, two rupees an hour. *Lena*?', ['Haan, *pakka*! (₹ 2.00)', 'Nakko, I will run there.']);
        if (pick === 0) { m.money(-200); await m.say('saleem', 'Ekdum mast choice. Bring it back without a scratch!', { mood: 'happy' }); }
        else await m.say('saleem', 'Running? In this heat? *Baigan*! Take it — first hour free.', { mood: 'surprised' });
        // 2) the cycle appears beside the stand
        const stand = N.places.cycle_rent_5;
        const f = N.world.findFree(stand.x + 14, stand.y + 18, 'drive', 16) || stand;
        const cycle = m.vehicle('cycle', f.x, f.y, 0, { color: '#2f6a3a' });
        m.objective('Get on the cycle.');
        const b = m.blip(cycle, { color: '#6fbf5a', icon: 'dot', pulse: true });
        await m.until(() => N.player.vehicle === cycle);
        m.unblip(b);
        // 3) timed race to the café (retry resumes here, on a cycle)
        m.checkpoint('race');
        m.timer(45, 'CHAI RUN');
        await m.goto('irani_cafe_3', { label: 'Race to the Irani café before the chai goes cold!', r: 26, inVehicle: true });
        m.timer(null);
        // 4) passthroughs (the real minigame / cutscene modules plug in here)
        const game = await m.minigame('chai_pour', { cups: 2 });
        await m.cutscene([{ type: 'card', title: 'Sunset, Basheerbagh', text: 'Two cups of chai. One plate Osmania.' }]);
        await m.say('cafe', game && game.win !== false ? 'Do pauna, ekdum garam! Your Ammamma will be proud.' : 'Spilled half? Never mind, *kanna*. Take it.', { mood: 'happy' });
        m.give('osmania_biscuits', { name: 'Osmania biscuits' });
        m.money(300);
        m.flag('demo_chai_done');
        await m.wait(0.3);
      },
    });
  }

  N.story = {
    chapter: 0,
    demo: true,
    DEMO_ID,
    begin() {},
  };

  N.on('game:new', (opts) => {
    if (opts && opts.skipIntro) return;
    // DEMO intro: point the player at the glowing marker
    setTimeout(() => {
      if (N.state.mode !== 'play' || (N.missions && N.missions.active)) return;
      N.hud.toast('Thursday, 14 January 1999 — Sankranti holidays! Walk into the glowing marker to begin.', 6000);
    }, 1200);
  });

  N.addSystem({
    id: 'story', order: 11, runIn: ['play'],
    init() { defineSpeakers(); register(); },
  });
})();
