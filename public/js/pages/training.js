import { h, clear, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { FOCUS_OPTS, FOCUS_LABEL, TECHNICAL_SUBCATEGORY_OPTS, TECHNICAL_SUBCATEGORY_LABEL } from '../focus.js';
import { courtDiagramSVG } from '../components/courtDiagram.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// So permite planejar a sessao com atletas de turmas que tem horario cadastrado
// naquele dia da semana (turmas avulsas/"is_dropin" nao tem dia fixo, entao
// ficam disponiveis todo dia). Retorna as turmas elegiveis e a uniao dos
// atletas delas -- usado tanto na criacao quanto na edicao de uma sessao.
function groupsAndAthletesForDate(dateStr, groups) {
  const dayAbbrev = WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
  const groupsForDay = (groups || []).filter((g) => (
    g.athletes && g.athletes.length
    && (g.is_dropin || (g.scheduleSlots || []).some((s) => s.day === dayAbbrev))
  ));
  const athletesById = new Map();
  groupsForDay.forEach((g) => g.athletes.forEach((a) => athletesById.set(a.id, a)));
  return { groupsForDay, athletesForDay: Array.from(athletesById.values()).sort((a, b) => a.name.localeCompare(b.name)) };
}

// Checkbox de atletas + atalho "selecionar por turma", reutilizado tanto no
// formulario de nova sessao quanto no modal de editar atletas de uma sessao
// ja existente.
function buildAthletePicker(athletes, groups, preselectedIds) {
  if (!athletes.length) {
    return {
      el: h('p', { style: 'font-size:13px;color:var(--status-warning)' }, [
        'Nenhuma turma tem horário cadastrado nesse dia da semana — cadastre um horário em Turmas, ou marque a turma como aula avulsa, para poder planejar uma sessão aqui.',
      ]),
      getSelectedIds: () => [],
      size: () => 0,
    };
  }
  const checkedIds = new Set(preselectedIds || []);
  const athleteRefs = new Map();
  const tagList = h('div', { class: 'tag-list' }, athletes.map((a) => {
    const cb = h('input', {
      type: 'checkbox', checked: checkedIds.has(a.id),
      onChange: (e) => { if (e.target.checked) checkedIds.add(a.id); else checkedIds.delete(a.id); label.classList.toggle('checked', e.target.checked); },
    });
    const label = h('label', { class: `tag-checkbox${checkedIds.has(a.id) ? ' checked' : ''}` }, [cb, a.name]);
    athleteRefs.set(a.id, { cb, label });
    return label;
  }));

  function setAthleteChecked(id, checked) {
    if (checked) checkedIds.add(id); else checkedIds.delete(id);
    const ref = athleteRefs.get(id);
    if (ref) { ref.cb.checked = checked; ref.label.classList.toggle('checked', checked); }
  }

  const groupsWithMembers = (groups || []).filter((g) => g.athletes && g.athletes.length);
  const chipRow = groupsWithMembers.length
    ? h('div', { class: 'chip-row', style: 'margin-bottom:12px' }, groupsWithMembers.map((g) => {
        const isSelected = () => g.athletes.every((a) => checkedIds.has(a.id));
        const chip = h('button', { type: 'button', class: `chip${isSelected() ? ' active' : ''}` }, [`${g.name} (${g.athletes.length})`]);
        chip.addEventListener('click', () => {
          const shouldSelect = !isSelected();
          g.athletes.forEach((a) => setAthleteChecked(a.id, shouldSelect));
          chip.classList.toggle('active', shouldSelect);
        });
        return chip;
      }))
    : null;

  const el = h('div', {}, [
    chipRow ? h('div', { class: 'form-field', style: 'margin-bottom:10px' }, [h('label', {}, ['Selecionar por turma']), chipRow]) : null,
    athletes.length ? h('div', { class: 'form-field' }, [h('label', {}, ['Atletas participantes']), tagList]) : null,
  ]);

  return { el, getSelectedIds: () => Array.from(checkedIds), size: () => checkedIds.size };
}

function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

function groupByDate(sessions) {
  const map = new Map();
  sessions.forEach((s) => {
    const key = s.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });
  return map;
}

export async function renderTraining(main, ctx) {
  const role = ctx.user.role;
  const canEdit = role === 'head_coach' || role === 'treinador';
  const isHeadCoach = role === 'head_coach';
  let [sessions, athletes, groups, drills, weeklyFocusRows] = await Promise.all([
    api.get('/api/training-sessions'),
    canEdit ? api.get('/api/athletes') : Promise.resolve([]),
    canEdit ? api.get('/api/groups') : Promise.resolve([]),
    canEdit ? api.get('/api/drills') : Promise.resolve([]),
    canEdit ? api.get('/api/weekly-focus') : Promise.resolve([]),
  ]);
  clear(main);

  const today = new Date();
  const state = { viewMonth: today.getMonth(), viewYear: today.getFullYear(), selectedDate: toISODate(today) };
  let byDate = groupByDate(sessions);
  const toWeekFocusEntry = (r) => ({ focusCategory: r.focus_category, subcategory: r.subcategory || null, secondaryFocusCategory: r.secondary_focus_category || null });
  let weekFocusMap = new Map(weeklyFocusRows.map((r) => [r.week_start, toWeekFocusEntry(r)]));

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Planejamento de treinos']), h('p', {}, ['Selecione um dia no calendário para ver ou adicionar sessões.'])]),
  ]));

  const focusBarContainer = h('div');
  main.appendChild(focusBarContainer);

  const layout = h('div', { class: 'calendar-layout' });
  main.appendChild(layout);

  async function reload() {
    sessions = await api.get('/api/training-sessions');
    byDate = groupByDate(sessions);
    draw();
  }

  async function reloadWeeklyFocus() {
    weeklyFocusRows = await api.get('/api/weekly-focus');
    weekFocusMap = new Map(weeklyFocusRows.map((r) => [r.week_start, toWeekFocusEntry(r)]));
    draw();
  }

  async function setWeekFocus(weekStart, focusCategory) {
    await api.post('/api/weekly-focus', { weekStart, focusCategory, subcategory: null, secondaryFocusCategory: null });
    await reloadWeeklyFocus();
  }

  async function setWeekSubfocus(weekStart, subcategory) {
    const entry = weekFocusMap.get(weekStart);
    if (!entry) return;
    await api.post('/api/weekly-focus', { weekStart, focusCategory: entry.focusCategory, subcategory, secondaryFocusCategory: entry.secondaryFocusCategory });
    await reloadWeeklyFocus();
  }

  async function setWeekSecondaryFocus(weekStart, secondaryFocusCategory) {
    const entry = weekFocusMap.get(weekStart);
    if (!entry) return;
    await api.post('/api/weekly-focus', { weekStart, focusCategory: entry.focusCategory, subcategory: entry.subcategory, secondaryFocusCategory });
    await reloadWeeklyFocus();
  }

  async function clearWeekFocus(weekStart) {
    await api.del(`/api/weekly-focus/${weekStart}`);
    await reloadWeeklyFocus();
  }

  function selectDate(dateStr) { state.selectedDate = dateStr; draw(); }

  function navMonth(delta) {
    let m = state.viewMonth + delta;
    let y = state.viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    state.viewMonth = m; state.viewYear = y;
    draw();
  }

  function goToday() {
    const t = new Date();
    state.viewMonth = t.getMonth(); state.viewYear = t.getFullYear(); state.selectedDate = toISODate(t);
    draw();
  }

  function draw() {
    clear(focusBarContainer);
    if (canEdit) {
      focusBarContainer.appendChild(buildWeekFocusBar(state, weekFocusMap, isHeadCoach, setWeekFocus, clearWeekFocus, setWeekSubfocus, setWeekSecondaryFocus));
    }
    clear(layout);
    layout.appendChild(buildCalendar(state, byDate, weekFocusMap, selectDate, navMonth, goToday));
    layout.appendChild(buildDayPanel(state, byDate, athletes, groups, drills, role, canEdit, weekFocusMap, reload));
  }

  draw();
}

