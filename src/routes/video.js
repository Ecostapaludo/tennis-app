import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from '../../db/db.js';
import { sendJson } from '../lib/router.js';
import { readMultipart } from '../lib/multipart.js';
import { analyzeStrokeVideo } from '../lib/videoAnalysis.js';
import { scopeAthleteIds } from './athletes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
    sendJson(res, 200, rows);
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
        analysis_source, serve_type, serve_confidence, knee_flexion, elbow_flexion, shoulder_abduction, shoulder_tilt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      athleteId, date, strokeType, videoFilename, videoOriginalName, fields.note || null,
      analysis.techniqueScore, analysis.powerScore, analysis.consistencyScore, analysis.balanceScore,
      analysis.overallScore, analysis.aiComments, analysis.analysisSource,
      analysis.serveType || null, analysis.serveConfidence ?? null,
      analysis.kneeFlexion ?? null, analysis.elbowFlexion ?? null, analysis.shoulderAbduction ?? null, analysis.shoulderTilt ?? null
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
}
