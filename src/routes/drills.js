import db from '../../db/db.js';
import { sendJson, readJsonBody } from '../lib/router.js';

const FOCUS_CATEGORIES = new Set(['technical', 'physical', 'tactical', 'mental']);
const TECHNICAL_SUBCATEGORIES = new Set(['serve', 'volley_smash', 'forehand', 'backhand']);
const KIDS_STAGES = new Set(['vermelha', 'laranja', 'verde']);
const MODALITIES = new Set(['tenis', 'beach_tennis']);

const FOCUS_LABEL = { technical: 'Técnico', physical: 'Físico', tactical: 'Tático', mental: 'Mental' };
const SUBCATEGORY_LABEL = { serve: 'Saque', volley_smash: 'Voleio/Smash', forehand: 'Forehand', backhand: 'Backhand/Slice' };
const KIDS_STAGE_LABEL = { vermelha: 'Bola vermelha', laranja: 'Bola laranja', verde: 'Bola verde' };

function csvEscape(value) {
  const s = String(value ?? '');
  if (/["\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Monta um prompt pronto para gerar, em outra ferramenta de IA de imagem, uma
// ilustracao didatica do drill -- descreve o exercicio, o foco e sugere um
// estilo de diagrama esportivo simples (sem depender de nenhuma API de imagem)
function buildImagePrompt(drill) {
  const focusLabel = FOCUS_LABEL[drill.focus_category] || drill.focus_category;
  const subLabel = drill.subcategory ? SUBCATEGORY_LABEL[drill.subcategory] : null;
  const focusPart = subLabel ? `${focusLabel} — ${subLabel}` : focusLabel;
  const desc = drill.description ? drill.description.replace(/\s+/g, ' ').trim() : '';
  return `Diagrama esportivo simples e didático de tênis ilustrando o exercício "${drill.name}" (foco ${focusPart}). ` +
    `${desc ? `Execução: ${desc}. ` : ''}` +
    `${drill.court_zone ? `Zona da quadra em destaque: ${drill.court_zone}. ` : ''}` +
    `Vista de cima de uma quadra de tênis, com setas indicando o movimento dos jogadores e a trajetória da bola. ` +
    `Estilo flat illustration, cores vivas, traço limpo, sem nenhum texto ou legenda na imagem.`;
}

// Subcategoria so faz sentido dentro do foco tecnico; fora dele, e sempre null
function normalizeSubcategory(focusCategory, subcategory) {
  if (focusCategory !== 'technical' || !subcategory) return null;
  return TECHNICAL_SUBCATEGORIES.has(subcategory) ? subcategory : null;
}

function normalizeKidsStage(kidsStage) {
  return KIDS_STAGES.has(kidsStage) ? kidsStage : null;
}

function normalizeModality(modality) {
  return MODALITIES.has(modality) ? modality : 'tenis';
}

export function registerDrillRoutes(router) {
  router.get('/api/drills', async (req, res, params, user, query) => {
    if (query && query.focusCategory) {
      const rows = db.prepare('SELECT * FROM drills WHERE focus_category = ? ORDER BY name').all(query.focusCategory);
      return sendJson(res, 200, rows);
    }
    if (query && query.kidsStage) {
      const rows = db.prepare('SELECT * FROM drills WHERE kids_stage = ? ORDER BY focus_category, name').all(query.kidsStage);
      return sendJson(res, 200, rows);
    }
    if (query && query.modality) {
      const rows = db.prepare('SELECT * FROM drills WHERE modality = ? ORDER BY focus_category, name').all(query.modality);
      return sendJson(res, 200, rows);
    }
    const rows = db.prepare('SELECT * FROM drills ORDER BY focus_category, name').all();
    sendJson(res, 200, rows);
  });

  router.get('/api/drills/export', async (req, res) => {
    const rows = db.prepare('SELECT * FROM drills ORDER BY focus_category, subcategory, name').all();
    const header = ['ID', 'Nome', 'Modalidade', 'Foco', 'Subcategoria', 'Estágio (bola)', 'Zona da quadra', 'Descrição', 'Material', 'Duração (min)', 'Prompt sugerido para IA de imagem'];
    const lines = [header, ...rows.map((d) => [
      d.id, d.name, d.modality === 'beach_tennis' ? 'Beach Tennis' : 'Tênis',
      FOCUS_LABEL[d.focus_category] || d.focus_category,
      d.subcategory ? SUBCATEGORY_LABEL[d.subcategory] || d.subcategory : '',
      d.kids_stage ? KIDS_STAGE_LABEL[d.kids_stage] || d.kids_stage : '',
      d.court_zone || '',
      d.description || '', d.equipment || '', d.duration_minutes ?? '',
      buildImagePrompt(d),
    ])].map((r) => r.map(csvEscape).join(';'));
    const csv = `﻿${lines.join('\r\n')}`;
    const buffer = Buffer.from(csv, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="drills-prompts-imagens.csv"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  });

  router.get('/api/drills/:id', async (req, res, params) => {
    const row = db.prepare('SELECT * FROM drills WHERE id = ?').get(Number(params.id));
    if (!row) return sendJson(res, 404, { error: 'Drill nao encontrado.' });
    sendJson(res, 200, row);
  });

  router.post('/api/drills', async (req, res, params, user) => {
    const b = await readJsonBody(req);
    if (!b.name || !b.name.trim()) return sendJson(res, 400, { error: 'Nome do drill e obrigatorio.' });
    if (!FOCUS_CATEGORIES.has(b.focusCategory)) return sendJson(res, 400, { error: 'Foco invalido.' });
    const info = db.prepare(
      `INSERT INTO drills (created_by, name, focus_category, subcategory, description, duration_minutes, equipment, court_zone, kids_stage, modality)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id, b.name.trim(), b.focusCategory, normalizeSubcategory(b.focusCategory, b.subcategory),
      b.description || null, b.durationMinutes || null, b.equipment || null, b.courtZone || null,
      normalizeKidsStage(b.kidsStage), normalizeModality(b.modality)
    );
    sendJson(res, 201, { id: Number(info.lastInsertRowid) });
  });

  router.put('/api/drills/:id', async (req, res, params) => {
    const id = Number(params.id);
    const b = await readJsonBody(req);
    const existing = db.prepare('SELECT * FROM drills WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Drill nao encontrado.' });
    if (b.focusCategory !== undefined && !FOCUS_CATEGORIES.has(b.focusCategory)) return sendJson(res, 400, { error: 'Foco invalido.' });
    if (b.name !== undefined && !b.name.trim()) return sendJson(res, 400, { error: 'Nome do drill e obrigatorio.' });
    const nextFocusCategory = b.focusCategory ?? existing.focus_category;
    const nextSubcategory = b.subcategory !== undefined
      ? normalizeSubcategory(nextFocusCategory, b.subcategory)
      : normalizeSubcategory(nextFocusCategory, existing.subcategory);
    db.prepare(
      'UPDATE drills SET name=?, focus_category=?, subcategory=?, description=?, duration_minutes=?, equipment=?, court_zone=?, kids_stage=?, modality=? WHERE id=?'
    ).run(
      b.name !== undefined ? b.name.trim() : existing.name,
      nextFocusCategory,
      nextSubcategory,
      b.description !== undefined ? b.description : existing.description,
      b.durationMinutes !== undefined ? b.durationMinutes : existing.duration_minutes,
      b.equipment !== undefined ? b.equipment : existing.equipment,
      b.courtZone !== undefined ? b.courtZone : existing.court_zone,
      b.kidsStage !== undefined ? normalizeKidsStage(b.kidsStage) : existing.kids_stage,
      b.modality !== undefined ? normalizeModality(b.modality) : existing.modality,
      id
    );
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/drills/:id', async (req, res, params) => {
    db.prepare('DELETE FROM drills WHERE id = ?').run(Number(params.id));
    sendJson(res, 200, { ok: true });
  });
}
