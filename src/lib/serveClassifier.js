// ---------------------------------------------------------------------------
// Classificador de tipo de saque (flat / slice / kick) a partir de cinematica
// do impacto -- posicao do toss, vetor de velocidade da raquete e velocidade
// angular de pronacao. Portado 1:1 do algoritmo fornecido pelo head coach
// (gemini-code-1787422699807.ts); ver PONTO DE INTEGRACAO em videoAnalysis.js
// para de onde vem essa cinematica hoje (simulada) vs. de onde deveria vir
// (extracao real de pose a partir do video).
//
// Point3D: { x: lateral (negativo=esquerda, positivo=direita, em metros),
//            y: profundidade (positivo=para frente/quadra adversaria),
//            z: altura (positivo=vertical) }
// ImpactKinematics: { tossApexRelative: Point3D, racketVelocityVector: Point3D,
//                      pronationAngularVelocity: number (deg/s),
//                      shoulderInternalRotationSpeed: number (deg/s) }
// ---------------------------------------------------------------------------

export function classifyServeType(data) {
  const { tossApexRelative, racketVelocityVector, pronationAngularVelocity } = data;

  const totalVelocity = Math.sqrt(
    racketVelocityVector.x ** 2 +
    racketVelocityVector.y ** 2 +
    racketVelocityVector.z ** 2
  );

  if (totalVelocity === 0) {
    return {
      serveType: 'UNKNOWN',
      confidenceScore: 0,
      features: { upwardAttackRatio: 0, lateralAttackRatio: 0, pronationIntensity: 0 },
    };
  }

  // Relacoes vetoriais normalizadas
  const upwardRatio = racketVelocityVector.z / totalVelocity;
  const lateralRatio = Math.abs(racketVelocityVector.x) / totalVelocity;
  const forwardRatio = racketVelocityVector.y / totalVelocity;

  // 1. Thresholds de classificacao para KICK SERVE
  const isKickToss = tossApexRelative.y <= 0.12 && tossApexRelative.x <= 0.05;
  const isKickTrajectory = upwardRatio > 0.45 && forwardRatio < 0.70;

  if (isKickToss || isKickTrajectory) {
    const confidence = (upwardRatio / 0.6) * 0.6 + (isKickToss ? 0.4 : 0.2);
    return {
      serveType: 'KICK',
      confidenceScore: Math.min(Math.max(confidence, 0.5), 0.98),
      features: { upwardAttackRatio: upwardRatio, lateralAttackRatio: lateralRatio, pronationIntensity: pronationAngularVelocity },
    };
  }

  // 2. Thresholds de classificacao para SLICE SERVE
  const isSliceToss = tossApexRelative.x >= 0.20;
  const isSliceTrajectory = lateralRatio > 0.30 && upwardRatio < 0.40;

  if (isSliceToss || (isSliceTrajectory && pronationAngularVelocity < 1300)) {
    const confidence = (lateralRatio / 0.45) * 0.5 + (isSliceToss ? 0.5 : 0.3);
    return {
      serveType: 'SLICE',
      confidenceScore: Math.min(Math.max(confidence, 0.5), 0.96),
      features: { upwardAttackRatio: upwardRatio, lateralAttackRatio: lateralRatio, pronationIntensity: pronationAngularVelocity },
    };
  }

  // 3. Fallback / determinacao para FLAT SERVE -- predominancia de forca para
  // frente (forward drive) com pronacao explosiva
  const isHighPronation = pronationAngularVelocity >= 1200;
  const confidence = forwardRatio * 0.5 + (isHighPronation ? 0.4 : 0.2);

  return {
    serveType: 'FLAT',
    confidenceScore: Math.min(Math.max(confidence, 0.5), 0.95),
    features: { upwardAttackRatio: upwardRatio, lateralAttackRatio: lateralRatio, pronationIntensity: pronationAngularVelocity },
  };
}