const SECONDARY_FOCUS_OPTS = FOCUS_OPTS.filter((f) => f.value !== 'technical');

function buildWeekFocusBar(state, weekFocusMap, isHeadCoach, onSetFocus, onClearFocus, onSetSubfocus, onSetSecondaryFocus) {
  const weekStart = mondayOfWeek(state.selectedDate);
  const weekEnd = addDays(weekStart, 6);
  const entry = weekFocusMap.get(weekStart) || null;
  const current = entry ? entry.focusCategory : null;
  const currentSub = entry ? entry.subcategory : null;
  const currentSecondary = entry ? entry.secondaryFocusCategory : null;

  const card = h('div', { class: 'card week-focus-bar' });
  card.appendChild(h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
    h('div', {}, [
      h('h3', { style: 'margin:0' }, ['Foco da semana']),
      h('p', { style: 'margin:2px 0 0' }, [`${formatShort(weekStart)} – ${formatShort(weekEnd)}`]),
    ]),
    !isHeadCoach
      ? h('span', { class: `badge ${current ? `focus-badge-${current}` : 'badge-neutral'}` }, [
          current
            ? `${FOCUS_LABEL[current]}${currentSub ? ' · ' + TECHNICAL_SUBCATEGORY_LABEL[currentSub] : ''}${currentSecondary ? ' + ' + FOCUS_LABEL[currentSecondary] : ''}`
            : 'Sem foco definido',
        ])
      : null,
  ]));

  if (isHeadCoach) {
    const chipRow = h('div', { class: 'chip-row', style: 'margin:0' }, FOCUS_OPTS.map((f) => {
      const chip = h('button', { type: 'button', class: `chip focus-chip-${f.value}${current === f.value ? ' active' : ''}` }, [f.label]);
      chip.addEventListener('click', () => { (current === f.value ? onClearFocus(weekStart) : onSetFocus(weekStart, f.value)); });
      return chip;
    }));
    card.appendChild(chipRow);

    if (current === 'technical') {
      card.appendChild(h('div', { class: 'chip-row', style: 'margin:8px 0 0' }, TECHNICAL_SUBCATEGORY_OPTS.map((s) => {
        const chip = h('button', { type: 'button', class: `chip${currentSub === s.value ? ' active' : ''}` }, [s.label]);
        chip.addEventListener('click', () => onSetSubfocus(weekStart, currentSub === s.value ? null : s.value));
        return chip;
      })));

      card.appendChild(h('p', { style: 'font-size:12px;margin:10px 0 4px' }, ['Combinar com um segundo foco (opcional):']));
      card.appendChild(h('div', { class: 'chip-row', style: 'margin:0' }, SECONDARY_FOCUS_OPTS.map((f) => {
        const chip = h('button', { type: 'button', class: `chip focus-chip-${f.value}${currentSecondary === f.value ? ' active' : ''}` }, [f.label]);
        chip.addEventListener('click', () => onSetSecondaryFocus(weekStart, currentSecondary === f.value ? null : f.value));
        return chip;
      })));
    }
  }

  return card;
}

function formatShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function buildCalendar(state, byDate, weekFocusMap, onSelect, onNav, onToday) {
  const { viewMonth, viewYear, selectedDate } = state;
  const card = h('div', { class: 'card calendar-card' });

  card.appendChild(h('div', { class: 'calendar-header' }, [
    h('button', { class: 'btn btn-sm', type: 'button', onClick: () => onNav(-1) }, ['‹']),
    h('h2', { class: 'calendar-title' }, [`${MONTHS[viewMonth]} ${viewYear}`]),
    h('button', { class: 'btn btn-sm', type: 'button', onClick: () => onNav(1) }, ['›']),
    h('button', { class: 'btn btn-sm', type: 'button', style: 'margin-left:8px', onClick: onToday }, ['Hoje']),
  ]));

  const grid = h('div', { class: 'calendar-grid' });
  WEEKDAYS.forEach((wd) => grid.appendChild(h('div', { class: 'calendar-weekday' }, [wd])));

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const todayStr = toISODate(new Date());

  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1;
    let cellDate;
    let isCurrentMonth;
    if (dayNum < 1) {
      cellDate = new Date(viewYear, viewMonth - 1, daysInPrevMonth + dayNum);
      isCurrentMonth = false;
    } else if (dayNum > daysInMonth) {
      cellDate = new Date(viewYear, viewMonth + 1, dayNum - daysInMonth);
      isCurrentMonth = false;
    } else {
      cellDate = new Date(viewYear, viewMonth, dayNum);
      isCurrentMonth = true;
    }
    const dateStr = toISODate(cellDate);
    const daySessions = byDate.get(dateStr) || [];
    const weekFocusEntry = weekFocusMap.get(mondayOfWeek(dateStr)) || null;
    const classes = ['calendar-day'];
    if (!isCurrentMonth) classes.push('muted');
    if (dateStr === todayStr) classes.push('today');
    if (dateStr === selectedDate) classes.push('selected');
    if (daySessions.length) classes.push('has-sessions');

    const focusBar = weekFocusEntry
      ? h('span', {
          class: 'calendar-day-focusbar',
          style: weekFocusEntry.secondaryFocusCategory
            ? `background:linear-gradient(to right, var(--focus-${weekFocusEntry.focusCategory}) 50%, var(--focus-${weekFocusEntry.secondaryFocusCategory}) 50%)`
            : `background:var(--focus-${weekFocusEntry.focusCategory})`,
        })
      : null;

    const cell = h('button', { class: classes.join(' '), type: 'button', onClick: () => onSelect(dateStr) }, [
      h('span', { class: 'calendar-daynum' }, [String(cellDate.getDate())]),
      daySessions.length
        ? h('span', { class: 'calendar-dot-row' }, daySessions.slice(0, 3).map(() => h('span', { class: 'calendar-dot' })))
        : null,
      focusBar,
    ]);
    grid.appendChild(cell);
  }

  card.appendChild(grid);
  card.appendChild(h('div', { class: 'calendar-legend' }, FOCUS_OPTS.map((f) => h('span', { class: 'calendar-legend-item' }, [
    h('span', { class: `calendar-legend-swatch focus-swatch-${f.value}` }),
    f.label,
  ]))));
  return card;
}

