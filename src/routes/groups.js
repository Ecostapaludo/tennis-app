import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const BALL_STAGES = new Set(['vermelha', 'laranja', 'verde', 'amarela']);

function normalizeBallStage(ballStage) {
  return BALL_STAGES.has(ballStage) ? ballStage : null;
}

function attachMembers(group) {
  const rows = db.prepare(
    `SELECT a.id, a.name FROM athlete_group_members agm
     JOIN athletes a ON a.id = agm.athlete_id WHERE agm.group_id = ? ORDER BY a.name`
  ).all(group.id);
  let scheduleSlots = [];
  if (group.schedule_slots) {
    try { scheduleSlots = JSON.parse(group.schedule_slots); } catch { scheduleSlots = []; }
  }
  const headCoach = group.head_coach_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(group.head_coach_id) || null
    : null;
  const trainers = db.prepare(
    `SELECT u.id, u.name FROM athlete_group_trainers agt
     JOIN users u ON u.id = agt.user_id WHERE agt.group_id = ? ORDER BY u.name`
  ).all(group.id);
  return { ...group, is_dropin: !!group.is_dropin, scheduleSlots, headCoach, trainers, athletes: rows };
}

function setTrainers(groupId, trainerIds) {
  db.prepare('DELETE FROM athlete_group_trainers WHERE group_id = ?').run(groupId);
  if (!Array.isArray(trainerIds) || !trainerIds.length) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO athlete_group_trainers (group_id, user_id) VALUES (?, ?)');
  trainerIds.forEach((uid) => stmt.run(groupId, uid));
}

// Turma precisa de pelo menos um horario selecionado no calendario semanal, OU ser
// marcada como aula avulsa (sem horario fixo)
function validSlots(scheduleSlots) {
  return Array.isArray(scheduleSlots)
    && scheduleSlots.every((s) => s && WEEKDAYS.includes(s.day) && Number.isInteger(s.hour));
}

function scheduleError(isDropin, scheduleSlots) {
  if (isDropin) return null;
  if (!validSlots(scheduleSlots) || !scheduleSlots.length) {
    return 'Selecione ao menos um horario no calendario ou marque como aula avulsa.';
  }
  return null;
}

export function registerGroupRoutes(router) {
  router.get('/api/groups', async (req, res) => {
    const rows = db.prepare('SELECT * FROM athlete_groups ORDER BY name').all();
    sendJson(res, 200, rows.map(attachMembers));
  });

  router.get('/api/groups/:id', async (req, res, params) => {
    const row = db.prepare('SELECT * FROM athlete_groups WHERE id = ?').get(Number(params.id));
    if (!row) return sendJson(res, 404, { error: 'Turma nao encontrada.' });
    sendJson(res, 200, attachMembers(row));
  });

  router.post('/api/groups', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.name || !b.name.trim()) return sendJson(res, 400, { error: 'Nome da turma e obrigatorio.' });
    const isDropin = !!b.isDropin;
    const schErr = scheduleError(isDropin, b.scheduleSlots);
    if (schErr) return sendJson(res, 400, { error: schErr });
    const info = db.prepare(
      'INSERT INTO athlete_groups (created_by, name, description, schedule_time, schedule_slots, is_dropin, head_coach_id, ball_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      user.id, b.name.trim(), b.description || null,
      isDropin ? null : (b.scheduleTime || null),
      isDropin ? null : JSON.stringify(b.scheduleSlots),
      isDropin ? 1 : 0,
      b.headCoachId || null,
      normalizeBallStage(b.ballStage)
    );
    const groupId = Number(info.lastInsertRowid);
    if (Array.isArray(b.athleteIds)) {
      const stmt = db.prepare('INSERT INTO athlete_group_members (group_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(groupId, aid));
    }
    setTrainers(groupId, b.trainerIds);
    sendJson(res, 201, { id: groupId });
  });

  router.put('/api/groups/:id', async (req, res, params) => {
    const id = Number(params.id);
    const b = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM athlete_groups WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Turma nao encontrada.' });
    if (b.name !== undefined && !b.name.trim()) return sendJson(res, 400, { error: 'Nome da turma e obrigatorio.' });
    const isDropin = b.isDropin !== undefined ? !!b.isDropin : !!existing.is_dropin;
    const scheduleSlots = b.scheduleSlots !== undefined
      ? b.scheduleSlots
      : (existing.schedule_slots ? JSON.parse(existing.schedule_slots) : []);
    const schErr = scheduleError(isDropin, scheduleSlots);
    if (schErr) return sendJson(res, 400, { error: schErr });
    db.prepare('UPDATE athlete_groups SET name=?, description=?, schedule_time=?, schedule_slots=?, is_dropin=?, head_coach_id=?, ball_stage=? WHERE id=?').run(
      b.name !== undefined ? b.name.trim() : existing.name,
      b.description !== undefined ? b.description : existing.description,
      isDropin ? null : (b.scheduleTime !== undefined ? b.scheduleTime : existing.schedule_time),
      isDropin ? null : JSON.stringify(scheduleSlots),
      isDropin ? 1 : 0,
      b.headCoachId !== undefined ? (b.headCoachId || null) : existing.head_coach_id,
      b.ballStage !== undefined ? normalizeBallStage(b.ballStage) : existing.ball_stage,
      id
    );
    if (Array.isArray(b.athleteIds)) {
      db.prepare('DELETE FROM athlete_group_members WHERE group_id = ?').run(id);
      const stmt = db.prepare('INSERT INTO athlete_group_members (group_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(id, aid));
    }
    if (b.trainerIds !== undefined) setTrainers(id, b.trainerIds);
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/groups/:id', async (req, res, params) => {
    db.prepare('DELETE FROM athlete_groups WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });
}
