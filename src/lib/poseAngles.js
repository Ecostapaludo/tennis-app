// ---------------------------------------------------------------------------
// Angulos articulares 3D (joelho, cotovelo, abducao/inclinacao de ombro) a
// partir de landmarks brutos do MediaPipe Pose / BlazePose. Portado 1:1 do
// modulo fornecido pelo head coach (gemini-code-1787423348618.ts), so
// convertido de TypeScript para JavaScript -- mesma algebra vetorial (produto
// escalar via arccos, com clamping para estabilidade numerica).
//
// Landmark3D: { x, y, z, visibility? }
// PONTO DE INTEGRACAO: hoje quem chama estas funcoes (videoAnalysis.js) gera
// landmarks SIMULADOS; numa integracao real, os landmarks viriam do
// MediaPipe Pose Landmarker rodando no navegador sobre os frames do video
// enviado (ver @mediapipe/tasks-vision), quadro a quadro.
// ---------------------------------------------------------------------------

export const MediaPipeLandmarks = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

// ==========================================
// Funcoes auxiliares de algebra vetorial
// ==========================================

export function createVector(pointA, pointB) {
  return { x: pointB.x - pointA.x, y: pointB.y - pointA.y, z: pointB.z - pointA.z };
}

export function vectorMagnitude(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function dotProduct(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

// Calcula o angulo tridimensional entre 3 pontos (P1 - Vertice - P2) em graus.
// Angulo formado no vertice pelas semirretas (Vertex -> P1) e (Vertex -> P2).
export function calculate3DAngle(p1, vertex, p2) {
  const v1 = createVector(vertex, p1);
  const v2 = createVector(vertex, p2);

  const mag1 = vectorMagnitude(v1);
  const mag2 = vectorMagnitude(v2);

  // Evita divisao por zero se dois keypoints colidirem
  if (mag1 === 0 || mag2 === 0) return 0;

  // Normalizacao do produto escalar com clamping para evitar NaN por imprecisao de ponto flutuante
  const cosTheta = Math.max(-1.0, Math.min(1.0, dotProduct(v1, v2) / (mag1 * mag2)));
  const angleInRadians = Math.acos(cosTheta);

  return (angleInRadians * 180) / Math.PI;
}

// ==========================================
// Extratores de angulos articulares especificos
// ==========================================

// Angulo de flexao do joelho (Quadril -> Joelho -> Tornozelo).
// Ex: 180 = perna totalmente estendida; 120 = joelho flexionado em loading.
export function calculateKneeAngle(landmarks, side) {
  const hipIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_HIP : MediaPipeLandmarks.LEFT_HIP;
  const kneeIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_KNEE : MediaPipeLandmarks.LEFT_KNEE;
  const ankleIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_ANKLE : MediaPipeLandmarks.LEFT_ANKLE;

  return calculate3DAngle(landmarks[hipIdx], landmarks[kneeIdx], landmarks[ankleIdx]);
}

// Angulo de flexao do cotovelo (Ombro -> Cotovelo -> Punho).
// Ex: 180 = braco reto (reach do saque); 90 = braco flexionado (trophy pose).
export function calculateElbowAngle(landmarks, side) {
  const shoulderIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_SHOULDER : MediaPipeLandmarks.LEFT_SHOULDER;
  const elbowIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_ELBOW : MediaPipeLandmarks.LEFT_ELBOW;
  const wristIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_WRIST : MediaPipeLandmarks.LEFT_WRIST;

  return calculate3DAngle(landmarks[shoulderIdx], landmarks[elbowIdx], landmarks[wristIdx]);
}

// Abducao do ombro (angulo entre o umero e a lateral do tronco).
// Vertice: Ombro. Segmentos: Ombro -> Cotovelo e Ombro -> Quadril ipsilateral.
export function calculateShoulderAbduction(landmarks, side) {
  const hipIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_HIP : MediaPipeLandmarks.LEFT_HIP;
  const shoulderIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_SHOULDER : MediaPipeLandmarks.LEFT_SHOULDER;
  const elbowIdx = side === 'RIGHT' ? MediaPipeLandmarks.RIGHT_ELBOW : MediaPipeLandmarks.LEFT_ELBOW;

  return calculate3DAngle(landmarks[hipIdx], landmarks[shoulderIdx], landmarks[elbowIdx]);
}

// Shoulder Tilt (inclinacao da linha dos ombros em relacao ao plano horizontal).
// Essencial para detectar Trophy Pose e "Cartwheel effect" no Saque.
export function calculateShoulderTilt(landmarks) {
  const leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER];
  const rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER];

  const deltaY = rightShoulder.y - leftShoulder.y;
  const deltaX = rightShoulder.x - leftShoulder.x;

  const angleRad = Math.atan2(deltaY, deltaX);
  return Math.abs((angleRad * 180) / Math.PI);
}

// ==========================================
// Pipeline principal por frame
// ==========================================

// Processa todos os landmarks de um frame do MediaPipe e retorna as metricas
// articulares, ou null se algum keypoint critico estiver ausente/pouco confiavel.
export function extractBiomechanicalFrameMetrics(landmarks, dominantSide = 'RIGHT', minVisibilityThreshold = 0.65) {
  const requiredIndices = [
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_SHOULDER : MediaPipeLandmarks.LEFT_SHOULDER,
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_ELBOW : MediaPipeLandmarks.LEFT_ELBOW,
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_WRIST : MediaPipeLandmarks.LEFT_WRIST,
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_HIP : MediaPipeLandmarks.LEFT_HIP,
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_KNEE : MediaPipeLandmarks.LEFT_KNEE,
    dominantSide === 'RIGHT' ? MediaPipeLandmarks.RIGHT_ANKLE : MediaPipeLandmarks.LEFT_ANKLE,
    MediaPipeLandmarks.LEFT_SHOULDER,
    MediaPipeLandmarks.RIGHT_SHOULDER,
  ];

  for (const idx of requiredIndices) {
    const point = landmarks[idx];
    if (!point || (point.visibility !== undefined && point.visibility < minVisibilityThreshold)) {
      return null; // Oclusao detectada ou landmark nao confiavel
    }
  }

  return {
    kneeFlexion: Number(calculateKneeAngle(landmarks, dominantSide).toFixed(2)),
    elbowFlexion: Number(calculateElbowAngle(landmarks, dominantSide).toFixed(2)),
    shoulderAbduction: Number(calculateShoulderAbduction(landmarks, dominantSide).toFixed(2)),
    shoulderTilt: Number(calculateShoulderTilt(landmarks).toFixed(2)),
  };
}
