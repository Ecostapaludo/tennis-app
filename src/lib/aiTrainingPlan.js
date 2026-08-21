import https from 'node:https';
import db from '../../db/db.js';
import { weightedAverage, weightedWinRate } from './matchWeights.js';

// ---------------------------------------------------------------------------
// MOTOR DE SUGESTAO DE PLANO DE TREINO
//
// 1) Sempre calcula um plano por HEURISTICA a partir dos dados reais do(s)
//    atleta(s) (avaliacoes, estatisticas de jogos e analises de video), sem
//    depender de nenhum servico externo.
// 2) Os drills sugeridos vem sempre da biblioteca de drills cadastrada pelo
//    head coach (tabela `drills`), casados pelo foco/subdivisao tecnica.
// 3) Se a variavel de ambiente ANTHROPIC_API_KEY estiver configurada, o
//    resumo em texto do plano e opcionalmente reescrito por um modelo Claude
//    (IA generativa real) a partir dos MESMOS dados -- ou seja, a IA nao
//    inventa numeros, apenas transforma os dados calculados em um texto
//    mais claro e acionavel para o treinador.
// ---------------------------------------------------------------------------

// Espelha public/js/evalCriteria.js (modelo de 4 fatores ITF/USTA com criterios
// granulares por categoria) -- mantido em Node puro (sem import ESM cross-lado)
const SKILL_LABELS = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  serve: 'Saque',
  serve_variety: 'Dominio de efeitos no saque',
  forehand_slice: 'Slice de forehand',
  backhand_slice: 'Slice de backhand',
  return_shot: 'Retorno de saque',
  volley: 'Voleio',
  smash: 'Smash',
  tactical_awareness: 'Tomada de decisao / escolha de golpe',
  tactical_anticipation: 'Antecipacao e posicionamento',
  tactical_point_construction: 'Construcao de ponto',
  tactical_adaptability: 'Adaptacao tatica',
  angle_creation: 'Criacao de angulos',
  court_zone_awareness: 'Leitura e uso das zonas de quadra',
  footwork: 'Movimentacao / footwork',
  physical_fitness: 'Resistencia',
  physical_recovery: 'Recuperacao entre pontos',
  mental_focus: 'Foco e concentracao',
  mental_emotional_control: 'Controle emocional',
  mental_resilience: 'Resiliencia sob pressao',
  mental_competitiveness: 'Competitividade',
  mental_coachability: 'Coachability',
};

// Casa cada habilidade avaliada com o foco/subdivisao da biblioteca de drills
const SKILL_TO_DRILL_FILTER = {
  forehand: { focusCategory: 'technical', subcategory: 'forehand' },
  backhand: { focusCategory: 'technical', subcategory: 'backhand' },
  serve: { focusCategory: 'technical', subcategory: 'serve' },
  serve_variety: { focusCategory: 'technical', subcategory: 'serve' },
  forehand_slice: { focusCategory: 'technical', subcategory: 'forehand' },
  backhand_slice: { focusCategory: 'technical', subcategory: 'backhand' },
  return_shot: { focusCategory: 'technical', subcategory: null },
  volley: { focusCategory: 'technical', subcategory: 'volley_smash' },
  smash: { focusCategory: 'technical', subcategory: 'volley_smash' },
  tactical_awareness: { focusCategory: 'tactical', subcategory: null },
  tactical_anticipation: { focusCategory: 'tactical', subcategory: null },
  tactical_point_construction: { focusCategory: 'tactical', subcategory: null },
  tactical_adaptability: { focusCategory: 'tactical', subcategory: null },
  angle_creation: { focusCategory: 'tactical', subcategory: null },
  court_zone_awareness: { focusCategory: 'tactical', subcategory: null },
  footwork: { focusCategory: 'physical', subcategory: null },
  physical_fitness: { focusCategory: 'physical', subcategory: null },
  physical_recovery: { focusCategory: 'physical', subcategory: null },
  mental_focus: { focusCategory: 'mental', subcategory: null },
  mental_emotional_control: { focusCategory: 'mental', subcategory: null },
  mental_resilience: { focusCategory: 'mental', subcategory: null },
  mental_competitiveness: { focusCategory: 'mental', subcategory: null },
  mental_coachability: { focusCategory: 'mental', subcategory: null },
};

