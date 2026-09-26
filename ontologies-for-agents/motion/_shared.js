/* Declarative choreography on one shared timeline.
   <el data-in="12" data-out="40" data-fx="rise" data-ramp="3">
   data-in / data-out are percentages of the loop (--T). data-fx picks the effect:
   rise | fade | scale | pop | draw (SVG stroke) | dim | glow | hl (highlight)   */
(function () {
  const FX = {
    rise:  ['opacity:0;transform:translateY(14px)', 'opacity:1;transform:translateY(0)'],
    fade:  ['opacity:0', 'opacity:1'],
    scale: ['opacity:0;transform:scale(.85)', 'opacity:1;transform:scale(1)'],
    pop:   ['opacity:0;transform:scale(.5)', 'opacity:1;transform:scale(1)'],
    draw:  ['stroke-dashoffset:1', 'stroke-dashoffset:0'],
    dim:   ['opacity:.45', 'opacity:1'],
    glow:  ['filter:drop-shadow(0 0 0px transparent)', 'filter:drop-shadow(0 0 12px currentColor)'],
    hl:    ['background-color:rgba(45,212,191,0)', 'background-color:rgba(45,212,191,.28)'],
    hlbad: ['background-color:rgba(248,113,113,0)', 'background-color:rgba(248,113,113,.3)'],
    hlwarm:['background-color:rgba(245,165,36,0)', 'background-color:rgba(245,165,36,.3)'],
  };
  const css = []; let n = 0;
  const clamp = v => Math.max(0, Math.min(100, v));
  document.querySelectorAll('[data-in],[data-out]').forEach(el => {
    const hasIn = el.dataset.in !== undefined, hasOut = el.dataset.out !== undefined;
    const i = parseFloat(el.dataset.in), o = parseFloat(el.dataset.out);
    const r = parseFloat(el.dataset.ramp ?? 3);
    const [hidden, shown] = FX[el.dataset.fx || 'rise'];
    const stops = [];
    if (hasIn) {
      stops.push(`0%{${hidden}}`);
      if (i > 0) stops.push(`${clamp(i)}%{${hidden}}`);
      stops.push(`${clamp(i + r)}%{${shown}}`);
    } else stops.push(`0%{${shown}}`);
    if (hasOut) { stops.push(`${clamp(o)}%{${shown}}`); stops.push(`${clamp(o + r)}%{${hidden}}`); stops.push(`100%{${hidden}}`); }
    else stops.push(`100%{${shown}}`);
    const name = 'k' + (n++);
    css.push(`@keyframes ${name}{${stops.join('')}}`);
    const cur = getComputedStyle(el).animationName;
    el.style.animationName = (cur && cur !== 'none') ? cur + ',' + name : name; el.classList.add('a');
    if ((el.dataset.fx || '') === 'draw') { el.setAttribute('pathLength', '1'); el.style.strokeDasharray = '1'; }
  });
  const s = document.createElement('style'); s.textContent = css.join('\n'); document.head.appendChild(s);
})();