function buildDayPanel(state, byDate, athletes, groups, drills, role, canEdit, weekFocusMap, onReload) {
  const panel = h('div', { class: 'card day-panel' });
  const dateObj = new Date(`${state.selectedDate}T00:00:00`);
  const rawLabel = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  panel.appendChild(h('h3', {}, [label]));

  const daySessions = (byDate.get(state.selectedDate) || [])
    .slice()
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  if (!daySessions.length) {
    panel.appendChild(h('div', { class: 'empty-state', style: 'padding:20px 0' }, ['Nenhuma sessão neste dia.']));
  } else {
    daySessions.forEach((s) => panel.appendChild(buildSessionItem(s, athletes, groups, canEdit, onReload)));
  }

  if (canEdit) {
    panel.appendChild(buildAddForm(state.selectedDate, athletes, groups, drills, role, weekFocusMap, onReload));
  }

  return panel;
}

function buildSessionItem(s, athletes, groups, canEdit, onReload) {
  const drillsByCat = { technical: [], physical: [], tactical: [], mental: [] };
  (s.drills || []).forEach((d) => { if (drillsByCat[d.focus_category]) drillsByCat[d.focus_category].push(d); });
  const hasAthletes = s.athletes && s.athletes.length;

  return h('div', { class: 'session-item' }, [
    h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
      h('div', {}, [
        h('h4', { style: 'margin:0' }, [s.title]),
        h('p', { style: 'margin:2px 0 0' }, [`${s.start_time || ''}${s.end_time ? '–' + s.end_time : ''}`]),
      ]),
      h('div', {}, [
        h('span', { class: 'badge badge-neutral' }, [s.status]),
        canEdit
          ? h('button', {
              class: 'btn btn-sm', style: 'margin-left:8px', type: 'button',
              onClick: () => openEditAthletesModal(s, athletes, groups, onReload),
            }, ['Editar atletas'])
          : null,
        canEdit
          ? h('button', {
              class: 'btn btn-sm btn-danger', style: 'margin-left:8px', type: 'button',
              onClick: () => confirmModal('Excluir sessão?', async () => { await api.del(`/api/training-sessions/${s.id}`); onReload(); }),
            }, ['Excluir'])
          : null,
      ]),
    ]),
    s.objective ? h('p', {}, [h('strong', {}, ['Objetivo: ']), s.objective]) : null,
    focusLine('Técnico', s.focus_technical, drillsByCat.technical),
    focusLine('Físico', s.focus_physical, drillsByCat.physical),
    focusLine('Tático', s.focus_tactical, drillsByCat.tactical),
    focusLine('Mental', s.focus_mental, drillsByCat.mental),
    hasAthletes
      ? h('p', {}, [h('strong', {}, ['Atletas: ']), s.athletes.map((a) => a.name).join(', ')])
      : h('p', { style: 'color:var(--status-warning)' }, [
          '⚠ Nenhum atleta vinculado a esta sessão — a confirmação de presença não vai aparecer até você adicionar atletas em "Editar atletas".',
        ]),
    s.notes ? h('p', {}, [h('strong', {}, ['Notas: ']), s.notes]) : null,
  ]);
}

