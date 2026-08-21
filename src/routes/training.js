import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { scopeAthleteIds } from './athletes.js';

const FOCUS_LABEL = { technical: 'Técnico', physical: 'Físico', tactical: 'Tático', mental: 'Mental' };
const TECHNICAL_SUBCATEGORY_LABEL = { serve: 'Saque', volley_smash: 'Voleio/Smash', forehand: 'Forehand', backhand: 'Backhand/Slice' };
const ATTENDANCE_STATUSES = ['previsto', 'presente', 'ausente', 'justificado'];

// Segunda-feira (ISO) da semana que contem a data informada
function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Drills selecionados so podem pertencer ao(s) foco(s) definido(s) para a semana da
// sessao -- foco principal, e opcionalmente um foco secundario (fisico/tatico/mental
// combinado com um foco principal tecnico). Vale para qualquer papel; se nenhum foco
// estiver definido para a semana, nao ha restricao.
function drillSelectionError(user, date, drillIds) {
  if (!Array.isArray(drillIds) || !drillIds.length) return null;
  const weekStart = mondayOfWeek(date);
  const focusRow = db.prepare(
    'SELECT focus_category, subcategory, secondary_focus_category FROM weekly_focus WHERE week_start = ?'
  ).get(weekStart);
  if (!focusRow) return null;

  const allowedCategories = [focusRow.focus_category];
  if (focusRow.secondary_focus_category) allowedCategories.push(focusRow.secondary_focus_category);

  const placeholders = drillIds.map(() => '?').join(',');
  const catPlaceholders = allowedCategories.map(() => '?').join(',');
  const offCategory = db.prepare(
    `SELECT COUNT(*) as c FROM drills WHERE id IN (${placeholders}) AND focus_category NOT IN (${catPlaceholders})`
  ).get(...drillIds, ...allowedCategories);
  if (offCategory.c > 0) {
    const labels = allowedCategories.map((c) => FOCUS_LABEL[c]).join(' + ');
    return `O foco desta semana e "${labels}" - so podem ser selecionados drills desse(s) foco(s).`;
  }

  if (focusRow.focus_category === 'technical' && focusRow.subcategory) {
    const offSubcategory = db.prepare(
      `SELECT COUNT(*) as c FROM drills WHERE id IN (${placeholders}) AND focus_category = 'technical'
        AND (subcategory IS NULL OR subcategory != ?)`
    ).get(...drillIds, focusRow.subcategory);
    if (offSubcategory.c > 0) {
      return `O foco tecnico desta semana e "${TECHNICAL_SUBCATEGORY_LABEL[focusRow.subcategory]}" - so podem ser selecionados drills tecnicos dessa subdivisao.`;
    }
  }
  return null;
}

function attachAthletes(session) {
  const rows = db.prepare(
    `SELECT a.id, a.name, tsa.attendance FROM training_session_athletes tsa
     JOIN athletes a ON a.id = tsa.athlete_id WHERE tsa.session_id = ? ORDER BY a.name`
  ).all(session.id);
  return { ...session, athletes: rows };
}

function attachDrills(session) {
  const rows = db.prepare(
    `SELECT d.id, d.name, d.focus_category, d.subcategory, d.duration_minutes FROM training_session_drills tsd
     JOIN drills d ON d.id = tsd.drill_id WHERE tsd.session_id = ? ORDER BY d.focus_category, d.subcategory, d.name`
  ).all(session.id);
  return { ...session, drills: rows };
}

function attachExtras(session) {
  return attachDrills(attachAthletes(session));
}

// Uma sessao "pertence" a uma turma quando o conjunto de atletas da sessao bate
// exatamente com os membros da turma (mesmo criterio usado no dashboard para
// mostrar a turma de cada sessao). Usado para restringir quem pode confirmar
// presenca: so o(s) treinador(es) responsavel(is) pela turma, ou o head coach.
function findGroupForSession(sessionId) {
  const sessionAthleteIds = db.prepare(
    'SELECT athlete_id FROM training_session_athletes WHERE session_id = ?'
  ).all(sessionId).map((r) => r.athlete_id);
  if (!sessionAthleteIds.length) return null;
  const sessionSet = new Set(sessionAthleteIds);

  const groups = db.prepare('SELECT id, name, head_coach_id FROM athlete_groups').all();
  for (const g of groups) {
    const memberIds = db.prepare('SELECT athlete_id FROM athlete_group_members WHERE group_id = ?').all(g.id).map((r) => r.athlete_id);
    if (memberIds.length === sessionSet.size && memberIds.every((id) => sessionSet.has(id))) {
      return g;
    }
  }
  return null;
}

