import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, sendJson } from './src/lib/router.js';
import { can } from './src/lib/auth.js';
import { registerAuthRoutes, currentUserFromReq } from './src/routes/auth.js';
import { registerUserRoutes } from './src/routes/users.js';
import { registerAthleteRoutes } from './src/routes/athletes.js';
import { registerGroupRoutes } from './src/routes/groups.js';
import { registerDrillRoutes } from './src/routes/drills.js';
import { registerWeeklyFocusRoutes } from './src/routes/weeklyFocus.js';
import { registerTrainingRoutes } from './src/routes/training.js';
import { registerEvaluationRoutes } from './src/routes/evaluations.js';
import { registerMatchRoutes } from './src/routes/matches.js';
import { registerVideoRoutes } from './src/routes/video.js';
import { registerBiomechCriteriaRoutes } from './src/routes/biomechCriteria.js';
import { registerTrainingPlanRoutes } from './src/routes/trainingPlan.js';
import { registerDashboardRoutes } from './src/routes/dashboard.js';
import { registerTournamentRoutes } from './src/routes/tournaments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env manualmente (sem dependencias externas), se o arquivo existir
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env) && value) process.env[key] = value;
  });
}

const PORT = process.env.PORT || 3000;

const router = new Router();
registerAuthRoutes(router);
registerUserRoutes(router);
registerAthleteRoutes(router);
registerGroupRoutes(router);
registerDrillRoutes(router);
registerWeeklyFocusRoutes(router);
registerTrainingRoutes(router);
registerEvaluationRoutes(router);
registerMatchRoutes(router);
registerVideoRoutes(router);
registerBiomechCriteriaRoutes(router);
registerTrainingPlanRoutes(router);
registerDashboardRoutes(router);
registerTournamentRoutes(router);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const publicDir = path.join(__dirname, 'public');

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(publicDir, filePath);
  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA fallback: rotas do lado do cliente devolvem index.html
      fs.readFile(path.join(publicDir, 'index.html'), (err2, indexData) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Extrai o nome do "recurso" a partir do path da API, para checagem de permissao
function resourceFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean); // ['api', 'training-sessions', '3']
  return parts[1] || '';
}

const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  if (!pathname.startsWith('/api/')) {
    serveStatic(req, res, pathname);
    return;
  }

  try {
    // /api/auth/me precisa apenas checar sessao (sem checagem de recurso)
    if (pathname === '/api/auth/me' || PUBLIC_API_PATHS.has(pathname)) {
      const match = router.match(req.method, pathname);
      if (!match) return sendJson(res, 404, { error: 'Rota nao encontrada.' });
      await match.handler(req, res, match.params, currentUserFromReq(req), query);
      return;
    }

    const user = currentUserFromReq(req);
    if (!user) return sendJson(res, 401, { error: 'Nao autenticado.' });

    const resource = resourceFromPath(pathname);
    // rota especial de geracao de plano usa metodo POST mas e conceitualmente leitura/analise
    const effectiveResource = pathname.startsWith('/api/training-plans') ? 'training-plans' : resource;
    if (!can(user, effectiveResource, req.method)) {
      return sendJson(res, 403, { error: 'Seu perfil nao tem permissao para esta acao.' });
    }

    const match = router.match(req.method, pathname);
    if (!match) return sendJson(res, 404, { error: 'Rota nao encontrada.' });
    await match.handler(req, res, match.params, user, query);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno no servidor.' });
  }
});

server.listen(PORT, () => {
  console.log(`Tennis Coach App rodando em http://localhost:${PORT}`);
});