function openEditAthletesModal(session, athletes, groups, onReload) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const { groupsForDay, athletesForDay } = groupsAndAthletesForDate(session.date, groups);
  // Atletas ja vinculados a sessao continuam disponiveis mesmo se a turma deles
  // nao tiver mais horario nesse dia (ex: horario da turma mudou depois que a
  // sessao foi criada) -- assim editar a sessao nunca perde atleta ja marcado,
  // so restringe quem pode ser ADICIONADO de novo.
  const alreadyIn = session.athletes || [];
  const pickerAthletes = [...athletesForDay, ...alreadyIn.filter((a) => !athletesForDay.some((x) => x.id === a.id))]
    .sort((a, b) => a.name.localeCompare(b.name));
  const athletePicker = buildAthletePicker(pickerAthletes, groupsForDay, alreadyIn.map((a) => a.id));
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.put(`/api/training-sessions/${session.id}`, { athleteIds: athletePicker.getSelectedIds() });
        backdrop.remove();
        onReload();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, [`Editar atletas — ${session.title}`]),
    h('div', { style: 'margin-top:12px' }, [athletePicker.el]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Salvar']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

function focusLine(label, value, focusDrills) {
  if (!value && (!focusDrills || !focusDrills.length)) return null;
  return h('div', {}, [
    value ? h('p', {}, [h('strong', {}, [`Foco ${label}: `]), value]) : h('p', {}, [h('strong', {}, [`Foco ${label}`])]),
    focusDrills && focusDrills.length
      ? h('p', { style: 'margin-top:-6px;font-size:13px' }, [h('strong', {}, ['Drills: ']), focusDrills.map((d) => d.name).join(', ')])
      : null,
  ]);
}

function buildAddForm(dateStr, athletes, groups, drills, role, weekFocusMap, onDone) {
  const startTime = h('input', { type: 'time' });
  const endTime = h('input', { type: 'time' });
  const title = h('input', { required: true, placeholder: 'Ex: Treino técnico - forehand' });
  const objective = h('input', { placeholder: 'Objetivo geral da sessão' });
  const focusTechnical = h('input', { placeholder: 'Ex: consistência de fundo de quadra' });
  const focusPhysical = h('input', { placeholder: 'Ex: resistência específica' });
  const focusTactical = h('input', { placeholder: 'Ex: padrões cross-court' });
  const focusMental = h('input', { placeholder: 'Ex: rotina pré-ponto' });
  const notes = h('textarea', { placeholder: 'Notas adicionais' });
  const errorBox = h('div', { class: 'error-msg' });

  const { groupsForDay, athletesForDay } = groupsAndAthletesForDate(dateStr, groups);
  const athletePicker = buildAthletePicker(athletesForDay, groupsForDay, []);

  const weekFocusEntry = weekFocusMap.get(mondayOfWeek(dateStr)) || null;
  const weekFocusCategory = weekFocusEntry ? weekFocusEntry.focusCategory : null;
  const weekFocusSubcategory = weekFocusEntry ? weekFocusEntry.subcategory : null;
  const weekFocusSecondary = weekFocusEntry ? weekFocusEntry.secondaryFocusCategory : null;
  const allowedFocusCategories = weekFocusCategory ? [weekFocusCategory, weekFocusSecondary].filter(Boolean) : null;

  const selectedDrillIds = new Set();

  function drillFieldFor(category) {
    if (allowedFocusCategories && !allowedFocusCategories.includes(category)) {
      const labels = allowedFocusCategories.map((c) => FOCUS_LABEL[c]).join(' + ');
      return h('p', { style: 'font-size:11.5px;color:var(--text-muted);margin-top:4px' }, [
        `Foco da semana é "${labels}" — sem drills disponíveis aqui.`,
      ]);
    }
    let list = (drills || []).filter((d) => d.focus_category === category);
    const subcategoryRestricted = category === 'technical' && weekFocusCategory === 'technical' && weekFocusSubcategory;
    if (subcategoryRestricted) {
      list = list.filter((d) => d.subcategory === weekFocusSubcategory);
    }
    if (!list.length) {
      if (subcategoryRestricted) {
        return h('p', { style: 'font-size:11.5px;color:var(--text-muted);margin-top:4px' }, [
          `Foco da semana é "${TECHNICAL_SUBCATEGORY_LABEL[weekFocusSubcategory]}" — sem drills disponíveis aqui.`,
        ]);
      }
      return role === 'head_coach'
        ? h('a', { href: '#/drills', style: 'font-size:12px;display:inline-block;margin-top:4px' }, ['+ Cadastrar drills na biblioteca'])
        : h('p', { style: 'font-size:11.5px;color:var(--text-muted);margin-top:4px' }, ['Nenhum drill cadastrado para este foco.']);
    }
    if (category === 'technical') {
      list.sort((a, b) => (a.subcategory || '').localeCompare(b.subcategory || '') || a.name.localeCompare(b.name));
    }

    const summary = h('div', { class: 'drill-pick-list' });
    function refreshSummary() {
      clear(summary);
      const chosen = list.filter((d) => selectedDrillIds.has(d.id));
      if (!chosen.length) {
        summary.appendChild(h('span', { style: 'font-size:11.5px;color:var(--text-muted)' }, ['Nenhum drill selecionado.']));
        return;
      }
      chosen.forEach((d) => {
        summary.appendChild(h('span', { class: 'drill-chip drill-chip-selected' }, [
          d.name,
          h('button', {
            type: 'button', class: 'drill-chip-remove',
            onClick: () => { selectedDrillIds.delete(d.id); refreshSummary(); },
          }, ['×']),
        ]));
      });
    }
    refreshSummary();

    const openBtn = h('button', {
      type: 'button', class: 'btn btn-sm', style: 'margin-top:6px',
      onClick: () => openDrillPickerModal(FOCUS_LABEL[category], list, selectedDrillIds, refreshSummary),
    }, [`Selecionar drills (${list.length})`]);

    return h('div', {}, [summary, openBtn]);
  }

  const form = h('form', {
    class: 'inline-session-form',
    onSubmit: async (e) => {
      e.preventDefault();
      if (!athletePicker.size()) {
        errorBox.textContent = 'Selecione ao menos um atleta (ou uma turma) para esta sessão — sem isso não é possível confirmar presença depois.';
        return;
      }
      try {
        await api.post('/api/training-sessions', {
          date: dateStr, startTime: startTime.value || null, endTime: endTime.value || null,
          title: title.value, objective: objective.value || null,
          focusTechnical: focusTechnical.value || null, focusPhysical: focusPhysical.value || null,
          focusTactical: focusTactical.value || null, focusMental: focusMental.value || null,
          notes: notes.value || null, athleteIds: athletePicker.getSelectedIds(), drillIds: Array.from(selectedDrillIds),
        });
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h4', {}, ['+ Nova sessão nesse dia']),
    h('div', { class: 'form-grid', style: 'margin-top:10px' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Início']), startTime]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Fim']), endTime]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Título']), title]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Objetivo']), objective]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Foco técnico']), focusTechnical, drillFieldFor('technical')]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Foco físico']), focusPhysical, drillFieldFor('physical')]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Foco tático']), focusTactical, drillFieldFor('tactical')]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Foco mental']), focusMental, drillFieldFor('mental')]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Notas']), notes]),
    ]),
    h('div', { style: 'margin-top:10px' }, [athletePicker.el]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Salvar sessão']),
    ]),
  ]);

  return form;
}

