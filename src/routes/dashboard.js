import db from '../../db/db.js';
import { sendJson } from '../lib/router.js';
import { ROLES } from '../lib/auth.js';

export function registerDashboardRoutes(router) {
  router.get('/api/dashboard', async (req, res, params, user) => {
    const today = new Date().toISOString().slice(0, 10);

    if (user.role === ROLES.RESPONSAVEL) {
      const ids = user.athleteIds || [];
      if (!ids.length) return sendJson(res, 200, { athletes: [], recentMatches: [], recentEvaluations: [] });
      const placeholders = ids.map(() => '?').join(',');
      const athletes = db.prepare(`SELECT * FROM athletes WHERE id IN (${placeholders})`).all(...ids);
      const recentMatches = db.prepare(`SELECT * FROM matches WHERE athlete_id IN (${placeholders}) ORDER BY date DESC LIMIT 5`).all(...ids);
      const recentEvaluations = db.prepare(`SELECT * FROM evaluations WHERE athlete_id IN (${placeholders}) ORDER BY date DESC LIMIT 5`).all(...ids);
      return sendJson(res, 200, { athletes, recentMatches, recentEvaluations });
    }

    const athleteCount = db.prepare('SELECT COUNT(*) as c FROM athletes WHERE active = 1').get().c;
    const upcomingSessions = db.prepare('SELECT * FROM training_sessions WHERE date >= ? ORDER BY date ASC LIMIT 5').all(today);
    const recentMatches = db.prepare(
      `SELECT m.*, a.name as athlete_name FROM matches m JOIN athletes a ON a.id = m.athlete_id ORDER BY date DESC LIMIT 8`
    ).all();

    let attentionAthletes = [];
    if (user.role === ROLES.HEAD_COACH) {
      const rows = db.prepare(
        `SELECT a.id, a.name, AVG(m.unforced_errors) as avg_unforced
         FROM athletes a JOIN matches m ON m.athlete_id = a.id
         WHERE a.active = 1
         GROUP BY a.id HAVING avg_unforced > 15 ORDER BY avg_unforced DESC LIMIT 5`
      ).all();
      attentionAthletes = rows;
    }

    sendJson(res, 200, { athleteCount, upcomingSessions, recentMatches, attentionAthletes });
  });
}
