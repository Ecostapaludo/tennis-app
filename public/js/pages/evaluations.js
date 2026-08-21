import { h, clear, fmtDate, scoreClass, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { EVAL_CATEGORIES, EVAL_FIELD_TO_DB, categoryAverage, SCALE_LEGEND } from '../evalCriteria.js';

export async function renderEvaluations(main, ctx) {
  const canEdit = ctx.user.role === 'head_coach';
  const athletes = await api.get('/api/athletes');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Avaliações de desempenho']), h('p', {}, ['Modelo de 4 fatores (Técnico / Tático / Físico / Mental), com critérios granulares por categoria.'])]),
    h('div', { style: 'display:flex;gap:8px' }, [
      canEdit ? h('a', { class: 'btn btn-sm', href: '/api/evaluations/template', download: 'planilha-avaliacoes.csv' }, ['Baixar planilha para preenchimento']) : null,
      canEdit ? h('button', { class: 'btn btn-primary', onClick: () => openEvalModal(athletes, () => renderEvaluations(main, ctx)) }, ['+ Nova avaliação']) : null,
    ]),
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Nenhum atleta disponível.'])]));
    return;
  }

  const select = h('select', { class: 'athlete-select' }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  main.appendChild(h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), select]));

  const listWrap = h('div');
  main.appendChild(listWrap);

  async function loadFor(athleteId) {
    const evals = await api.get(`/api/evaluations?athleteId=${athleteId}`);
    clear(listWrap);
    if (!evals.length) {
      listWrap.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Sem avaliações registradas para este atleta.'])]));
      return;
    }
    const athleteName = athletes.find((a) => String(a.id) === String(athleteId))?.name || 'Atleta';
    evals.slice().reverse().forEach((ev) => {
      const card = h('div', { class: 'card' }, [
        h('div', { class: 'page-header', style: 'margin-bottom:10px' }, [
          h('div', {}, [
            h('h3', {}, [fmtDate(ev.date)]),
            h('p', {}, [`Nota geral: `, h('span', { class: `score-pill ${scoreClass(ev.overall)}` }, [ev.overall ?? '-'])]),
          ]),
          canEdit ? h('div', {}, [
            h('button', {
              class: 'btn btn-sm', style: 'margin-right:6px', type: 'button',
              onClick: () => openEvaluationReportModal(ev, athleteName),
            }, ['📝 Relatório IA']),
            h('button', { class: 'btn btn-sm btn-danger', onClick: () => confirmModal('Excluir avaliação?', async () => { await api.del(`/api/evaluations/${ev.id}`); loadFor(athleteId); }) }, ['Excluir']),
          ]) : null,
        ]),
      ]);
      EVAL_CATEGORIES.forEach((cat) => {
        const catAvg = categoryAverage(ev, cat);
        card.appendChild(h('div', { style: 'margin-top:12px' }, [
          h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px' }, [
            h('strong', { style: 'font-size:13px' }, [cat.label]),
            catAvg !== null ? h('span', { class: `score-pill ${scoreClass(catAvg)}` }, [catAvg]) : null,
          ]),
          h('div', { class: 'grid grid-4', style: 'gap:10px' }, cat.criteria.map(([apiKey, label]) => {
            const val = ev[EVAL_FIELD_TO_DB[apiKey]];
            return h('div', {}, [
              h('div', { style: 'font-size:11.5px;color:var(--text-secondary)' }, [label]),
              h('span', { class: `score-pill ${scoreClass(val)}` }, [val ?? '-']),
            ]);
          })),
        ]));
      });
      if (ev.notes) card.appendChild(h('p', { style: 'margin-top:12px' }, [h('strong', {}, ['Notas: ']), ev.notes]));
      listWrap.appendChild(card);
    });
  }

  select.addEventListener('change', () => loadFor(select.value));
  await loadFor(select.value);
}

// ---------------------------------------------------------------------------
// Preenchimento rápido: em vez de arrastar sliders, o treinador toca um número
// (0-10) por critério. Categorias ficam recolhidas em acordeão, com um atalho
// para aplicar uma nota a todos os critérios da categoria de uma vez.
// ---------------------------------------------------------------------------

const DEFAULT_RATING = 7;

function createRatingControl(onChange) {
  let value = DEFAULT_RATING;
  let touched = false;
  const chips = [];
  const wrap = h('div', { class: 'rating-chip-row' });
  for (let v = 0; v <= 10; v++) {
    const chip = h('button', { type: 'button', class: 'rating-chip' }, [String(v)]);
    chip.addEventListener('click', () => setValue(v, true));
    chips.push(chip);
    wrap.appendChild(chip);
  }
  function setValue(v, markTouched) {
    value = v;
    if (markTouched) touched = true;
    chips.forEach((c, i) => c.classList.toggle('active', i <= v));
    wrap.classList.toggle('touched', touched);
    if (markTouched && onChange) onChange();
  }
  setValue(DEFAULT_RATING, false);
  return { el: wrap, getValue: () => value, setValue, isTouched: () => touched };
}

function buildCategorySection(cat, controls, onAnyChange, defaultOpen) {
  const details = h('details', { class: 'eval-category', open: defaultOpen });
  details.appendChild(h('summary', {}, [
    h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
      h('span', { class: 'eval-cat-arrow' }, ['▸']),
      h('span', { class: 'eval-cat-summary-title' }, [cat.label]),
    ]),
    h('span', { class: 'eval-cat-summary-hint' }, [cat.hint]),
  ]));

  const quickFill = createRatingControl(() => {
    cat.criteria.forEach(([apiKey]) => controls[apiKey].setValue(quickFill.getValue(), true));
    onAnyChange();
  });
  details.appendChild(h('div', { class: 'eval-quickfill' }, [
    h('span', { class: 'eval-quickfill-label' }, ['Definir todos nesta categoria como:']),
    quickFill.el,
  ]));

  cat.criteria.forEach(([apiKey, label]) => {
    const control = createRatingControl(onAnyChange);
    controls[apiKey] = control;
    details.appendChild(h('div', { class: 'eval-criterion-row' }, [
      h('div', { class: 'eval-criterion-label' }, [label]),
      control.el,
    ]));
  });

  return details;
}

