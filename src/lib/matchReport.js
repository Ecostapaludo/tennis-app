import https from 'node:https';

// ---------------------------------------------------------------------------
// RELATORIO POS-JOGO
//
// Sempre calcula um relatorio por HEURISTICA a partir das estatisticas reais
// ja registradas no scout do jogo (nenhum numero e inventado). Se a variavel
// ANTHROPIC_API_KEY estiver configurada, o texto e opcionalmente reescrito por
// um modelo Claude a partir dos MESMOS dados, igual ao motor de plano de treino.
// ---------------------------------------------------------------------------

const MATCH_TYPE_LABEL = { torneio: 'Torneio', treino: 'Jogo treino', ranking: 'Ranking' };
const MATCH_FORMAT_LABEL = {
  two_sets_super_tb: '2 sets com super tiebreak',
  super_tb_only: 'Super tiebreak (jogo único)',
  pro_set_8: 'Set pro de 8 games',
  short_sets_4_super_tb: 'Short sets (4 games) + super tiebreak',
};

function round1(v) { return v === null || v === undefined ? null : Math.round(v * 10) / 10; }

export function buildHeuristicMatchReport(match, athleteName) {
  const highlights = [];
  const improvements = [];

  const {
    result, sets_score: setsScore, aces, double_faults: doubleFaults,
    first_serve_pct: firstServePct, first_serve_points_won_pct: firstServeWonPct,
    second_serve_points_won_pct: secondServeWonPct, winners, unforced_errors: unforcedErrors,
    break_points_won: bpWon, break_points_faced: bpFaced,
    net_points_won: netWon, net_points_total: netTotal,
    rallies_up_to_4: ralliesShort, rallies_over_4: ralliesLong,
  } = match;

  if (firstServePct !== null && firstServePct !== undefined) {
    if (firstServePct >= 65) highlights.push(`1º saque consistente (${firstServePct}% de aproveitamento) — base sólida para pressionar o adversário.`);
    else if (firstServePct < 50) improvements.push(`1º saque baixo (${firstServePct}%) — trabalhar consistência antes de buscar mais potência.`);
  }
  if (firstServeWonPct !== null && firstServeWonPct !== undefined) {
    if (firstServeWonPct >= 70) highlights.push(`Ótimo aproveitamento de pontos no 1º saque (${firstServeWonPct}%).`);
    else if (firstServeWonPct < 50) improvements.push(`Poucos pontos ganhos quando o 1º saque entra (${firstServeWonPct}%) — revisar padrões de jogo pós-saque.`);
  }
  if (secondServeWonPct !== null && secondServeWonPct !== undefined && secondServeWonPct < 40) {
    improvements.push(`2º saque vulnerável — apenas ${secondServeWonPct}% de pontos ganhos quando precisou do 2º saque.`);
  }
  if (aces !== null && aces !== undefined && doubleFaults !== null && doubleFaults !== undefined) {
    if (doubleFaults > 0 && doubleFaults >= aces * 1.5 && doubleFaults >= 3) {
      improvements.push(`${doubleFaults} duplas faltas contra ${aces} aces — risco no saque acima do ideal.`);
    } else if (aces >= 3) {
      highlights.push(`${aces} aces no jogo — saque como arma ofensiva.`);
    }
  }
  if (winners !== null && winners !== undefined && unforcedErrors !== null && unforcedErrors !== undefined) {
    if (unforcedErrors > 15) improvements.push(`${unforcedErrors} erros não forçados é um número alto — priorizar consistência de fundo de quadra no próximo treino.`);
    if (winners >= unforcedErrors && winners > 0) highlights.push(`Relação winners/erros não forçados positiva (${winners} winners x ${unforcedErrors} erros).`);
  }
  if (bpFaced !== null && bpFaced !== undefined && bpFaced > 0) {
    const bpPct = round1(((bpWon || 0) / bpFaced) * 100);
    if (bpPct >= 60) highlights.push(`Bom controle em break points: salvou ${bpWon}/${bpFaced} (${bpPct}%).`);
    else if (bpPct < 40) improvements.push(`Aproveitamento baixo em break points (${bpWon || 0}/${bpFaced}, ${bpPct}%) — treinar rotina para pontos de pressão.`);
  }
  if (netTotal !== null && netTotal !== undefined && netTotal >= 3) {
    const netPct = round1(((netWon || 0) / netTotal) * 100);
    if (netPct >= 65) highlights.push(`Jogo de rede eficiente: ${netWon}/${netTotal} pontos ganhos (${netPct}%).`);
    else if (netPct < 40) improvements.push(`Rede pouco efetiva (${netWon || 0}/${netTotal}, ${netPct}%) — trabalhar volejo e transição.`);
  }
  if (ralliesShort !== null && ralliesShort !== undefined && ralliesLong !== null && ralliesLong !== undefined && (ralliesShort + ralliesLong) > 0) {
    const total = ralliesShort + ralliesLong;
    const longPct = round1((ralliesLong / total) * 100);
    if (result === 'derrota' && longPct >= 60) {
      improvements.push(`${longPct}% dos pontos marcados foram rallies longos (acima de 4 trocas) — pode indicar desgaste ou dificuldade em finalizar pontos.`);
    } else if (result === 'vitoria' && ralliesShort >= ralliesLong) {
      highlights.push(`Predomínio de pontos curtos (até 4 trocas: ${ralliesShort} x longos: ${ralliesLong}) — padrão agressivo funcionando.`);
    }
  }

  const resultLabel = result === 'vitoria' ? 'Vitória' : result === 'derrota' ? 'Derrota' : 'Resultado não informado';
  const typeLabel = MATCH_TYPE_LABEL[match.match_type] || match.match_type;
  const formatLabel = match.match_format ? MATCH_FORMAT_LABEL[match.match_format] || match.match_format : null;

  const headerParts = [
    `${resultLabel}${setsScore ? ` (${setsScore})` : ''}`,
    `${typeLabel}${match.tournament_name ? ` · ${match.tournament_name}` : ''}`,
    match.opponent_name ? `vs ${match.opponent_name}` : null,
    formatLabel,
  ].filter(Boolean);

  let summary = `${athleteName} — ${headerParts.join(' · ')}. `;
  if (highlights.length) summary += `Pontos fortes: ${highlights[0]} `;
  if (improvements.length) summary += `Ponto de atenção: ${improvements[0]} `;
  if (!highlights.length && !improvements.length) {
    summary += 'Estatísticas registradas insuficientes para gerar destaques automáticos — lance mais dados no scout deste jogo.';
  }

  return { summary: summary.trim(), highlights, improvements, resultLabel, headerParts };
}

export async function refineMatchReportWithClaude(report, athleteName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é um assistente de um head coach de tênis. Com base nos dados estruturados abaixo ` +
    `(gerados automaticamente a partir das estatísticas do scout de UM jogo), escreva um relatório pós-jogo curto ` +
    `(máx 180 palavras) e acionável sobre a partida de ${athleteName}, em português do Brasil, destacando pontos ` +
    `fortes, pontos de atenção e uma sugestão prática para o próximo treino. Não invente números que não estejam nos dados.\n\n` +
    `DADOS:\n${JSON.stringify({ contexto: report.headerParts, pontosFortesDetectados: report.highlights, pontosDeAtencaoDetectados: report.improvements }, null, 2)}`;

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
