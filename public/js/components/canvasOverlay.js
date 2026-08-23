// ---------------------------------------------------------------------------
// Overlay de canvas com o esqueleto + arcos/badges de angulo sobre um frame
// de video (landmarks normalizados 0..1, x/y relativos a largura/altura do
// canvas). Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787498913778.ts), TypeScript -> JavaScript sem mudar a logica
// de desenho -- so troca CanvasRenderingContext2D (tipo TS) por uso direto.
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  OPTIMAL: '#00E676',
  WARNING: '#FFD600',
  CRITICAL: '#FF1744',
  SKELETON: '#00B0FF',
  JOINT_FILL: '#FFFFFF',
};

export function drawBiomechanicalOverlay(ctx, width, height, landmarks, angles) {
  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) return;

  // 1. Desenhar conexoes osseas (esqueleto)
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const pStart = landmarks[startIdx];
    const pEnd = landmarks[endIdx];

    if (
      pStart && pEnd &&
      (pStart.visibility === undefined || pStart.visibility > 0.5) &&
      (pEnd.visibility === undefined || pEnd.visibility > 0.5)
    ) {
      ctx.beginPath();
      ctx.moveTo(pStart.x * width, pStart.y * height);
      ctx.lineTo(pEnd.x * width, pEnd.y * height);
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.75)';
      ctx.stroke();
    }
  }

  // 2. Desenhar arcos de angulo e rotulos
  for (const annotation of angles) {
    drawAngleArcAndBadge(ctx, width, height, landmarks, annotation);
  }

  // 3. Desenhar articulacoes (joints / keypoints)
  for (let i = 0; i < landmarks.length; i++) {
    const kp = landmarks[i];
    if (kp && (kp.visibility === undefined || kp.visibility > 0.5)) {
      const cx = kp.x * width;
      const cy = kp.y * height;

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
      ctx.fillStyle = STATUS_COLORS.JOINT_FILL;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }
  }
}

// Desenha o arco setorial e o balao com o valor numerico do angulo.
function drawAngleArcAndBadge(ctx, width, height, landmarks, annotation) {
  const v = landmarks[annotation.vertexIndex];
  const p1 = landmarks[annotation.p1Index];
  const p2 = landmarks[annotation.p2Index];

  if (!v || !p1 || !p2) return;

  const vx = v.x * width;
  const vy = v.y * height;
  const p1x = p1.x * width;
  const p1y = p1.y * height;
  const p2x = p2.x * width;
  const p2y = p2.y * height;

  const angle1 = Math.atan2(p1y - vy, p1x - vx);
  const angle2 = Math.atan2(p2y - vy, p2x - vx);

  const arcRadius = 32;
  const color = STATUS_COLORS[annotation.status];

  // A. Arco setorial
  ctx.save();
  ctx.beginPath();
  ctx.arc(vx, vy, arcRadius, angle1, angle2, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.lineTo(vx, vy);
  ctx.fillStyle = `${color}33`;
  ctx.fill();
  ctx.restore();

  // B. Posicao da badge (rotulo) -- bissetriz externa
  let midAngle = (angle1 + angle2) / 2;
  if (Math.abs(angle1 - angle2) > Math.PI) {
    midAngle += Math.PI;
  }

  const badgeDistance = arcRadius + 24;
  const badgeX = vx + Math.cos(midAngle) * badgeDistance;
  const badgeY = vy + Math.sin(midAngle) * badgeDistance;

  // C. Renderizacao do badge (pill container com sombra)
  const text = `${annotation.label}: ${annotation.angleValue.toFixed(1)}°`;
  ctx.font = 'bold 12px "Inter", -apple-system, sans-serif';
  const textMetrics = ctx.measureText(text);
  const paddingX = 8;
  const boxWidth = textMetrics.width + paddingX * 2;
  const boxHeight = 22;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = 'rgba(18, 18, 18, 0.88)';
  roundRect(ctx, badgeX - boxWidth / 2, badgeY - boxHeight / 2, boxWidth, boxHeight, 4);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, badgeX, badgeY);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Conexoes anatomicas do MediaPipe Pose (33 keypoints) -- mesma lista de
// public/js/components/poseSkeleton.js, repetida aqui para este modulo poder
// ser usado de forma independente (mesmo padrao de constantes duplicadas
// entre courtDiagram.js/charts.js ja existente no app).
const POSE_CONNECTIONS = [
  [12, 14], [14, 16],
  [11, 13], [13, 15],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [24, 26], [26, 28],
  [23, 25], [25, 27],
];

// Normaliza landmarks de coordenadas arbitrarias (ex: os SIMULADOS deste MVP,
// em metros) para o intervalo 0..1 esperado por drawBiomechanicalOverlay
// (mesma convencao do MediaPipe: x/y normalizados pela dimensao do frame).
// PONTO DE INTEGRACAO: landmarks reais do MediaPipe ja vem normalizados
// 0..1 -- essa normalizacao so e necessaria enquanto os dados forem simulados.
export function normalizeLandmarksTo01(landmarks, marginFrac = 0.18) {
  const present = landmarks.filter((p) => p && (p.visibility === undefined || p.visibility > 0));
  const xs = present.map((p) => p.x);
  const ys = present.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const m = marginFrac;
  return landmarks.map((p) => {
    if (!p || (p.visibility !== undefined && p.visibility <= 0)) return p;
    const nx = (p.x - minX) / spanX;
    const ny = (p.y - minY) / spanY;
    return {
      ...p,
      x: m + nx * (1 - 2 * m),
      y: m + (1 - ny) * (1 - 2 * m), // flip: maior y real (para cima) -> topo do frame (y menor)
    };
  });
}
