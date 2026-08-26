// Gera um diagrama SVG esquematico de quadra de tenis para os drills da
// biblioteca. Nao depende de nenhuma API de imagem -- e um esquema tatico,
// nao uma ilustracao fotorrealista, montado a partir do texto ja cadastrado
// do drill (nome + zona da quadra + descricao completa).
//
// Cores fixas em hex (nao usar var() aqui -- SVG inline via innerHTML nao
// resolve custom properties do :root de forma confiavel neste app, ver
// components/charts.js para o mesmo motivo).
const SURFACE = '#0b2a30';
const LINE = 'rgba(94, 200, 247, 0.35)';
const NET = '#5ec8f7';

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
  rede: { color: '#e34948', opacity: 0.42, rects: [[C.oL, 178, C.oR - C.oL, 44]] },
  curta: { color: '#eda100', opacity: 0.55, rects: [[C.sL, 150, C.sR - C.sL, 50], [C.sL, 200, C.sR - C.sL, 50]] },
};

// Ordem de prioridade quando o texto casa com varias zonas ao mesmo tempo
// (comum: um drill menciona "linha de saque" na descricao do objetivo E
// "quadra inteira" numa fase de progressao mais adiante) -- zonas mais
// especificas contam mais pra "entender o exercicio de relance" do que a
// zona generica, entao "quadra inteira" so aparece se for a UNICA pista.
const ZONE_PRIORITY = ['cantos', 'curta', 'rede', 'corredorDuplas', 'zonaSaque', 'centro', 'meiaQuadra', 'fundo', 'quadraInteira'];
const MAX_ZONES = 2;

