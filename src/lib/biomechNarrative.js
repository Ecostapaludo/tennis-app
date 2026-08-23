import https from 'node:https';

// ---------------------------------------------------------------------------
// RELATORIO NARRATIVO APROFUNDADO PARA UMA ANALISE BIOMECANICA DE VIDEO
//
// Mesmo padrao dos outros relatorios de IA do app (matchReport.js,
// evaluationReport.js): sempre monta uma versao por HEURISTICA a partir do
// biomechReport ja calculado pelo motor de regras real (nenhum diagnostico e
// inventado); se ANTHROPIC_API_KEY estiver configurada, o texto e
// opcionalmente reescrito/expandido por Claude a partir dos MESMOS dados.
//
// O formato de saida (headline/executiveSummary/kineticChainAudit/actionPlan/
// coachEncouragement) e adaptado do schema estruturado que o head coach tinha
// desenhado para um provedor de IA diferente (Gemini, gemini-code-
// 1787497812892.ts) -- aqui usamos o mesmo padrao de chamada direta a API do
// Claude ja estabelecido no resto do app, em vez de adicionar uma dependencia
// nova (@google/genai) so para isso.
// ---------------------------------------------------------------------------

const CATEGORY_LABEL = {
  POWER_GENERATION: 'Geração de potência',
  CONTROL_TIMING: 'Controle e timing',
  INJURY_RISK: 'Risco de lesão',
  BALANCE: 'Equilíbrio',
};

export function buildHeuristicBiomechNarrative(report, athleteName, strokeLabel) {
  const diagnoses = report.diagnoses || [];

  const headline = diagnoses.length
    ? diagnoses[0].title
    : 'Execução dentro do padrão biomecânico esperado';

  const executiveSummary = report.summaryFeedback;

  const kineticChainAudit = diagnoses.map((d) => ({
    segment: CATEGORY_LABEL[d.category] || d.category,
    status: d.severity,
    finding: d.rootCauseDescription,
  }));

  let priority = 1;
  const actionPlan = [];
  diagnoses.forEach((d) => {
    (d.correctiveDrills || []).forEach((drill) => {
      actionPlan.push({
        priority: priority++,
        drillName: drill.drillName,
        objective: drill.objective,
        motorCue: drill.focusCue,
        dosage: null,
      });
    });
  });

  const coachEncouragement = diagnoses.length
    ? `${athleteName} já tem uma base para evoluir — foque em 1 ajuste por vez e reavalie em algumas semanas.`
    : `${athleteName} está executando o ${strokeLabel.toLowerCase()} dentro do esperado — mantenha a consistência do treino.`;

  return {
    strokeTitle: strokeLabel,
    efficiencyScore: report.overallKineticEfficiencyScore,
    safetyScore: report.injurySafetyScore,
    headline,
    executiveSummary,
    kineticChainAudit,
    actionPlan,
    coachEncouragement,
  };
}

export async function refineBiomechNarrativeWithClaude(narrative, athleteName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é um cientista biomecânico de elite do tênis, trabalhando com o head coach de ${athleteName}. ` +
    `Com base no diagnóstico estruturado abaixo (gerado automaticamente por um motor de regras biomecânicas real, ` +
    `a partir de ângulos e métricas medidos), reescreva um relatório mais rico e com comandos motores claros, ` +
    `em português do Brasil, focado em conectar a cadeia cinética e prevenir lesões. ` +
    `NÃO invente diagnósticos, ângulos ou drills que não estejam nos dados -- você pode reordenar, priorizar e ` +
    `melhorar a redação, mas o conteúdo técnico deve vir só do que foi fornecido.\n\n` +
    `Responda ESTRITAMENTE em JSON válido (sem markdown, sem texto fora do JSON) neste formato exato:\n` +
    `{"headline": string, "executiveSummary": string (max 60 palavras), ` +
    `"kineticChainAudit": [{"segment": string, "status": string, "finding": string}], ` +
    `"actionPlan": [{"priority": number, "drillName": string, "objective": string, "motorCue": string, "dosage": string}], ` +
    `"coachEncouragement": string (max 40 palavras)}\n\n` +
    `DADOS:\n${JSON.stringify(narrative, null, 2)}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
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
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            const text = body?.content?.[0]?.text;
            if (!text) return resolve(null);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return resolve(null);
            const parsed = JSON.parse(jsonMatch[0]);
            if (!parsed.headline || !Array.isArray(parsed.actionPlan)) return resolve(null);
            resolve(parsed);
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