function openEvalModal(athletes, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const athleteSelect = h('select', { required: true }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  const date = h('input', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
  const notes = h('textarea', { placeholder: 'Observações sobre a avaliação' });
  const errorBox = h('div', { class: 'error-msg' });
  const progress = h('p', { class: 'eval-progress' });

  const controls = {};
  function updateProgress() {
    const total = Object.keys(controls).length;
    const touched = Object.values(controls).filter((c) => c.isTouched()).length;
    progress.textContent = `${touched}/${total} critérios ajustados manualmente — os demais ficam no padrão (${DEFAULT_RATING}).`;
  }

  const categorySections = EVAL_CATEGORIES.map((cat, i) => buildCategorySection(cat, controls, updateProgress, i === 0));
  updateProgress();

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        const payload = { athleteId: Number(athleteSelect.value), date: date.value, notes: notes.value || null };
        Object.keys(controls).forEach((apiKey) => { payload[apiKey] = controls[apiKey].getValue(); });
        await api.post('/api/evaluations', payload);
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, ['Nova avaliação de desempenho']),
    h('p', { style: 'font-size:12px;margin-top:4px' }, [SCALE_LEGEND]),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), athleteSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data']), date]),
    ]),
    progress,
    ...categorySections,
    h('div', { class: 'form-field', style: 'margin-top:14px' }, [h('label', {}, ['Notas']), notes]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Salvar avaliação']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box', style: 'width:700px' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

// ---------------------------------------------------------------------------
// Relatório de IA para uma avaliação -- heurística sempre calculada a partir
// das notas reais já lançadas; refinamento por Claude opcional. Mesmo padrão
// do relatório pós-jogo (public/js/pages/matches.js).
// ---------------------------------------------------------------------------

function openEvaluationReportModal(evaluation, athleteName) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box', style: 'width:640px' });
  box.appendChild(h('h2', {}, ['Relatório de IA da avaliação']));
  box.appendChild(h('p', { style: 'margin-top:-6px;font-size:13px;color:var(--text-secondary)' }, [
    `${athleteName} · ${fmtDate(evaluation.date)}${evaluation.overall !== null && evaluation.overall !== undefined ? ` · Nota geral ${evaluation.overall}/10` : ''}`,
  ]));

  const useAi = h('input', { type: 'checkbox' });
  const generateBtn = h('button', { class: 'btn btn-primary', type: 'button' }, ['Gerar relatório']);
  const errorBox = h('div', { class: 'error-msg' });

  box.appendChild(h('div', { class: 'form-field' }, [
    h('label', { class: 'tag-checkbox' }, [useAi, ' usar IA generativa (Claude) se ANTHROPIC_API_KEY estiver configurada']),
  ]));
  box.appendChild(h('div', { class: 'form-actions', style: 'margin-top:8px' }, [generateBtn]));
  box.appendChild(errorBox);

  const historyWrap = h('div', { style: 'margin-top:14px' });
  box.appendChild(historyWrap);

  async function loadHistory() {
    const reports = await api.get(`/api/evaluations/${evaluation.id}/report`);
    clear(historyWrap);
    if (!reports.length) {
      historyWrap.appendChild(h('p', { style: 'font-size:13px;color:var(--text-muted)' }, ['Nenhum relatório gerado ainda para esta avaliação.']));
      return;
    }
    reports.forEach((r) => historyWrap.appendChild(buildReportCard(r)));
  }

  function buildReportCard(r) {
    return h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
        h('div', {}, [h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0' }, [fmtDate(r.generated_at)])]),
        h('div', {}, [
          h('span', { class: 'badge badge-neutral', style: 'margin-right:6px' }, [r.source === 'ia_claude' ? 'IA (Claude)' : 'Heurística']),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmModal('Excluir este relatório?', async () => {
              await api.del(`/api/evaluations/${evaluation.id}/report/${r.id}`);
              loadHistory();
            }),
          }, ['Excluir']),
        ]),
      ]),
      h('p', {}, [r.summary_text]),
      r.highlights && r.highlights.length ? h('div', {}, [
        h('strong', { style: 'font-size:13px' }, ['Pontos fortes']),
        h('ul', { style: 'margin-top:4px' }, r.highlights.map((x) => h('li', { style: 'font-size:13px' }, [x]))),
      ]) : null,
      r.improvements && r.improvements.length ? h('div', {}, [
        h('strong', { style: 'font-size:13px' }, ['Pontos de atenção']),
        h('ul', { style: 'margin-top:4px' }, r.improvements.map((x) => h('li', { style: 'font-size:13px' }, [x]))),
      ]) : null,
    ]);
  }

  generateBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Gerando...';
    try {
      const report = await api.post(`/api/evaluations/${evaluation.id}/report`, { useAi: useAi.checked });
      if (useAi.checked && report.source !== 'ia_claude') {
        errorBox.textContent = 'IA generativa não configurada neste ambiente (ANTHROPIC_API_KEY ausente) — relatório gerado por heurística.';
      }
      await loadHistory();
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Gerar relatório';
    }
  });

  box.appendChild(h('div', { class: 'form-actions', style: 'margin-top:14px' }, [
    h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Fechar']),
  ]));

  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  loadHistory();
}
