import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { scopeAthleteIds } from './athletes.js';

const FOCUS_LABEL = { technical: 'Técnico', physical: 'Físico', tactical: 'Tático', mental: 'Mental' };
const TECHNICAL_SUBCATEGORY_LABEL = { serve: 'Saque', volley_smash: 'Voleio/Smash', forehand: 'Forehand', backhand: 'Backhand/Slice' };
const KIDS_STAGE_LABEL = { vermelha: 'Bola vermelha', laranja: 'Bola laranja', verde: 'Bola verde' };
const KIDS_STAGES = new Set(['vermelha', 'laranja', 'verde']);
const ATTENDANCE_STATUSES = ['previsto', 'presente', 'ausente', 'justificado'];

function normalizeKidsStage(kidsStage) {
  return KIDS_STAGES.has(kidsStage) ? kidsStage : null;
}

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
    `SELECT d.id, d.name, d.focus_category, d.subcategory, d.duration_minutes, d.description, d.equipment, d.court_zone
     FROM training_session_drills tsd
     JOIN drills d ON d.id = tsd.drill_id WHERE tsd.session_id = ? ORDER BY d.focus_category, d.subcategory, d.name`
  ).all(session.id);
  return { ...session, drills: rows };
}

function addDaysISO(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDateShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PRINT_CSS = `
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 24px; line-height: 1.5; }
.toolbar { position: sticky; top: 0; background: #fff; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid #ddd; }
.toolbar button { background: #0e6ba8; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
.doc-header { margin-bottom: 20px; }
.doc-header h1 { margin: 0 0 4px; font-size: 22px; color: #0e6ba8; }
.doc-subtitle { margin: 0; font-size: 15px; color: #555; }
.day-heading { font-size: 17px; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #0e6ba8; color: #0e6ba8; }
.session { border: 1px solid #ccc; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; break-inside: avoid; }
.session-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.session-time { font-weight: 700; color: #0e6ba8; font-size: 13px; white-space: nowrap; }
.session-title { margin: 0; font-size: 16px; }
.stage-badge { font-size: 11px; font-weight: 600; color: #0e6ba8; background: #e3f2fb; border: 1px solid #b8dff5; border-radius: 999px; padding: 2px 10px; }
.session p { margin: 4px 0; font-size: 13px; }
.drills { margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 8px; }
.drills h4 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; }
.drill { margin-bottom: 8px; padding-left: 10px; border-left: 3px solid #b8dff5; }
.drill-name { font-weight: 700; margin: 0; font-size: 13.5px; }
.drill-meta { font-weight: 400; color: #666; font-size: 12px; }
.drill-desc { white-space: pre-wrap; font-size: 12.5px; color: #333; margin: 3px 0; }
.drill-equip { font-size: 12px; color: #444; }
.empty { color: #777; font-style: italic; }
.doc-footer { margin-top: 30px; font-size: 11px; color: #999; text-align: right; }
@media print {
  .no-print { display: none !important; }
  body { padding: 0; }
}
@page { size: A4; margin: 16mm; }
`;

function drillHtml(d) {
  const meta = [
    FOCUS_LABEL[d.focus_category] || d.focus_category,
    d.subcategory ? TECHNICAL_SUBCATEGORY_LABEL[d.subcategory] || d.subcategory : null,
    d.duration_minutes ? `${d.duration_minutes} min` : null,
    d.court_zone || null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="drill">
      <p class="drill-name">${esc(d.name)} <span class="drill-meta">(${esc(meta)})</span></p>
      ${d.description ? `<p class="drill-desc">${esc(d.description).replace(/\n/g, '<br>')}</p>` : ''}
      ${d.equipment ? `<p class="drill-equip"><strong>Material:</strong> ${esc(d.equipment)}</p>` : ''}
    </div>`;
}

function sessionBlockHtml(s) {
  const timeRange = s.start_time ? `${esc(s.start_time)}${s.end_time ? '–' + esc(s.end_time) : ''}` : '';
  const athleteNames = (s.athletes || []).map((a) => esc(a.name)).join(', ');
  const focusLines = [
    ['Técnico', s.focus_technical], ['Físico', s.focus_physical],
    ['Tático', s.focus_tactical], ['Mental', s.focus_mental],
  ].filter(([, v]) => v).map(([label, v]) => `<p><strong>Foco ${label}:</strong> ${esc(v)}</p>`).join('');
  const drillsHtml = (s.drills || []).length
    ? `<div class="drills"><h4>Drills</h4>${s.drills.map(drillHtml).join('')}</div>`
    : '';

  return `
  <article class="session">
    <div class="session-header">
      <span class="session-time">${timeRange}</span>
      <h3 class="session-title">${esc(s.title)}</h3>
      ${s.kids_stage ? `<span class="stage-badge">${esc(KIDS_STAGE_LABEL[s.kids_stage] || s.kids_stage)}</span>` : ''}
    </div>
    ${s.objective ? `<p><strong>Objetivo:</strong> ${esc(s.objective)}</p>` : ''}
    ${focusLines}
    ${athleteNames ? `<p><strong>Atletas:</strong> ${athleteNames}</p>` : ''}
    ${s.notes ? `<p><strong>Notas:</strong> ${esc(s.notes)}</p>` : ''}
    ${drillsHtml}
  </article>`;
}

function buildPrintHtml(sessions, scope, rangeStart, rangeEnd) {
  const title = scope === 'week'
    ? `Semana de ${formatDateShort(rangeStart)} a ${formatDateShort(rangeEnd)}`
    : formatDateLabel(rangeStart);

  const byDate = new Map();
  sessions.forEach((s) => {
    const key = s.date.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(s);
  });
  const dateKeys = Array.from(byDate.keys()).sort();

  const bodyHtml = dateKeys.length
    ? dateKeys.map((dateKey) => `
      <section class="day-block">
        ${scope === 'week' ? `<h2 class="day-heading">${esc(formatDateLabel(dateKey))}</h2>` : ''}
        ${byDate.get(dateKey).map(sessionBlockHtml).join('')}
      </section>`).join('')
    : '<p class="empty">Nenhuma sessão planejada neste período.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Plano de treino — ${esc(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <div class="no-print toolbar">
    <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  </div>
  <header class="doc-header">
    <h1>Plano de treino</h1>
    <p class="doc-subtitle">${esc(title)}</p>
  </header>
  ${bodyHtml}
  <footer class="doc-footer">Gerado em ${esc(new Date().toLocaleString('pt-BR'))}</footer>
</body>
</html>`;
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

  router.get('/api/training-sessions/print', async (req, res, params, user, query) => {
    const date = query.date;
    const scope = query.scope === 'week' ? 'week' : 'day';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Parametro "date" invalido.');
      return;
    }
    const rangeStart = scope === 'week' ? mondayOfWeek(date) : date;
    const rangeEnd = scope === 'week' ? addDaysISO(rangeStart, 6) : date;

    let rows = db.prepare(
      'SELECT * FROM training_sessions WHERE date >= ? AND date <= ? ORDER BY date, start_time'
    ).all(rangeStart, rangeEnd).map(attachExtras);

    const scoped = scopeAthleteIds(user);
    if (scoped !== null) {
      rows = rows
        .map((s) => ({ ...s, athletes: s.athletes.filter((a) => scoped.includes(a.id)) }))
        .filter((s) => s.athletes.length > 0);
    }

    const html = buildPrintHtml(rows, scope, rangeStart, rangeEnd);
    const buffer = Buffer.from(html, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buffer.length });
    res.end(buffer);
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
        focus_technical, focus_physical, focus_tactical, focus_mental, notes, status, kids_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, b.date, b.startTime || null, b.endTime || null, b.title, b.objective || null,
      b.focusTechnical || null, b.focusPhysical || null, b.focusTactical || null, b.focusMental || null,
      b.notes || null, b.status || 'planejado', normalizeKidsStage(b.kidsStage));
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
        focus_technical=?, focus_physical=?, focus_tactical=?, focus_mental=?, notes=?, status=?, kids_stage=?
       WHERE id=?`
    ).run(
      b.date ?? existing.date, b.startTime ?? existing.start_time, b.endTime ?? existing.end_time,
      b.title ?? existing.title, b.objective ?? existing.objective,
      b.focusTechnical ?? existing.focus_technical, b.focusPhysical ?? existing.focus_physical,
      b.focusTactical ?? existing.focus_tactical, b.focusMental ?? existing.focus_mental,
      b.notes ?? existing.notes, b.status ?? existing.status,
      b.kidsStage !== undefined ? normalizeKidsStage(b.kidsStage) : existing.kids_stage, id
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
