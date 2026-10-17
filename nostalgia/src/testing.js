/* NOSTALGIA — testing.js: switches for play-testing builds.
 *
 * N.testing.unlimitedMoney (default ON for now, at the owner's request) keeps Chinnu's pocket
 * money topped up so every shop, ride and minigame can be tried without grinding. Money is
 * stored in integer paise on N.player.money; this system simply refills it each frame, so it
 * works no matter which module spends it. Turn it off with N.testing.setUnlimitedMoney(false)
 * (remembered in localStorage) or flip DEFAULT_UNLIMITED_MONEY below for release builds.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;

  const DEFAULT_UNLIMITED_MONEY = true;   // release builds: set to false
  const LS_KEY = 'nostalgia.testing.unlimitedMoney';
  const FLOOR = 100000 * 100;             // refill whenever below ₹1,00,000 (paise)
  const TOP = 999999 * 100;               // refill to ₹9,99,999

  const lsGet = () => { try { return window.localStorage.getItem(LS_KEY); } catch (e) { return null; } };
  const lsSet = (v) => { try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* storage off: fine */ } };

  const stored = lsGet();
  const T = (N.testing = {
    unlimitedMoney: stored == null ? DEFAULT_UNLIMITED_MONEY : stored === '1',
    setUnlimitedMoney(on) {
      T.unlimitedMoney = !!on;
      lsSet(on ? '1' : '0');
      if (N.hud && N.hud.toast) N.hud.toast(on ? 'Testing: unlimited ₹ ON' : 'Testing: unlimited ₹ OFF', 2200);
    },
  });

  let announced = false;
  N.on('game:new', () => { announced = false; });
  N.on('game:continue', () => { announced = false; });

  N.addSystem({
    id: 'testing', order: 21, runIn: ['*'],
    update() {
      const p = N.player;
      if (!T.unlimitedMoney || !p || !isFinite(p.money)) return;
      if (p.money < FLOOR) p.money = TOP;
      if (!announced && N.state && N.state.is && N.state.is('play') && N.hud && N.hud.toast) {
        announced = true;
        N.hud.toast('Testing build: unlimited pocket money', 3000);
      }
    },
  });

  if (N.debug) N.debug.unlimitedMoney = (on) => T.setUnlimitedMoney(on !== false);
})();
