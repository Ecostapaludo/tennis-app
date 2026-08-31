import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';
import { hashPassword, verifyPassword, createSession, destroySession, parseCookies, getUserFromToken, ROLES } from '../lib/auth.js';

const COOKIE_NAME = 'tc_session';

function setSessionCookie(res, token, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Expires=${expires}; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function currentUserFromReq(req) {
  const cookies = parseCookies(req);
  return getUserFromToken(cookies[COOKIE_NAME]);
}

export function registerAuthRoutes(router) {
  router.post('/api/auth/login', async (req, res) => {
    const body = await readJsonBody(req);
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !password) return sendJson(res, 400, { error: 'Informe email e senha.' });

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !row.active) return sendJson(res, 401, { error: 'Credenciais invalidas.' });
    if (!verifyPassword(password, row.password_salt, row.password_hash)) {
      return sendJson(res, 401, { error: 'Credenciais invalidas.' });
    }

    const { token, expiresAt } = createSession(row.id);
    setSessionCookie(res, token, expiresAt);
    sendJson(res, 200, { id: row.id, name: row.name, email: row.email, role: row.role, modality: row.modality });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const cookies = parseCookies(req);
    if (cookies[COOKIE_NAME]) destroySession(cookies[COOKIE_NAME]);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', async (req, res) => {
    const user = currentUserFromReq(req);
    if (!user) return sendJson(res, 401, { error: 'Nao autenticado.' });
    sendJson(res, 200, user);
  });
}

export { COOKIE_NAME, setSessionCookie };
