import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';

const FOCUS_CATEGORIES = new Set(['technical', 'physical', 'tactical', 'mental']);
const TECHNICAL_SUBCATEGORIES = new Set(['serve', 'volley_smash', 'forehand', 'backhand']);
const SECONDARY_FOCUS_CATEGORIES = new Set(['physical', 'tactical', 'mental']);

// Subcategoria so faz sentido dentro do foco tecnico; fora dele, e sempre null
function normalizeSubcategory(focusCategory, subcategory) {
  if (focusCategory !== 'technical' || !subcategory) return null;
  return TECHNICAL_SUBCATEGORIES.has(subcategory) ? subcategory : null;
}

// Foco secundario (fisico/tatico/mental) so pode ser combinado quando o foco
// principal da semana e 'technical'; fora desse caso e sempre null
function normalizeSecondaryFocus(focusCategory, secondaryFocusCategory) {
  if (focusCategory !== 'technical' || !secondaryFocusCategory) return null;
  return SECONDARY_FOCUS_CATEGORIES.has(secondaryFocusCategory) ? secondaryFocusCategory : null;
}

// Escrita (POST/DELETE) ja e restrita a head_coach pelo gate de permissao em server.js
export function registerWeeklyFocusRoutes(router) {
  router.get('/api/weekly-focus', async (req, res) => {
    const rows = db.prepare('SELECT * FROM weekly_focus ORDER BY week_start').all();
    sendJson(res, 200, rows);
  });

  router.post('/api/weekly-focus', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.weekStart || !FOCUS_CATEGORIES.has(b.focusCategory)) {
      return sendJson(res, 400, { error: 'Semana e foco sao obrigatorios.' });
    }
    db.prepare(
      `INSERT INTO weekly_focus (week_start, focus_category, subcategory, secondary_focus_category, created_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(week_start) DO UPDATE SET focus_category = excluded.focus_category,
         subcategory = excluded.subcategory, secondary_focus_category = excluded.secondary_focus_category,
         created_by = excluded.created_by`
    ).run(
      b.weekStart, b.focusCategory, normalizeSubcategory(b.focusCategory, b.subcategory),
      normalizeSecondaryFocus(b.focusCategory, b.secondaryFocusCategory), user.id
    );
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/weekly-focus/:weekStart', async (req, res, params) => {
    db.prepare('DELETE FROM weekly_focus WHERE week_start = ?').run(params.weekStart);
    sendJson(res, 200, { ok: true });
  });
}