function average(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// Busca drills reais da biblioteca (tabela `drills`) para uma habilidade
function drillsForSkill(skill, limit = 3) {
  const filter = SKILL_TO_DRILL_FILTER[skill];
  if (!filter) return [];
  const rows = filter.subcategory
    ? db.prepare(
        'SELECT id, name, description, duration_minutes FROM drills WHERE focus_category = ? AND subcategory = ? ORDER BY name LIMIT ?'
      ).all(filter.focusCategory, filter.subcategory, limit)
    : db.prepare(
        'SELECT id, name, description, duration_minutes FROM drills WHERE focus_category = ? AND subcategory IS NULL ORDER BY name LIMIT ?'
      ).all(filter.focusCategory, limit);
  return rows;
}

// Calcula as notas de habilidade de um atleta a partir da ultima avaliacao,
// ajustadas pelas analises de video (peso 40%) quando existirem
function computeAthleteSkillScores({ evaluations, videoAnalyses }) {
  const latestEval = evaluations[evaluations.length - 1] || null;
  const round1 = (v) => (v === null || v === undefined ? v : Math.round(v * 10) / 10);

  const skillScores = {};
  Object.keys(SKILL_LABELS).forEach((key) => {
    skillScores[key] = latestEval ? round1(latestEval[key]) : null;
  });

  const videoByStroke = {};
  videoAnalyses.forEach((v) => {
    videoByStroke[v.stroke_type] = videoByStroke[v.stroke_type] || [];
    videoByStroke[v.stroke_type].push(v.overall_score);
  });
  ['forehand', 'backhand', 'serve', 'volley', 'smash'].forEach((stroke) => {
    const videoAvg = average(videoByStroke[stroke] || []);
    if (videoAvg !== null && skillScores[stroke] !== null && skillScores[stroke] !== undefined) {
      skillScores[stroke] = Math.round((skillScores[stroke] * 0.6 + videoAvg * 0.4) * 10) / 10;
    } else if (videoAvg !== null) {
      skillScores[stroke] = Math.round(videoAvg * 10) / 10;
    }
  });

  return skillScores;
}

// Recebe os dados brutos de UM atleta e devolve o plano estruturado (heuristica)
export function buildHeuristicPlan({ athlete, evaluations, matches, videoAnalyses }) {
  const skillScores = computeAthleteSkillScores({ evaluations, videoAnalyses });

  const ranked = Object.entries(skillScores)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort((a, b) => a[1] - b[1]);

  const focusAreas = ranked.slice(0, 3).map(([key, score], idx) => ({
    skill: key,
    label: SKILL_LABELS[key],
    score,
    priority: idx + 1,
    reason: `Menor nota entre as avaliadas (${score}/10).`,
    drills: drillsForSkill(key),
  }));

  // Resultados de torneio pesam mais que ranking, que pesa mais que treino --
  // um jogo de treino nao deve influenciar o plano tanto quanto um de torneio
  const recentMatches = matches.slice(-5);
  const avgUnforced = weightedAverage(recentMatches, (m) => m.unforced_errors);
  const avgFirstServePct = weightedAverage(recentMatches, (m) => m.first_serve_pct);
  const winRatePct = weightedWinRate(recentMatches);
  const wins = recentMatches.filter((m) => m.result === 'vitoria').length;

  const matchInsights = [];
  if (avgUnforced !== null && avgUnforced > 15) {
    matchInsights.push(`Media ponderada de ${avgUnforced.toFixed(1)} erros nao forcados nas ultimas partidas -- priorizar consistencia sobre risco.`);
  }
  if (avgFirstServePct !== null && avgFirstServePct < 55) {
    matchInsights.push(`Percentual ponderado de 1o saque em ${avgFirstServePct.toFixed(0)}% -- trabalhar consistencia de saque antes de potencia.`);
  }
  if (recentMatches.length) {
    matchInsights.push(`Aproveitamento recente ponderado (torneio conta mais que ranking, que conta mais que treino): ${winRatePct}% (${wins}/${recentMatches.length} vitorias).`);
  }

  const periodLabel = `Ciclo gerado em ${new Date().toISOString().slice(0, 10)}`;

  const summary = focusAreas.length
    ? `Plano de treino individual para ${athlete.name}: foco prioritario em ${focusAreas.map((f) => f.label).join(', ')}. ` +
      matchInsights.join(' ')
    : `Ainda nao ha dados suficientes (avaliacoes, jogos ou analises de video) para gerar um plano individualizado para ${athlete.name}. Registre pelo menos uma avaliacao de desempenho.`;

  return {
    periodLabel,
    focusAreas,
    matchInsights,
    summary,
    source: 'heuristica',
    isGroup: false,
    athleteNames: [athlete.name],
    snapshot: { skillScores, avgUnforced, avgFirstServePct, weightedWinRatePct: winRatePct, recentMatchesCount: recentMatches.length },
  };
}

// Recebe os dados de DOIS OU MAIS atletas e devolve um plano de grupo, priorizando
// pontos fracos comuns (sinergia) para permitir treinar varios atletas juntos
export function buildGroupHeuristicPlan(athletesData) {
  const perAthlete = athletesData.map(({ athlete, evaluations, videoAnalyses }) => {
    const skillScores = computeAthleteSkillScores({ evaluations, videoAnalyses });
    const ranked = Object.entries(skillScores)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort((a, b) => a[1] - b[1]);
    const weakSkills = new Set(ranked.slice(0, 3).map(([k]) => k));
    return { athlete, skillScores, weakSkills };
  });

  const skillStats = {};
  Object.keys(SKILL_LABELS).forEach((skill) => {
    const scores = perAthlete.map((p) => p.skillScores[skill]).filter((v) => v !== null && v !== undefined);
    const weakAthletes = perAthlete.filter((p) => p.weakSkills.has(skill)).map((p) => p.athlete.name);
    skillStats[skill] = {
      avgScore: average(scores),
      weakCount: weakAthletes.length,
      weakAthletes,
    };
  });

  const ranked = Object.entries(skillStats)
    .filter(([, s]) => s.weakCount > 0)
    .sort((a, b) => (b[1].weakCount - a[1].weakCount) || ((a[1].avgScore ?? 99) - (b[1].avgScore ?? 99)));

  const focusAreas = ranked.slice(0, 4).map(([key, stat], idx) => ({
    skill: key,
    label: SKILL_LABELS[key],
    score: stat.avgScore !== null ? Math.round(stat.avgScore * 10) / 10 : null,
    priority: idx + 1,
    reason: stat.weakCount === perAthlete.length
      ? `Ponto fraco comum aos ${perAthlete.length} atletas selecionados (media ${stat.avgScore !== null ? stat.avgScore.toFixed(1) : '-'}/10) -- ideal para treinar em conjunto.`
      : `Sinergia parcial: ponto fraco de ${stat.weakCount} de ${perAthlete.length} atletas (${stat.weakAthletes.join(', ')}).`,
    drills: drillsForSkill(key),
    sharedBy: stat.weakAthletes,
  }));

  const athleteNames = perAthlete.map((p) => p.athlete.name);
  const periodLabel = `Plano de grupo gerado em ${new Date().toISOString().slice(0, 10)}`;

  const summary = focusAreas.length
    ? `Plano de treino em grupo para ${athleteNames.join(', ')}: pontos de sinergia em ${focusAreas.map((f) => f.label).join(', ')}, permitindo trabalhar esses atletas juntos.`
    : `Ainda nao ha avaliacoes suficientes para os atletas selecionados para identificar pontos comuns de treino.`;

  return {
    periodLabel,
    focusAreas,
    matchInsights: [],
    summary,
    source: 'heuristica',
    isGroup: true,
    athleteNames,
    snapshot: { skillStats },
  };
}

// Chama a API da Anthropic (Claude) para transformar o plano heuristico em um
// texto mais rico, SE ANTHROPIC_API_KEY estiver definida no ambiente.
// Nunca inventa dados: o modelo recebe o JSON do plano heuristico como base.
export async function refinePlanWithClaude(plan, subjectLabel) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const contextLine = plan.isGroup
    ? `um plano de treino EM GRUPO para os atletas ${subjectLabel}, priorizando pontos fracos comuns entre eles (sinergia)`
    : `o plano de treino individual do atleta ${subjectLabel}`;

  const prompt = `Voce e um assistente de um head coach de tenis. Com base nos dados estruturados abaixo ` +
    `(gerados automaticamente a partir de avaliacoes, jogos e analises de video), escreva um resumo curto ` +
    `(max 150 palavras) e acionavel para ${contextLine}, em portugues do Brasil, destacando os focos ` +
    `prioritarios e sugestoes praticas. Nao invente numeros que nao estejam nos dados.\n\n` +
    `DADOS:\n${JSON.stringify({ focusAreas: plan.focusAreas, matchInsights: plan.matchInsights }, null, 2)}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            const text = body?.content?.[0]?.text;
            resolve(text || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

export { SKILL_LABELS };
