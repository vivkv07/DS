/* baseline: the harness itself + the extension API surface */
module.exports = {
  name: 'baseline', order: 0,
  async run(T) {
    const api = await T.ev(() => { const X = N.audio.ext; return X ? ['registerSfx', 'registerInst', 'registerTrack', 'setEngineVoice', 'onUpdate', 'bus', 'listener', 'spatial'].filter((k) => typeof X[k] !== 'function') : null; });
    T.check(api && api.length === 0, 'N.audio.ext API present', api);
    const r = await T.L.renderFn(T.page, `(oc, out, t, X) => X.P.tone(oc, out, t, { f: 440, a: 0.01, h: 0.5, r: 0.2, v: 0.5 })`, 1.2);
    const m = T.L.save(r, 'baseline_sine440');
    T.check(m && m.peakDb > -8 && m.peakDb < -4 && m.clicks === 0, 'harness renders a clean 440 Hz tone', m);
    T.check(m && Math.abs(m.centroid - 440) < 60, 'spectral centroid of a sine is its frequency', m && m.centroid);
  },
};
