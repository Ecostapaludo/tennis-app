import crypto from 'node:crypto';
import db from '../../db/db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

export const ROLES = {
  HEAD_COACH: 'head_coach',
  TREINADOR: 'treinador',
  RESPONSAVEL: 'responsavel',
};

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

// Retorna o usuario autenticado (com papel e, se 'responsavel', a lista de athlete_ids vinculados)
export function getUserFromToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).get(token);
  if (!row) return null;
  if (!row.active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  if (row.role === ROLES.RESPONSAVEL) {
    const links = db.prepare('SELECT athlete_id FROM athlete_guardians WHERE user_id = ?').all(row.id);
    user.athleteIds = links.map((l) => l.athlete_id);
  }
  return user;
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = val;
  });
  return cookies;
}

// --- Controle de permissoes por papel -------------------------------------
// head_coach: acesso total (leitura/escrita em tudo)
// treinador: apenas leitura de planejamento de treinos (e lista basica de atletas p/ contexto)
// responsavel: apenas leitura de jogos e avaliacoes dos atletas vinculados a ele

const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

// Recursos que 'treinador' pode LER
const TREINADOR_READ_RESOURCES = ['training-sessions', 'athletes', 'dashboard', 'drills', 'groups', 'weekly-focus', 'tournaments'];
// Recursos que 'treinador' pode CRIAR/EDITAR/EXCLUIR (sujeito a regras extras, ex: foco da semana)
const TREINADOR_WRITE_RESOURCES = ['training-sessions'];
// Recursos que 'responsavel' pode LER (sempre filtrados pelos athleteIds vinculados)
const RESPONSAVEL_READ_RESOURCES = ['matches', 'evaluations', 'athletes', 'dashboard', 'training-sessions', 'tournaments'];

export function can(user, resource, method) {
  if (!user) return false;
  if (user.role === ROLES.HEAD_COACH) return true;

  const isRead = READ_ONLY_METHODS.has(method);

  if (user.role === ROLES.TREINADOR) {
    if (isRead) return TREINADOR_READ_RESOURCES.includes(resource);
    return TREINADOR_WRITE_RESOURCES.includes(resource);
  }

  if (user.role === ROLES.RESPONSAVEL) {
    return isRead && RESPONSAVEL_READ_RESOURCES.includes(resource);
  }

  return false;
}
