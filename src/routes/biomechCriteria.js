import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';

const STROKE_LABELS = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  backhand_2h: 'Backhand (2 mãos)',
  backhand_1h: 'Backhand (1 mão)',
  serve: 'Saque',
  volley: 'Voleio',
  smash: 'Smash',
};

function attachPhases(strokeType) {
  const phases = db.prepare(
    'SELECT * FROM biomech_phases WHERE stroke_type = ? ORDER BY phase_order'
  ).all(strokeType);
  const markerStmt = db.prepare('SELECT * FROM biomech_markers WHERE phase_id = ? ORDER BY marker_order');
  return phases.map((p) => ({
    id: p.id,
    phaseOrder: p.phase_order,
    phaseName: p.phase_name,
    timeframe: p.timeframe,
    markers: markerStmt.all(p.id).map((m) => ({
      id: m.id,
      markerKey: m.marker_key,
      name: m.name,
      description: m.description,
      targetRange: m.target_range,
      criticality: m.criticality,
      faultIndicator: m.fault_indicator,
    })),
  }));
}

function validateImportPayload(b) {
  if (!b || typeof b !== 'object') return 'JSON invalido.';
  if (!b.stroke_type || typeof b.stroke_type !== 'string') return 'Campo "stroke_type" e obrigatorio.';
  if (!Array.isArray(b.phases) || !b.phases.length) return 'Campo "phases" precisa ser uma lista com ao menos 1 fase.';
  for (const phase of b.phases) {
    if (!phase.phase_name) return 'Cada fase precisa de "phase_name".';
    if (!Array.isArray(phase.markers) || !phase.markers.length) {
      return `A fase "${phase.phase_name}" precisa de ao menos 1 marcador em "markers".`;
    }
    for (const marker of phase.markers) {
      if (!marker.marker_id || !marker.name) return `Cada marcador precisa de "marker_id" e "name" (fase "${phase.phase_name}").`;
    }
  }
  return null;
}

export function registerBiomechCriteriaRoutes(router) {
  router.get('/api/biomech-criteria', async (req, res) => {
    const models = db.prepare('SELECT * FROM biomech_models ORDER BY stroke_type').all();
    const countStmt = db.prepare(
      `SELECT COUNT(*) as n FROM biomech_markers m
       JOIN biomech_phases p ON p.id = m.phase_id WHERE p.stroke_type = ?`
    );
    sendJson(res, 200, models.map((m) => ({
      strokeType: m.stroke_type,
      strokeLabel: STROKE_LABELS[m.stroke_type] || m.stroke_type,
      modelVersion: m.model_version,
      updatedAt: m.updated_at,
      markerCount: countStmt.get(m.stroke_type).n,
    })));
  });

  router.get('/api/biomech-criteria/:strokeType', async (req, res, params) => {
    const strokeType = params.strokeType;
    const model = db.prepare('SELECT * FROM biomech_models WHERE stroke_type = ?').get(strokeType);
    if (!model) return sendJson(res, 404, { error: 'Nenhum critério biomecânico cadastrado para este golpe.' });
    sendJson(res, 200, {
      strokeType: model.stroke_type,
      strokeLabel: STROKE_LABELS[model.stroke_type] || model.stroke_type,
      modelVersion: model.model_version,
      updatedAt: model.updated_at,
      phases: attachPhases(strokeType),
    });
  });

  // Importa (ou substitui) o modelo biomecanico de um golpe a partir do JSON
  // estruturado (fases + marcadores) definido pelo head coach -- ver formato
  // em db/schema.sql / biomechCriteria.js. Substituir apaga fases/marcadores
  // antigos daquele golpe e grava os novos (cascade cuida dos marcadores).
  router.post('/api/biomech-criteria/import', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    const validationError = validateImportPayload(b);
    if (validationError) return sendJson(res, 400, { error: validationError });

    const strokeType = b.stroke_type.trim();
    const modelVersion = b.biomechanical_model_version || '1.0';

    db.prepare('DELETE FROM biomech_phases WHERE stroke_type = ?').run(strokeType);
    db.prepare(
      `INSERT INTO biomech_models (stroke_type, model_version, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(stroke_type) DO UPDATE SET model_version = excluded.model_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).run(strokeType, modelVersion, user.id);

    const phaseStmt = db.prepare(
      'INSERT INTO biomech_phases (stroke_type, phase_order, phase_name, timeframe) VALUES (?, ?, ?, ?)'
    );
    const markerStmt = db.prepare(
      `INSERT INTO biomech_markers (phase_id, marker_order, marker_key, name, description, target_range, criticality, fault_indicator)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    b.phases.forEach((phase, phaseIdx) => {
      const info = phaseStmt.run(strokeType, phase.phase_id ?? phaseIdx + 1, phase.phase_name, phase.timeframe || null);
      const phaseId = Number(info.lastInsertRowid);
      phase.markers.forEach((marker, markerIdx) => {
        markerStmt.run(
          phaseId, markerIdx + 1, marker.marker_id, marker.name,
          marker.description || null, marker.target_range || null,
          marker.criticality || null, marker.fault_indicator || null
        );
      });
    });

    sendJson(res, 201, { strokeType, phases: attachPhases(strokeType).length });
  });

  router.delete('/api/biomech-criteria/:strokeType', async (req, res, params) => {
    db.prepare('DELETE FROM biomech_models WHERE stroke_type = ?').run(params.strokeType);
    sendJson(res, 200, { ok: true });
  });
}
