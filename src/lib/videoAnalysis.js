import crypto from 'node:crypto';
import { classifyServeType } from './serveClassifier.js';

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

  const comments =
    `Analise simulada do golpe ${label}: o ponto mais forte identificado foi ${strongest.label.toLowerCase()} ` +
    `(${strongest.value}/10) e o ponto de maior oportunidade de evolucao foi ${weakest.label.toLowerCase()} ` +
    `(${weakest.value}/10). Sugestao de foco no proximo ciclo de treino: trabalhar ${weakestTip}.${serveNote} ` +
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
  };
}
