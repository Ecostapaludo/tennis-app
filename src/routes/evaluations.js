import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { scopeAthleteIds } from './athletes.js';
import { SKILL_LABELS } from '../lib/aiTrainingPlan.js';
import { buildHeuristicEvaluationReport, refineEvaluationReportWithClaude } from '../lib/evaluationReport.js';

function attachReport(row) {
  return {
    ...row,
    highlights: JSON.parse(row.highlights_json),
    improvements: JSON.parse(row.improvements_json),
  };
}

// Colunas do banco (snake_case), organizadas por categoria (ver public/js/evalCriteria.js
// para o modelo completo com labels e a chave da API em camelCase para cada uma)
const CRITERIA = [
  'forehand', 'backhand', 'serve', 'serve_variety', 'forehand_slice', 'backhand_slice', 'return_shot', 'volley', 'smash',
  'tactical_awareness', 'tactical_anticipation', 'tactical_point_construction', 'tactical_adaptability',
  'angle_creation', 'court_zone_awareness',
  'footwork', 'physical_fitness', 'physical_recovery',
  'mental_focus', 'mental_emotional_control', 'mental_resilience', 'mental_competitiveness', 'mental_coachability',
];

// Mapa chave da API (camelCase) -> coluna do banco (snake_case)
const FIELD_TO_DB = {
  forehand: 'forehand', backhand: 'backhand', serve: 'serve', serveVariety: 'serve_variety',
  forehandSlice: 'forehand_slice', backhandSlice: 'backhand_slice', returnShot: 'return_shot',
  volley: 'volley', smash: 'smash',
  tacticalAwareness: 'tactical_awareness', tacticalAnticipation: 'tactical_anticipation',
  tacticalPointConstruction: 'tactical_point_construction', tacticalAdaptability: 'tactical_adaptability',
  angleCreation: 'angle_creation', courtZoneAwareness: 'court_zone_awareness',
  footwork: 'footwork', physicalFitness: 'physical_fitness', physicalRecovery: 'physical_recovery',
  mentalFocus: 'mental_focus', mentalEmotionalControl: 'mental_emotional_control',
  mentalResilience: 'mental_resilience', mentalCompetitiveness: 'mental_competitiveness',
  mentalCoachability: 'mental_coachability',
};

