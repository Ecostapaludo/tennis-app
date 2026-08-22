import crypto from 'node:crypto';
import { classifyServeType } from './serveClassifier.js';
import { MediaPipeLandmarks, extractBiomechanicalFrameMetrics } from './poseAngles.js';

// ---------------------------------------------------------------------------
// MOTOR DE ANALISE BIOMECANICA DE VIDEO -- VERSAO SIMULADA
//
// Esta funcao NAO faz visao computacional de verdade. Ela gera uma analise
// deterministica (mesmo video + mesmo golpe sempre produz o mesmo resultado)
// para que a interface, o banco de dados e os relatorios do app funcionem de
// ponta a ponta enquanto um servico real de IA (ex: um modelo de pose
// estimation como MediaPipe/OpenPose, ou uma API de visao computacional) nao
// e conectado.
//
// PONTO DE INTEGRACAO: para plugar uma analise real, substitua o corpo desta
// funcao por uma chamada ao seu servico de analise de video (upload do
// arquivo em `videoPath`, processamento de pose estimation, calculo de
// angulos articulares, etc.) mantendo o mesmo formato de retorno.
// ---------------------------------------------------------------------------

const STROKE_LABELS = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  serve: 'Saque',
  volley: 'Voleio',
  smash: 'Smash',
};

const STROKE_TIPS = {
  forehand: [
    'preparacao antecipada da raquete',
    'rotacao de quadril e ombros',
    'ponto de contato a frente do corpo',
    'transferencia de peso para a perna da frente',
    'finalizacao (follow-through) completa',
  ],
  backhand: [
    'unidade de giro dos ombros',
    'estabilidade do cotovelo na preparacao',
    'ponto de contato consistente',
    'extensao do braco no contato',
    'equilibrio ao final do movimento',
  ],
  serve: [
    'lancamento de bola (ball toss) consistente',
    'flexao de joelhos e cadeia cinetica',
    'posicao do cotovelo no "trophy position"',
    'pronacao do antebraco no contato',
    'aterrissagem e recuperacao apos o saque',
  ],
  volley: [
    'firmeza do punho no contato',
    'posicionamento antecipado dos pes',
    'angulo da face da raquete',
    'curto tempo de preparacao',
    'divisao de passos (split step)',
  ],
  smash: [
    'posicionamento sob a bola',
    'coordenacao braco-corpo similar ao saque',
    'timing do salto (quando aplicavel)',
    'ponto de contato acima da cabeca',
    'controle direcional na finalizacao',
  ],
};

function seededRandom(seedStr) {
  const hash = crypto.createHash('sha256').update(seedStr).digest();
  let idx = 0;
  return () => {
    const val = hash[idx % hash.length] / 255;
    idx += 1;
    return val;
  };
}

function scoreInRange(rand, min, max) {
  return Math.round((min + rand() * (max - min)) * 10) / 10;
}

const SERVE_TYPE_LABEL = { FLAT: 'Flat', SLICE: 'Slice', KICK: 'Kick', UNKNOWN: 'Indeterminado' };

// Gera a cinematica de impacto do saque (posicao do toss, vetor de velocidade
// da raquete, velocidade angular de pronacao/rotacao interna do ombro) usada
// pelo classifyServeType real em serveClassifier.js. SIMULADA mas
// deterministica, mesmo padrao do resto deste arquivo.
// PONTO DE INTEGRACAO: numa integracao real essa cinematica viria de pose
// estimation a partir do video (tracking do toss e da cabeca da raquete
// quadro a quadro), nao de numeros sorteados.
// Landmark simulado: ponto-base + variacao aleatoria (mesmo padrao "seeded"
// do resto do arquivo), imitando a variabilidade de um keypoint real do
// MediaPipe Pose.
function randomLandmark(rand, base, spread) {
  return {
    x: base.x + (rand() * 2 - 1) * spread,
    y: base.y + (rand() * 2 - 1) * spread,
    z: base.z + (rand() * 2 - 1) * spread * 0.4,
    visibility: 0.8 + rand() * 0.2,
  };
}

// Monta um array de 33 landmarks (indices do MediaPipe Pose) com proporcoes
// aproximadas de um corpo humano parado em posicao de saque/golpe, so
// preenchendo os pontos que extractBiomechanicalFrameMetrics realmente le.
// PONTO DE INTEGRACAO: substituir por landmarks reais vindos do MediaPipe
// Pose Landmarker rodando sobre um frame do video enviado.
function simulatedPoseLandmarks(rand, dominantSide) {
  const isRight = dominantSide === 'RIGHT';
  const landmarks = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const L = MediaPipeLandmarks;

  const hip = randomLandmark(rand, { x: 0, y: 0, z: 0 }, 0.05);
  const knee = randomLandmark(rand, { x: 0.05, y: -0.9, z: 0 }, 0.15);
  const ankle = randomLandmark(rand, { x: 0, y: -1.8, z: 0 }, 0.3);
  const shoulder = randomLandmark(rand, { x: 0, y: 1.3, z: 0 }, 0.1);
  const elbow = randomLandmark(rand, { x: 0.35, y: 0.9, z: 0.1 }, 0.25);
  const wrist = randomLandmark(rand, { x: 0.6, y: 0.5, z: 0.2 }, 0.35);
  const oppositeShoulder = randomLandmark(rand, { x: -0.35, y: 1.3, z: 0 }, 0.05);

  landmarks[isRight ? L.RIGHT_HIP : L.LEFT_HIP] = hip;
  landmarks[isRight ? L.RIGHT_KNEE : L.LEFT_KNEE] = knee;
  landmarks[isRight ? L.RIGHT_ANKLE : L.LEFT_ANKLE] = ankle;
  landmarks[isRight ? L.RIGHT_SHOULDER : L.LEFT_SHOULDER] = shoulder;
  landmarks[isRight ? L.RIGHT_ELBOW : L.LEFT_ELBOW] = elbow;
  landmarks[isRight ? L.RIGHT_WRIST : L.LEFT_WRIST] = wrist;
  landmarks[isRight ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER] = oppositeShoulder;

  return landmarks;
}

