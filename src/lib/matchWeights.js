// Peso de cada tipo de jogo nas analises da IA (planos de treino, insights de
// resultados): torneio conta mais, seguido por ranking, e por ultimo treino --
// resultados mais competitivos pesam mais na leitura de forma do atleta.
// Usado apenas pelo motor de plano de treino (src/lib/aiTrainingPlan.js), nao
// e exibido em dashboard/relatorios.
const MATCH_TYPE_WEIGHTS = { torneio: 3, ranking: 2, treino: 1 };

function weightOf(match) { return MATCH_TYPE_WEIGHTS[match.match_type] || 1; }

// Media ponderada de um valor numerico das partidas (ex: erros nao forcados, % de 1o saque)
function weightedAverage(matches, valueFn) {
  let sumWeighted = 0;
  let sumWeight = 0;
  matches.forEach((m) => {
    const v = valueFn(m);
    if (typeof v !== 'number' || Number.isNaN(v)) return;
    const w = weightOf(m);
    sumWeighted += v * w;
    sumWeight += w;
  });
  return sumWeight ? sumWeighted / sumWeight : null;
}

// % de aproveitamento ponderado: vitoria/derrota conta pelo peso do tipo de jogo
function weightedWinRate(matches) {
  const decided = matches.filter((m) => m.result === 'vitoria' || m.result === 'derrota');
  const totalWeight = decided.reduce((sum, m) => sum + weightOf(m), 0);
  if (!totalWeight) return null;
  const wonWeight = decided.filter((m) => m.result === 'vitoria').reduce((sum, m) => sum + weightOf(m), 0);
  return Math.round((wonWeight / totalWeight) * 100);
}

export { MATCH_TYPE_WEIGHTS, weightedAverage, weightedWinRate };
