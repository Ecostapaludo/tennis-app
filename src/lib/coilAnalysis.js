// ---------------------------------------------------------------------------
// Dissociacao pelvico-escapular (Coil / X-Factor) a partir dos landmarks do
// MediaPipe Pose -- a separacao angular entre a linha dos ombros e a linha do
// quadril no plano transversal (visto de cima), o "hip_shoulder_separation_angle"
// que e o primeiro marcador do forehand na Base biomecanica (target 20 a 35
// graus). Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787424416098.ts), TypeScript -> JavaScript sem mudar a logica.
//
// PONTO DE INTEGRACAO: hoje quem chama esta funcao (videoAnalysis.js) gera
// landmarks SIMULADOS; numa integracao real, viriam do MediaPipe Pose
// Landmarker rodando sobre um frame do video enviado.
// ---------------------------------------------------------------------------

import { MediaPipeLandmarks } from './poseAngles.js';

// Normaliza uma diferenca angular para a faixa [-180, 180] graus (valor
// absoluto) para evitar saltos de descontinuidade em 0/360.
function normalizeAngleDifference(angleDiff) {
  let normalized = angleDiff;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return Math.abs(normalized);
}

// Calcula a rotacao angular de um segmento projetado no plano transversal
// (X-Z). Referencia: eixo X (0 grau paralelo a rede / linha de base).
function calculateSegmentYawAngle(pLeft, pRight) {
  const deltaX = pRight.x - pLeft.x;
  const deltaZ = pRight.z - pLeft.z;

  const thetaRad = Math.atan2(deltaZ, deltaX);
  let thetaDeg = (thetaRad * 180) / Math.PI;

  // Garante escala continua de 0 a 360 graus
  if (thetaDeg < 0) thetaDeg += 360;

  return thetaDeg;
}

// Calcula a dissociacao pelvico-escapular (Coil / X-Factor) a partir dos
// landmarks do MediaPipe. minCoilThreshold: separacao minima esperada em
// graus (default 20, referencia geral de forehand).
export function calculatePelvicScapularCoil(landmarks, minCoilThreshold = 20) {
  const leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER];
  const rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER];
  const leftHip = landmarks[MediaPipeLandmarks.LEFT_HIP];
  const rightHip = landmarks[MediaPipeLandmarks.RIGHT_HIP];

  // Validacao de visibilidade e presenca dos 4 keypoints
  const keypoints = [leftShoulder, rightShoulder, leftHip, rightHip];
  for (const kp of keypoints) {
    if (!kp || (kp.visibility !== undefined && kp.visibility < 0.6)) {
      return null; // Oclusao nos keypoints centrais do tronco
    }
  }

  // 1. Angulos absolutos no plano transversal (X-Z)
  const shoulderAngle = calculateSegmentYawAngle(leftShoulder, rightShoulder);
  const hipAngle = calculateSegmentYawAngle(leftHip, rightHip);

  // 2. Diferenca angular relativa (torcao axial)
  const rawDifference = shoulderAngle - hipAngle;
  const dissociation = normalizeAngleDifference(rawDifference);

  return {
    shoulderAngleDeg: Number(shoulderAngle.toFixed(2)),
    hipAngleDeg: Number(hipAngle.toFixed(2)),
    dissociationAngleDeg: Number(dissociation.toFixed(2)),
    isCoilSufficient: dissociation >= minCoilThreshold,
  };
}
