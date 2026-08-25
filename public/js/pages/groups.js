import { h, clear, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { BALL_STAGE_OPTS, BALL_STAGE_LABEL, BALL_STAGE_EMOJI } from '../kidsStages.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 16 }, (_, i) => 6 + i); // 06h..21h (inicio de cada slot de 1h)

function slotKey(day, hour) { return `${day}_${hour}`; }

// Agrupa os horarios selecionados em faixas legiveis por dia, ex: "Seg 16h–18h · Qua 16h–17h"
function summarizeSlots(slots) {
  if (!slots.length) return '';
  const byDay = new Map();
  slots.forEach(({ day, hour }) => { if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(hour); });
  return WEEKDAYS.filter((d) => byDay.has(d)).map((day) => {
    const hours = byDay.get(day).slice().sort((a, b) => a - b);
    const ranges = [];
    let start = hours[0];
    let prev = hours[0];
    for (let i = 1; i < hours.length; i++) {
      if (hours[i] === prev + 1) { prev = hours[i]; continue; }
      ranges.push([start, prev]);
      start = hours[i]; prev = hours[i];
    }
    ranges.push([start, prev]);
    const rangeStr = ranges.map(([s, e]) => `${String(s).padStart(2, '0')}h–${String(e + 1).padStart(2, '0')}h`).join(', ');
    return `${day} ${rangeStr}`;
  }).join(' · ');
}

export async function renderGroups(main, ctx) {
  const canEdit = ctx.user.role === 'head_coach';
  const [groups, athletes, users] = await Promise.all([
    api.get('/api/groups'),
    api.get('/api/athletes'),
    canEdit ? api.get('/api/users') : Promise.resolve([]),
  ]);
  const headCoaches = users.filter((u) => u.role === 'head_coach');
  const trainerUsers = users.filter((u) => u.role === 'treinador');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Turmas']), h('p', {}, ['Agrupe atletas em turmas para organizar o planejamento.'])]),
    canEdit ? h('button', { class: 'btn btn-primary', onClick: () => openGroupModal(null, athletes, headCoaches, trainerUsers, async () => renderGroups(main, ctx)) }, ['+ Nova turma']) : null,
  ]));

  if (!groups.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Nenhuma turma cadastrada ainda.'])]));
    return;
  }

  const grid = h('div', { class: 'grid grid-3' });
  groups.forEach((g) => {
    const card = h('div', { class: 'card' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
        h('div', {}, [
          h('h3', {}, [g.name]),
          h('p', {}, [`${g.athletes.length} aluno${g.athletes.length === 1 ? '' : 's'}`]),
          h('span', { class: `badge ${g.is_dropin ? 'badge-neutral' : 'badge-torneio'}` }, [g.is_dropin ? 'Aula avulsa' : (g.schedule_time || 'Horário não definido')]),
          g.ball_stage
            ? h('span', { class: 'badge badge-neutral', style: 'margin-left:6px' }, [`${BALL_STAGE_EMOJI[g.ball_stage] || ''} ${BALL_STAGE_LABEL[g.ball_stage] || g.ball_stage}`])
            : null,
        ]),
        canEdit ? h('div', {}, [
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openGroupModal(g, athletes, headCoaches, trainerUsers, async () => renderGroups(main, ctx)) }, ['Editar']),
          h('button', {
            class: 'btn btn-sm btn-danger', style: 'margin-left:6px', type: 'button',
            onClick: () => confirmModal('Excluir turma?', async () => { await api.del(`/api/groups/${g.id}`); renderGroups(main, ctx); }),
          }, ['Excluir']),
        ]) : null,
      ]),
      g.description ? h('p', {}, [g.description]) : null,
      g.athletes.length
        ? h('p', {}, [h('strong', {}, ['Alunos: ']), g.athletes.map((a) => a.name).join(', ')])
        : h('p', {}, ['Nenhum aluno nesta turma ainda.']),
      g.headCoach ? h('p', {}, [h('strong', {}, ['Head coach: ']), g.headCoach.name]) : null,
      g.trainers && g.trainers.length ? h('p', {}, [h('strong', {}, ['Treinador(es): ']), g.trainers.map((t) => t.name).join(', ')]) : null,
    ]);
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

