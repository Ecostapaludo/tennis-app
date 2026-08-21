import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { scopeAthleteIds } from './athletes.js';

function attachAthletes(tournament) {
  const rows = db.prepare(
    `SELECT a.id, a.name FROM tournament_athletes ta
     JOIN athletes a ON a.id = ta.athlete_id WHERE ta.tournament_id = ? ORDER BY a.name`
  ).all(tournament.id);
  return { ...tournament, athletes: rows };
}

export function registerTournamentRoutes(router) {
  router.get('/api/tournaments', async (req, res, params, user) => {
    let rows = db.prepare('SELECT * FROM tournaments ORDER BY start_date').all().map(attachAthletes);
    const scoped = scopeAthleteIds(user);
    if (scoped !== null) {
      // responsavel: so ve torneios em que seu(s) atleta(s) participam, e so ve os
      // proprios atletas vinculados dentro de cada torneio
      rows = rows
        .map((t) => ({ ...t, athletes: t.athletes.filter((a) => scoped.includes(a.id)) }))
        .filter((t) => t.athletes.length > 0);
    }
    sendJson(res, 200, rows);
  });

  router.post('/api/tournaments', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.name || !b.name.trim() || !b.startDate) {
      return sendJson(res, 400, { error: 'Nome e data de início são obrigatórios.' });
    }
    const info = db.prepare(
      'INSERT INTO tournaments (created_by, name, location, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, b.name.trim(), b.location || null, b.startDate, b.endDate || null, b.notes || null);
    const tournamentId = Number(info.lastInsertRowid);
    if (Array.isArray(b.athleteIds)) {
      const stmt = db.prepare('INSERT INTO tournament_athletes (tournament_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(tournamentId, aid));
    }
    sendJson(res, 201, { id: tournamentId });
  });

  router.put('/api/tournaments/:id', async (req, res, params) => {
    const id = Number(params.id);
    const b = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Torneio não encontrado.' });
    if (b.name !== undefined && !b.name.trim()) return sendJson(res, 400, { error: 'Nome é obrigatório.' });
    db.prepare('UPDATE tournaments SET name=?, location=?, start_date=?, end_date=?, notes=? WHERE id=?').run(
      b.name !== undefined ? b.name.trim() : existing.name,
      b.location !== undefined ? b.location : existing.location,
      b.startDate !== undefined ? b.startDate : existing.start_date,
      b.endDate !== undefined ? b.endDate : existing.end_date,
      b.notes !== undefined ? b.notes : existing.notes,
      id
    );
    if (Array.isArray(b.athleteIds)) {
      db.prepare('DELETE FROM tournament_athletes WHERE tournament_id = ?').run(id);
      const stmt = db.prepare('INSERT INTO tournament_athletes (tournament_id, athlete_id) VALUES (?, ?)');
      b.athleteIds.forEach((aid) => stmt.run(id, aid));
    }
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/tournaments/:id', async (req, res, params) => {
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });
}
