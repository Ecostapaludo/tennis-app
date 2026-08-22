// ---------------------------------------------------------------------------
// Deteccao do frame de impacto (t0) numa serie temporal de poses, sem
// sensores fisicos (IMU) -- baseada em identificar a descontinuidade
// cinematica (inversao de velocidade/desaceleracao abrupta) na extremidade
// distal da cadeia cinetica (punho) causada pela transferencia de momento
// para a bola. Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787423852229.ts), TypeScript -> JavaScript sem mudar a logica.
//
// FramePoseData: { frameIndex, timestampMs, wrist: Landmark3D, shoulder:
// Landmark3D, hip: Landmark3D } -- Landmark3D: { x, y, z, visibility? }
// (mesmo formato de src/lib/poseAngles.js).
//
// PONTO DE INTEGRACAO: hoje quem chama esta funcao (videoAnalysis.js) gera
// uma serie de frames SIMULADA; numa integracao real, viria do MediaPipe Pose
// Landmarker processando o video quadro a quadro no navegador.
// ---------------------------------------------------------------------------

// Detecta o frame exato do ponto de contato (t0) em uma serie temporal de frames.
export function detectImpactFrame(frames, strokeCategory = 'GROUNDSTROKE', fps = 60) {
  if (frames.length < 10) return null;

  const dt = 1 / fps;
  const velocities = [];
  const accelerations = [];

  // 1. Calculo da magnitude da velocidade 3D (primeira derivada)
  for (let i = 1; i < frames.length; i++) {
    const pPrev = frames[i - 1].wrist;
    const pCurr = frames[i].wrist;

    const dx = pCurr.x - pPrev.x;
    const dy = pCurr.y - pPrev.y;
    const dz = pCurr.z - pPrev.z;

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    velocities.push(dist / dt);
  }

  // Suavizacao simples de media movel (janela de 3 frames para filtrar jitter)
  const smoothedVelocities = smoothTimeSeries(velocities, 3);

  // 2. Calculo da aceleracao 3D (segunda derivada)
  for (let i = 1; i < smoothedVelocities.length; i++) {
    const dv = smoothedVelocities[i] - smoothedVelocities[i - 1];
    accelerations.push(dv / dt);
  }

  // 3. Busca pelo candidato a impacto: procura o maior pico de velocidade
  // seguido pela desaceleracao mais abrupta
  let maxVelIdx = 0;
  let maxVel = 0;

  for (let i = 0; i < smoothedVelocities.length; i++) {
    if (smoothedVelocities[i] > maxVel) {
      maxVel = smoothedVelocities[i];
      maxVelIdx = i;
    }
  }

  // O impacto ocorre tipicamente na transicao do pico de velocidade para a
  // desaceleracao (janela de +-2 frames)
  let bestCandidateFrame = maxVelIdx;
  let maxDeceleration = 0;

  const searchWindowStart = Math.max(0, maxVelIdx - 2);
  const searchWindowEnd = Math.min(accelerations.length - 1, maxVelIdx + 3);

  for (let i = searchWindowStart; i <= searchWindowEnd; i++) {
    // Desaceleracao = aceleracao negativa
    if (accelerations[i] < maxDeceleration) {
      maxDeceleration = accelerations[i];
      bestCandidateFrame = i + 1; // Ajuste de indice devido a dupla diferenciacao
    }
  }

  // 4. Validacao biomecanica espacial
  const targetFrame = frames[bestCandidateFrame] || frames[maxVelIdx];
  let spatialConfidence = 0.5;

  if (strokeCategory === 'GROUNDSTROKE') {
    // Valida se o punho esta a frente do quadril/ombro no plano Y/profundidade
    const isForward = targetFrame.wrist.y > targetFrame.hip.y;
    spatialConfidence = isForward ? 0.95 : 0.6;
  } else {
    // Serve/Smash: valida se o punho esta no ponto mais alto (altura Z em relacao a cabeca/ombro)
    const isAboveShoulder = targetFrame.wrist.z < targetFrame.shoulder.z; // (no MediaPipe, Y/Z invertido dependendo da projecao)
    spatialConfidence = isAboveShoulder ? 0.95 : 0.6;
  }

  return {
    impactFrameIndex: targetFrame.frameIndex,
    impactTimestampMs: targetFrame.timestampMs,
    confidenceScore: spatialConfidence,
    peakVelocity: Number(maxVel.toFixed(2)),
    impactDeceleration: Number(maxDeceleration.toFixed(2)),
  };
}

// Filtro de suavizacao por media movel (moving average filter).
function smoothTimeSeries(data, windowSize) {
  const result = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j >= 0 && j < data.length) {
        sum += data[j];
        count++;
      }
    }
    result.push(sum / count);
  }
  return result;
}
