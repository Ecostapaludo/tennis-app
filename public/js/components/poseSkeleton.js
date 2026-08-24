// ---------------------------------------------------------------------------
// Diagrama SVG do esqueleto (pose) com as articulações anotadas por ângulo --
// visualização do MediaPipe Pose. POSE_CONNECTIONS portado 1:1 do modulo
// fornecido pelo head coach (gemini-code-1787498517005.ts).
//
// Cores fixas em hex (nao usar var() aqui -- mesmo motivo de
// components/courtDiagram.js: SVG inline via innerHTML nao resolve custom
// properties do :root de forma confiavel neste app).
// ---------------------------------------------------------------------------

const SURFACE = '#0b2a30';
const BONE = 'rgba(94, 200, 247, 0.55)';
const JOINT = '#5ec8f7';
const STATUS_COLOR = { OPTIMAL: '#4a95e8', WARNING: '#eda100', CRITICAL: '#e34948' };

// Conexoes anatomicas do MediaPipe Pose (33 keypoints)
export const POSE_CONNECTIONS = [
  // Membro Superior Direito
  [12, 14], [14, 16],
  // Membro Superior Esquerdo
  [11, 13], [13, 15],
  // Cintura Escapular & Pelvica (Tronco)
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Membro Inferior Direito
  [24, 26], [26, 28],
  // Membro Inferior Esquerdo
  [23, 25], [25, 27],
];

// Projeta os landmarks (coordenadas arbitrarias/normalizadas, y crescendo
// para cima) num viewBox SVG (y crescendo para baixo), a partir da bounding
// box dos pontos presentes -- funciona tanto para os landmarks SIMULADOS de
// hoje quanto para landmarks normalizados 0..1 reais do MediaPipe no futuro
// (nesse caso o eixo Y do MediaPipe ja cresce para baixo -- ajustar o flip
// abaixo quando essa integracao real for feita).
function buildProjector(landmarks, viewW, viewH, pad) {
  const present = landmarks.filter((p) => p && (p.visibility === undefined || p.visibility > 0));
  const xs = present.map((p) => p.x);
  const ys = present.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  return (p) => {
    const nx = (p.x - minX) / spanX;
    const ny = (p.y - minY) / spanY;
    return {
      x: pad + nx * (viewW - 2 * pad),
      y: pad + (1 - ny) * (viewH - 2 * pad), // flip: maior y (para cima) -> topo do SVG
    };
  };
}

// landmarks: array de 33 pontos {x,y,visibility} (indice = indice MediaPipe).
// angleAnnotations: [{ vertexIndex, p1Index, p2Index, angleValue, label, status }]
export function poseSkeletonSVG(landmarks, angleAnnotations) {
  const W = 260;
  const H = 320;
  const PAD = 30;
  const project = buildProjector(landmarks, W, H, PAD);
  const present = (i) => landmarks[i] && (landmarks[i].visibility === undefined || landmarks[i].visibility > 0);

  const bones = POSE_CONNECTIONS
    .filter(([a, b]) => present(a) && present(b))
    .map(([a, b]) => {
      const pa = project(landmarks[a]);
      const pb = project(landmarks[b]);
      return `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="${BONE}" stroke-width="3" stroke-linecap="round"/>`;
    })
    .join('');

  const joints = landmarks
    .map((p, i) => (present(i) ? project(p) : null))
    .filter(Boolean)
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${JOINT}"/>`)
    .join('');

  const annotations = (angleAnnotations || [])
    .filter((a) => present(a.vertexIndex))
    .map((a) => {
      const v = project(landmarks[a.vertexIndex]);
      const color = STATUS_COLOR[a.status] || STATUS_COLOR.OPTIMAL;
      const dy = v.y < H / 2 ? 16 : -10;
      return `
        <circle cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="6" fill="none" stroke="${color}" stroke-width="2"/>
        <text x="${v.x.toFixed(1)}" y="${(v.y + dy).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${color}">${a.label}: ${a.angleValue}°</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background:${SURFACE};border-radius:8px">
    ${bones}
    ${joints}
    ${annotations}
  </svg>`;
}