function openGroupModal(group, athletes, headCoaches, trainerUsers, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Ex: Turma sub-14 manhã', value: group ? group.name : '' });
  const description = h('textarea', { placeholder: 'Descrição (opcional)' });
  if (group && group.description) description.value = group.description;
  const errorBox = h('div', { class: 'error-msg' });

  const isDropin = group ? !!group.is_dropin : false;
  const selectedSlots = new Set((group && group.scheduleSlots ? group.scheduleSlots : []).map((s) => slotKey(s.day, s.hour)));

  const scheduleSummary = h('p', { style: 'font-size:12.5px;color:var(--text-secondary);margin:6px 0 0' });
  function refreshScheduleSummary() {
    const slots = Array.from(selectedSlots).map((k) => { const [day, hour] = k.split('_'); return { day, hour: Number(hour) }; });
    scheduleSummary.textContent = slots.length ? summarizeSlots(slots) : 'Nenhum horário selecionado ainda.';
  }
  refreshScheduleSummary();
  const scheduleBtn = h('button', {
    type: 'button', class: 'btn btn-sm',
    onClick: () => openSchedulePickerModal(selectedSlots, refreshScheduleSummary),
  }, ['📅 Selecionar horários']);
  const scheduleField = h('div', { class: 'form-field span-2' }, [h('label', {}, ['Horário da turma']), scheduleBtn, scheduleSummary]);
  const dropinCb = h('input', {
    type: 'checkbox', checked: isDropin,
    onChange: (e) => { scheduleField.style.display = e.target.checked ? 'none' : ''; },
  });
  scheduleField.style.display = isDropin ? 'none' : '';
  const dropinField = h('div', { class: 'form-field span-2' }, [
    h('label', { class: 'tag-checkbox' }, [dropinCb, 'Aula avulsa (sem horário fixo)']),
  ]);

  const memberIds = new Set(group ? group.athletes.map((a) => a.id) : []);
  const tagList = h('div', { class: 'tag-list' }, athletes.map((a) => {
    const checked = memberIds.has(a.id);
    const cb = h('input', {
      type: 'checkbox', checked,
      onChange: (e) => { if (e.target.checked) memberIds.add(a.id); else memberIds.delete(a.id); label.classList.toggle('checked', e.target.checked); },
    });
    const label = h('label', { class: `tag-checkbox${checked ? ' checked' : ''}` }, [cb, a.name]);
    return label;
  }));

  const ballStageSelect = h('select', {}, [
    h('option', { value: '' }, ['Não definido']),
    ...BALL_STAGE_OPTS.map((s) => h('option', { value: s.value, selected: !!(group && group.ball_stage === s.value) }, [`${BALL_STAGE_EMOJI[s.value]} ${s.label}`])),
  ]);
  const ballStageField = h('div', { class: 'form-field span-2' }, [
    h('label', {}, ['Tipo de bola da turma']),
    ballStageSelect,
    h('p', { style: 'font-size:11.5px;color:var(--text-muted);margin-top:4px' }, [
      'Restringe quais drills podem ser usados nas sessões dessa turma (mini-tênis por estágio, ou geral para amarela/adulto).',
    ]),
  ]);

  const headCoachSelect = h('select', {}, [
    h('option', { value: '' }, ['Nenhum definido']),
    ...headCoaches.map((u) => h('option', { value: u.id, selected: !!(group && group.headCoach && group.headCoach.id === u.id) }, [u.name])),
  ]);

  const trainerIds = new Set(group && group.trainers ? group.trainers.map((t) => t.id) : []);
  const trainerTagList = h('div', { class: 'tag-list' }, trainerUsers.map((u) => {
    const checked = trainerIds.has(u.id);
    const cb = h('input', {
      type: 'checkbox', checked,
      onChange: (e) => { if (e.target.checked) trainerIds.add(u.id); else trainerIds.delete(u.id); label.classList.toggle('checked', e.target.checked); },
    });
    const label = h('label', { class: `tag-checkbox${checked ? ' checked' : ''}` }, [cb, u.name]);
    return label;
  }));

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      if (!dropinCb.checked && !selectedSlots.size) {
        errorBox.textContent = 'Selecione ao menos um horário no calendário ou marque como aula avulsa.';
        return;
      }
      try {
        const scheduleSlots = Array.from(selectedSlots).map((k) => { const [day, hour] = k.split('_'); return { day, hour: Number(hour) }; });
        const payload = {
          name: name.value, description: description.value || null, athleteIds: Array.from(memberIds),
          isDropin: dropinCb.checked,
          scheduleSlots: dropinCb.checked ? [] : scheduleSlots,
          scheduleTime: dropinCb.checked ? null : summarizeSlots(scheduleSlots),
          headCoachId: headCoachSelect.value ? Number(headCoachSelect.value) : null,
          trainerIds: Array.from(trainerIds),
          ballStage: ballStageSelect.value || null,
        };
        if (group) await api.put(`/api/groups/${group.id}`, payload);
        else await api.post('/api/groups', payload);
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, [group ? 'Editar turma' : 'Nova turma']),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome da turma']), name]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Descrição']), description]),
      scheduleField,
      dropinField,
      ballStageField,
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px' }, [
      h('label', {}, ['Alunos da turma']),
      athletes.length ? tagList : h('p', {}, ['Nenhum atleta cadastrado ainda.']),
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px;max-width:320px' }, [
      h('label', {}, ['Head coach responsável (opcional)']),
      headCoachSelect,
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px' }, [
      h('label', {}, ['Treinador(es) da turma']),
      trainerUsers.length ? trainerTagList : h('p', {}, ['Nenhum treinador cadastrado ainda.']),
    ]),
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

