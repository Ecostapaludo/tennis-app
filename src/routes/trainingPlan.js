import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { buildHeuristicPlan, buildGroupHeuristicPlan, refinePlanWithClaude } from '../lib/aiTrainingPlan.js';
import { buildPlanCsv, buildPlanPdf } from '../lib/planExport.js';

function loadAthleteData(athleteId) {
  const athlete = db.prepare('SELECT * FROM athletes WHERE id = ?').get(athleteId);
  const evaluations = db.prepare('SELECT * FROM evaluations WHERE athlete_id = ? ORDER BY date').all(athleteId);
  const matches = db.prepare('SELECT * FROM matches WHERE athlete_id = ? ORDER BY date').all(athleteId);
  const videoAnalyses = db.prepare('SELECT * FROM stroke_video_analyses WHERE athlete_id = ? ORDER BY date').all(athleteId);
  return { athlete, evaluations, matches, videoAnalyses };
}

function groupMembersOf(planId) {
  return db.prepare(
    `SELECT a.id, a.name FROM training_plan_athletes tpa
     JOIN athletes a ON a.id = tpa.athlete_id WHERE tpa.plan_id = ? ORDER BY a.name`
  ).all(planId);
}

function attachGroupInfo(row) {
  const groupMembers = groupMembersOf(row.id);
  return { ...row, focusAreas: JSON.parse(row.focus_areas_json), isGroup: groupMembers.length > 0, groupMembers };
}

export function registerTrainingPlanRoutes(router) {
  router.get('/api/training-plans', async (req, res, params, user, query) => {
    if (!query.athleteId) return sendJson(res, 400, { error: 'Informe athleteId.' });
    const athleteId = Number(query.athleteId);
    const rows = db.prepare(
      `SELECT DISTINCT tp.* FROM training_plans tp
       LEFT JOIN training_plan_athletes tpa ON tpa.plan_id = tp.id
       WHERE tp.athlete_id = ? OR tpa.athlete_id = ?
       ORDER BY tp.generated_at DESC`
    ).all(athleteId, athleteId);
    sendJson(res, 200, rows.map(attachGroupInfo));
  });

  router.post('/api/training-plans/generate', async (req, res, params, user) => {
    const body = await readJsonBody(req);
    const athleteIds = Array.isArray(body.athleteIds) && body.athleteIds.length
      ? [...new Set(body.athleteIds.map(Number))]
      : (body.athleteId ? [Number(body.athleteId)] : []);
    if (!athleteIds.length) return sendJson(res, 400, { error: 'Informe ao menos um atleta.' });

    const athletesData = athleteIds.map(loadAthleteData);
    if (athletesData.some((d) => !d.athlete)) return sendJson(res, 404, { error: 'Atleta nao encontrado.' });

    const plan = athletesData.length > 1 ? buildGroupHeuristicPlan(athletesData) : buildHeuristicPlan(athletesData[0]);

    let finalSummary = plan.summary;
    let source = 'heuristica';
    if (body.useAi) {
      const refined = await refinePlanWithClaude(plan, plan.athleteNames.join(', '));
      if (refined) { finalSummary = refined; source = 'ia_claude'; }
    }

    const info = db.prepare(
      `INSERT INTO training_plans (athlete_id, period_label, focus_areas_json, summary_text, source, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(athleteIds[0], plan.periodLabel, JSON.stringify(plan.focusAreas), finalSummary, source, JSON.stringify(plan.snapshot));
    const planId = Number(info.lastInsertRowid);

    if (athleteIds.length > 1) {
      const stmt = db.prepare('INSERT INTO training_plan_athletes (plan_id, athlete_id) VALUES (?, ?)');
      athleteIds.forEach((aid) => stmt.run(planId, aid));
    }

    sendJson(res, 201, {
      id: planId,
      periodLabel: plan.periodLabel,
      focusAreas: plan.focusAreas,
      matchInsights: plan.matchInsights,
      summary: finalSummary,
      source,
      isGroup: plan.isGroup,
      athleteNames: plan.athleteNames,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  router.delete('/api/training-plans/:id', async (req, res, params) => {
    db.prepare('DELETE FROM training_plans WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/training-plans/:id/export', async (req, res, params, user, query) => {
    const id = Number(params.id);
    const row = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(id);
    if (!row) return sendJson(res, 404, { error: 'Plano nao encontrado.' });
    const groupMembers = groupMembersOf(id);
    const athleteNames = groupMembers.length
      ? groupMembers.map((m) => m.name)
      : [db.prepare('SELECT name FROM athletes WHERE id = ?').get(row.athlete_id)?.name || 'Atleta'];

    const plan = {
      periodLabel: row.period_label,
      summary: row.summary_text,
      focusAreas: JSON.parse(row.focus_areas_json),
      matchInsights: [],
      isGroup: groupMembers.length > 0,
      athleteNames,
    };

    const format = query.format === 'pdf' ? 'pdf' : 'csv';
    const safeName = athleteNames.join('-').replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 60) || 'plano';

    if (format === 'pdf') {
      const buffer = buildPlanPdf(plan);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="plano-treino-${safeName}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } else {
      const buffer = Buffer.from(buildPlanCsv(plan), 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="plano-treino-${safeName}.csv"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    }
  });
}
