import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { readMultipart } from '../lib/multipart.js';
import { analyzeStrokeVideo, STROKE_LABELS } from '../lib/videoAnalysis.js';
import { buildHeuristicBiomechNarrative, refineBiomechNarrativeWithClaude } from '../lib/biomechNarrative.js';
import { scopeAthleteIds } from './athletes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function attachBiomechReport(row) {
  return {
    ...row,
    biomech_report: row.biomech_report_json ? JSON.parse(row.biomech_report_json) : null,
    pose_landmarks: row.pose_landmarks_json ? JSON.parse(row.pose_landmarks_json) : null,
  };
}

function attachNarrative(row) {
  return {
    id: row.id,
    videoAnalysisId: row.video_analysis_id,
    generatedAt: row.generated_at,
    headline: row.headline,
    executiveSummary: row.executive_summary,
    kineticChainAudit: JSON.parse(row.kinetic_chain_audit_json),
    actionPlan: JSON.parse(row.action_plan_json),
    coachEncouragement: row.coach_encouragement,
    source: row.source,
  };
}

export function registerVideoRoutes(router) {
  router.get('/api/video-analyses', async (req, res, params, user, query) => {
    const scoped = scopeAthleteIds(user);
    let rows;
    if (query.athleteId) {
      const athleteId = Number(query.athleteId);
      if (scoped !== null && !scoped.includes(athleteId)) return sendJson(res, 403, { error: 'Acesso negado.' });
      rows = db.prepare('SELECT * FROM stroke_video_analyses WHERE athlete_id = ? ORDER BY date').all(athleteId);
    } else {
      if (scoped !== null) return sendJson(res, 403, { error: 'Recurso nao disponivel para este perfil.' });
      rows = db.prepare('SELECT * FROM stroke_video_analyses ORDER BY date DESC').all();
    }
    sendJson(res, 200, rows.map(attachBiomechReport));
  });

  router.post('/api/video-analyses', async (req, res) => {
    const { fields, files } = await readMultipart(req);
    const athleteId = Number(fields.athleteId);
    const strokeType = fields.strokeType;
    const date = fields.date || new Date().toISOString().slice(0, 10);
    if (!athleteId || !strokeType) return sendJson(res, 400, { error: 'Atleta e tipo de golpe sao obrigatorios.' });

    let videoFilename = null;
    let videoOriginalName = null;
    const file = files.video;
    if (file) {
      const ext = path.extname(file.filename) || '.mp4';
      videoFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      videoOriginalName = file.filename;
      fs.writeFileSync(path.join(uploadsDir, videoFilename), file.data);
    }

    const analysis = analyzeStrokeVideo({ athleteId, strokeType, videoFilename, note: fields.note });

    const info = db.prepare(
      `INSERT INTO stroke_video_analyses (athlete_id, date, stroke_type, video_filename, video_original_name,
        note, technique_score, power_score, consistency_score, balance_score, overall_score, ai_comments,
        analysis_source, serve_type, serve_confidence, knee_flexion, elbow_flexion, shoulder_abduction, shoulder_tilt,
        impact_frame_index, impact_timestamp_ms, impact_confidence, peak_velocity, coil_dissociation, coil_sufficient,
        kinetic_efficiency_score, injury_safety_score, biomech_report_json, pose_landmarks_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      athleteId, date, strokeType, videoFilename, videoOriginalName, fields.note || null,
      analysis.techniqueScore, analysis.powerScore, analysis.consistencyScore, analysis.balanceScore,
      analysis.overallScore, analysis.aiComments, analysis.analysisSource,
      analysis.serveType || null, analysis.serveConfidence ?? null,
      analysis.kneeFlexion ?? null, analysis.elbowFlexion ?? null, analysis.shoulderAbduction ?? null, analysis.shoulderTilt ?? null,
      analysis.impactFrameIndex ?? null, analysis.impactTimestampMs ?? null, analysis.impactConfidence ?? null, analysis.peakVelocity ?? null,
      analysis.coilDissociation ?? null, analysis.coilSufficient == null ? null : (analysis.coilSufficient ? 1 : 0),
      analysis.kineticEfficiencyScore ?? null, analysis.injurySafetyScore ?? null,
      analysis.biomechReport ? JSON.stringify(analysis.biomechReport) : null,
      analysis.poseLandmarks ? JSON.stringify(analysis.poseLandmarks) : null
    );

    sendJson(res, 201, { id: Number(info.lastInsertRowid), ...analysis });
  });

  router.delete('/api/video-analyses/:id', async (req, res, params) => {
    const row = db.prepare('SELECT * FROM stroke_video_analyses WHERE id = ?').get(Number(params.id));
    if (row && row.video_filename) {
      const filePath = path.join(uploadsDir, row.video_filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM stroke_video_analyses WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/video-analyses/:id/file', async (req, res, params) => {
    const row = db.prepare('SELECT * FROM stroke_video_analyses WHERE id = ?').get(Number(params.id));
    if (!row || !row.video_filename) return sendJson(res, 404, { error: 'Video nao encontrado.' });
    const filePath = path.join(uploadsDir, row.video_filename);
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Arquivo nao encontrado no servidor.' });
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    fs.createReadStream(filePath).pipe(res);
  });

  router.get('/api/video-analyses/:id/biomech-narrative', async (req, res, params) => {
    const rows = db.prepare(
      'SELECT * FROM video_biomech_narratives WHERE video_analysis_id = ? ORDER BY generated_at DESC'
    ).all(Number(params.id));
    sendJson(res, 200, rows.map(attachNarrative));
  });

  router.post('/api/video-analyses/:id/biomech-narrative', async (req, res, params) => {
    const videoAnalysisId = Number(params.id);
    const video = db.prepare('SELECT * FROM stroke_video_analyses WHERE id = ?').get(videoAnalysisId);
    if (!video) return sendJson(res, 404, { error: 'Análise de vídeo não encontrada.' });
    if (!video.biomech_report_json) {
      return sendJson(res, 400, { error: 'Esta análise não tem diagnóstico biomecânico (só disponível para golpes com regras implementadas).' });
    }
    const athlete = db.prepare('SELECT name FROM athletes WHERE id = ?').get(video.athlete_id);
    const athleteName = athlete ? athlete.name : 'Atleta';
    const strokeLabel = STROKE_LABELS[video.stroke_type] || video.stroke_type;
    const report = JSON.parse(video.biomech_report_json);

    const b = await readJsonBody(req);
    const heuristic = buildHeuristicBiomechNarrative(report, athleteName, strokeLabel);

    let final = heuristic;
    let source = 'heuristica';
    if (b.useAi) {
      const refined = await refineBiomechNarrativeWithClaude(heuristic, athleteName);
      if (refined) { final = refined; source = 'ia_claude'; }
    }

    const info = db.prepare(
      `INSERT INTO video_biomech_narratives (video_analysis_id, headline, executive_summary,
        kinetic_chain_audit_json, action_plan_json, coach_encouragement, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      videoAnalysisId, final.headline, final.executiveSummary,
      JSON.stringify(final.kineticChainAudit), JSON.stringify(final.actionPlan), final.coachEncouragement, source
    );

    sendJson(res, 201, {
      id: Number(info.lastInsertRowid),
      videoAnalysisId,
      headline: final.headline,
      executiveSummary: final.executiveSummary,
      kineticChainAudit: final.kineticChainAudit,
      actionPlan: final.actionPlan,
      coachEncouragement: final.coachEncouragement,
      source,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  router.delete('/api/video-analyses/:videoId/biomech-narrative/:narrativeId', async (req, res, params) => {
    db.prepare('DELETE FROM video_biomech_narratives WHERE id = ? AND video_analysis_id = ?')
      .run(Number(params.narrativeId), Number(params.videoId));
    sendJson(res, 200, { ok: true });
  });
}