// Calendario semanal interativo, dividido hora a hora — o usuario pode tocar em quantas
// celulas precisar (varios dias e horarios) para montar o horario fixo da turma.
function openSchedulePickerModal(selectedSlots, onChange) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box schedule-picker-modal' });
  box.appendChild(h('h2', {}, ['Selecionar horários da turma']));
  box.appendChild(h('p', { style: 'margin-top:-6px' }, ['Toque nos horários desejados — pode marcar quantos precisar, em vários dias.']));

  const grid = h('div', { class: 'schedule-grid' });
  grid.appendChild(h('div', { class: 'schedule-grid-corner' }));
  WEEKDAYS.forEach((day) => grid.appendChild(h('div', { class: 'schedule-grid-headcell' }, [day])));

  HOURS.forEach((hour) => {
    grid.appendChild(h('div', { class: 'schedule-grid-hourcell' }, [`${String(hour).padStart(2, '0')}:00`]));
    WEEKDAYS.forEach((day) => {
      const key = slotKey(day, hour);
      const cell = h('button', {
        type: 'button',
        class: `schedule-cell${selectedSlots.has(key) ? ' active' : ''}`,
      }, []);
      cell.addEventListener('click', () => {
        if (selectedSlots.has(key)) selectedSlots.delete(key); else selectedSlots.add(key);
        cell.classList.toggle('active', selectedSlots.has(key));
      });
      grid.appendChild(cell);
    });
  });
  box.appendChild(grid);

  const doneBtn = h('button', { class: 'btn btn-primary', type: 'button', style: 'margin-top:14px' }, ['Concluído']);
  doneBtn.addEventListener('click', () => { backdrop.remove(); onChange(); });
  box.appendChild(doneBtn);

  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); onChange(); } });
  document.body.appendChild(backdrop);
}