// Janela dedicada para escolher drills: mostra a descrição/execução completa de cada um,
// já que o campo do formulário principal fica compacto demais para isso.
function openDrillPickerModal(categoryLabel, list, selectedDrillIds, onChange) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box drill-picker-modal' });
  box.appendChild(h('h2', {}, [`Selecionar drills — Foco ${categoryLabel}`]));
  box.appendChild(h('p', { style: 'margin-top:-6px' }, ['Leia a execução de cada drill antes de escolher.']));

  const hasSubcategories = list.some((d) => d.subcategory);
  const groups = hasSubcategories
    ? [...TECHNICAL_SUBCATEGORY_OPTS, { value: null, label: 'Outros' }]
    : [{ value: undefined, label: null }];

  groups.forEach((g) => {
    const groupList = g.value === undefined ? list : list.filter((d) => (d.subcategory || null) === g.value);
    if (!groupList.length) return;
    if (g.label) box.appendChild(h('h4', { style: 'margin-top:14px;color:var(--text-secondary)' }, [g.label]));
    groupList.forEach((d) => {
      const card = h('label', { class: `drill-pick-card${selectedDrillIds.has(d.id) ? ' checked' : ''}` }, [
        h('div', { class: 'drill-pick-card-body' }, [
          h('div', { class: 'drill-diagram-thumb', title: d.court_zone || '', html: courtDiagramSVG(d.court_zone) }),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { class: 'drill-pick-card-header' }, [
              h('input', {
                type: 'checkbox', checked: selectedDrillIds.has(d.id),
                onChange: (e) => {
                  if (e.target.checked) selectedDrillIds.add(d.id); else selectedDrillIds.delete(d.id);
                  card.classList.toggle('checked', e.target.checked);
                },
              }),
              h('strong', {}, [d.name]),
              d.duration_minutes ? h('span', { class: 'badge badge-neutral' }, [`${d.duration_minutes} min`]) : null,
            ]),
            d.description ? h('p', { style: 'white-space:pre-wrap;font-size:13px;margin-top:6px' }, [d.description]) : null,
            d.equipment ? h('p', { style: 'font-size:13px' }, [h('strong', {}, ['Material: ']), d.equipment]) : null,
          ]),
        ]),
      ]);
      box.appendChild(card);
    });
  });

  const doneBtn = h('button', { class: 'btn btn-primary', type: 'button', style: 'margin-top:14px' }, ['Concluído']);
  doneBtn.addEventListener('click', () => { backdrop.remove(); onChange(); });
  box.appendChild(doneBtn);

  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); onChange(); } });
  document.body.appendChild(backdrop);
}
