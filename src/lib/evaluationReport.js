import https from 'node:https';
import { SKILL_LABELS } from './aiTrainingPlan.js';

// ---------------------------------------------------------------------------
// RELATORIO DE IA PARA UMA AVALIACAO DE DESEMPENHO
//
// Mesmo padrao do relatorio pos-jogo (src/lib/matchReport.js) e do plano de
// treino: sempre calcula um relatorio por HEURISTICA a partir das notas reais
// ja lancadas na avaliacao (nenhum numero e inventado); se ANTHROPIC_API_KEY
// estiver configurada, o texto pode ser opcionalmente reescrito por Claude.
// ---------------------------------------------------------------------------

const CATEGORY_GROUPS = [
  { label: 'Técnico', criteria: ['forehand', 'backhand', 'serve', 'serve_variety', 'forehand_slice', 'backhand_slice', 'return_shot', 'volley', 'smash'] },
  { label: 'Tático', criteria: ['tactical_awareness', 'tactical_anticipation', 'tactical_point_construction', 'tactical_adaptability', 'angle_creation', 'court_zone_awareness'] },
  { label: 'Físico', criteria: ['footwork', 'physical_fitness', 'physical_recovery'] },
  { label: 'Mental', criteria: ['mental_focus', 'mental_emotional_control', 'mental_resilience', 'mental_competitiveness', 'mental_coachability'] },
];

function average(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
function round1(v) { return v === null || v === undefined ? null : Math.round(v * 10) / 10; }

export function buildHeuristicEvaluationReport(evaluation, athleteName) {
  const highlights = [];
  const improvements = [];

  const allScores = CATEGORY_GROUPS.flatMap((g) => g.criteria)
    .map((key) => ({ key, label: SKILL_LABELS[key] || key, value: evaluation[key] }))
    .filter((s) => s.value !== null && s.value !== undefined);

  const overall = round1(average(allScores.map((s) => s.value)));

  const categoryAverages = CATEGORY_GROUPS.map((g) => ({
    label: g.label,
    avg: round1(average(g.criteria.map((c) => evaluation[c]))),
  })).filter((c) => c.avg !== null);

  categoryAverages.forEach((c) => {
    if (c.avg >= 8) highlights.push(`Categoria ${c.label} em bom nível (média ${c.avg}/10).`);
    else if (c.avg < 5.5) improvements.push(`Categoria ${c.label} abaixo do esperado (média ${c.avg}/10) — merece atenção prioritária.`);
  });

  const sortedDesc = allScores.slice().sort((a, b) => b.value - a.value);
  sortedDesc.slice(0, 3).forEach((s) => {
    if (s.value >= 7.5) highlights.push(`${s.label}: ${s.value}/10 — ponto forte do atleta.`);
  });
  sortedDesc.slice(-3).reverse().forEach((s) => {
    if (s.value <= 5.5) improvements.push(`${s.label}: ${s.value}/10 — recomendado priorizar nos próximos treinos.`);
  });

  const headerParts = [
    `Nota geral: ${overall !== null ? `${overall}/10` : 'sem dados suficientes'}`,
    `${allScores.length} critérios avaliados`,
  ];

  let summary = `${athleteName} — ${headerParts.join(' · ')}. `;
  if (highlights.length) summary += `Ponto forte: ${highlights[0]} `;
  if (improvements.length) summary += `Foco recomendado: ${improvements[0]} `;
  if (!highlights.length && !improvements.length) {
    summary += 'Notas registradas insuficientes para gerar destaques automáticos.';
  }

  return { summary: summary.trim(), highlights, improvements, headerParts, categoryAverages, overall };
}

export async function refineEvaluationReportWithClaude(report, athleteName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é um assistente de um head coach de tênis. Com base nos dados estruturados abaixo ` +
    `(gerados automaticamente a partir de UMA avaliação de desempenho, modelo de 4 fatores ITF/USTA), escreva um ` +
    `relatório curto (máx 180 palavras) e acionável sobre a avaliação de ${athleteName}, em português do Brasil, ` +
    `destacando pontos fortes, pontos de atenção e uma sugestão prática de foco para os próximos treinos. ` +
    `Não invente números que não estejam nos dados.\n\n` +
    `DADOS:\n${JSON.stringify({ contexto: report.headerParts, mediasPorCategoria: report.categoryAverages, pontosFortesDetectados: report.highlights, pontosDeAtencaoDetectados: report.improvements }, null, 2)}`;

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
