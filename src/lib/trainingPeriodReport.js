import https from 'node:https';

// ---------------------------------------------------------------------------
// RELATORIO DE CICLO DE TREINO
//
// Sempre calcula um resumo por HEURISTICA a partir das sessoes de treino JA
// PLANEJADAS num intervalo de datas (foco tecnico/fisico/tatico/mental,
// drills usados, objetivos registrados) -- nenhum numero e inventado, so
// agregado do que ja esta no banco. Se ANTHROPIC_API_KEY estiver configurada,
// o texto e opcionalmente reescrito por Claude a partir dos MESMOS dados,
// mesmo padrao de matchReport.js / biomechNarrative.js.
// ---------------------------------------------------------------------------

const FOCUS_LABEL = { technical: 'Técnico', physical: 'Físico', tactical: 'Tático', mental: 'Mental' };

function fmtBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function buildHeuristicPeriodReport(sessions, { rangeStart, rangeEnd, scopeLabel }) {
  const sessionCount = sessions.length;

  const focusCounts = { technical: 0, physical: 0, tactical: 0, mental: 0 };
  const drillCounts = new Map(); // name -> { count, category }
  const objectives = [];

  sessions.forEach((s) => {
    if (s.focus_technical) focusCounts.technical += 1;
    if (s.focus_physical) focusCounts.physical += 1;
    if (s.focus_tactical) focusCounts.tactical += 1;
    if (s.focus_mental) focusCounts.mental += 1;
    if (s.objective) objectives.push(s.objective.trim());
    (s.drills || []).forEach((d) => {
      const entry = drillCounts.get(d.name) || { count: 0, category: d.focus_category };
      entry.count += 1;
      drillCounts.set(d.name, entry);
    });
  });

  const drillsUsed = Array.from(drillCounts.entries())
    .map(([name, v]) => ({ name, count: v.count, category: v.category }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const focusBreakdown = Object.entries(focusCounts)
    .map(([cat, count]) => ({ category: cat, label: FOCUS_LABEL[cat], count, pct: sessionCount ? Math.round((count / sessionCount) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  const periodLabel = `${fmtBR(rangeStart)} a ${fmtBR(rangeEnd)}`;

  let summary;
  if (!sessionCount) {
    summary = `Nenhuma sessão de treino planejada${scopeLabel ? ` para ${scopeLabel}` : ''} no período de ${periodLabel}.`;
  } else {
    const focusParts = focusBreakdown
      .filter((f) => f.count > 0)
      .map((f) => `${f.label.toLowerCase()} em ${f.count} de ${sessionCount} sessões (${f.pct}%)`);
    const topDrills = drillsUsed.slice(0, 5).map((d) => d.name);
    summary = `${scopeLabel ? `${scopeLabel} — ` : ''}${sessionCount} sessão${sessionCount === 1 ? '' : 'ões'} planejada${sessionCount === 1 ? '' : 's'} entre ${periodLabel}. `
      + (focusParts.length ? `Distribuição de foco: ${focusParts.join('; ')}. ` : '')
      + (topDrills.length ? `Drills mais usados: ${topDrills.join(', ')}. ` : 'Nenhum drill vinculado às sessões deste período. ')
      + (objectives.length ? `${objectives.length} objetivo(s) registrado(s) ao longo do período.` : 'Nenhum objetivo de sessão registrado neste período.');
  }

  return { summary: summary.trim(), sessionCount, focusBreakdown, drillsUsed, objectives, periodLabel };
}

export async function refinePeriodReportWithClaude(report, scopeLabel) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é um assistente de um head coach de tênis. Com base nos dados estruturados abaixo `
    + `(agregados automaticamente a partir das sessões de treino JÁ PLANEJADAS num período), escreva uma análise `
    + `curta (máx 200 palavras) em português do Brasil sobre o que foi trabalhado no ciclo${scopeLabel ? ` de ${scopeLabel}` : ''}, `
    + `destacando padrões de foco (ex: excesso ou falta de algum foco), uso de drills, e uma sugestão prática para o `
    + `próximo ciclo. Não invente números que não estejam nos dados.\n\n`
    + `DADOS:\n${JSON.stringify({
      periodo: report.periodLabel,
      totalSessoes: report.sessionCount,
      distribuicaoFoco: report.focusBreakdown,
      drillsMaisUsados: report.drillsUsed.slice(0, 10),
      objetivosRegistrados: report.objectives,
    }, null, 2)}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 450,
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