// Casa palavras-chave (em portugues, texto livre vindo da biblioteca) com as
// zonas visuais acima. Recebe o texto JA COMBINADO (nome + zona + descricao)
// -- muitos drills (principalmente os de mini-tenis) tem o campo "zona da
// quadra" preenchido so com o TAMANHO da quadra (ex: "Quadra Completa Oficial
// (78ft)"), sem nenhuma pista de alvo; nesses casos a pista real esta no
// nome/descricao (ex: "Voleio na Fita", "Approach"), entao so olhar o campo
// de zona sozinho deixava a maioria dos diagramas genericos (quadra inteira).
function matchZones(text) {
  const t = (text || '').toLowerCase();
  const matched = new Set();
  if (/rede\b|voleio|vôlei|na fita|volei de/.test(t)) matched.add('rede');
  if (/corredor de duplas|corredor\b/.test(t)) matched.add('corredorDuplas');
  if (/zona de saque|linha de saque|área de saque|quadrante de saque|box de saque/.test(t)) matched.add('zonaSaque');
  if (/meia-?quadra|transição|split step|approach curto/.test(t)) matched.add('meiaQuadra');
  if (/fundo|linha de base|baseline|rally longo|troca de fundo/.test(t)) matched.add('fundo');
  if (/\bcurta\b|drop ?shot|amortecid|bola curta/.test(t)) matched.add('curta');
  if (/\bcentro\b|meio da quadra|quadrante central/.test(t)) matched.add('centro');
  if (/cantos?\b|quinas?\b/.test(t)) matched.add('cantos');
  if (/quadra inteira|quadra total|quadra dividida/.test(t)) matched.add('quadraInteira');

  // "quadra inteira" so sobrevive se nao houver nenhuma pista mais especifica
  if (matched.size > 1) matched.delete('quadraInteira');
  // no maximo MAX_ZONES destacadas ao mesmo tempo, priorizando as mais
  // especificas -- evita empilhar 3-4 retangulos coloridos sobrepostos
  const zones = matched.size > MAX_ZONES
    ? ZONE_PRIORITY.filter((z) => matched.has(z)).slice(0, MAX_ZONES)
    : Array.from(matched);
  if (!zones.length) zones.push('quadraInteira');

  const hasDiagonal = /diagonal|cruzad/.test(t);
  const hasParallel = !hasDiagonal && /paralela|linha reta|down.?the.?line|ao longo da linha/.test(t);
  return { zones, hasDiagonal, hasParallel };
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

// PRNG determinístico simples (Park-Miller LCG) -- gera sempre os mesmos
// valores para o mesmo id de drill, so pra dar variedade visual entre drills
// que compartilham a mesma zona (sem foto real, e so decorativo/ilustrativo).
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PLAYER_COLOR = '#4a95e8';
const PARTNER_COLOR = '#eb6834';
const TARGET_COLOR = '#eda100';

function marker(cx, cy, label, color) {
  return `
    <circle cx="${cx}" cy="${cy}" r="10" fill="${color}" fill-opacity="0.9" stroke="#0b2a30" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + 3.8}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>
  `;
}

function targetSVG(cx, cy) {
  // Rotulo "Alvo" deslocado pra fora do circulo, pro lado que sobra mais
  // espaco dentro do viewBox (evita cortar o texto perto das bordas).
  const labelX = cx > 100 ? cx - 16 : cx + 16;
  const anchor = cx > 100 ? 'end' : 'start';
  return `
    <circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${TARGET_COLOR}" stroke-width="1.5" stroke-opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="${TARGET_COLOR}" stroke-width="1.5" stroke-opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="1.8" fill="${TARGET_COLOR}"/>
    <text x="${labelX}" y="${cy + 3}" font-size="9.5" font-weight="600" fill="${TARGET_COLOR}" text-anchor="${anchor}">Alvo</text>
  `;
}

// Detecta se o drill realmente tem um alvo/trajetoria definidos (zona
// especifica e/ou pistas de direcao no texto) -- drills genericos (sem
// nenhuma pista de direcao, ex: um drill fisico de deslocamento puro) nao
// ganham trajetoria/alvo fabricados, so a posicao do aluno.
// Usa a MESMA zona ja decidida por matchZones (em vez de re-varrer o texto com
// outro conjunto de palavras-chave) pra nunca discordar dela -- zona
// especifica encontrada (rede, cantos, zona de saque, etc.) e prova suficiente
// de alvo; sem zona especifica, so uma pista de direcao clara (alvo/diagonal/
// paralela/mira/profundidade) libera a trajetoria.
function hasSpecificTarget(zones, combinedText) {
  const hasSpecificZone = !(zones.length === 1 && zones[0] === 'quadraInteira');
  const hasDirectionalCue = /alvo|cruzad|paralel|diagonal|colocaç|direç\w*|\bmira\b|profund/.test(combinedText);
  return hasSpecificZone || hasDirectionalCue;
}

// Detecta um padrao de MOVIMENTACAO do aluno no texto do drill -- so desenha
// a seta de deslocamento quando o texto realmente descreve um movimento
// (lateral, subida a rede, ou corrida/recuperacao), pra nao inventar
// deslocamento em drills que sao parados (ex: so de saque).
function detectMovement(combinedText) {
  if (/lateral|shuffle|side-?step|passada lateral/.test(combinedText)) return 'lateral';
  if (/approach|aproxima[çc][ãa]o|sobe (a|à|pra|para) rede|vem (a|à|pra|para) rede|avan[çc]a (a|à|pra|para) rede|transição.*rede|split step/.test(combinedText)) return 'approach';
  if (/sprint|corrida|recupera[çc][ãa]o|recuperar? a bola|desloca(mento)?|corre até|caça[ -]bolas?/.test(combinedText)) return 'sprint';
  return null;
}

function parsePlayerCount(description) {
  const m = (description || '').match(/jogadores:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Legenda empilhada (1 item por linha) em vez de uma linha so -- mais legivel
// no tamanho pequeno do que tentar caber tudo numa unica linha horizontal.
function legendSVG(items) {
  const startY = 410;
  return items.map((text, i) => (
    `<text x="10" y="${startY + i * 11}" font-size="9.5" fill="rgba(255,255,255,0.75)">${text}</text>`
  )).join('');
}

// Seta solida (deslocamento do aluno) -- visualmente distinta da trajetoria
// da bola (tracejada, cor de alvo): linha cheia na cor do jogador.
function movementArrowSVG(x1, y1, x2, y2, arrowId) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${PLAYER_COLOR}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#${arrowId})"/>`;
}

function buildMovementSVG(pattern, p1x, p1y, targetX, targetY, rng) {
  if (!pattern) return { svg: '', label: null };
  const arrowId = `move-arrow-${uid++}`;
  const arrowDef = `<marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${PLAYER_COLOR}"/></marker>`;

  if (pattern === 'lateral') {
    const half = (C.sR - C.sL - 30) / 2;
    const x1 = Math.max(C.sL + 6, p1x - half);
    const x2 = Math.min(C.sR - 6, p1x + half);
    const revArrowId = `move-arrow-${uid++}`;
    const revArrowDef = `<marker id="${revArrowId}" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="${PLAYER_COLOR}"/></marker>`;
    return {
      svg: `<defs>${arrowDef}${revArrowDef}</defs><line x1="${x1}" y1="${p1y}" x2="${x2}" y2="${p1y}" stroke="${PLAYER_COLOR}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#${arrowId})" marker-start="url(#${revArrowId})"/>`,
      label: 'Movimento lateral do aluno',
    };
  }
  if (pattern === 'approach') {
    const destY = C.net - 34;
    return { svg: `<defs>${arrowDef}</defs>${movementArrowSVG(p1x, p1y - 12, p1x, destY, arrowId)}`, label: 'Aproximação do aluno até a rede' };
  }
  // 'sprint': corre ate o ponto de alvo (ou centro da zona, se nao houver alvo)
  const destX = targetX ?? C.cx;
  const destY = targetY ?? C.b - 90;
  return { svg: `<defs>${arrowDef}</defs>${movementArrowSVG(p1x, p1y - 12, destX, destY + 14, arrowId)}`, label: 'Deslocamento/recuperação do aluno' };
}

// Monta o texto combinado (nome + zona + descricao) usado por toda a deteccao
// de zona/direcao/movimento -- o nome do drill costuma ter a pista tatica
// real quando o campo "zona da quadra" so descreve o tamanho da quadra
// (comum nos drills de mini-tenis, ex: "Quadra Completa Oficial (78ft)").
function buildSearchText(drill) {
  if (!drill) return '';
  if (typeof drill === 'string') return drill.toLowerCase();
  return `${drill.name || ''} ${drill.court_zone || ''} ${drill.description || ''}`.toLowerCase();
}

// Versao ampliada do diagrama, usada quando o drill esta selecionado: alem da
// zona destacada, mostra a posicao esquematica do aluno (e do parceiro/
// treinador, quando o drill nao e solo), a trajetoria da bola ate um alvo
// dentro da zona (quando o texto da alguma pista de direcao) e, quando o
// texto descreve deslocamento, uma seta solida separada mostrando para onde
// o aluno se move. Nao e uma foto real, e um esquema tatico gerado a partir
// do texto ja cadastrado do drill -- nada e fabricado sem pista no texto.
export function drillIllustrationSVG(drill) {
  const searchText = buildSearchText(drill);
  const description = (drill && drill.description) || '';
  const { zones, hasDiagonal, hasParallel } = matchZones(searchText);
  const primaryZone = zones.find((z) => ZONE_DEFS[z]) || 'quadraInteira';
  const overlays = zones
    .filter((z) => ZONE_DEFS[z])
    .map((z) => {
      const def = ZONE_DEFS[z];
      return def.rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${def.color}" fill-opacity="${def.opacity}" rx="2"/>`).join('');
    })
    .join('');

  const rng = seededRandom((drill && drill.id) || 1);
  const coachFed = /alimentador|cesta baixa|cesta alta|mão do treinador|professor alimenta|treinador alimenta/.test(searchText);
  const playerCount = parsePlayerCount(description);
  const showSecondMarker = coachFed || playerCount === null || playerCount >= 2;
  const showTarget = hasSpecificTarget(zones, searchText);
  const movementPattern = detectMovement(searchText);

  const p1x = C.sL + 20 + rng() * (C.sR - C.sL - 40);
  const p1y = C.b - 14;
  const p2x = C.sL + 20 + rng() * (C.sR - C.sL - 40);
  const p2y = coachFed ? C.net - 18 : C.t + 14;

  const targetRect = (ZONE_DEFS[primaryZone] || ZONE_DEFS.quadraInteira).rects[0];
  const [tx0, ty0, tw, th] = targetRect;
  const targetX = tx0 + tw * (0.25 + rng() * 0.5);
  const targetY = ty0 + th * (0.25 + rng() * 0.5);

  const arrowId = `drill-arrow-${uid++}`;
  let trajectorySVG = '';
  if (showTarget) {
    if (hasDiagonal) {
      const leftToRight = rng() < 0.5;
      const x1 = leftToRight ? C.sL : C.sR;
      const x2 = leftToRight ? C.sR : C.sL;
      trajectorySVG = `<line x1="${x1}" y1="${C.t}" x2="${x2}" y2="${C.b}" stroke="${TARGET_COLOR}" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>`;
    } else if (hasParallel) {
      const side = rng() < 0.5 ? C.sL + 14 : C.sR - 14;
      trajectorySVG = `<line x1="${side}" y1="${C.b - 20}" x2="${side}" y2="${C.t + 20}" stroke="${TARGET_COLOR}" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>`;
    } else {
      trajectorySVG = `<path d="M${p1x},${p1y} Q${(p1x + targetX) / 2},${(p1y + targetY) / 2 - 30} ${targetX},${targetY}" fill="none" stroke="${TARGET_COLOR}" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>`;
    }
  }

  const movement = buildMovementSVG(movementPattern, p1x, p1y, showTarget ? targetX : null, showTarget ? targetY : null, rng);

  const legendParts = ['A — Aluno'];
  if (showSecondMarker) legendParts.push(coachFed ? 'T — Treinador' : 'P2 — Parceiro');
  if (showTarget) legendParts.push('Alvo — mira da bola (tracejado)');
  if (movement.label) legendParts.push(`→ ${movement.label} (linha cheia)`);

  return `<svg viewBox="0 0 200 ${445 + (movement.label ? 11 : 0)}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
    <defs>
      <marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="${TARGET_COLOR}"/>
      </marker>
    </defs>
    ${baseCourtSVG()}
    ${overlays}
    ${movement.svg}
    ${trajectorySVG}
    ${showTarget ? targetSVG(targetX, targetY) : ''}
    ${marker(p1x, p1y, 'A', PLAYER_COLOR)}
    ${showSecondMarker ? marker(p2x, p2y, coachFed ? 'T' : 'P2', PARTNER_COLOR) : ''}
    ${legendSVG(legendParts)}
  </svg>`;
}

// Miniatura compacta (sem jogadores/alvo) usada nas listagens. Aceita tanto a
// string de zona pura (compatibilidade) quanto o drill inteiro -- passar o
// drill inteiro da diagramas mais precisos pros casos (comuns nos drills de
// mini-tenis) em que a zona so descreve o tamanho da quadra e a pista real
// esta no nome/descricao.
export function courtDiagramSVG(drillOrZone) {
  const searchText = buildSearchText(drillOrZone);
  const { zones, hasDiagonal, hasParallel } = matchZones(searchText);
  const overlays = zones
    .filter((z) => ZONE_DEFS[z])
    .map((z) => {
      const def = ZONE_DEFS[z];
      return def.rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${def.color}" fill-opacity="${def.opacity}" rx="2"/>`).join('');
    })
    .join('');
  const arrowId = `court-arrow-${uid++}`;
  let directionSVG = '';
  if (hasDiagonal) {
    directionSVG = `<line x1="${C.sL}" y1="${C.t}" x2="${C.sR}" y2="${C.b}" stroke="#eda100" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>`;
  } else if (hasParallel) {
    directionSVG = `<line x1="${C.sL + 14}" y1="${C.b - 20}" x2="${C.sL + 14}" y2="${C.t + 20}" stroke="#eda100" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#${arrowId})"/>`;
  }
  return `<svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
    <defs>
      <marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#eda100"/>
      </marker>
    </defs>
    ${baseCourtSVG()}
    ${overlays}
    ${directionSVG}
  </svg>`;
}
