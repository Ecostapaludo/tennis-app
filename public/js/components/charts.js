// Graficos SVG customizados, sem dependencias externas.
// Segue a metodologia da skill de dataviz: paleta categorica fixa, marcas finas,
// grid discreto, legenda para 2+ series, tooltip no hover.

const NS = 'http://www.w3.org/2000/svg';
const PALETTE = ['#4a95e8', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#2fbf2f', '#8b7ae8', '#e34948'];
const GRID = 'rgba(240, 149, 46, 0.16)';
const MUTED = '#9b7346';
const INK = '#f0952e';
const SURFACE = '#103a42';

export function seriesColor(i) { return PALETTE[i % PALETTE.length]; }

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null) el.setAttribute(k, v); });
  return el;
}

function getTooltip() {
  let tip = document.getElementById('viz-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'viz-tooltip';
    tip.className = 'viz-tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

function showTooltip(evt, html) {
  const tip = getTooltip();
  tip.innerHTML = html;
  tip.classList.add('show');
  moveTooltip(evt);
}
function moveTooltip(evt) {
  const tip = getTooltip();
  tip.style.left = `${evt.clientX + 14}px`;
  tip.style.top = `${evt.clientY + 14}px`;
}
function hideTooltip() {
  getTooltip().classList.remove('show');
}

function legendEl(items) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  items.forEach(({ label, color }) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${label}`;
    wrap.appendChild(item);
  });
  return wrap;
}

function niceTicks(max) {
  if (max <= 10) return [0, 2, 4, 6, 8, 10];
  const step = Math.ceil(max / 5 / 5) * 5;
  const ticks = [];
  for (let v = 0; v <= step * 5; v += step) ticks.push(v);
  return ticks;
}

// ---------------------------------------------------------------------------
// Line chart -- evolucao ao longo do tempo (0-10 por padrao)
// ---------------------------------------------------------------------------
export function lineChart(container, { categories, series, yMax = 10, yMin = 0, height = 260, valueSuffix = '' }) {
  container.innerHTML = '';
  const W = 640, H = height;
  const padL = 32, padR = 16, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, style: 'overflow:visible;display:block' });

  const ticks = niceTicks(yMax);
  const yScale = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const xScale = (i) => categories.length <= 1 ? padL + plotW / 2 : padL + (i / (categories.length - 1)) * plotW;

  ticks.forEach((t) => {
    const y = yScale(t);
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
    svg.appendChild(svgEl('text', { x: padL - 8, y: y + 3, 'text-anchor': 'end', 'font-size': 10, fill: MUTED }, ))
      .textContent = t;
  });

  // eixo x (poucas labels para nao poluir)
  const xLabelStep = Math.ceil(categories.length / 6) || 1;
  categories.forEach((c, i) => {
    if (i % xLabelStep !== 0 && i !== categories.length - 1) return;
    const t = svgEl('text', { x: xScale(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: MUTED });
    t.textContent = c;
    svg.appendChild(t);
  });

  series.forEach((s, si) => {
    const color = s.color || seriesColor(si);
    let d = '';
    let started = false;
    s.data.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      const x = xScale(i), y = yScale(v);
      d += `${started ? 'L' : 'M'}${x},${y} `;
      started = true;
    });
    if (d) svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

    s.data.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const x = xScale(i), y = yScale(v);
      const hit = svgEl('circle', { cx: x, cy: y, r: 8, fill: 'transparent', style: 'cursor:pointer' });
      const dot = svgEl('circle', { cx: x, cy: y, r: 3.5, fill: color, stroke: SURFACE, 'stroke-width': 2 });
      hit.addEventListener('mousemove', (e) => showTooltip(e, `<strong>${s.label}</strong><br>${categories[i]}: ${v}${valueSuffix}`));
      hit.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(dot);
      svg.appendChild(hit);
    });

    // label direto no ultimo ponto (ate 4 series)
    if (series.length <= 4) {
      for (let i = s.data.length - 1; i >= 0; i--) {
        if (s.data[i] === null || s.data[i] === undefined) continue;
        const x = xScale(i), y = yScale(s.data[i]);
        const t = svgEl('text', { x: x + 8, y: y + 3, 'font-size': 10, fill: color, 'font-weight': 700 });
        t.textContent = s.data[i];
        svg.appendChild(t);
        break;
      }
    }
  });

  container.appendChild(svg);
  if (series.length > 1) {
    container.appendChild(legendEl(series.map((s, i) => ({ label: s.label, color: s.color || seriesColor(i) }))));
  }
}

// ---------------------------------------------------------------------------
// Radar chart -- foto atual de habilidades (comparando ate 2 series)
// ---------------------------------------------------------------------------
export function radarChart(container, { axes, series, max = 10, size = 320 }) {
  container.innerHTML = '';
  const W = size, H = size;
  const cx = W / 2, cy = H / 2 - 6;
  const R = Math.min(W, H) / 2 - 46;
  const n = axes.length;
  const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: size, style: 'overflow:visible;display:block' });

  [0.25, 0.5, 0.75, 1].forEach((frac) => {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = angleFor(i % n);
      const x = cx + Math.cos(a) * R * frac, y = cy + Math.sin(a) * R * frac;
      d += `${i === 0 ? 'M' : 'L'}${x},${y} `;
    }
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: GRID, 'stroke-width': 1 }));
  });

  axes.forEach((ax, i) => {
    const a = angleFor(i);
    const x2 = cx + Math.cos(a) * R, y2 = cy + Math.sin(a) * R;
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2, y2, stroke: GRID, 'stroke-width': 1 }));
    const lx = cx + Math.cos(a) * (R + 26), ly = cy + Math.sin(a) * (R + 26);
    const t = svgEl('text', {
      x: lx, y: ly, 'text-anchor': Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end'),
      'font-size': 10.5, fill: MUTED, 'dominant-baseline': 'middle',
    });
    t.textContent = ax.label;
    svg.appendChild(t);
  });

  series.forEach((s, si) => {
    const color = s.color || seriesColor(si);
    let d = '';
    const pts = [];
    axes.forEach((ax, i) => {
      const v = s.values[ax.key];
      const val = v === null || v === undefined ? 0 : v;
      const a = angleFor(i);
      const r = (Math.min(val, max) / max) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      pts.push({ x, y, v, label: ax.label });
      d += `${i === 0 ? 'M' : 'L'}${x},${y} `;
    });
    d += 'Z';
    svg.appendChild(svgEl('path', { d, fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    pts.forEach((p) => {
      const hit = svgEl('circle', { cx: p.x, cy: p.y, r: 8, fill: 'transparent', style: 'cursor:pointer' });
      const dot = svgEl('circle', { cx: p.x, cy: p.y, r: 3.5, fill: color, stroke: SURFACE, 'stroke-width': 2 });
      hit.addEventListener('mousemove', (e) => showTooltip(e, `<strong>${s.label}</strong><br>${p.label}: ${p.v ?? '-'}`));
      hit.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(dot);
      svg.appendChild(hit);
    });
  });

  container.appendChild(svg);
  if (series.length > 1) {
    container.appendChild(legendEl(series.map((s, i) => ({ label: s.label, color: s.color || seriesColor(i) }))));
  }
}

// ---------------------------------------------------------------------------
// Bar chart -- categorias no eixo x, 1+ series agrupadas
// ---------------------------------------------------------------------------
export function barChart(container, { categories, series, height = 240, yMax, valueSuffix = '' }) {
  container.innerHTML = '';
  const W = 640, H = height;
  const padL = 34, padR = 16, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const computedMax = yMax || Math.max(1, ...series.flatMap((s) => s.data.map((v) => v || 0))) * 1.15;
  const ticks = niceTicks(computedMax);
  const realMax = ticks[ticks.length - 1] || computedMax;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, style: 'overflow:visible;display:block' });

  const yScale = (v) => padT + plotH - (v / realMax) * plotH;
  ticks.forEach((t) => {
    const y = yScale(t);
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
    const lbl = svgEl('text', { x: padL - 8, y: y + 3, 'text-anchor': 'end', 'font-size': 10, fill: MUTED });
    lbl.textContent = t;
    svg.appendChild(lbl);
  });

  const groupW = plotW / categories.length;
  const barGap = 2;
  const nSeries = series.length;
  const maxBarW = 24;
  const barW = Math.min(maxBarW, (groupW - 12 - barGap * (nSeries - 1)) / nSeries);

  categories.forEach((cat, ci) => {
    const groupX = padL + ci * groupW + groupW / 2;
    const totalW = barW * nSeries + barGap * (nSeries - 1);
    series.forEach((s, si) => {
      const v = s.data[ci];
      if (v === null || v === undefined) return;
      const x = groupX - totalW / 2 + si * (barW + barGap);
      const y = yScale(v);
      const barH = padT + plotH - y;
      const color = s.color || seriesColor(si);
      const rect = svgEl('rect', { x, y, width: barW, height: Math.max(barH, 1), rx: 4, ry: 4, fill: color, style: 'cursor:pointer' });
      rect.addEventListener('mousemove', (e) => showTooltip(e, `<strong>${s.label}</strong><br>${cat}: ${v}${valueSuffix}`));
      rect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(rect);
    });
    const t = svgEl('text', { x: groupX, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: MUTED });
    t.textContent = cat;
    svg.appendChild(t);
  });

  container.appendChild(svg);
  if (series.length > 1) {
    container.appendChild(legendEl(series.map((s, i) => ({ label: s.label, color: s.color || seriesColor(i) }))));
  }
}

export function statTile(container, { label, value, delta, deltaUp }) {
  const wrap = document.createElement('div');
  wrap.className = 'stat-tile';
  wrap.innerHTML = `
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    ${delta ? `<div class="delta ${deltaUp ? 'up' : 'down'}">${delta}</div>` : ''}
  `;
  container.appendChild(wrap);
}
