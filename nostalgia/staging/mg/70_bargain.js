
  /* ================================================================ BARGAIN */
  // Mol-bhaav. Haggle the auto driver (or the banana / flower vendor) down to a fair price before
  // his patience (SABR) runs out. Pick a line (each person likes different kinds of talk: read his
  // first line for a hint), then deliver it with confidence: press when the needle is in the green.
  {
    const CATS = {
      logic: { name: 'LOGIC', col: '#3b6fc4', frac: 0.25, pat: -7 },
      charm: { name: 'PYAAR', col: '#e8487c', frac: 0.22, pat: 2 },
      local: { name: 'APNAPAN', col: '#2a8c82', frac: 0.25, pat: 3 },
      filmy: { name: 'FILMY', col: '#7a3db8', frac: 0.27, pat: -2 },
      walk: { name: 'JAATA HOON', col: '#5a5560', frac: 0, pat: 0 },
      offer: { name: 'OFFER', col: '#2f8a3a', frac: 0, pat: 0 },
    };
    const WHO = {
      auto: {
        title: 'Auto Mol-Bhaav', what: 'Koti to Charminar', start: [38, 45], target: 20, floor: [16, 19], unit: '',
        types: {
          grumpy: { intro: 'Charminar? ₹{P}. Meter kharab hai. Baitho ya jao.', m: { logic: 1.35, charm: 0.55, local: 0.9, filmy: 0.4, walk: 1.2 } },
          filmy: { intro: 'Arre hero! Charminar? ₹{P} mein seedha, gaana bhi bajega!', m: { logic: 0.6, charm: 1.0, local: 0.9, filmy: 1.6, walk: 0.8 } },
          chatty: { intro: 'Kahan jaana, baba? Charminar? Arre, ₹{P}, bas! Apne log ho.', m: { logic: 0.8, charm: 1.3, local: 1.6, filmy: 1.0, walk: 0.7 } },
        },
        lines: {
          logic: ['Meter pe chalo na, anna.', 'Bus mein toh teen rupaye lagte!', 'Itna door bhi nahi hai, anna!', 'Kal ₹20 mein gaya tha.'],
          charm: ['Anna, aap toh apne hi ho!', 'Aap ka auto ekdum mast hai!', 'Thoda kam karo na, please!'],
          local: ['Mere mamu bhi Koti mein auto chalate!', 'Aap Sultan Bazaar wale ho na?', 'Hum roz isi stand se jaate.'],
          filmy: ['Anna, hero log seedha deal karte!', 'Picture ka time hai, jaldi aur sasta!'],
          walk: ['Chodo, doosra auto le lunga.', 'Rehne do, main bus se jaata.'],
          offer: ['₹{T} final, anna?'],
        },
        good: ['Accha... ₹{P} de dena.', 'Theek hai, theek hai. ₹{P}.', 'Hmm. Chalo, ₹{P}.'],
        meh: ['Petrol kitna mehenga hai, maloom? ₹{P}.', '₹{P}. Isse kam nahi.'],
        bad: ['Kya bolra baba? ₹{P} hi lagenge.', 'Time waste mat karo!'],
        walkWin: 'Arre ruko ruko! Chalo, ₹{P}!', walkLose: 'Jao jao! Bahut auto hai.',
        deal: 'Chalo, baitho! ₹{P}, meter nakko.', leave: 'Chal hatt! Mera time kharab kiya.',
        offerNo: 'Nahi baba, ₹{P} final. Petrol bhi dekho.',
      },
      banana: {
        title: 'Kele ka Mol-Bhaav', what: 'one dozen bananas', catNames: { filmy: 'EXTRA' }, start: [15, 18], target: 10, floor: [7, 9], unit: '/dozen',
        types: {
          busy: { intro: 'Chakkarkeli! Ekdum meethe! ₹{P} darjan. Lena hai toh lo, jaldi.', m: { logic: 1.35, charm: 0.6, local: 1.0, filmy: 0.5, walk: 1.3 } },
          soft: { intro: 'Aao beta, ekdum taaze kele! ₹{P} darjan, Amma ke liye?', m: { logic: 0.75, charm: 1.4, local: 1.5, filmy: 0.9, walk: 0.6 } },
        },
        lines: {
          logic: ['Rythu Bazaar mein ₹10 hai!', 'Ye toh chhote chhote hain!', 'Do darjan lunga, kam karo.'],
          charm: ['Amma bolti aap ke kele best hain!', 'Aap ke kele sabse meethe!'],
          local: ['Hum roz aap se hi lete hain.', 'Main woh peeli building wala!'],
          filmy: ['Ek kela phokat dedo na!'],
          walk: ['Chalo, aage wale se lete.', 'Rehne do, kal lunga.'],
          offer: ['₹{T} mein do na?'],
        },
        good: ['Accha, ₹{P} de do.', 'Chalo, aap ke liye ₹{P}.'],
        meh: ['Mandi mein bhi mehenga hai, beta. ₹{P}.'],
        bad: ['Nahi hoga, ₹{P}.', 'Bhaav mat karo, beta!'],
        walkWin: 'Arre ruko! ₹{P}, le jao!', walkLose: 'Jao, aage wala bhi itna hi lega.',
        deal: 'Lo, ₹{P}. Ek extra bhi daal diya!', leave: 'Agla customer! Chalo, hato.',
        offerNo: 'Nahi beta, ₹{P} se kam nahi.',
      },
      flower: {
        title: 'Phoolon ka Mol-Bhaav', what: 'a jasmine and marigold garland', catNames: { filmy: 'EXTRA' }, start: [20, 24], target: 12, floor: [9, 11], unit: '',
        types: {
          strict: { intro: 'Mallepoolu, genda! Thursday hai, haar ₹{P}. Bheed hai, jaldi bolo.', m: { logic: 1.3, charm: 0.7, local: 1.0, filmy: 0.4, walk: 1.2 } },
          kind: { intro: 'Aao beta, taaze phool! Haar ₹{P}. Ammamma ke liye?', m: { logic: 0.8, charm: 1.3, local: 1.6, filmy: 0.8, walk: 0.6 } },
        },
        lines: {
          logic: ['Kal toh ₹12 tha!', 'Aadhe phool toh band hain!', 'Andar bhi milta hai.'],
          charm: ['Aap ke phool sabse fresh hain!', 'Kitna sundar haar banaya!'],
          local: ['Ammamma ke liye hai, har Thursday aate.', 'Hum isi gali mein rehte.'],
          filmy: ['Ek gulab bhi daal do na!'],
          walk: ['Rehne do, doosri jagah lete.', 'Kal le lunga.'],
          offer: ['₹{T} chalega?'],
        },
        good: ['Accha, ₹{P} de do.', 'Chalo, Ammamma ke liye ₹{P}.'],
        meh: ['Phool mehenge hain aaj. ₹{P}.'],
        bad: ['₹{P} se kam nahi.', 'Mol-bhaav nahi, beta.'],
        walkWin: 'Ruko! ₹{P}, le lo.', walkLose: 'Theek hai, jao.',
        deal: 'Lo beta, ₹{P}. Ammamma ko pranaam bolna.', leave: 'Agla! Bheed hai, beta.',
        offerNo: 'Nahi beta, ₹{P}. Itna toh lagega.',
      },
    };

    const def = {
      id: 'bargain',
      title: 'Mol-Bhaav',
      sub: 'Never pay the first price. Every 90s kid learnt this from Amma.',
      osd: 'HAGGLE',
      place: 'koti_bus_stand', places: ['koti_bus_stand', 'banana_cart_', 'flower_cart_', 'rtc_x_roads', 'dilsukhnagar_sai_temple'],
      secs: 50,
      goLabel: 'BOLO!',
      keys: { Digit1: 'c1', Digit2: 'c2', Digit3: 'c3', Numpad1: 'c1', Numpad2: 'c2', Numpad3: 'c3', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'left', ArrowDown: 'right', KeyA: 'left', KeyD: 'right', Space: 'ok', Enter: 'ok', NumpadEnter: 'ok', KeyE: 'ok' },
      buttons: () => [],
      keyHint: () => 'pick a line: <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> or <kbd>←</kbd><kbd>→</kbd> + <kbd>Space</kbd> &nbsp; then <kbd>Space</kbd> when the needle is green',
      howto(g) {
        const W_ = WHO[who(g)];
        return {
          lines: [
            'He starts high. Get him down to <b>₹' + W_.target + '</b> for ' + W_.what + ' before his <b>SABR</b> (patience) runs out.',
            'Pick a line: <b>LOGIC</b>, <b>PYAAR</b> (charm), <b>APNAPAN</b> (we\'re local), <b>FILMY</b>... Each person likes different talk. His first line is a hint.',
            'Then say it with confidence: press when the needle is <b style="color:#2f8a3a">green</b>. <b>JAATA HOON</b> (walk away) works only when he\'s close to his lowest price.',
          ],
          goal: 'PRICE ≤ ₹' + W_.target + ' &middot; DON\'T LET HIM LEAVE',
          keys: '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick · <kbd>Space</kbd> say it',
          touch: 'Tap a line, then tap the screen when the needle is <b>green</b>',
        };
      },
      setup(g) {
        const S = g.S, r = g.rng;
        S.who = who(g); const W_ = (S.W = WHO[S.who]);
        if (g.nameEl && !g.params.title) g.nameEl.textContent = W_.title;
        const types = Object.keys(W_.types);
        S.type = types[(r.next() * types.length) | 0];
        S.start = g.params.start || Math.round(lerp(W_.start[0], W_.start[1], r.next()));
        S.target = g.params.target || W_.target;
        S.floor = Math.min(S.target, Math.round(lerp(W_.floor[0], W_.floor[1], r.next()) + g.diff * 1.2)); // his real minimum (never above fair)
        S.price = S.start; S.shown = S.start; S.history = [S.start];
        S.patience = 100; S.score = 0;
        S.used = {}; S.turns = 0;
        S.stage = 'intro'; S.st = 0; S.sel = 0;
        S.cards = [];
        dealCards(g, S);
        S.meter = { t: 0, speed: 1.6 + g.diff * 1.4, zone: 0.2 - g.diff * 0.07 };
        S.bubble = { who: 'him', text: fill(W_.types[S.type].intro, S), t: 0 };
        S.kidBubble = null;
        S.leave = 0; S.time = 0; S.deal = false;
        S.nameSet = false;
      },
      layout(g) { g.S.bgKey = null; lay(g, g.S); },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) { S.time += dt; if (S.bubble) S.bubble.t = Math.min(S.bubble.t + dt, 1); } },
      pointer(g, type, x, y) {
        const S = g.S;
        if (type !== 'down' || g.over) return;
        if (S.stage === 'choose') {
          const i = (S.cardRects || []).findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
          if (i >= 0) { S.sel = i; pick(g, S, i); }
        } else if (S.stage === 'deliver') deliver(g, S);
      },
      bot(g, dt, want) {
        const S = g.S;
        S.botT = (S.botT || 0) - dt;
        if (S.botT > 0) return;
        if (S.stage === 'choose') {
          let best = 0, bs = -1e9;
          S.cards.forEach((c, i) => {
            let sc = (S.W.types[S.type].m[c.cat] || 1) * (CATS[c.cat].frac || 0.2) / (1 + (S.used[c.cat] || 0));
            if (c.cat === 'offer') sc = S.floor <= S.target && S.price - S.floor <= 4 ? 10 : -1;
            if (c.cat === 'walk') sc = S.price - S.floor <= 3 ? 5 : -5;
            if (want === 'lose') sc = c.cat === 'walk' ? 10 : -sc;
            if (sc > bs) { bs = sc; best = i; }
          });
          g.botPress(['c1', 'c2', 'c3'][best]); S.botT = 0.4;
        } else if (S.stage === 'deliver') {
          const v = needle(S), inG = Math.abs(v - 0.5) < S.meter.zone * 0.4;
          if (want === 'lose' ? Math.abs(v - 0.5) > 0.4 : inG) { g.botPress('ok'); S.botT = 0.3; }
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'BHAAV', v: '₹' + S.price, good: S.price <= S.target }, { k: 'TARGET', v: '₹' + S.target }, { k: 'SABR', v: Math.max(0, Math.round(S.patience)) + '%', warn: S.patience < 30 }];
      },
      draw(g, ctx) { drawBargain(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? (S.who === 'auto' ? 'Chalo, baitho!' : 'Deal pakki!') : (S.who === 'auto' ? 'Auto chala gaya!' : 'Woh toh mud gaye!'),
          line: r.win ? 'Saved ₹' + (S.start - S.price) + '. Amma will be proud (and will ask for the change).' : 'Next time read him first: ' + hintFor(S.type) + '.',
          rows: [['First price', '₹' + S.start], ['Final price', '₹' + S.price], ['Saved', '₹' + Math.max(0, S.start - S.price)], ['Lines used', S.turns], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.price <= S.target - 2 ? 1 : 0) + (S.patience >= 40 ? 1 : 0) : 0; },
    };
    function who(g) { return WHO[g.params.who] ? g.params.who : 'auto'; }
    function fill(t, S) { return t.replace('{P}', S.price).replace('{T}', S.target); }
    function hintFor(type) { return { grumpy: 'the grumpy ones respect logic', filmy: 'a filmy one wants style', chatty: 'a chatty one loves apnapan', busy: 'a busy one wants logic, fast', soft: 'a soft one melts for charm and apnapan', strict: 'a strict one respects logic', kind: 'a kind one loves apnapan' }[type] || 'listen to his first line'; }
    function needle(S) { return 0.5 + 0.5 * Math.sin(S.meter.t * S.meter.speed * Math.PI); }

    function dealCards(g, S) {
      const W_ = S.W, r = g.rng;
      const pool = ['logic', 'charm', 'local', 'filmy'];
      const cats = [];
      while (cats.length < 2) { const c = pool[(r.next() * pool.length) | 0]; if (!cats.includes(c)) cats.push(c); }
      const near = S.price - S.target <= 6;
      cats.push(near && r.next() < 0.6 ? 'offer' : r.next() < 0.45 ? 'walk' : pool.find((c) => !cats.includes(c)));
      for (let i = cats.length - 1; i > 0; i--) { const j = (r.next() * (i + 1)) | 0; [cats[i], cats[j]] = [cats[j], cats[i]]; }
      S.cards = cats.map((cat) => { const L = W_.lines[cat]; return { cat, text: fill(L[(r.next() * L.length) | 0], S) }; });
      S.sel = Math.min(S.sel, 2);
    }

    function say(S, text, whoSays) { if (whoSays === 'kid') S.kidBubble = { text, t: 0 }; else S.bubble = { who: 'him', text, t: 0 }; }

    function pick(g, S, i) {
      if (S.stage !== 'choose') return;
      S.pick = S.cards[i];
      S.stage = 'deliver'; S.st = 0; S.meter.t = g.rng.next() * 2;
      say(S, S.pick.text, 'kid');
      g.sfx('ui_select');
    }
    function deliver(g, S) {
      if (S.stage !== 'deliver') return;
      const v = needle(S), off = Math.abs(v - 0.5), z = S.meter.zone;
      const grade = off < z * 0.5 ? 'green' : off < z * 1.3 ? 'yellow' : 'red';
      S.grade = grade;
      react(g, S, S.pick, grade);
    }

    function react(g, S, card, grade) {
      const W_ = S.W, T = W_.types[S.type], cat = card.cat;
      S.turns++;
      const tm = grade === 'green' ? 1.35 : grade === 'yellow' ? 1 : 0.5;
      const L = S.Lay;
      g.pop(grade === 'green' ? 'JAMKE BOLA!' : grade === 'yellow' ? 'theek' : 'atak gaya...', L ? L.kidX : g.W * 0.2, L ? L.kidY - 120 : g.H * 0.6, { size: grade === 'green' ? 22 : 17, color: grade === 'green' ? '#b9ffb0' : grade === 'yellow' ? '#fff' : '#ffb4a6', font: grade === 'green' ? 'display' : 'body' });
      if (grade === 'red') S.patience -= 10;
      let prev = S.price, text;
      if (cat === 'walk') {
        if (S.price - S.floor <= 3 || (S.price - S.floor <= 5 && grade === 'green')) { S.price = Math.max(S.floor, Math.min(S.price, S.target)); text = W_.walkWin; g.sfx('ui_select'); }
        else { S.patience -= 38 / (T.m.walk || 1); text = W_.walkLose; S.walked = true; }
      } else if (cat === 'offer') {
        if (S.floor <= S.target && S.price - S.floor <= (grade === 'green' ? 4 : 3)) { S.price = S.target; text = W_.deal; }
        else { S.price = Math.max(S.floor, S.price - 2); S.patience -= 8; text = W_.offerNo; }
      } else {
        const m = (T.m[cat] || 1) * tm / (1 + (S.used[cat] || 0) * 0.7);
        S.used[cat] = (S.used[cat] || 0) + 1;
        const gap = S.price - S.floor;
        let drop = Math.round(gap * CATS[cat].frac * m);
        if (m >= 0.75 && drop < 1 && gap > 0) drop = 1;
        S.price = Math.max(S.floor, S.price - Math.max(0, drop));
        S.patience += CATS[cat].pat + (m >= 1.1 ? 7 : m < 0.75 ? -15 : -3);
        const pool = m >= 1.1 ? W_.good : m >= 0.75 ? W_.meh : W_.bad;
        text = pool[(g.rng.next() * pool.length) | 0];
      }
      S.patience = Math.min(100, S.patience);
      if (S.price < prev) { S.history.push(S.price); g.sfx('coin', { vol: 0.6 }); }
      S.stage = 'react'; S.st = 0;
      if (S.price <= S.target) {
        S.deal = true;
        say(S, fill(W_.deal, S), 'him');
        S.score = (S.start - S.price) * 30 + Math.round(S.patience) * 3 + Math.max(0, 8 - S.turns) * 20;
        g.finish(true, { price: S.price, start: S.start, saved: S.start - S.price, savedPaise: (S.start - S.price) * 100, who: S.who, delay: 2.0 });
        g.sfx('cash');
        return;
      }
      if (S.patience <= 0) { leave(g, S); return; }
      say(S, fill(text, S), 'him');
    }
    function leave(g, S) {
      S.patience = 0; S.leave = 0.001; S.stage = 'gone';
      say(S, S.W.leave, 'him');
      if (S.who === 'auto') { g.sfx('auto_start'); g.sfx('auto_horn', { delay: 0.6 }); }
      g.finish(false, { price: S.price, start: S.start, who: S.who, delay: 2.2 });
    }

    function step(g, S, dt) {
      S.time += dt; S.st += dt;
      if (S.bubble) S.bubble.t += dt;
      if (S.kidBubble) S.kidBubble.t += dt;
      if (S.leave > 0) S.leave += dt;
      S.shown += (S.price - S.shown) * Math.min(1, dt * 6);
      if (g.over) return;
      if (S.stage === 'intro') { if (S.st > 1.3) { S.stage = 'choose'; S.st = 0; } return; }
      if (S.stage === 'choose' || S.stage === 'deliver') {
        S.patience -= dt * (1.6 + g.diff * 1.4);
        if (S.st > 4.5 && S.stage === 'choose' && !S.nag) { S.nag = true; say(S, ['Bolo bolo, jaldi!', 'Haan? Kya?', 'Time nahi hai!'][(g.rng.next() * 3) | 0], 'him'); if (S.who === 'auto') g.sfx('auto_horn', { vol: 0.5 }); }
        if (S.patience <= 0) { leave(g, S); return; }
      }
      if (S.stage === 'choose') {
        for (let i = 0; i < 3; i++) if (g.pressed('c' + (i + 1))) { S.sel = i; pick(g, S, i); return; }
        if (g.pressed('left')) S.sel = (S.sel + 2) % 3;
        if (g.pressed('right')) S.sel = (S.sel + 1) % 3;
        if (g.pressed('ok')) pick(g, S, S.sel);
      } else if (S.stage === 'deliver') {
        S.meter.t += dt;
        if (g.pressed('ok') || g.pressed('c1') || g.pressed('c2') || g.pressed('c3')) deliver(g, S);
        else if (S.st > 4) { S.grade = 'red'; react(g, S, S.pick, 'red'); }
      } else if (S.stage === 'react') {
        if (S.st > 1.5) { S.stage = 'choose'; S.st = 0; S.nag = false; S.kidBubble = null; dealCards(g, S); }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function lay(g, S) {
      const A = g.area, W = g.W, P = g.portrait;
      const L = (S.Lay = {});
      const cardsH = P ? Math.min(A.h * 0.36, 3 * 64 + 20) : Math.min(A.h * 0.34, 120);
      L.cardsY = A.y + A.h - cardsH; L.cardsH = cardsH;
      L.meterY = L.cardsY - (P ? 46 : 40);
      L.ground = L.meterY - (P ? 26 : 16);
      L.sceneH = L.ground - A.y;
      L.sc = Math.max(0.5, Math.min(L.sceneH / 230, W / (P ? 340 : 560)));
      L.vx = W * (P ? 0.62 : 0.6); // vendor / auto anchor
      L.kidX = W * (P ? 0.17 : 0.18); L.kidY = L.ground + 4;
      return L;
    }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, A = g.area;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h;
      const L = lay(g, S);
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const gy = L.ground;
      let gr = c.createLinearGradient(0, 0, 0, gy);
      gr.addColorStop(0, '#f2b26a'); gr.addColorStop(1, '#f7dca8');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const rng = U.rng(55);
      if (S.who === 'auto') {
        // Koti bus stand: shelter roof, a red-and-cream city bus, crowd
        c.fillStyle = '#c9b8a0'; c.fillRect(0, gy - L.sceneH * 0.62, W, L.sceneH * 0.62);
        c.fillStyle = '#8a7a66'; c.fillRect(0, gy - L.sceneH * 0.66, W, L.sceneH * 0.06);
        for (let x = 20; x < W; x += 90) { c.fillStyle = '#6a5a4a'; c.fillRect(x, gy - L.sceneH * 0.6, 6, L.sceneH * 0.6); }
        const bw = Math.min(W * 0.55, 360), bh = bw * 0.36, bx = W * 0.02, by = gy - bh - 4;
        c.fillStyle = '#b22b2b'; H.rr(c, bx, by, bw, bh, 10); c.fill();
        c.fillStyle = '#efe0c0'; c.fillRect(bx, by + bh * 0.42, bw, bh * 0.14);
        for (let i = 0; i < 6; i++) { c.fillStyle = '#3a3a4a'; c.fillRect(bx + 10 + i * (bw - 20) / 6, by + 8, (bw - 20) / 6 - 8, bh * 0.3); }
        c.fillStyle = '#1a1214'; c.beginPath(); c.arc(bx + bw * 0.2, by + bh, bh * 0.16, 0, TAU); c.arc(bx + bw * 0.8, by + bh, bh * 0.16, 0, TAU); c.fill();
        H.text(c, '8A  CHARMINAR', bx + bw * 0.5, by + bh * 0.49, { font: 'osd', size: Math.max(10, bh * 0.12), color: '#b22b2b' });
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.32, 170), Math.max(26, Math.min(48, L.sceneH * 0.13)), { fill: '#f2c230', text: 'KOTI', size: Math.max(16, Math.min(32, L.sceneH * 0.09)) });
      } else if (S.who === 'banana') {
        // a colony market lane: shop shutters + a Rythu Bazaar-ish shed
        for (let x = 0; x < W; ) { const w = 60 + rng.next() * 60, h = L.sceneH * (0.6 + rng.next() * 0.3); c.fillStyle = ['#e8d9b5', '#c7b9d6', '#bcd3c4', '#e9c6b6'][(rng.next() * 4) | 0]; c.fillRect(x, gy - h, w, h); c.fillStyle = '#7a7a80'; c.fillRect(x + 6, gy - h * 0.45, w - 12, h * 0.45); c.strokeStyle = 'rgba(0,0,0,0.2)'; for (let yy = gy - h * 0.45; yy < gy; yy += 5) { c.beginPath(); c.moveTo(x + 6, yy); c.lineTo(x + w - 6, yy); c.stroke(); } x += w + 4; }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.4, 220), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#2f8a3a', text: 'RYTHU BAZAAR', color: '#fff', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else {
        // outside a temple on a Thursday: whitewashed wall with a saffron band, a few devotees
        c.fillStyle = '#f4efe2'; c.fillRect(0, gy - L.sceneH * 0.7, W, L.sceneH * 0.7);
        c.fillStyle = '#ef8a2a'; c.fillRect(0, gy - L.sceneH * 0.7, W, L.sceneH * 0.05);
        c.fillStyle = '#b5694a'; c.fillRect(0, gy - L.sceneH * 0.12, W, L.sceneH * 0.12);
        for (let i = 0; i < 6; i++) { const x = W * (0.05 + i * 0.17), h = L.sceneH * 0.3; c.fillStyle = 'rgba(80,60,50,0.18)'; c.beginPath(); c.arc(x, gy - h - 10, 9, 0, TAU); c.fill(); H.rr(c, x - 11, gy - h, 22, h, 6); c.fill(); }
        // a saffron flag on a pole
        const fx = W * 0.9; c.strokeStyle = '#6a5a4a'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, gy - L.sceneH * 0.7); c.lineTo(fx, gy - L.sceneH * 1.0); c.stroke();
        c.fillStyle = '#ef8a2a'; c.beginPath(); c.moveTo(fx, gy - L.sceneH * 1.0); c.lineTo(fx - 26, gy - L.sceneH * 0.95); c.lineTo(fx, gy - L.sceneH * 0.9); c.fill();
      }
      // road / footpath
      c.fillStyle = '#8a8580'; c.fillRect(0, gy, W, Hh - gy);
      c.fillStyle = '#b8b0a4'; c.fillRect(0, gy, W, 6);
      // card tray background
      c.fillStyle = 'rgba(18,13,22,0.88)'; c.fillRect(0, L.meterY - 10, W, Hh - L.meterY + 10);
      c.fillStyle = 'rgba(242,194,48,0.35)'; c.fillRect(0, L.meterY - 10, W, 2);
    }

    function drawBargain(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const L = S.Lay;
      // the other party
      if (S.who === 'auto') drawAuto(ctx, S, L, g); else drawCart(ctx, S, L, g);
      // price slate
      drawSlate(ctx, S, L, g);
      // the kid
      H.kidBack(ctx, L.kidX, L.kidY, L.sc * 1.35, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      // bubbles
      if (S.bubble && S.bubble.t < 3.5 && !(S.kidBubble && S.stage === 'deliver')) {
        const bx = S.who === 'auto' ? L.vx + 10 * L.sc : L.vx, by = L.ground - 150 * L.sc;
        bubble(ctx, g, S.bubble.text, bx, by, S.bubble.t, S.type === 'grumpy' || S.type === 'busy' || S.type === 'strict' ? '#ffe6dc' : '#fff8e6', 'right');
      }
      if (S.kidBubble) bubble(ctx, g, S.kidBubble.text, L.kidX + 30 * L.sc, L.kidY - 90 * L.sc, S.kidBubble.t, '#e8f4ff', 'left');
      // patience meter (SABR) with a face
      const pw = Math.min(W * 0.4, 220), px = W - pw - 14, py = g.area.y + 12;
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, px - 30, py - 4, pw + 36, 24, 12); ctx.fill();
      const pv = U.clamp(S.patience / 100, 0, 1);
      ctx.fillStyle = pv > 0.5 ? '#6fbf5a' : pv > 0.25 ? '#ffb43a' : '#e2483a'; H.rr(ctx, px, py + 2, pw * pv, 12, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; H.rr(ctx, px, py + 2, pw, 12, 6); ctx.stroke();
      face(ctx, px - 15, py + 8, 9, pv);
      H.text(ctx, 'SABR', px + pw / 2, py + 27, { font: 'osd', size: 15, color: '#eaf2ff', outline: 3 });
      // the timing meter
      if (S.stage === 'deliver') {
        const mw = Math.min(W - 40, 420), mx = (W - mw) / 2, my = L.meterY, z = S.meter.zone;
        ctx.fillStyle = '#e2483a'; H.rr(ctx, mx, my - 9, mw, 18, 9); ctx.fill();
        ctx.fillStyle = '#ffb43a'; ctx.fillRect(mx + mw * (0.5 - z * 1.3), my - 9, mw * z * 2.6, 18);
        ctx.fillStyle = '#6fdc5a'; ctx.fillRect(mx + mw * (0.5 - z * 0.5), my - 9, mw * z, 18);
        const v = needle(S), nx = mx + mw * v;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(nx, my - 12); ctx.lineTo(nx + 7, my - 22); ctx.lineTo(nx - 7, my - 22); ctx.fill();
        ctx.fillRect(nx - 1.5, my - 12, 3, 24);
        H.text(ctx, g.touch ? 'BOLO! tap on green' : 'BOLO! SPACE on green', W / 2, my + 22, { font: 'osd', size: 16, color: '#eaf2ff' });
      } else if (S.stage === 'choose') {
        H.text(ctx, 'Kya bolna hai?', W / 2, L.meterY, { font: 'display', size: 20, color: '#ffd84a', outline: 4 });
      }
      // the cards
      drawCards(ctx, S, L, g);
    }

    function bubble(ctx, g, text, x, y, t, fillc, side) {
      const W = g.W;
      const fs = Math.max(13, Math.min(17, W * 0.034));
      ctx.font = H.font('body', fs, 700);
      const maxW = Math.min(W * 0.62, 300);
      const lines = H.wrap(ctx, text, maxW - 22);
      const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24), lh = fs * 1.25, bh = lines.length * lh + 14;
      let bx = side === 'right' ? x - bw * 0.35 : x;
      bx = U.clamp(bx, 8, W - bw - 8);
      const by = Math.max(g.area.y + 34, y - bh);
      const k = Math.min(1, t / 0.16);
      ctx.save(); ctx.translate(bx + bw / 2, by + bh); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-bx - bw / 2, -by - bh);
      ctx.fillStyle = fillc; H.rr(ctx, bx, by, bw, bh, 10); ctx.fill(); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 2; ctx.stroke();
      const tx = U.clamp(x, bx + 14, bx + bw - 14);
      ctx.beginPath(); ctx.moveTo(tx - 7, by + bh - 1); ctx.lineTo(tx, by + bh + 10); ctx.lineTo(tx + 7, by + bh - 1); ctx.fillStyle = fillc; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 7, by + bh); ctx.lineTo(tx, by + bh + 10); ctx.lineTo(tx + 7, by + bh); ctx.stroke();
      lines.forEach((l, i) => H.text(ctx, l, bx + bw / 2, by + 7 + lh * (i + 0.5), { font: 'body', weight: 700, size: fs, color: '#1a1214' }));
      ctx.restore();
    }
    function face(ctx, x, y, r, mood) {
      ctx.fillStyle = mood > 0.5 ? '#ffd84a' : mood > 0.25 ? '#ffb43a' : '#ff6a5a';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1214'; ctx.fillRect(x - r * 0.45, y - r * 0.3, r * 0.22, r * 0.22); ctx.fillRect(x + r * 0.25, y - r * 0.3, r * 0.22, r * 0.22);
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.5; ctx.beginPath();
      if (mood > 0.5) ctx.arc(x, y + r * 0.1, r * 0.45, 0.3, Math.PI - 0.3); else if (mood > 0.25) { ctx.moveTo(x - r * 0.4, y + r * 0.4); ctx.lineTo(x + r * 0.4, y + r * 0.4); } else ctx.arc(x, y + r * 0.75, r * 0.45, Math.PI + 0.4, -0.4);
      ctx.stroke();
    }

    function drawCards(ctx, S, L, g) {
      const W = g.W, P = g.portrait;
      S.cardRects = [];
      if (!(S.stage === 'choose' || S.stage === 'deliver' || S.stage === 'intro')) return;
      const n = S.cards.length, pad = 12;
      for (let i = 0; i < n; i++) {
        let x, y, w, h;
        if (P) { w = W - pad * 2; h = (L.cardsH - pad * (n + 1)) / n; x = pad; y = L.cardsY + pad + i * (h + pad); }
        else { w = (Math.min(W, 900) - pad * (n + 1)) / n; h = L.cardsH - pad * 2; x = (W - Math.min(W, 900)) / 2 + pad + i * (w + pad); y = L.cardsY + pad; }
        S.cardRects.push({ x, y, w, h });
        const c = S.cards[i], C = CATS[c.cat];
        const chosen = S.stage === 'deliver' && S.pick === c, dim = (S.stage === 'deliver' && !chosen) || S.stage === 'intro';
        const hi = S.stage === 'choose' && i === S.sel && !g.touch;
        ctx.globalAlpha = dim ? 0.35 : 1;
        H.sign(ctx, x, y + (hi ? -3 : 0), w, h, { fill: chosen ? '#fff6c8' : '#f4ead8', edge: hi || chosen ? '#f2c230' : '#1a1214', bolts: false, r: 8, shadow: 'rgba(0,0,0,0.5)' });
        // category chip + key number
        const chipW = Math.min(110, w * 0.4), chipH = Math.min(20, h * 0.36);
        ctx.fillStyle = C.col; H.rr(ctx, x + 8, y + 6, chipW, chipH, 4); ctx.fill();
        H.text(ctx, (S.W.catNames && S.W.catNames[c.cat]) || C.name, x + 8 + chipW / 2, y + 6 + chipH / 2 + 1, { font: 'osd', size: chipH * 0.9, color: '#fff', maxW: chipW - 6 });
        if (!g.touch) H.text(ctx, String(i + 1), x + w - 16, y + 6 + chipH / 2 + 1, { font: 'osd', size: chipH * 0.95, color: '#7a6a5a' });
        ctx.font = H.font('body', Math.max(13, Math.min(17, h * 0.26)), 700);
        const lines = H.wrap(ctx, c.text, w - 20).slice(0, 2);
        const fs = Math.max(13, Math.min(17, h * 0.26));
        const ty = y + 6 + chipH + (h - 6 - chipH) / 2 - ((lines.length - 1) * fs * 1.15) / 2;
        lines.forEach((l, k) => H.text(ctx, l, x + 10, ty + k * fs * 1.15, { font: 'body', weight: 700, size: fs, color: '#1a1214', align: 'left', maxW: w - 20 }));
        ctx.globalAlpha = 1;
      }
    }

    function drawSlate(ctx, S, L, g) {
      const sc = Math.min(L.sc, 1.1), w = 92 * sc, h = 62 * sc;
      const sx = g.W - w - 16, sy = g.area.y + 48;
      ctx.fillStyle = '#7a5a30'; H.rr(ctx, sx - 5, sy - 5, w + 10, h + 10, 6); ctx.fill();
      ctx.fillStyle = '#2a3428'; ctx.fillRect(sx, sy, w, h);
      // struck-through history
      const hist = S.history.slice(-3, -1);
      hist.forEach((p, i) => {
        const tx = sx + 10 + i * w * 0.28, ty = sy + h * 0.24;
        H.text(ctx, '₹' + p, tx, ty, { font: 'osd', size: h * 0.26, color: 'rgba(255,255,255,0.55)', align: 'left' });
        ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 2); ctx.lineTo(tx + h * 0.4, ty - 4); ctx.stroke();
      });
      const cur = Math.round(S.shown);
      H.text(ctx, '₹' + cur + (S.W.unit || ''), sx + w / 2, sy + h * 0.66, { font: 'osd', size: h * 0.5, color: S.price <= S.target ? '#b9ffb0' : '#fff', maxW: w - 10 });
    }

    function drawAuto(ctx, S, L, g) {
      const sc = L.sc;
      const drive = S.leave > 0 ? Math.pow(S.leave, 2) * 260 : 0;
      const x = L.vx + drive, y = L.ground;
      const shake = S.stage !== 'gone' ? Math.sin(S.time * 40) * 0.6 : Math.sin(S.time * 60) * 1.4;
      ctx.save(); ctx.translate(x, y + shake); ctx.scale(sc, sc);
      // smoke puffs from the exhaust
      for (let i = 0; i < 4; i++) {
        const k = (S.time * (S.leave > 0 ? 2.5 : 0.8) + i / 4) % 1;
        ctx.fillStyle = 'rgba(120,120,120,' + (1 - k) * (S.leave > 0 ? 0.5 : 0.22) + ')';
        ctx.beginPath(); ctx.arc(-92 - k * 40, -14 - k * 18, 6 + k * 14, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 95, 8, 0, 0, TAU); ctx.fill();
      // body (black lower, yellow upper)
      ctx.fillStyle = '#1a1214';
      ctx.beginPath(); ctx.moveTo(-88, -10); ctx.lineTo(-88, -50); ctx.lineTo(30, -50); ctx.quadraticCurveTo(70, -48, 82, -20); ctx.lineTo(84, -10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(-90, -48); ctx.quadraticCurveTo(-88, -118, -40, -122); ctx.lineTo(40, -122); ctx.quadraticCurveTo(64, -118, 66, -70); ctx.lineTo(60, -48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 3; ctx.stroke();
      // window openings
      ctx.fillStyle = '#3a2a24'; H.rr(ctx, -80, -108, 70, 52, 8); ctx.fill();
      ctx.fillStyle = 'rgba(180,220,240,0.45)'; ctx.beginPath(); ctx.moveTo(30, -112); ctx.lineTo(56, -110); ctx.lineTo(58, -60); ctx.lineTo(30, -60); ctx.fill();
      // wheels
      for (const wx of [-60, 62]) { ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(wx, -6, 15, 0, TAU); ctx.fill(); ctx.fillStyle = '#9a9a9a'; ctx.beginPath(); ctx.arc(wx, -6, 6, 0, TAU); ctx.fill(); }
      // headlight + number plate
      ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(80, -36, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(-84, -40, 30, 12); H.text(ctx, 'AP 09', -69, -33.5, { font: 'osd', size: 10, color: '#1a1214' });
      // driver (leaning out, khaki uniform, towel)
      const dX = 8, dY = -62, mood = S.patience / 100;
      ctx.fillStyle = '#b8a070'; H.rr(ctx, dX - 14, dY - 30, 28, 32, 6); ctx.fill();
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(dX - 14, dY - 30, 9, 26);
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(dX + 2, dY - 42, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(dX + 2, dY - 46, 12.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dX - 6, dY - 36); ctx.quadraticCurveTo(dX + 4, dY - 41, dX + 12, dY - 36); ctx.quadraticCurveTo(dX + 4, dY - 33, dX - 6, dY - 36); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.fillRect(dX - 3, dY - 46, 3, 3); ctx.fillRect(dX + 7, dY - 46, 3, 3);
      if (mood < 0.3) { ctx.strokeStyle = '#1a1412'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(dX - 5, dY - 51); ctx.lineTo(dX + 1, dY - 49); ctx.moveTo(dX + 12, dY - 51); ctx.lineTo(dX + 6, dY - 49); ctx.stroke(); }
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dX + 10, dY - 22); ctx.lineTo(dX + 34, dY - 16); ctx.stroke(); // hand on the handle
      if (S.bubble && S.bubble.t < 1.2 && Math.sin(S.time * 10) > 0) { ctx.beginPath(); ctx.moveTo(dX - 12, dY - 22); ctx.lineTo(dX - 30, dY - 40); ctx.stroke(); }
      ctx.restore();
    }

    function drawCart(ctx, S, L, g) {
      const sc = L.sc, x = L.vx, y = L.ground;
      const turn = S.leave > 0 ? Math.min(1, S.leave * 1.5) : 0;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 80, 7, 0, 0, TAU); ctx.fill();
      // vendor behind the cart
      const vx = -10, vy = -58;
      const banana = S.who === 'banana';
      ctx.fillStyle = banana ? '#e8e2d2' : '#e8487c'; H.rr(ctx, vx - 15, vy - 36, 30, 40, 7); ctx.fill();
      ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(vx, vy - 48, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = banana ? '#f4efe2' : '#1a1412'; ctx.beginPath(); ctx.arc(vx, vy - 52, 12.5, Math.PI, TAU); ctx.fill();
      if (!banana) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(vx + 9 + Math.cos(i) * 3, vy - 55 + i * 2.5, 2, 0, TAU); ctx.fill(); } ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.arc(vx, vy - 52, 1.3, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.moveTo(vx - 7, vy - 43); ctx.quadraticCurveTo(vx, vy - 47, vx + 7, vy - 43); ctx.quadraticCurveTo(vx, vy - 40, vx - 7, vy - 43); ctx.fill(); }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(vx - 5, vy - 51, 3, 3); ctx.fillRect(vx + 3, vy - 51, 3, 3);
      if (turn) { ctx.fillStyle = 'rgba(244,234,216,' + turn * 0.7 + ')'; ctx.fillRect(vx - 16, vy - 62, 32, 70); }
      // the cart
      ctx.fillStyle = '#8a5a34'; ctx.fillRect(-70, -40, 140, 14);
      ctx.fillStyle = '#6a3a24'; ctx.fillRect(-64, -26, 6, 22); ctx.fillRect(58, -26, 6, 22);
      ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(-40, -8, 12, 0, TAU); ctx.arc(40, -8, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a8a8a'; ctx.beginPath(); ctx.arc(-40, -8, 4, 0, TAU); ctx.arc(40, -8, 4, 0, TAU); ctx.fill();
      if (banana) {
        ctx.fillStyle = '#4f7a3a'; ctx.beginPath(); ctx.ellipse(0, -42, 72, 8, 0, 0, TAU); ctx.fill(); // banana leaves
        for (let b = 0; b < 5; b++) {
          const bx = -52 + b * 26, by = -44;
          for (let k = 0; k < 5; k++) { ctx.strokeStyle = k % 2 ? '#f2c230' : '#e8b820'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bx + k * 2, by - 8, 12, Math.PI * 0.85, Math.PI * 1.6); ctx.stroke(); }
          ctx.fillStyle = '#5a4a1a'; ctx.fillRect(bx + 2, by - 24, 4, 6);
        }
        // hanging scale
        ctx.strokeStyle = '#4a4450'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(55, -100); ctx.lineTo(55, -80); ctx.moveTo(40, -80); ctx.lineTo(70, -80); ctx.moveTo(42, -80); ctx.lineTo(42, -68); ctx.moveTo(68, -80); ctx.lineTo(68, -68); ctx.stroke();
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.ellipse(42, -66, 7, 2.5, 0, 0, TAU); ctx.ellipse(68, -66, 7, 2.5, 0, 0, TAU); ctx.fill();
      } else {
        // marigold + jasmine garlands
        for (let i = 0; i < 7; i++) {
          const gx = -54 + i * 18;
          for (let k = 0; k < 7; k++) { ctx.fillStyle = i % 2 ? (k % 2 ? '#ffffff' : '#f4f0e0') : (k % 2 ? '#ef8a2a' : '#f2b22a'); ctx.beginPath(); ctx.arc(gx + Math.sin(k) * 2, -50 - k * 5, i % 2 ? 2.6 : 4, 0, TAU); ctx.fill(); }
        }
        ctx.fillStyle = '#c8402a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-50 + i * 25, -44, 5, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    MG.register(def);
  }
