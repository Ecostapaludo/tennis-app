import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';

export async function renderTrainingPlan(main, ctx) {
  const [athletes, groups] = await Promise.all([
    api.get('/api/athletes'),
    api.get('/api/groups'),
  ]);
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Plano de treino com IA']), h('p', {}, ['Sugestão de focos individuais (ou de grupo) a partir de avaliações, jogos, análises de vídeo e da biblioteca de drills.'])]),
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Cadastre um atleta primeiro.'])]));
    return;
  }

  const select = h('select', { class: 'athlete-select' }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  const groupMode = h('input', { type: 'checkbox' });
  const useAi = h('input', { type: 'checkbox' });
  const generateBtn = h('button', { class: 'btn btn-primary', type: 'button' }, ['Gerar novo plano']);
  const errorBox = h('div', { class: 'error-msg' });

  const singleWrap = h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), select]);
  const groupCheckedIds = new Set();
  const groupAthleteRefs = new Map();
  const groupTagList = h('div', { class: 'tag-list' }, athletes.map((a) => {
    const cb = h('input', { type: 'checkbox', onChange: (e) => { if (e.target.checked) groupCheckedIds.add(a.id); else groupCheckedIds.delete(a.id); label.classList.toggle('checked', e.target.checked); } });
    const label = h('label', { class: 'tag-checkbox' }, [cb, a.name]);
    groupAthleteRefs.set(a.id, { cb, label });
    return label;
  }));

  function setGroupAthleteChecked(id, checked) {
    if (checked) groupCheckedIds.add(id); else groupCheckedIds.delete(id);
    const ref = groupAthleteRefs.get(id);
    if (ref) { ref.cb.checked = checked; ref.label.classList.toggle('checked', checked); }
  }

  const groupsWithMembers = (groups || []).filter((g) => g.athletes && g.athletes.length);
  const turmaChipRow = groupsWithMembers.length
    ? h('div', { class: 'chip-row', style: 'margin-bottom:10px' }, groupsWithMembers.map((g) => {
        const isSelected = () => g.athletes.every((a) => groupCheckedIds.has(a.id));
        const chip = h('button', { type: 'button', class: `chip${isSelected() ? ' active' : ''}` }, [`${g.name} (${g.athletes.length})`]);
        chip.addEventListener('click', () => {
          const shouldSelect = !isSelected();
          g.athletes.forEach((a) => setGroupAthleteChecked(a.id, shouldSelect));
          chip.classList.toggle('active', shouldSelect);
        });
        return chip;
      }))
    : null;

  const groupWrap = h('div', { class: 'form-field span-2', style: 'display:none' }, [
    h('label', {}, ['Atletas (selecione 2 ou mais para buscar sinergia/pontos comuns)']),
    turmaChipRow ? h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 6px' }, ['Selecionar por turma:']) : null,
    turmaChipRow,
    groupTagList,
  ]);

  groupMode.addEventListener('change', () => {
    singleWrap.style.display = groupMode.checked ? 'none' : '';
    groupWrap.style.display = groupMode.checked ? '' : 'none';
    clear(resultWrap);
    if (!groupMode.checked) loadHistory();
    else clear(historyWrap);
  });

  main.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'form-grid' }, [
      singleWrap,
      h('div', { class: 'form-field' }, [
        h('label', {}, ['Modo de geração']),
        h('label', { class: 'tag-checkbox' }, [groupMode, ' comparar vários atletas (plano de grupo)']),
      ]),
      groupWrap,
      h('div', { class: 'form-field' }, [
        h('label', {}, ['Refinar com IA generativa (Claude)']),
        h('label', { class: 'tag-checkbox' }, [useAi, ' usar IA se ANTHROPIC_API_KEY estiver configurada']),
      ]),
    ]),
    h('div', { class: 'form-actions' }, [generateBtn]),
    errorBox,
  ]));

  const resultWrap = h('div');
  main.appendChild(resultWrap);
  const historyWrap = h('div');
  main.appendChild(historyWrap);

  generateBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    const athleteIds = groupMode.checked ? Array.from(groupCheckedIds) : [Number(select.value)];
    if (groupMode.checked && athleteIds.length < 2) {
      errorBox.textContent = 'Selecione pelo menos 2 atletas para gerar um plano de grupo.';
      return;
    }
    generateBtn.disabled = true;
    generateBtn.textContent = 'Gerando...';
    try {
      const plan = await api.post('/api/training-plans/generate', { athleteIds, useAi: useAi.checked });
      renderPlan(resultWrap, plan);
      if (!groupMode.checked) await loadHistory();
      else clear(historyWrap);
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Gerar novo plano';
    }
  });

  async function loadHistory() {
    const plans = await api.get(`/api/training-plans?athleteId=${select.value}`);
    clear(historyWrap);
    if (!plans.length) return;
    historyWrap.appendChild(h('h3', { style: 'margin:10px 0' }, ['Histórico de planos']));
    plans.forEach((p) => {
      const card = h('div', { class: 'card' }, [
        h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
          h('div', {}, [
            h('h3', {}, [fmtDate(p.generated_at)]),
            h('p', {}, [p.period_label]),
            p.isGroup ? h('p', { style: 'font-size:12.5px' }, [h('strong', {}, ['Grupo: ']), p.groupMembers.map((m) => m.name).join(', ')]) : null,
          ]),
          h('div', {}, [
            p.isGroup ? h('span', { class: 'badge badge-torneio', style: 'margin-right:6px' }, ['Grupo']) : null,
            h('span', { class: 'badge badge-neutral' }, [p.source === 'ia_claude' ? 'IA (Claude)' : 'Heurística']),
          ]),
        ]),
        h('p', {}, [p.summary_text]),
        h('div', { class: 'form-actions', style: 'margin-top:8px' }, [
          h('a', { class: 'btn btn-sm', href: `/api/training-plans/${p.id}/export?format=csv` }, ['Exportar planilha (CSV)']),
          h('a', { class: 'btn btn-sm', href: `/api/training-plans/${p.id}/export?format=pdf` }, ['Exportar PDF']),
        ]),
      ]);
      historyWrap.appendChild(card);
    });
  }

  select.addEventListener('change', () => { clear(resultWrap); loadHistory(); });
  await loadHistory();
}

