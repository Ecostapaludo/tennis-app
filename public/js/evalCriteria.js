// Estrutura de avaliação de desempenho, inspirada no modelo de "4 fatores de
// performance" da ITF/USTA Player Development (Técnico / Tático / Físico / Mental),
// com critérios granulares por categoria em vez de 1 nota genérica por área —
// alinhado a rubricas reais de avaliação de academias e ao Tactical Skills
// Questionnaire in Tennis (antecipação, tomada de decisão, construção de ponto,
// adaptação) para a parte tática, e a instrumentos de mental toughness (controle
// emocional, resiliência, competitividade, coachability) para a parte mental.
//
// Cada critério é [chaveDaApi, label, opcoes?]. opcoes.radar = false tira o
// critério do radar de habilidades (mantido enxuto com os golpes principais).

export const EVAL_CATEGORIES = [
  {
    key: 'technical',
    label: 'Técnico',
    hint: 'Nota por golpe — execução e efetividade geral.',
    criteria: [
      ['forehand', 'Forehand'],
      ['backhand', 'Backhand'],
      ['serve', 'Saque'],
      ['serveVariety', 'Domínio de efeitos no saque (kick / slice / flat)', { radar: false }],
      ['forehandSlice', 'Slice de forehand (direita)', { radar: false }],
      ['backhandSlice', 'Slice de backhand (esquerda)', { radar: false }],
      ['returnShot', 'Retorno de saque'],
      ['volley', 'Voleio'],
      ['smash', 'Smash / Overhead'],
    ],
  },
  {
    key: 'tactical',
    label: 'Tático (Game IQ)',
    hint: 'Leitura de jogo e tomada de decisão em ponto.',
    criteria: [
      ['tacticalAnticipation', 'Antecipação e posicionamento'],
      ['tacticalAwareness', 'Tomada de decisão / escolha de golpe'],
      ['tacticalPointConstruction', 'Construção de ponto'],
      ['tacticalAdaptability', 'Adaptação tática (muda o padrão conforme o adversário)'],
      ['angleCreation', 'Criação de ângulos'],
      ['courtZoneAwareness', 'Leitura e uso das zonas de quadra'],
    ],
  },
  {
    key: 'physical',
    label: 'Físico',
    hint: 'Condição física observada em quadra (sem testes de laboratório).',
    criteria: [
      ['footwork', 'Movimentação / footwork'],
      ['physicalFitness', 'Resistência ao longo do treino/jogo'],
      ['physicalRecovery', 'Recuperação entre pontos'],
    ],
  },
  {
    key: 'mental',
    label: 'Mental',
    hint: 'Aspectos psicológicos observáveis em treino e jogo.',
    criteria: [
      ['mentalFocus', 'Foco e concentração'],
      ['mentalEmotionalControl', 'Controle emocional'],
      ['mentalResilience', 'Resiliência sob pressão'],
      ['mentalCompetitiveness', 'Competitividade'],
      ['mentalCoachability', 'Coachability (aplica feedback)'],
    ],
  },
];

// Chave da API (camelCase) -> nome da coluna no banco (snake_case)
export const EVAL_FIELD_TO_DB = {
  forehand: 'forehand',
  backhand: 'backhand',
  serve: 'serve',
  serveVariety: 'serve_variety',
  forehandSlice: 'forehand_slice',
  backhandSlice: 'backhand_slice',
  returnShot: 'return_shot',
  volley: 'volley',
  smash: 'smash',
  tacticalAnticipation: 'tactical_anticipation',
  tacticalAwareness: 'tactical_awareness',
  tacticalPointConstruction: 'tactical_point_construction',
  tacticalAdaptability: 'tactical_adaptability',
  angleCreation: 'angle_creation',
  courtZoneAwareness: 'court_zone_awareness',
  footwork: 'footwork',
  physicalFitness: 'physical_fitness',
  physicalRecovery: 'physical_recovery',
  mentalFocus: 'mental_focus',
  mentalEmotionalControl: 'mental_emotional_control',
  mentalResilience: 'mental_resilience',
  mentalCompetitiveness: 'mental_competitiveness',
  mentalCoachability: 'mental_coachability',
};

// Todos os critérios "achatados", já como [dbColumn, label]
export const EVAL_CRITERIA_FLAT = EVAL_CATEGORIES.flatMap((cat) =>
  cat.criteria.map(([apiKey, label]) => [EVAL_FIELD_TO_DB[apiKey], label])
);

export function categoryAverage(evaluation, category) {
  const values = category.criteria
    .map(([apiKey]) => evaluation[EVAL_FIELD_TO_DB[apiKey]])
    .filter((v) => v !== null && v !== undefined);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export const SCALE_LEGEND = 'Escala 0-10 — 0-2 iniciante · 3-4 em desenvolvimento · 5-6 intermediário · 7-8 avançado · 9-10 elite/nível profissional';

// Eixos para o radar de habilidades: golpes principais (Técnico, exceto variantes
// marcadas radar:false) + 1 eixo agregado por categoria (Tático/Físico/Mental) --
// um radar com todos os ~23 critérios seria ilegível.
export function radarAxes() {
  const technical = EVAL_CATEGORIES.find((c) => c.key === 'technical');
  const rest = EVAL_CATEGORIES.filter((c) => c.key !== 'technical');
  return [
    ...technical.criteria.filter(([, , opts]) => !opts || opts.radar !== false).map(([apiKey, label]) => ({ key: EVAL_FIELD_TO_DB[apiKey], label })),
    ...rest.map((cat) => ({ key: `${cat.key}_avg`, label: cat.label })),
  ];
}

export function radarValues(evaluation) {
  const values = { ...evaluation };
  EVAL_CATEGORIES.forEach((cat) => {
    if (cat.key === 'technical') return;
    values[`${cat.key}_avg`] = categoryAverage(evaluation, cat);
  });
  return values;
}