function isTrainerAssignedToGroup(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM athlete_group_trainers WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

export function registerTrainingRoutes(router) {
  router.get('/api/training-sessions', async (req, res, params, user) => {
    let rows = db.prepare('SELECT * FROM training_sessions ORDER BY date DESC, start_time DESC').all().map(attachExtras);
    const scoped = scopeAthleteIds(user);
    if (scoped !== null) {
      // responsavel: so ve sessoes que incluem seu(s) atleta(s), e so ve os proprios
      // atletas vinculados dentro de cada sessao (nao expoe colegas de turma)
      rows = rows
        .map((s) => ({ ...s, athletes: s.athletes.filter((a) => scoped.includes(a.id)) }))
        .filter((s) => s.athletes.length > 0);
    }
    sendJson(res, 200, rows);
  });

  router.get('/api/training-sessions/:id', async (req, res, params, user) => {
    const row = db.prepare('SELECT * FROM training_sessions WHERE id = ?').get(Number(params.id));
    if (!row) return sendJson(res, 404, { error: 'Sessao nao encontrada.' });
    let session = attachExtras(row);
    const scoped = scopeAthleteIds(user);
    if (scoped !== null) {
      session = { ...session, athletes: session.athletes.filter((a) => scoped.includes(a.id)) };
      if (!session.athletes.length) return sendJson(res, 403, { error: 'Acesso negado.' });
    }
    sendJson(res, 200, session);
  });

  router.post('/api/training-sessions', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.date || !b.title) return sendJson(res, 400, { error: 'Data e titulo sao obrigatorios.' });
    const drillError = drillSelectionError(user, b.date, b.drillIds);
    if (drillError) return sendJson(res, 403, { error: drillError });
    const info = db.prepare(
      `INSERT INTO training_sessions (created_by, date, start_time, end_time, title, objective,
        focus_technical, focus_physical, focus_tactical, focus_mental, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, b.date, b.startTime || null, b.endTime || null, b.title, b.objective || null,
      b.focusTechnical || null, b.focusPhysical || null, b.focusTactical || null, b.focusMental || null,
      b.notes || null, b.status || 'planejado');
    const sessionId = Number(info.lastInsertRowid);
    if (Array.isArray(b.athleteIds)) {
      const stmt = db.prepare('INSERT INTO training_session_athletes (session_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(sessionId, aid));
    }
    if (Array.isArray(b.drillIds)) {
      const stmt = db.prepare('INSERT INTO training_session_drills (session_id, drill_id) VALUES (?, ?)');
      b.drillIds.forEach((did) => stmt.run(sessionId, did));
    }
    sendJson(res, 201, { id: sessionId });
  });

  router.put('/api/training-sessions/:id', async (req, res, params, user) => {
    const id = Number(params.id);
    const b = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM training_sessions WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Sessao nao encontrada.' });
    const drillError = drillSelectionError(user, b.date ?? existing.date, b.drillIds);
    if (drillError) return sendJson(res, 403, { error: drillError });
    db.prepare(
      `UPDATE training_sessions SET date=?, start_time=?, end_time=?, title=?, objective=?,
        focus_technical=?, focus_physical=?, focus_tactical=?, focus_mental=?, notes=?, status=?
       WHERE id=?`
    ).run(
      b.date ?? existing.date, b.startTime ?? existing.start_time, b.endTime ?? existing.end_time,
      b.title ?? existing.title, b.objective ?? existing.objective,
      b.focusTechnical ?? existing.focus_technical, b.focusPhysical ?? existing.focus_physical,
      b.focusTactical ?? existing.focus_tactical, b.focusMental ?? existing.focus_mental,
      b.notes ?? existing.notes, b.status ?? existing.status, id
    );
    if (Array.isArray(b.athleteIds)) {
      db.prepare('DELETE FROM training_session_athletes WHERE session_id = ?').run(id);
      const stmt = db.prepare('INSERT INTO training_session_athletes (session_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(id, aid));
    }
    if (Array.isArray(b.drillIds)) {
      db.prepare('DELETE FROM training_session_drills WHERE session_id = ?').run(id);
      const stmt = db.prepare('INSERT INTO training_session_drills (session_id, drill_id) VALUES (?, ?)');
      b.drillIds.forEach((did) => stmt.run(id, did));
    }
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/training-sessions/:id', async (req, res, params) => {
    db.prepare('DELETE FROM training_sessions WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });

  router.patch('/api/training-sessions/:id/attendance', async (req, res, params, user) => {
    const sessionId = Number(params.id);
    const b = await readJsonBody(req);
    const athleteId = Number(b.athleteId);
    if (!athleteId || !ATTENDANCE_STATUSES.includes(b.attendance)) {
      return sendJson(res, 400, { error: 'Atleta e status de presença válidos são obrigatórios.' });
    }
    // Presenca/falta so podem ser confirmadas em aulas de hoje ou ja realizadas --
    // em aulas futuras so se sabe de antemao uma ausencia justificada, nao se pode
    // atestar presenca/falta de algo que ainda nao aconteceu
    if (b.attendance === 'presente' || b.attendance === 'ausente') {
      const session = db.prepare('SELECT date FROM training_sessions WHERE id = ?').get(sessionId);
      const todayStr = new Date().toISOString().slice(0, 10);
      if (session && session.date.slice(0, 10) > todayStr) {
        return sendJson(res, 400, { error: 'Só é possível confirmar presença ou falta em aulas de hoje ou já realizadas. Para aulas futuras, apenas falta justificada.' });
      }
    }
    if (user.role === 'treinador') {
      const group = findGroupForSession(sessionId);
      if (group && group.head_coach_id !== user.id && !isTrainerAssignedToGroup(group.id, user.id)) {
        return sendJson(res, 403, { error: `Apenas o(s) treinador(es) responsável(is) pela turma "${group.name}" pode(m) confirmar presença.` });
      }
    }
    const info = db.prepare(
      'UPDATE training_session_athletes SET attendance = ? WHERE session_id = ? AND athlete_id = ?'
    ).run(b.attendance, sessionId, athleteId);
    if (info.changes === 0) return sendJson(res, 404, { error: 'Atleta não vinculado a esta sessão.' });
    sendJson(res, 200, { ok: true });
  });
}
