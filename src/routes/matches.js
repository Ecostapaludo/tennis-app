import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { scopeAthleteIds } from './athletes.js';
import { buildHeuristicMatchReport, refineMatchReportWithClaude } from '../lib/matchReport.js';

function attachReport(row) {
  return {
    ...row,
    highlights: JSON.parse(row.highlights_json),
    improvements: JSON.parse(row.improvements_json),
  };
}

// Inverte um placar de sets (ex: "6-4, 3-6, [10-7]" -> "4-6, 6-3, [7-10]") para
// gravar o mesmo jogo do ponto de vista do adversario, quando ele tambem e um
// aluno cadastrado.
function mirrorSetsScore(setsScore) {
  if (!setsScore) return null;
  return setsScore.split(',').map((raw) => {
    const s = raw.trim();
    const bracket = s.startsWith('[') && s.endsWith(']');
    const inner = bracket ? s.slice(1, -1) : s;
    const m = inner.match(/^(\d+)\s*-\s*(\d+)(.*)$/);
    if (!m) return s;
    const mirrored = `${m[2]}-${m[1]}${m[3]}`;
    return bracket ? `[${mirrored}]` : mirrored;
  }).join(', ');
}

function mirrorResult(result) {
  if (result === 'vitoria') return 'derrota';
  if (result === 'derrota') return 'vitoria';
  return null;
}

export function registerMatchRoutes(router) {
  router.get('/api/matches', async (req, res, params, user, query) => {
    const scoped = scopeAthleteIds(user);
    let rows;
    if (query.athleteId) {
      const athleteId = Number(query.athleteId);
      if (scoped !== null && !scoped.includes(athleteId)) return sendJson(res, 403, { error: 'Acesso negado.' });
      rows = db.prepare('SELECT * FROM matches WHERE athlete_id = ? ORDER BY date').all(athleteId);
    } else {
      if (scoped !== null) {
        if (scoped.length === 0) return sendJson(res, 200, []);
        const placeholders = scoped.map(() => '?').join(',');
        rows = db.prepare(`SELECT * FROM matches WHERE athlete_id IN (${placeholders}) ORDER BY date DESC`).all(...scoped);
      } else {
        rows = db.prepare('SELECT * FROM matches ORDER BY date DESC').all();
      }
    }
    if (query.type) rows = rows.filter((r) => r.match_type === query.type);
    sendJson(res, 200, rows);
  });

  router.get('/api/matches/:id', async (req, res, params, user) => {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(params.id));
    if (!row) return sendJson(res, 404, { error: 'Jogo nao encontrado.' });
    const scoped = scopeAthleteIds(user);
    if (scoped !== null && !scoped.includes(row.athlete_id)) return sendJson(res, 403, { error: 'Acesso negado.' });
    sendJson(res, 200, row);
  });

  router.post('/api/matches', async (req, res) => {
    const b = await readJsonBody(req);
    if (!b.athleteId || !b.date || !b.matchType) return sendJson(res, 400, { error: 'Atleta, data e tipo de jogo sao obrigatorios.' });
    const opponentAthleteId = b.opponentAthleteId ? Number(b.opponentAthleteId) : null;
    if (opponentAthleteId === Number(b.athleteId)) {
      return sendJson(res, 400, { error: 'O adversário cadastrado não pode ser o mesmo atleta.' });
    }
    const info = db.prepare(
      `INSERT INTO matches (athlete_id, date, match_type, tournament_name, opponent_name, opponent_athlete_id, result, sets_score,
        aces, double_faults, first_serve_pct, first_serve_points_won_pct, second_serve_points_won_pct,
        winners, unforced_errors, break_points_won, break_points_faced, net_points_won, net_points_total,
        rallies_up_to_4, rallies_over_4, match_format, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      b.athleteId, b.date, b.matchType, b.tournamentName || null, b.opponentName || null, opponentAthleteId, b.result || null,
      b.setsScore || null, b.aces ?? null, b.doubleFaults ?? null, b.firstServePct ?? null,
      b.firstServePointsWonPct ?? null, b.secondServePointsWonPct ?? null, b.winners ?? null,
      b.unforcedErrors ?? null, b.breakPointsWon ?? null, b.breakPointsFaced ?? null,
      b.netPointsWon ?? null, b.netPointsTotal ?? null,
      b.ralliesUpTo4 ?? null, b.ralliesOver4 ?? null, b.matchFormat || null, b.notes || null
    );
    const matchId = Number(info.lastInsertRowid);

    if (opponentAthleteId) {
      const athlete = db.prepare('SELECT name FROM athletes WHERE id = ?').get(b.athleteId);
      db.prepare(
        `INSERT INTO matches (athlete_id, date, match_type, tournament_name, opponent_name, opponent_athlete_id, result, sets_score, match_format, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        opponentAthleteId, b.date, b.matchType, b.tournamentName || null, athlete ? athlete.name : null, Number(b.athleteId),
        mirrorResult(b.result), mirrorSetsScore(b.setsScore), b.matchFormat || null,
        'Lançado automaticamente a partir do jogo registrado para ' + (athlete ? athlete.name : 'o adversário') + '.'
      );
    }

    sendJson(res, 201, { id: matchId });
  });

  router.delete('/api/matches/:id', async (req, res, params) => {
    db.prepare('DELETE FROM matches WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/matches/:id/report', async (req, res, params, user) => {
    const matchId = Number(params.id);
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) return sendJson(res, 404, { error: 'Jogo nao encontrado.' });
    const scoped = scopeAthleteIds(user);
    if (scoped !== null && !scoped.includes(match.athlete_id)) return sendJson(res, 403, { error: 'Acesso negado.' });
    const rows = db.prepare('SELECT * FROM match_reports WHERE match_id = ? ORDER BY generated_at DESC').all(matchId);
    sendJson(res, 200, rows.map(attachReport));
  });

  router.post('/api/matches/:id/report', async (req, res, params) => {
    const matchId = Number(params.id);
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) return sendJson(res, 404, { error: 'Jogo nao encontrado.' });
    const athlete = db.prepare('SELECT name FROM athletes WHERE id = ?').get(match.athlete_id);
    const athleteName = athlete ? athlete.name : 'Atleta';

    const b = await readJsonBody(req);
    const report = buildHeuristicMatchReport(match, athleteName);

    let finalSummary = report.summary;
    let source = 'heuristica';
    if (b.useAi) {
      const refined = await refineMatchReportWithClaude(report, athleteName);
      if (refined) { finalSummary = refined; source = 'ia_claude'; }
    }

    const info = db.prepare(
      `INSERT INTO match_reports (match_id, summary_text, highlights_json, improvements_json, source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(matchId, finalSummary, JSON.stringify(report.highlights), JSON.stringify(report.improvements), source);

    sendJson(res, 201, {
      id: Number(info.lastInsertRowid),
      matchId,
      summary: finalSummary,
      highlights: report.highlights,
      improvements: report.improvements,
      source,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  router.delete('/api/matches/:matchId/report/:reportId', async (req, res, params) => {
    db.prepare('DELETE FROM match_reports WHERE id = ? AND match_id = ?').run(Number(params.reportId), Number(params.matchId));
    sendJson(res, 200, { ok: true });
  });
}
