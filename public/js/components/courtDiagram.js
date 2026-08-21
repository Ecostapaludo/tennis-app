// Gera um pequeno diagrama SVG esquemático de quadra de tênis, destacando a(s)
// zona(s) de quadra do drill (campo "court_zone", texto livre em português vindo
// da biblioteca de drills). Nao depende de nenhuma API de imagem -- e um
// esquema, nao uma ilustracao fotorrealista.
//
// Cores fixas em hex (nao usar var() aqui -- SVG inline via innerHTML nao
// resolve custom properties do :root de forma confiavel neste app, ver
// components/charts.js para o mesmo motivo).
const SURFACE = '#0b2a30';
const LINE = 'rgba(240, 149, 46, 0.35)';
const NET = '#f0952e';

// Coordenadas do esquema (viewBox 0 0 200 400, orientacao retrato)
const C = { oL: 10, oR: 190, t: 10, b: 390, sL: 32, sR: 168, net: 200, svT: 98, svB: 302, cx: 100 };

const ZONE_DEFS = {
  quadraInteira: { color: '#4a95e8', opacity: 0.18, rects: [[C.oL, C.t, C.oR - C.oL, C.b - C.t]] },
  fundo: { color: '#eb6834', opacity: 0.38, rects: [[C.sL, C.t, C.sR - C.sL, C.svT - C.t], [C.sL, C.svB, C.sR - C.sL, C.b - C.svB]] },
  meiaQuadra: { color: '#1baf7a', opacity: 0.38, rects: [[C.sL, 70, C.sR - C.sL, 60], [C.sL, 270, C.sR - C.sL, 60]] },
  zonaSaque: { color: '#eda100', opacity: 0.38, rects: [[C.sL, C.svT, C.cx - C.sL, C.svB - C.svT], [C.cx, C.svT, C.sR - C.cx, C.svB - C.svT]] },
  cantos: { color: '#e87ba4', opacity: 0.42, rects: [[C.sL, C.t, 44, 44], [C.sR - 44, C.t, 44, 44], [C.sL, C.b - 44, 44, 44], [C.sR - 44, C.b - 44, 44, 44]] },
  centro: { color: '#2fbf2f', opacity: 0.32, rects: [[85, C.t, 30, C.b - C.t]] },
  corredorDuplas: { color: '#8b7ae8', opacity: 0.42, rects: [[C.oL, C.t, C.sL - C.oL, C.b - C.t], [C.sR, C.t, C.oR - C.sR, C.b - C.t]] },
  rede: { color: '#e34948', opacity: 0.42, rects: [[C.oL, 180, C.oR - C.oL, 40]] },
  curta: { color: '#eda100', opacity: 0.55, rects: [[C.sL, 160, C.sR - C.sL, 40], [C.sL, 200, C.sR - C.sL, 40]] },
};

function matchZones(text) {
  const t = (text || '').toLowerCase();
  const zones = new Set();
  if (!t || /quadra inteira|quadra total|quadra dividida/.test(t)) zones.add('quadraInteira');
  if (/corredor de duplas|linha lateral|lateral/.test(t)) zones.add('corredorDuplas');
  if (/zona de saque|linha de saque/.test(t)) zones.add('zonaSaque');
  if (/meia-?quadra/.test(t)) zones.add('meiaQuadra');
  if (/rede/.test(t)) zones.add('rede');
  if (/fundo|linha de base|baseline/.test(t)) zones.add('fundo');
  if (/curta/.test(t)) zones.add('curta');
  if (/centro/.test(t)) zones.add('centro');
  if (/cantos?|quinas?/.test(t)) zones.add('cantos');
  const hasDiagonal = /diagonal|cruzad/.test(t);
  if (!zones.size) zones.add('quadraInteira');
  return { zones: Array.from(zones), hasDiagonal };
}

function baseCourtSVG() {
  return `
    <rect x="${C.oL}" y="${C.t}" width="${C.oR - C.oL}" height="${C.b - C.t}" fill="${SURFACE}" stroke="${LINE}" stroke-width="1.5"/>
    <line x1="${C.sL}" y1="${C.t}" x2="${C.sL}" y2="${C.b}" stroke="${LINE}" stroke-width="1"/>
    <line x1="${C.sR}" y1="${C.t}" x2="${C.sR}" y2="${C.b}" stroke="${LINE}" stroke-width="1"/>
    <line x1="${C.sL}" y1="${C.svT}" x2="${C.sR}" y2="${C.svT}" stroke="${LINE}" stroke-width="1"/>
    <line x1="${C.sL}" y1="${C.svB}" x2="${C.sR}" y2="${C.svB}" stroke="${LINE}" stroke-width="1"/>
    <line x1="${C.cx}" y1="${C.svT}" x2="${C.cx}" y2="${C.svB}" stroke="${LINE}" stroke-width="1"/>
    <line x1="${C.oL}" y1="${C.net}" x2="${C.oR}" y2="${C.net}" stroke="${NET}" stroke-width="2.5"/>
  `;
}

let uid = 0;

export function courtDiagramSVG(courtZone) {
  const { zones, hasDiagonal } = matchZones(courtZone);
  const overlays = zones
    .filter((z) => ZONE_DEFS[z])
    .map((z) => {
      const def = ZONE_DEFS[z];
      return def.rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${def.color}" fill-opacity="${def.opacity}" rx="2"/>`).join('');
    })
    .join('');
  const arrowId = `court-arrow-${uid++}`;
  const diagonalSVG = hasDiagonal ? `
    <line x1="${C.sL}" y1="${C.t}" x2="${C.sR}" y2="${C.b}" stroke="#eda100" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>
  ` : '';
  return `<svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
    <defs>
      <marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#eda100"/>
      </marker>
    </defs>
    ${baseCourtSVG()}
    ${overlays}
    ${diagonalSVG}
  </svg>`;
}
