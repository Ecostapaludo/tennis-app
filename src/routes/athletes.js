import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { ROLES } from '../lib/auth.js';

function scopeAthleteIds(user) {
  if (user.role === ROLES.RESPONSAVEL) return user.athleteIds || [];
  return null; // null = sem restricao (head_coach / treinador veem todos)
}

export function registerAthleteRoutes(router) {
  router.get('/api/athletes', async (req, res, params, user) => {
    const scoped = scopeAthleteIds(user);
    let rows;
    if (scoped !== null) {
      if (scoped.length === 0) return sendJson(res, 200, []);
      const placeholders = scoped.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM athletes WHERE id IN (${placeholders}) ORDER BY name`).all(...scoped);
    } else {
      rows = db.prepare('SELECT * FROM athletes ORDER BY active DESC, name').all();
    }
    sendJson(res, 200, rows);
  });

  router.get('/api/athletes/:id', async (req, res, params, user) => {
    const id = Number(params.id);
    const scoped = scopeAthleteIds(user);
    if (scoped !== null && !scoped.includes(id)) return sendJson(res, 403, { error: 'Acesso negado.' });
    const row = db.prepare('SELECT * FROM athletes WHERE id = ?').get(id);
    if (!row) return sendJson(res, 404, { error: 'Atleta nao encontrado.' });
    sendJson(res, 200, row);
  });

  router.post('/api/athletes', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.name || !b.name.trim()) return sendJson(res, 400, { error: 'Nome e obrigatorio.' });
    const info = db.prepare(
      `INSERT INTO athletes (created_by, name, birth_date, category, gender, dominant_hand, ranking_position, club, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, b.name.trim(), b.birthDate || null, b.category || null, b.gender || null, b.dominantHand || null,
      b.rankingPosition || null, b.club || null, b.notes || null);
    sendJson(res, 201, { id: Number(info.lastInsertRowid) });
  });

  router.put('/api/athletes/:id', async (req, res, params) => {
    const id = Number(params.id);
    const b = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM athletes WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Atleta nao encontrado.' });
    db.prepare(
      `UPDATE athletes SET name=?, birth_date=?, category=?, gender=?, dominant_hand=?, ranking_position=?, club=?, notes=?, active=?
       WHERE id=?`
    ).run(
      b.name ?? existing.name,
      b.birthDate ?? existing.birth_date,
      b.category ?? existing.category,
      b.gender ?? existing.gender,
      b.dominantHand ?? existing.dominant_hand,
      b.rankingPosition ?? existing.ranking_position,
      b.club ?? existing.club,
      b.notes ?? existing.notes,
      b.active !== undefined ? (b.active ? 1 : 0) : existing.active,
      id
    );
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/athletes/:id', async (req, res, params) => {
    db.prepare('DELETE FROM athletes WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });
}

export { scopeAthleteIds };