function renderPlan(wrap, plan) {
  clear(wrap);
  const card = h('div', { class: 'card' }, [
    h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
      h('div', {}, [
        h('h3', {}, ['Plano gerado']),
        plan.isGroup ? h('p', {}, [h('strong', {}, ['Grupo: ']), plan.athleteNames.join(', ')]) : null,
      ]),
      plan.isGroup ? h('span', { class: 'badge badge-torneio' }, ['Plano de grupo']) : null,
    ]),
    h('p', {}, [plan.summary]),
    plan.source === 'heuristica' && !plan.aiAvailable
      ? h('div', { class: 'notice-banner' }, ['IA generativa não configurada neste ambiente (variável ANTHROPIC_API_KEY ausente) — mostrando plano gerado por heurística baseada nos dados reais.'])
      : null,
    h('div', { class: 'form-actions' }, [
      h('a', { class: 'btn btn-sm', href: `/api/training-plans/${plan.id}/export?format=csv` }, ['Exportar planilha (CSV)']),
      h('a', { class: 'btn btn-sm', href: `/api/training-plans/${plan.id}/export?format=pdf` }, ['Exportar PDF']),
    ]),
    h('h3', { style: 'margin-top:16px' }, ['Focos prioritários']),
  ]);
  const grid = h('div', { class: 'grid grid-3' });
  plan.focusAreas.forEach((f) => {
    grid.appendChild(h('div', { class: 'card', style: 'margin-bottom:0' }, [
      h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [`Prioridade ${f.priority}${f.score !== null && f.score !== undefined ? ` · ${f.score}/10` : ''}`]),
      h('h3', {}, [f.label]),
      h('p', {}, [f.reason]),
      f.sharedBy && f.sharedBy.length ? h('p', { style: 'font-size:12.5px' }, [h('strong', {}, ['Comum a: ']), f.sharedBy.join(', ')]) : null,
      f.drills && f.drills.length
        ? h('ul', {}, f.drills.map((d) => h('li', {}, [`${d.name}${d.duration_minutes ? ` (${d.duration_minutes} min)` : ''}`])))
        : h('p', { style: 'font-size:12.5px;color:var(--text-muted)' }, ['Nenhum drill cadastrado na biblioteca para este foco ainda.']),
    ]));
  });
  card.appendChild(grid);
  if (plan.matchInsights && plan.matchInsights.length) {
    card.appendChild(h('h3', { style: 'margin-top:16px' }, ['Sinais táticos dos jogos recentes']));
    card.appendChild(h('ul', {}, plan.matchInsights.map((m) => h('li', {}, [m]))));
  }
  wrap.appendChild(card);
}
