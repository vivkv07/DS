
  /* ================================================================ BARGAIN */
  // Mol-bhaav (systems_design §8.7). Haggle the seller down to the target price before his patience
  // (SABR) runs out. Pick a line (each seller likes one kind of talk, hinted by his first line), then
  // say it with confidence: press when the needle is in the green. Skins (params.who): auto, banana,
  // flower, kite (M1), farmer (M7), books (SA7); anything else falls back to 'auto'.
  {
    const T = (MG.TUNE.bargain = Object.assign({
      drain0: 2.2, drain1: 1.8,          // patience drain per second = drain0 + drain1 * d
      frac: 0.2, likedFrac: 0.45,        // share of (price - floor) a line cuts: any type / the liked type
      grade: { green: 1, yellow: 0.5, red: 0 }, redPatience: -10,
      walkNear: 2, walkFail: -38,        // JAATA HOON works within Rs 2 of his floor, else -38 patience
      speed0: 1.6, speed1: 1.4, zone0: 0.2, zone1: 0.07, // the confidence needle
    }, MG.TUNE.bargain || {}));
    const CATS = {
      logic: { name: 'LOGIC', col: '#3b6fc4', pat: -7 },
      charm: { name: 'PYAAR', col: '#e8487c', pat: 2 },
      local: { name: 'APNAPAN', col: '#2a8c82', pat: 3 },
      filmy: { name: 'FILMY', col: '#7a3db8', pat: -2 },
      walk: { name: 'JAATA HOON', col: '#5a5560', pat: 0 },
    };
    const TYPES = ['logic', 'charm', 'local', 'filmy'];
    // generic hints, used when params.randomType gives the seller a random taste
    const HINTS = {
      logic: 'Hisaab se baat karo, faltu nahi.',
      charm: 'Meethi baat karo toh sochenge.',
      local: 'Waise, kaunsi gali ke ho?',
      filmy: 'Kuch dialogue maaro, hero!',
    };
    const PLACE_SIGN = { koti_bus_stand: 'KOTI', rtc_x_roads: 'RTC X ROADS', nampally_station: 'NAMPALLY', kachiguda_station: 'KACHIGUDA', imlibun_bus_station: 'IMLIBUN' };
    const WHO = {
      auto: {
        title: 'Auto Mol-Bhaav', what: 'the ride', like: 'local',
        price: (p) => { const m = Math.max(4, Math.round(p.meter || p.target || 20)); return { start: m + 10, target: m, floor: m - 2 }; },
        ask: '{D}? ₹{P}. Meter nakko, das upar.', hint: 'Waise, kaunsi gali ke ho?',
        lines: {
          logic: ['Meter pe chalo na, anna.', 'Bus mein toh teen rupaye lagte!', 'Itna door bhi nahi hai, anna!', 'Kal meter se gaya tha.'],
          charm: ['Anna, aap toh apne hi ho!', 'Aap ka auto ekdum mast hai!', 'Thoda kam karo na, please!'],
          local: ['Mere mamu bhi Koti mein auto chalate!', 'Hum isi area ke hain, anna!', 'Hum roz isi stand se jaate.'],
          filmy: ['Anna, hero log seedha deal karte!', 'Picture ka time hai, jaldi aur sasta!'],
          walk: ['Chodo, doosra auto le lunga.', 'Rehne do, main bus se jaata.'],
        },
        good: ['Accha... ₹{P} de dena.', 'Apne log ho. Chalo, ₹{P}.', 'Hmm. Chalo, ₹{P}.'],
        meh: ['Petrol kitna mehenga hai, maloom? ₹{P}.', '₹{P}. Isse kam nahi.'],
        bad: ['Kya bolra baba? ₹{P} hi lagenge.', 'Time waste mat karo!'],
        walkWin: 'Arre ruko ruko! Chalo, ₹{P}!', walkLose: 'Jao jao! Bahut auto hai.',
        deal: 'Chalo, baitho! ₹{P}, meter nakko.', leave: 'Chal hatt! Mera time kharab kiya.',
      },
      banana: {
        title: 'Kele ka Mol-Bhaav', what: 'one dozen bananas', like: 'charm', unit: '/dozen',
        price: (p, r) => ({ start: ri(r, 15, 18), target: 10, floor: ri(r, 8, 11) }),
        ask: 'Chakkarakeli! ₹{P} darjan.', hint: 'Meethi baat karo, meethe kele lo!',
        lines: {
          logic: ['Rythu Bazaar mein ₹10 hai!', 'Ye toh chhote chhote hain!', 'Do darjan lunga, kam karo.'],
          charm: ['Amma bolti aap ke kele best hain!', 'Aap ke kele sabse meethe!', 'Aap ki muskaan bhi meethi, uncle!'],
          local: ['Hum roz aap se hi lete hain.', 'Main woh peeli building wala!'],
          filmy: ['Uncle, kele khaake hi hero bante!', 'Ek kela phokat, hero ke liye?'],
          walk: ['Chalo, aage wale se lete.', 'Rehne do, kal lunga.'],
        },
        good: ['Hehe, accha. ₹{P} de do.', 'Chalo, aap ke liye ₹{P}.'],
        meh: ['Mandi mein bhi mehenga hai, beta. ₹{P}.'],
        bad: ['Nahi hoga, ₹{P}.', 'Bhaav mat karo, beta!'],
        walkWin: 'Arre ruko! ₹{P}, le jao!', walkLose: 'Jao, aage wala bhi itna hi lega.',
        deal: 'Lo, ₹{P}. Ek extra bhi daal diya!', leave: 'Agla customer! Chalo, hato.',
      },
      flower: {
        title: 'Phoolon ka Mol-Bhaav', what: 'a jasmine and marigold garland', like: 'charm',
        price: (p, r) => ({ start: ri(r, 20, 24), target: 12, floor: ri(r, 10, 13) }),
        ask: 'Mallepoolu, genda! Haar ₹{P}.', hint: 'Dekho na, kitna sundar banaya!',
        lines: {
          logic: ['Kal toh ₹12 tha!', 'Aadhe phool toh band hain!', 'Andar bhi milta hai.'],
          charm: ['Aap ke phool sabse fresh hain!', 'Kitna sundar haar banaya, aunty!'],
          local: ['Har Thursday hum aap se hi lete.', 'Hum isi gali mein rehte.'],
          filmy: ['Aunty, ye haar toh picture mein bhi nahi dekha!', 'Ek gulab, hero ke liye?'],
          walk: ['Rehne do, doosri jagah lete.', 'Kal le lunga.'],
        },
        good: ['Aww. Accha, ₹{P} de do.', 'Chalo, aap ke liye ₹{P}.'],
        meh: ['Phool mehenge hain aaj. ₹{P}.'],
        bad: ['₹{P} se kam nahi.', 'Mol-bhaav nahi, beta.'],
        walkWin: 'Ruko! ₹{P}, le lo.', walkLose: 'Theek hai, jao.',
        deal: 'Lo beta, ₹{P}. Ammamma ko pranaam bolna.', leave: 'Agla! Bheed hai, beta.',
      },
      kite: {
        title: 'Patang ka Mol-Bhaav', what: 'five kites and a charkhi', like: 'filmy',
        price: (p, r) => ({ start: 30, target: 20, floor: ri(r, 18, 20) }),
        ask: 'Paanch patang, ek charkhi? ₹{P}, mian.', hint: 'Aaj Sankranti hai. Aaj toh hawa bhi extra charge karti!',
        lines: {
          logic: ['Chacha, charkhi pe saddi aadhi hai!', 'Kal ₹20 mein bech rahe the!', 'Paanch patang hi toh hain.'],
          charm: ['Chacha, aap ki patang sabse oonchi udti!', 'Aap ke haath ka kaam, first class!'],
          local: ['Hum Charminar ke paas hi rehte!', 'Har Sankranti aap se hi lete, Chacha.'],
          filmy: ['Chacha, hawa bhi aapki, patang bhi aapki, dil bhi aapka!', 'Aaj ka hero main, aaj ka bhaav bhi mera!', 'Hero ki patang kabhi nahi katti, Chacha!'],
          walk: ['Chalo, aage wali dukaan dekhte.', 'Rehne do, Chacha.'],
        },
        good: ['Hehe! Baaton mein toh hero ho. ₹{P}.', 'Wah mian, wah! ₹{P}.'],
        meh: ['Saddi mehengi hai, beta. ₹{P}.', 'Hmm. ₹{P}.'],
        bad: ['Na mian, ₹{P} hi.', 'Aaj Sankranti hai, beta!'],
        walkWin: 'Arre ruko, mian! Chalo, ₹{P}.', walkLose: 'Jao, har dukaan mein yahi bhaav.',
        deal: 'Theek hai. ₹{P}. Aur glass manja nahi, haan? Cotton only.', leave: 'Bas mian, bheed hai. Baad mein aana.',
      },
      farmer: {
        title: 'Rythu Bazaar Bhaav', what: 'Amma\'s list', like: 'logic',
        price: (p) => { const l = Math.max(4, Math.round(p.list || p.target || 36)); return { start: Math.round(l * 1.25), target: l, floor: Math.round(l * 0.9) }; },
        ask: 'Tamata kilo aaru! Poora list ₹{P}, babu.', hint: 'Hisaab pakka hai, babu. Gin ke dekho.',
        lines: {
          logic: ['Erragadda mein kilo ek rupaya kam hai!', 'Poora list ek saath le raha hoon, aunty.', 'Ye tamatar thode dabbe hue hain.', 'Board pe toh kam likha hai!'],
          charm: ['Aunty, aap ki sabzi sabse taazi!', 'Aap ke tamatar ekdum laal!'],
          local: ['Amma hamesha aap se hi leti, aunty.', 'Hum Mehdipatnam ke hi hain!'],
          filmy: ['Aunty, aap ke tamatar picture mein aane chahiye!', 'Hero ki Amma ki list hai, aunty!'],
          walk: ['Chalo, agle stall pe dekhte.', 'Rehne do aunty, Erragadda jaate.'],
        },
        good: ['Sare, babu. Hisaab theek. ₹{P}.', 'Smart boy. ₹{P} ivvu.'],
        meh: ['Mandi mein bhi rate hai, babu. ₹{P}.'],
        bad: ['Ledu babu, ₹{P}.', 'Rate fixed hai, babu!'],
        walkWin: 'Ruko babu! ₹{P}, sare.', walkLose: 'Jao, Erragadda ka auto ₹10 hai!',
        deal: 'Sare! ₹{P}. Kosaru bhi daal diya, Amma ko bolna.', leave: 'Babu, line lagi hai. Agla!',
      },
      books: {
        title: 'Kitaabon ka Mol-Bhaav', what: 'the class VII set', like: 'local',
        price: (p, r) => ({ start: 90, target: 60, floor: 55 }),
        ask: 'Seventh class, full set, ₹{P}. Half price!', hint: 'Kaunse school ke ho? Idhar ke ho?',
        lines: {
          logic: ['Ye toh pichle saal ka edition hai!', 'Cover phata hua hai, uncle.', 'Guide nahi chahiye, sirf books.'],
          charm: ['Uncle, aap ke paas sab milta hai!', 'Aap toh Koti ki library ho!'],
          local: ['Main yahin paas ke school mein padhta!', 'Bhaiyya bhi aap se hi lete the!', 'Hum Koti ke hi hain, uncle.'],
          filmy: ['Uncle, padhai ka hero banna hai, help karo!', 'Half price ka half price, uncle?'],
          walk: ['Chalo, agla stall.', 'Rehne do, uncle.'],
        },
        good: ['Apne area ka ho? Accha, ₹{P}.', 'Padhne wale ho. ₹{P}.'],
        meh: ['Books bhaari hain, beta. ₹{P}.'],
        bad: ['Na beta, ₹{P}.', 'Half price already hai!'],
        walkWin: 'Arre ruko! ₹{P}, le jao.', walkLose: 'Jao, Abids mein bhi yahi rate.',
        deal: 'Lo, ₹{P}. Achhe se cover karna, haan!', leave: 'Beta, aur customer hain. Kal aana.',
      },
    };
    function ri(r, a, b) { return a + Math.floor(r.next() * (b - a + 1)); }

    const def = {
      id: 'bargain',
      title: 'Mol-Bhaav',
      sub: 'Never pay the first price. Every 90s kid learnt this from Amma.',
      osd: 'HAGGLE',
      place: 'koti_bus_stand', places: ['koti_bus_stand', 'banana_cart_', 'flower_cart_', 'kite_stall_1', 'rythu_bazaar_', 'koti_book_bazaar', 'rtc_x_roads'],
      secs: 50,
      goLabel: 'BOLO!',
      keys: { Digit1: 'c1', Digit2: 'c2', Digit3: 'c3', Numpad1: 'c1', Numpad2: 'c2', Numpad3: 'c3', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'left', ArrowDown: 'right', KeyA: 'left', KeyD: 'right', Space: 'ok', Enter: 'ok', NumpadEnter: 'ok', KeyE: 'ok' },
      buttons: () => [],
      keyHint: () => 'pick a line: <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> or <kbd>←</kbd><kbd>→</kbd> + <kbd>Space</kbd> &nbsp; then <kbd>Space</kbd> when the needle is green',
      howto(g) {
        const w = who(g), W_ = WHO[w], pr = prices(g, w, U.rng(1));
        return {
          lines: [
            'He starts high. Get him down to <b>₹' + pr.target + '</b> for ' + (g.params.what || W_.what) + ' before his <b>SABR</b> (patience) runs out.',
            'Pick a line: <b>LOGIC</b>, <b>PYAAR</b> (charm), <b>APNAPAN</b> (we\'re local), <b>FILMY</b>. He likes one kind more: <b>his first line is the hint</b>.',
            'Say it with confidence: press when the needle is <b style="color:#2f8a3a">green</b> (yellow does half, red annoys him). <b>JAATA HOON</b> (walk away) works only when he\'s close to his lowest price.',
          ],
          goal: 'PRICE ≤ ₹' + pr.target + ' &middot; DON\'T LET HIM LEAVE',
          keys: '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick · <kbd>Space</kbd> say it',
          touch: 'Tap a line, then tap the screen when the needle is <b>green</b>',
        };
      },
      setup(g) {
        const S = g.S, r = g.rng, p = g.params;
        S.who = who(g); const W_ = (S.W = WHO[S.who]);
        if (g.nameEl && !p.title) g.nameEl.textContent = W_.title;
        S.like = p.like && CATS[p.like] && p.like !== 'walk' ? p.like : p.randomType ? TYPES[(r.next() * TYPES.length) | 0] : W_.like;
        const pr = prices(g, S.who, r);
        S.start = pr.start; S.target = pr.target; S.floor = pr.floor;
        S.price = S.start; S.shown = S.start; S.history = [S.start];
        S.patience = 100; S.score = 0;
        S.used = {}; S.turns = 0;
        S.stage = 'intro'; S.st = 0; S.sel = 0;
        S.cards = [];
        dealCards(g, S);
        S.meter = { t: 0, speed: T.speed0 + g.diff * T.speed1, zone: Math.min(0.32, (T.zone0 - g.diff * T.zone1) * g.winMul) };
        const hint = S.like === W_.like ? W_.hint : HINTS[S.like];
        S.bubble = { who: 'him', text: fill(W_.ask, S, g) + ' ' + hint, t: 0 };
        S.kidBubble = null;
        S.leave = 0; S.time = 0; S.deal = false;
        S.sign = S.who === 'auto' ? PLACE_SIGN[p.place] || 'KOTI' : null;
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
            let sc = c.cat === 'walk' ? (S.price - S.floor <= T.walkNear ? 9 : -9) : (c.cat === S.like ? 4 : 1) + CATS[c.cat].pat * 0.05;
            if (want === 'lose') sc = c.cat === 'walk' ? 10 : c.cat === 'logic' ? 5 : -sc;
            if (sc > bs) { bs = sc; best = i; }
          });
          g.botPress(['c1', 'c2', 'c3'][best]); S.botT = 0.4;
        } else if (S.stage === 'deliver') {
          const v = needle(S), off = Math.abs(v - 0.5);
          if (want === 'lose' ? off > 0.4 : off < S.meter.zone * 0.35) { g.botPress('ok'); S.botT = 0.3; }
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'BHAAV', v: '₹' + S.price, good: S.price <= S.target }, { k: 'TARGET', v: '₹' + S.target }, { k: 'SABR', v: Math.max(0, Math.round(S.patience)) + '%', warn: S.patience < 30 }];
      },
      draw(g, ctx) { drawBargain(g, ctx, g.S); },
      result(g, r) {
        const S = g.S, ride = S.who === 'auto';
        return {
          title: r.win ? (ride ? 'Chalo, baitho!' : 'Deal pakki!') : (ride ? 'Auto chala gaya!' : 'Woh toh mud gaye!'),
          line: r.win ? 'Saved ₹' + (S.start - S.price) + '. Amma will be proud (and will ask for the change).' : 'Next time read him first: ' + hintFor(S.like) + '.',
          rows: [['First price', '₹' + S.start], ['Final price', '₹' + S.price], ['Saved', '₹' + Math.max(0, S.start - S.price)], ['Lines used', S.turns], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.price <= S.target - 2 ? 1 : 0) + (S.patience >= 40 ? 1 : 0) : 0; },
    };
    function who(g) { return WHO[g.params.who] ? g.params.who : 'auto'; }
    /** start / target / floor for this seller; explicit params win. The floor never sits above the target. */
    function prices(g, w, r) {
      const p = g.params, d = WHO[w].price(p, r);
      if (p.target != null) d.target = Math.max(1, Math.round(p.target));
      if (p.start != null) d.start = Math.round(p.start);
      if (p.floor != null) d.floor = Math.round(p.floor);
      d.start = Math.max(d.start, d.target + 2);
      d.floor = Math.max(1, Math.min(d.floor, d.target));
      return d;
    }
    function fill(t, S, g) { return t.replace('{P}', S.price).replace('{T}', S.target).replace('{D}', (g && g.params.dest) || 'Charminar'); }
    function hintFor(like) { return { logic: 'this one wanted plain logic', charm: 'this one melts for pyaar', local: 'this one loves apnapan', filmy: 'this one wanted filmy style' }[like] || 'listen to his first line'; }
    function needle(S) { return 0.5 + 0.5 * Math.sin(S.meter.t * S.meter.speed * Math.PI); }

    function dealCards(g, S) {
      const W_ = S.W, r = g.rng;
      const cats = [];
      while (cats.length < 2) { const c = TYPES[(r.next() * TYPES.length) | 0]; if (!cats.includes(c)) cats.push(c); }
      cats.push(S.price - S.floor <= T.walkNear + 2 || r.next() < 0.4 ? 'walk' : TYPES.find((c) => !cats.includes(c)));
      // Assist: his favourite kind of line is always in the hand
      if (g.assist && !cats.includes(S.like)) cats[cats[0] === 'walk' ? 1 : 0] = S.like;
      for (let i = cats.length - 1; i > 0; i--) { const j = (r.next() * (i + 1)) | 0; [cats[i], cats[j]] = [cats[j], cats[i]]; }
      S.cards = cats.map((cat) => { const L = W_.lines[cat]; return { cat, text: fill(L[(r.next() * L.length) | 0], S, g) }; });
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
      const W_ = S.W, cat = card.cat, k = T.grade[grade];
      S.turns++;
      const L = S.Lay;
      g.pop(grade === 'green' ? 'JAMKE BOLA!' : grade === 'yellow' ? 'theek' : 'atak gaya...', L ? L.kidX : g.W * 0.2, L ? L.kidY - 120 : g.H * 0.6, { size: grade === 'green' ? 22 : 17, color: grade === 'green' ? '#b9ffb0' : grade === 'yellow' ? '#fff' : '#ffb4a6', font: grade === 'green' ? 'display' : 'body' });
      const prev = S.price;
      let text;
      if (grade === 'red') {
        // no effect, and he is annoyed
        S.patience += T.redPatience;
        const pool = W_.bad; text = pool[(g.rng.next() * pool.length) | 0];
      } else if (cat === 'walk') {
        if (S.price - S.floor <= T.walkNear) { S.price = S.floor; text = W_.walkWin; g.sfx('ui_select'); }
        else { S.patience += T.walkFail; text = W_.walkLose; S.walked = true; }
      } else {
        const liked = cat === S.like;
        S.used[cat] = (S.used[cat] || 0) + 1;
        const gap = S.price - S.floor;
        let drop = Math.round(gap * (liked ? T.likedFrac : T.frac) * k);
        if (drop < 1 && gap > 0) drop = 1;
        S.price = Math.max(S.floor, S.price - drop);
        S.patience += CATS[cat].pat * k;
        const pool = liked && grade === 'green' ? W_.good : W_.meh;
        text = pool[(g.rng.next() * pool.length) | 0];
        if (liked) S.likedHits = (S.likedHits || 0) + 1;
      }
      S.patience = Math.min(100, S.patience);
      if (S.price < prev) { S.history.push(S.price); g.sfx('coin', { vol: 0.6 }); }
      S.stage = 'react'; S.st = 0;
      if (S.price <= S.target) {
        S.deal = true;
        say(S, fill(W_.deal, S, g), 'him');
        S.score = (S.start - S.price) * 30 + Math.round(S.patience) * 3 + Math.max(0, 8 - S.turns) * 20;
        g.finish(true, { price: S.price, start: S.start, target: S.target, saved: S.start - S.price, savedPaise: (S.start - S.price) * 100, pricePaise: S.price * 100, who: S.who, like: S.like, delay: 2.0 });
        g.sfx('cash');
        return;
      }
      if (S.patience <= 0) { leave(g, S); return; }
      say(S, fill(text, S, g), 'him');
    }
    function leave(g, S) {
      S.patience = 0; S.leave = 0.001; S.stage = 'gone';
      say(S, S.W.leave, 'him');
      if (S.who === 'auto') { g.sfx('auto_start'); g.sfx('auto_horn', { delay: 0.6 }); }
      g.finish(false, { price: S.price, start: S.start, target: S.target, pricePaise: S.price * 100, who: S.who, like: S.like, delay: 2.2 });
    }

    function step(g, S, dt) {
      S.time += dt; S.st += dt;
      if (S.bubble) S.bubble.t += dt;
      if (S.kidBubble) S.kidBubble.t += dt;
      if (S.leave > 0) S.leave += dt;
      S.shown += (S.price - S.shown) * Math.min(1, dt * 6);
      if (g.over) return;
      if (S.stage === 'intro') { if (S.st > 1.6) { S.stage = 'choose'; S.st = 0; } return; }
      if (S.stage === 'choose' || S.stage === 'deliver') {
        S.patience -= dt * (T.drain0 + g.diff * T.drain1);
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
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.32, 170), Math.max(26, Math.min(48, L.sceneH * 0.13)), { fill: '#f2c230', text: S.sign || 'KOTI', size: Math.max(16, Math.min(32, L.sceneH * 0.09)) });
      } else if (S.who === 'banana') {
        // a colony market lane: shop shutters
        for (let x = 0; x < W; ) { const w = 60 + rng.next() * 60, h = L.sceneH * (0.6 + rng.next() * 0.3); c.fillStyle = ['#e8d9b5', '#c7b9d6', '#bcd3c4', '#e9c6b6'][(rng.next() * 4) | 0]; c.fillRect(x, gy - h, w, h); c.fillStyle = '#7a7a80'; c.fillRect(x + 6, gy - h * 0.45, w - 12, h * 0.45); c.strokeStyle = 'rgba(0,0,0,0.2)'; for (let yy = gy - h * 0.45; yy < gy; yy += 5) { c.beginPath(); c.moveTo(x + 6, yy); c.lineTo(x + w - 6, yy); c.stroke(); } x += w + 4; }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.4, 220), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#f2c230', text: 'TAAZE KELE', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'kite') {
        // Gulzar Houz on Sankranti: a big stone arch, a sky full of kites, strings of kites over the stall
        gr = c.createLinearGradient(0, A.y, 0, gy); gr.addColorStop(0, '#7fc3e8'); gr.addColorStop(1, '#f7e2b0');
        c.fillStyle = gr; c.fillRect(0, 0, W, gy);
        for (let i = 0; i < 14; i++) {
          const kx = rng.next() * W, ky = A.y + 10 + rng.next() * L.sceneH * 0.45, ks = 4 + rng.next() * 6;
          c.fillStyle = ['#e2483a', '#f2c230', '#2a8c82', '#7a3db8', '#e8487c'][i % 5];
          c.beginPath(); c.moveTo(kx, ky - ks); c.lineTo(kx + ks * 0.75, ky); c.lineTo(kx, ky + ks); c.lineTo(kx - ks * 0.75, ky); c.fill();
        }
        const aw = Math.min(W * 0.9, L.sceneH * 1.6), ax = W * 0.5 - aw / 2, ah = L.sceneH * 0.78, top = gy - ah;
        c.fillStyle = '#e4cfa6'; c.fillRect(ax, top, aw, ah);
        c.fillStyle = '#c9ae80'; c.fillRect(ax, top, aw, ah * 0.08);
        // the arch opening (pointed) showing the lane beyond
        const ow = aw * 0.42, ox = W * 0.5 - ow / 2, oh = ah * 0.8;
        c.fillStyle = '#9fc6d8'; c.beginPath(); c.moveTo(ox, gy); c.lineTo(ox, gy - oh * 0.62); c.quadraticCurveTo(ox, gy - oh * 0.95, W * 0.5, gy - oh); c.quadraticCurveTo(ox + ow, gy - oh * 0.95, ox + ow, gy - oh * 0.62); c.lineTo(ox + ow, gy); c.fill();
        c.strokeStyle = '#a88a5c'; c.lineWidth = 4; c.stroke();
        for (let i = 0; i < 2; i++) { const nx = ax + aw * (i ? 0.84 : 0.08), nw = aw * 0.08; c.fillStyle = '#c9ae80'; c.beginPath(); c.moveTo(nx, top + ah * 0.6); c.lineTo(nx, top + ah * 0.3); c.quadraticCurveTo(nx + nw / 2, top + ah * 0.16, nx + nw, top + ah * 0.3); c.lineTo(nx + nw, top + ah * 0.6); c.fill(); }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.42, 230), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#ef8a2a', text: 'GULZAR HOUZ', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'farmer') {
        // Rythu Bazaar: a long green shed, price board, rows of stalls
        c.fillStyle = '#dfe6d2'; c.fillRect(0, gy - L.sceneH * 0.66, W, L.sceneH * 0.66);
        c.fillStyle = '#3c7a4a'; c.beginPath(); c.moveTo(0, gy - L.sceneH * 0.66); c.lineTo(W, gy - L.sceneH * 0.66); c.lineTo(W, gy - L.sceneH * 0.8); c.lineTo(0, gy - L.sceneH * 0.8); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; for (let x = 0; x < W; x += 12) { c.beginPath(); c.moveTo(x, gy - L.sceneH * 0.8); c.lineTo(x, gy - L.sceneH * 0.66); c.stroke(); }
        for (let x = 30; x < W; x += 110) { c.fillStyle = '#5a6a5a'; c.fillRect(x, gy - L.sceneH * 0.66, 6, L.sceneH * 0.66); }
        for (let i = 0; i < 6; i++) { const x = W * (0.04 + i * 0.17); c.fillStyle = ['#c84a3a', '#b88a5a', '#6a3a7a', '#4f8a3a'][i % 4]; c.beginPath(); c.ellipse(x, gy - L.sceneH * 0.12, 26, 10, 0, Math.PI, TAU); c.fill(); }
        const bw = Math.min(W * 0.3, 150), bh = Math.min(L.sceneH * 0.3, 70), bx = W - bw - 16, by = gy - L.sceneH * 0.6;
        c.fillStyle = '#1e3a2a'; c.fillRect(bx, by, bw, bh); c.strokeStyle = '#8a6a3a'; c.lineWidth = 3; c.strokeRect(bx, by, bw, bh);
        ['TOMATO 6', 'ONION 8', 'BRINJAL 7'].forEach((t, i) => H.text(c, t, bx + bw / 2, by + bh * (0.22 + i * 0.28), { font: 'osd', size: Math.max(10, bh * 0.2), color: '#f4efe2', maxW: bw - 10 }));
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.46, 240), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#2f8a3a', text: 'RYTHU BAZAAR', color: '#fff', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'books') {
        // the Koti footpath book bazaar: an old wall with tuition posters
        c.fillStyle = '#d8c8a8'; c.fillRect(0, gy - L.sceneH * 0.72, W, L.sceneH * 0.72);
        c.fillStyle = '#b8a888'; for (let y = gy - L.sceneH * 0.72; y < gy; y += 14) c.fillRect(0, y, W, 1.5);
        const posters = ['TUITION', 'ADMISSIONS', 'EAMCET', 'TYPING', 'SPOKEN ENGLISH', 'ABACUS'];
        for (let i = 0; i < 7; i++) {
          const pw = Math.min(70, W * 0.16), ph = pw * 1.3, px = W * 0.03 + i * W * 0.15 + (rng.next() - 0.5) * 8, py = gy - L.sceneH * 0.66 + rng.next() * 10;
          c.save(); c.translate(px + pw / 2, py + ph / 2); c.rotate((rng.next() - 0.5) * 0.12);
          c.fillStyle = ['#f4efe2', '#f2d84a', '#e9c6b6', '#c8e0f0'][i % 4]; c.fillRect(-pw / 2, -ph / 2, pw, ph);
          c.fillStyle = ['#b22b2b', '#2a4a8a', '#1a1214'][i % 3]; c.fillRect(-pw / 2 + 5, -ph / 2 + 6, pw - 10, ph * 0.18);
          for (let k = 0; k < 4; k++) c.fillRect(-pw / 2 + 6, -ph / 2 + ph * (0.36 + k * 0.13), (pw - 12) * (0.5 + ((i + k) % 3) * 0.2), 2.5);
          H.text(c, posters[i % posters.length], 0, -ph / 2 + 6 + ph * 0.09, { font: 'osd', size: Math.max(8, pw * 0.13), color: '#fff', maxW: pw - 12 });
          c.restore();
        }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.46, 240), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#2a4a8a', text: 'KOTI · OLD BOOKS', color: '#fff', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
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
      if (S.who === 'auto') drawAuto(ctx, S, L, g); else if (S.who === 'banana' || S.who === 'flower') drawCart(ctx, S, L, g); else drawStall(ctx, S, L, g);
      // price slate
      drawSlate(ctx, S, L, g);
      // the kid
      H.kidBack(ctx, L.kidX, L.kidY, L.sc * 1.35, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      // bubbles
      if (S.bubble && S.bubble.t < 3.5 && !(S.kidBubble && S.stage === 'deliver')) {
        const bx = S.who === 'auto' ? L.vx + 10 * L.sc : L.vx, by = L.ground - 150 * L.sc;
        bubble(ctx, g, S.bubble.text, bx, by, S.bubble.t, S.patience < 35 ? '#ffe6dc' : '#fff8e6', 'right');
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
      if (!(S.stage === 'choose' || S.stage === 'deliver' || S.stage === 'intro' || S.stage === 'react')) return;
      const n = S.cards.length, pad = 12;
      for (let i = 0; i < n; i++) {
        let x, y, w, h;
        if (P) { w = W - pad * 2; h = (L.cardsH - pad * (n + 1)) / n; x = pad; y = L.cardsY + pad + i * (h + pad); }
        else { w = (Math.min(W, 900) - pad * (n + 1)) / n; h = L.cardsH - pad * 2; x = (W - Math.min(W, 900)) / 2 + pad + i * (w + pad); y = L.cardsY + pad; }
        S.cardRects.push({ x, y, w, h });
        const c = S.cards[i], C = CATS[c.cat];
        const chosen = S.stage === 'deliver' && S.pick === c, dim = (S.stage === 'deliver' && !chosen) || S.stage === 'intro' || S.stage === 'react';
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
      let tx = sx + 8;
      const ty = sy + h * 0.24, hs = h * 0.26;
      for (const p of hist) {
        const s = '₹' + p;
        ctx.font = H.font('osd', hs);
        const tw = ctx.measureText(s).width;
        if (tx + tw > sx + w - 4) break;
        H.text(ctx, s, tx, ty, { font: 'osd', size: hs, color: 'rgba(255,255,255,0.55)', align: 'left' });
        ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 3); ctx.lineTo(tx + tw + 2, ty - 4); ctx.stroke();
        tx += tw + 8;
      }
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

    /** a seller from the waist up, in the cart's local units (head r 12 at y-48 above the shoulders at y). */
    function vendorFig(ctx, x, y, o) {
      const sk = o.skin || '#8a5a35';
      ctx.fillStyle = o.shirt || '#e8e2d2'; H.rr(ctx, x - 15, y - 36, 30, 40, 7); ctx.fill();
      if (o.drape) { ctx.fillStyle = o.drape; ctx.beginPath(); ctx.moveTo(x - 15, y - 34); ctx.lineTo(x - 6, y - 36); ctx.lineTo(x + 15, y + 2); ctx.lineTo(x + 4, y + 4); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = sk; ctx.beginPath(); ctx.arc(x, y - 48, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = o.hair || '#1a1412';
      if (o.back) { ctx.beginPath(); ctx.arc(x, y - 48, 12.5, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x, y - 52, 12.5, Math.PI, TAU); ctx.fill(); }
      if (o.bun) { ctx.beginPath(); ctx.arc(x + 10, y - 56, 6, 0, TAU); ctx.fill(); }
      if (o.cap) { ctx.fillStyle = o.cap; ctx.beginPath(); ctx.arc(x, y - 54, 12, Math.PI, TAU); ctx.fill(); ctx.fillRect(x - 12, y - 55, 24, 3); }
      if (o.back) return;
      if (o.beard) { ctx.fillStyle = o.beard; ctx.beginPath(); ctx.arc(x, y - 44, 10, 0.1, Math.PI - 0.1); ctx.fill(); }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(x - 5, y - 51, 3, 3); ctx.fillRect(x + 3, y - 51, 3, 3);
      if (o.glasses) { ctx.strokeStyle = '#1a1412'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x - 3.5, y - 49.5, 3.6, 0, TAU); ctx.moveTo(x + 8.1, y - 49.5); ctx.arc(x + 4.5, y - 49.5, 3.6, 0, TAU); ctx.moveTo(x - 0.1, y - 50); ctx.lineTo(x + 0.9, y - 50); ctx.stroke(); }
      if (o.moustache) { ctx.fillStyle = o.beard || '#1a1412'; ctx.beginPath(); ctx.moveTo(x - 7, y - 43); ctx.quadraticCurveTo(x, y - 47, x + 7, y - 43); ctx.quadraticCurveTo(x, y - 40, x - 7, y - 43); ctx.fill(); }
      else if (!o.beard) { ctx.strokeStyle = '#4a2a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y - 45, 3.5, 0.3, Math.PI - 0.3); ctx.stroke(); }
      if (o.bindi) { ctx.fillStyle = '#c8202a'; ctx.beginPath(); ctx.arc(x, y - 56, 1.6, 0, TAU); ctx.fill(); }
    }

    // kite stall (Gulzar Houz), vegetable heaps (Rythu Bazaar), footpath books (Koti)
    function drawStall(ctx, S, L, g) {
      const sc = L.sc, x = L.vx, y = L.ground, t = S.time;
      const back = S.leave > 0.35;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 92, 7, 0, 0, TAU); ctx.fill();
      if (S.who === 'kite') {
        // a string of kites over the stall
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-100, -170); ctx.quadraticCurveTo(0, -150, 100, -170); ctx.stroke();
        const cols = ['#e2483a', '#f2c230', '#2a8c82', '#7a3db8', '#e8487c', '#3b6fc4', '#ef8a2a'];
        for (let i = 0; i < 7; i++) {
          const kx = -84 + i * 28, ky = -158 + Math.abs(i - 3) * -2.4 + 18, sw = Math.sin(t * 1.6 + i) * 0.12;
          ctx.save(); ctx.translate(kx, ky - 16); ctx.rotate(sw);
          ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 15); ctx.lineTo(0, 32); ctx.lineTo(-11, 15); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 32); ctx.moveTo(-11, 15); ctx.quadraticCurveTo(0, 9, 11, 15); ctx.stroke();
          ctx.fillStyle = cols[(i + 3) % 7]; ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(4, 40); ctx.lineTo(-4, 40); ctx.fill();
          ctx.restore();
        }
        vendorFig(ctx, -8, -56, { shirt: '#f4efe2', cap: '#ffffff', beard: '#e4e0d8', moustache: true, skin: '#8a5a35', back });
        // the table: kites fanned out, charkhis of cotton saddi
        ctx.fillStyle = '#8a5a34'; ctx.fillRect(-82, -42, 164, 12); ctx.fillStyle = '#6a3a24'; ctx.fillRect(-76, -30, 7, 30); ctx.fillRect(69, -30, 7, 30);
        for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(-50, -44); ctx.rotate(-0.5 + i * 0.25); ctx.fillStyle = cols[(i + 1) % 7]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -14); ctx.lineTo(0, -30); ctx.lineTo(-10, -14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
        for (let i = 0; i < 3; i++) {
          const cx = 22 + i * 20, cy = -54;
          ctx.fillStyle = '#c89a5a'; ctx.fillRect(cx - 8, cy - 2, 16, 14); ctx.fillStyle = ['#e8487c', '#f4efe2', '#e2483a'][i]; ctx.fillRect(cx - 7, cy + 1, 14, 8);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx - 7, cy + 2 + k * 2); ctx.lineTo(cx + 7, cy + 2 + k * 2); ctx.stroke(); }
          ctx.fillStyle = '#6a3a24'; ctx.fillRect(cx - 2, cy + 12, 4, 6);
        }
      } else if (S.who === 'farmer') {
        vendorFig(ctx, 10, -30, { shirt: '#2f8a3a', drape: '#ef8a2a', bun: true, bindi: true, skin: '#7a4a2a', back });
        // a hand scale hanging from the shed
        ctx.strokeStyle = '#4a4450'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(62, -120); ctx.lineTo(62, -98); ctx.moveTo(46, -98); ctx.lineTo(78, -98 + Math.sin(t * 2) * 1.5); ctx.moveTo(48, -98); ctx.lineTo(48, -84); ctx.moveTo(76, -98); ctx.lineTo(76, -84); ctx.stroke();
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.ellipse(48, -82, 8, 2.5, 0, 0, TAU); ctx.ellipse(76, -82, 8, 2.5, 0, 0, TAU); ctx.fill();
        // gunny sack + heaps
        ctx.fillStyle = '#b89a6a'; H.rr(ctx, -96, -22, 192, 22, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 1; for (let k = -92; k < 92; k += 6) { ctx.beginPath(); ctx.moveTo(k, -22); ctx.lineTo(k + 3, 0); ctx.stroke(); }
        const heap = (hx, n, r, col, shine) => { let k = 0; for (let row = 0; row < n; row++) for (let j = 0; j < n - row; j++) { const px = hx + (j - (n - row - 1) / 2) * r * 1.8, py = -24 - row * r * 1.5; ctx.fillStyle = col[(k++) % col.length]; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); if (shine) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.25, 0, TAU); ctx.fill(); } } };
        heap(-64, 4, 6, ['#d8302a', '#c8282a', '#e2483a'], true);
        heap(-18, 4, 5.5, ['#c06a8a', '#b25a7a', '#d08aa0'], false);
        for (let i = 0; i < 5; i++) { const bx = 24 + (i % 3) * 13, by = -28 - ((i / 3) | 0) * 9; ctx.fillStyle = '#5a2a6a'; ctx.beginPath(); ctx.ellipse(bx, by, 7, 4.5, 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#3c7a3a'; ctx.beginPath(); ctx.arc(bx - 6, by - 2, 2.5, 0, TAU); ctx.fill(); }
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#3c8a3a' : '#4fa04a'; ctx.beginPath(); ctx.ellipse(76 + i * 4, -30 - (i % 2) * 4, 6, 9, -0.3 + i * 0.2, 0, TAU); ctx.fill(); }
      } else {
        // books: the book man on his stool, stacks on a blue tarp
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(40, -24, 4, 24); ctx.fillRect(58, -24, 4, 24); ctx.fillRect(36, -28, 30, 5);
        vendorFig(ctx, 50, -34, { shirt: '#c8d8e8', glasses: true, moustache: true, hair: '#4a4a4a', skin: '#8a5a35', back });
        ctx.fillStyle = '#2a5a9a'; ctx.beginPath(); ctx.moveTo(-104, 0); ctx.lineTo(34, 0); ctx.lineTo(28, -16); ctx.lineTo(-96, -16); ctx.closePath(); ctx.fill();
        const spines = ['#b22b2b', '#2a8c82', '#f2c230', '#3b6fc4', '#e8e2d2', '#7a3db8', '#ef8a2a', '#4f7a3a'];
        for (let s = 0; s < 5; s++) {
          const n = 4 + ((s * 3) % 4), bx = -90 + s * 24;
          for (let k = 0; k < n; k++) { const w = 20 - ((s + k) % 3) * 2, h = 5; ctx.fillStyle = spines[(s * 5 + k * 3) % spines.length]; ctx.fillRect(bx + ((k * 7) % 3) - 1, -8 - (k + 1) * h, w, h - 0.8); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(bx + 3, -8 - (k + 1) * h + 1.5, w * 0.4, 1); }
        }
        ctx.fillStyle = '#f4efe2'; ctx.save(); ctx.translate(-20, -60); ctx.rotate(-0.08); ctx.fillRect(-18, -9, 36, 18); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1; ctx.strokeRect(-18, -9, 36, 18);
        H.text(ctx, '½ PRICE', 0, 0.5, { font: 'osd', size: 10, color: '#b22b2b', maxW: 32 }); ctx.restore();
      }
      ctx.restore();
    }

    MG.register(def);
  }