function withOverall(row) {
  const values = CRITERIA.map((c) => row[c]).filter((v) => v !== null && v !== undefined);
  const overall = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { ...row, overall: overall !== null ? Math.round(overall * 10) / 10 : null };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/["\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildEvaluationTemplateCsv(athletes) {
  const header = ['Atleta', 'Data (preencher)', ...CRITERIA.map((c) => SKILL_LABELS[c] || c), 'Notas'];
  const legendRow = ['Escala 0-10: 0-2 iniciante, 3-4 em desenvolvimento, 5-6 intermediario, 7-8 avancado, 9-10 elite/profissional'];
  const rows = athletes.map((a) => [a.name, '', ...CRITERIA.map(() => ''), '']);
  const lines = [legendRow, [], header, ...rows].map((r) => r.map(csvEscape).join(';'));
  return `﻿${lines.join('\r\n')}`;
}

export function registerEvaluationRoutes(router) {
  router.get('/api/evaluations/template', async (req, res, params, user) => {
    const scoped = scopeAthleteIds(user);
    let athletes;
    if (scoped !== null) {
      if (!scoped.length) {
        athletes = [];
      } else {
        const placeholders = scoped.map(() => '?').join(',');
        athletes = db.prepare(`SELECT * FROM athletes WHERE id IN (${placeholders}) AND active = 1 ORDER BY name`).all(...scoped);
      }
    } else {
      athletes = db.prepare('SELECT * FROM athletes WHERE active = 1 ORDER BY name').all();
    }
    const csv = buildEvaluationTemplateCsv(athletes);
    const buffer = Buffer.from(csv, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="planilha-avaliacoes.csv"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  });

  router.get('/api/evaluations', async (req, res, params, user, query) => {
    const scoped = scopeAthleteIds(user);
    let rows;
    if (query.athleteId) {
      const athleteId = Number(query.athleteId);
      if (scoped !== null && !scoped.includes(athleteId)) return sendJson(res, 403, { error: 'Acesso negado.' });
      rows = db.prepare('SELECT * FROM evaluations WHERE athlete_id = ? ORDER BY date').all(athleteId);
    } else {
      if (scoped !== null) {
        if (scoped.length === 0) return sendJson(res, 200, []);
        const placeholders = scoped.map(() => '?').join(',');
        rows = db.prepare(`SELECT * FROM evaluations WHERE athlete_id IN (${placeholders}) ORDER BY date DESC`).all(...scoped);
      } else {
        rows = db.prepare('SELECT * FROM evaluations ORDER BY date DESC').all();
      }
    }
    sendJson(res, 200, rows.map(withOverall));
  });

  router.post('/api/evaluations', async (req, res) => {
    const b = await readJsonBody(req);
    if (!b.athleteId || !b.date) return sendJson(res, 400, { error: 'Atleta e data sao obrigatorios.' });
    const columns = Object.values(FIELD_TO_DB);
    const values = Object.keys(FIELD_TO_DB).map((apiKey) => b[apiKey] ?? null);
    const info = db.prepare(
      `INSERT INTO evaluations (athlete_id, date, ${columns.join(', ')}, notes)
       VALUES (?, ?, ${columns.map(() => '?').join(', ')}, ?)`
    ).run(b.athleteId, b.date, ...values, b.notes || null);
    sendJson(res, 201, { id: Number(info.lastInsertRowid) });
  });

  router.delete('/api/evaluations/:id', async (req, res, params) => {
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/evaluations/:id/report', async (req, res, params, user) => {
    const evalId = Number(params.id);
    const evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
    if (!evaluation) return sendJson(res, 404, { error: 'Avaliação não encontrada.' });
    const scoped = scopeAthleteIds(user);
    if (scoped !== null && !scoped.includes(evaluation.athlete_id)) return sendJson(res, 403, { error: 'Acesso negado.' });
    const rows = db.prepare('SELECT * FROM evaluation_reports WHERE evaluation_id = ? ORDER BY generated_at DESC').all(evalId);
    sendJson(res, 200, rows.map(attachReport));
  });

  router.post('/api/evaluations/:id/report', async (req, res, params) => {
    const evalId = Number(params.id);
    const evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
    if (!evaluation) return sendJson(res, 404, { error: 'Avaliação não encontrada.' });
    const athlete = db.prepare('SELECT name FROM athletes WHERE id = ?').get(evaluation.athlete_id);
    const athleteName = athlete ? athlete.name : 'Atleta';

    const b = await readJsonBody(req);
    const report = buildHeuristicEvaluationReport(evaluation, athleteName);

    let finalSummary = report.summary;
    let source = 'heuristica';
    if (b.useAi) {
      const refined = await refineEvaluationReportWithClaude(report, athleteName);
      if (refined) { finalSummary = refined; source = 'ia_claude'; }
    }

    const info = db.prepare(
      `INSERT INTO evaluation_reports (evaluation_id, summary_text, highlights_json, improvements_json, source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(evalId, finalSummary, JSON.stringify(report.highlights), JSON.stringify(report.improvements), source);

    sendJson(res, 201, {
      id: Number(info.lastInsertRowid),
      evaluationId: evalId,
      summary: finalSummary,
      highlights: report.highlights,
      improvements: report.improvements,
      source,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  router.delete('/api/evaluations/:evalId/report/:reportId', async (req, res, params) => {
    db.prepare('DELETE FROM evaluation_reports WHERE id = ? AND evaluation_id = ?').run(Number(params.reportId), Number(params.evalId));
    sendJson(res, 200, { ok: true });
  });
}

export { CRITERIA };
