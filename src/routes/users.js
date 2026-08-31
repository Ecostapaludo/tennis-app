import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { hashPassword, ROLES } from '../lib/auth.js';

// Todas as rotas aqui exigem papel head_coach (checado no server.js antes de chamar)

const MODALITIES = new Set(['tenis', 'beach_tennis']);
function normalizeModality(modality) {
  return MODALITIES.has(modality) ? modality : 'tenis';
}

export function registerUserRoutes(router) {
  router.get('/api/users', async (req, res) => {
    const rows = db.prepare('SELECT id, name, email, role, active, modality, created_at FROM users ORDER BY role, name').all();
    const guardianLinks = db.prepare(
      `SELECT ag.user_id, ag.athlete_id, a.name as athlete_name, ag.relationship
       FROM athlete_guardians ag JOIN athletes a ON a.id = ag.athlete_id`
    ).all();
    const byUser = {};
    guardianLinks.forEach((l) => {
      byUser[l.user_id] = byUser[l.user_id] || [];
      byUser[l.user_id].push({ athleteId: l.athlete_id, athleteName: l.athlete_name, relationship: l.relationship });
    });
    sendJson(res, 200, rows.map((r) => ({ ...r, athletes: byUser[r.id] || [] })));
  });

  router.post('/api/users', async (req, res) => {
    const body = await readJsonBody(req);
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const role = body.role;
    if (!name || !email || !password || !Object.values(ROLES).includes(role)) {
      return sendJson(res, 400, { error: 'Dados invalidos. Informe nome, email, senha e papel valido.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return sendJson(res, 409, { error: 'Ja existe um usuario com este email.' });

    const { hash, salt } = hashPassword(password);
    const modality = normalizeModality(body.modality);
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, password_salt, role, modality) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email, hash, salt, role, modality);

    const athleteIds = Array.isArray(body.athleteIds) ? body.athleteIds : [];
    if (role === ROLES.RESPONSAVEL && athleteIds.length) {
      const stmt = db.prepare('INSERT OR IGNORE INTO athlete_guardians (user_id, athlete_id, relationship) VALUES (?, ?, ?)');
      athleteIds.forEach((aid) => stmt.run(info.lastInsertRowid, aid, body.relationship || null));
    }

    sendJson(res, 201, { id: Number(info.lastInsertRowid), name, email, role, modality });
  });

  router.patch('/api/users/:id', async (req, res, params) => {
    const id = Number(params.id);
    const body = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Usuario nao encontrado.' });

    const name = body.name !== undefined ? body.name : existing.name;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;
    let email = existing.email;
    if (body.email !== undefined) {
      const nextEmail = (body.email || '').trim().toLowerCase();
      if (!nextEmail) return sendJson(res, 400, { error: 'Email nao pode ser vazio.' });
      if (nextEmail !== existing.email) {
        const emailTaken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(nextEmail, id);
        if (emailTaken) return sendJson(res, 409, { error: 'Ja existe um usuario com este email.' });
      }
      email = nextEmail;
    }
    const modality = body.modality !== undefined ? normalizeModality(body.modality) : existing.modality;
    db.prepare('UPDATE users SET name = ?, email = ?, active = ?, modality = ? WHERE id = ?').run(name, email, active, modality, id);

    if (body.password) {
      const { hash, salt } = hashPassword(body.password);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
    }

    if (existing.role === ROLES.RESPONSAVEL && Array.isArray(body.athleteIds)) {
      db.prepare('DELETE FROM athlete_guardians WHERE user_id = ?').run(id);
      const stmt = db.prepare('INSERT OR IGNORE INTO athlete_guardians (user_id, athlete_id, relationship) VALUES (?, ?, ?)');
      body.athleteIds.forEach((aid) => stmt.run(id, aid, body.relationship || null));
    }

    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/users/:id', async (req, res, params) => {
    const id = Number(params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    sendJson(res, 200, { ok: true });
  });
}