function simulatedServeKinematics(rand) {
  return {
    tossApexRelative: { x: -0.05 + rand() * 0.4, y: -0.05 + rand() * 0.6, z: rand() * 0.1 },
    racketVelocityVector: { x: (rand() * 2 - 1) * 8, y: 15 + rand() * 20, z: (rand() * 2 - 1) * 15 + 10 },
    pronationAngularVelocity: 700 + rand() * 1500,
    shoulderInternalRotationSpeed: 600 + rand() * 1200,
  };
}

export function analyzeStrokeVideo({ athleteId, strokeType, videoFilename, note }) {
  const seed = `${athleteId}:${strokeType}:${videoFilename || 'sem-arquivo'}:${note || ''}`;
  const rand = seededRandom(seed);

  const technique = scoreInRange(rand, 5.5, 9.5);
  const power = scoreInRange(rand, 5, 9.5);
  const consistency = scoreInRange(rand, 5, 9.5);
  const balance = scoreInRange(rand, 5.5, 9.5);
  const overall = Math.round(((technique + power + consistency + balance) / 4) * 10) / 10;

  const label = STROKE_LABELS[strokeType] || strokeType;
  const tips = STROKE_TIPS[strokeType] || STROKE_TIPS.forehand;
  const scored = [
    { key: 'technique', label: 'Tecnica', value: technique },
    { key: 'power', label: 'Potencia', value: power },
    { key: 'consistency', label: 'Consistencia', value: consistency },
    { key: 'balance', label: 'Equilibrio', value: balance },
  ].sort((a, b) => a.value - b.value);

  const weakest = scored[0];
  const strongest = scored[scored.length - 1];
  const weakestTip = tips[Math.floor(rand() * tips.length)];

  let serveType = null;
  let serveConfidence = null;
  let serveNote = '';
  if (strokeType === 'serve') {
    const classification = classifyServeType(simulatedServeKinematics(rand));
    if (classification.serveType !== 'UNKNOWN') {
      serveType = classification.serveType;
      serveConfidence = Math.round(classification.confidenceScore * 100) / 100;
      serveNote = ` Classificação do tipo de saque: ${SERVE_TYPE_LABEL[serveType]} (confiança ${Math.round(serveConfidence * 100)}%).`;
    }
  }

  // Angulos articulares (joelho/cotovelo/ombro) extraidos via algebra vetorial
  // real (poseAngles.js) a partir de landmarks -- SIMULADOS por enquanto, ver
  // PONTO DE INTEGRACAO em simulatedPoseLandmarks acima.
  const jointAngles = extractBiomechanicalFrameMetrics(simulatedPoseLandmarks(rand, 'RIGHT'), 'RIGHT');
  const jointAnglesNote = jointAngles
    ? ` Ângulos articulares estimados no frame analisado: joelho ${jointAngles.kneeFlexion}°, ` +
      `cotovelo ${jointAngles.elbowFlexion}°, abdução de ombro ${jointAngles.shoulderAbduction}°, ` +
      `inclinação de ombros ${jointAngles.shoulderTilt}°.`
    : '';

  const comments =
    `Analise simulada do golpe ${label}: o ponto mais forte identificado foi ${strongest.label.toLowerCase()} ` +
    `(${strongest.value}/10) e o ponto de maior oportunidade de evolucao foi ${weakest.label.toLowerCase()} ` +
    `(${weakest.value}/10). Sugestao de foco no proximo ciclo de treino: trabalhar ${weakestTip}.${serveNote}${jointAnglesNote} ` +
    `[Esta e uma analise SIMULADA gerada para fins de demonstracao -- conecte um servico real de analise ` +
    `de video (pose estimation) em src/lib/videoAnalysis.js para obter metricas biomecanicas reais.]`;

  return {
    techniqueScore: technique,
    powerScore: power,
    consistencyScore: consistency,
    balanceScore: balance,
    overallScore: overall,
    aiComments: comments,
    analysisSource: 'simulado',
    serveType,
    serveConfidence,
    kneeFlexion: jointAngles ? jointAngles.kneeFlexion : null,
    elbowFlexion: jointAngles ? jointAngles.elbowFlexion : null,
    shoulderAbduction: jointAngles ? jointAngles.shoulderAbduction : null,
    shoulderTilt: jointAngles ? jointAngles.shoulderTilt : null,
  };
}
