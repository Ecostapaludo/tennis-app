import { h, clear, fmtDate, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { statTile } from '../components/charts.js';
import { CATEGORY_OPTS, GENDER_LABEL } from '../athleteCategories.js';

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

const GROUP_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

function groupColorMap(groups) {
  const sorted = groups.slice().sort((a, b) => a.name.localeCompare(b.name));
  const map = new Map();
  sorted.forEach((g, i) => map.set(g.id, GROUP_COLORS[i % GROUP_COLORS.length]));
  return map;
}

// Agrupa horas em sequencias continuas (ex: [15,16,17] -> [[15,17]]) para o
// resumo da turma da semana poder mostrar "15:00 às 17:00" em vez de 3 linhas
// separadas. Horas com furo (ex: [15,17]) viram 2 intervalos de 1 hora cada.
function hourRanges(hours) {
  const sorted = Array.from(new Set(hours)).sort((a, b) => a - b);
  const ranges = [];
  let start = null;
  let prev = null;
  sorted.forEach((h) => {
    if (start === null) { start = h; prev = h; return; }
    if (h === prev + 1) { prev = h; return; }
    ranges.push([start, prev]);
    start = h; prev = h;
  });
  if (start !== null) ranges.push([start, prev]);
  return ranges;
}

// Uma sessao "pertence" a turma quando o conjunto de atletas bate exatamente
// com os membros da turma (mesmo criterio usado no backend em training.js
// para achar a turma de uma sessao) -- usado so pra puxar o objetivo
// planejado daquele dia, se ja houver uma sessao criada.
function findSessionForGroupOnDate(sessions, group, dateStr) {
  const groupIds = new Set((group.athletes || []).map((a) => a.id));
  if (!groupIds.size) return null;
  return (sessions || []).find((s) => {
    if (s.date.slice(0, 10) !== dateStr) return false;
    const sIds = (s.athletes || []).map((a) => a.id);
    return sIds.length === groupIds.size && sIds.every((id) => groupIds.has(id));
  }) || null;
}

// Mostra as turmas da semana (segunda a domingo), dia a dia, ordenadas por horario —
// a partir do horario fixo cadastrado em cada turma (ver Turmas), nao de sessoes avulsas.
// Quando ja existe uma sessao planejada pra aquele dia da turma, mostra o objetivo dela.
function buildWeekCard(groups, sessions) {
  const weekStart = mondayOfWeek(new Date());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });
  const todayStr = toISODate(new Date());
  const colorOf = groupColorMap(groups);

  const entriesByDay = {};
  WEEKDAY_NAMES.forEach((day) => { entriesByDay[day] = []; });
  groups.forEach((g) => {
    const hoursByDay = {};
    (g.scheduleSlots || []).forEach((slot) => {
      if (!(slot.day in entriesByDay)) return;
      if (!hoursByDay[slot.day]) hoursByDay[slot.day] = [];
      hoursByDay[slot.day].push(slot.hour);
    });
    Object.entries(hoursByDay).forEach(([day, hours]) => {
      hourRanges(hours).forEach(([startHour, endHour]) => {
        entriesByDay[day].push({ startHour, endHour, group: g });
      });
    });
  });
  Object.values(entriesByDay).forEach((list) => list.sort((a, b) => a.startHour - b.startHour));

  const dropinGroups = groups.filter((g) => g.is_dropin);

  const weekCard = h('div', { class: 'card' }, [
    h('h3', {}, ['Turmas da semana']),
    h('p', {}, ['Horário fixo de cada turma, dia a dia — o dia de hoje aparece destacado.']),
  ]);
  const weekGrid = h('div', { class: 'dash-week-grid' });
  weekDates.forEach((dateStr, i) => {
    const dayLabel = WEEKDAY_NAMES[i];
    const dayEntries = entriesByDay[dayLabel] || [];
    const dayCell = h('div', { class: `dash-week-day${dateStr === todayStr ? ' today' : ''}` }, [
      h('div', { class: 'dash-week-day-label' }, [`${dayLabel} ${fmtDate(dateStr)}`]),
    ]);
    if (!dayEntries.length) {
      dayCell.appendChild(h('p', { class: 'dash-week-empty' }, ['—']));
    } else {
      dayEntries.forEach(({ startHour, endHour, group }) => {
        const timeLabel = startHour === endHour
          ? `${String(startHour).padStart(2, '0')}:00`
          : `${String(startHour).padStart(2, '0')}:00 às ${String(endHour).padStart(2, '0')}:00`;
        const session = findSessionForGroupOnDate(sessions, group, dateStr);
        dayCell.appendChild(h('div', { class: 'dash-week-session' }, [
          h('span', { class: 'dash-week-time', style: `color:${colorOf.get(group.id)}` }, [timeLabel]),
          h('div', { class: 'dash-week-session-title' }, [group.name]),
          session && session.objective
            ? h('p', { class: 'dash-week-objective' }, [session.objective])
            : h('p', { class: 'dash-week-objective muted' }, ['Sem objetivo definido ainda.']),
        ]));
      });
    }
    weekGrid.appendChild(dayCell);
  });
  weekCard.appendChild(weekGrid);

  if (dropinGroups.length) {
    weekCard.appendChild(h('p', { style: 'font-size:12px;color:var(--text-muted);margin-top:10px' }, [
      `Aulas avulsas (sem horário fixo): ${dropinGroups.map((g) => g.name).join(', ')}`,
    ]));
  }

  return weekCard;
}

function toISODateStr(d) { return toISODate(d); }

// Quantos dias faltam ate a data (0 = hoje, negativo = ja passou o inicio mas
// o torneio pode seguir em cartaz ate end_date)
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function tournamentDateRangeLabel(t) {
  return t.end_date && t.end_date !== t.start_date ? `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}` : fmtDate(t.start_date);
}

function reminderBadge(days) {
  if (days < 0) return h('span', { class: 'badge badge-neutral' }, ['Em andamento']);
  if (days === 0) return h('span', { class: 'badge badge-loss' }, ['Hoje!']);
  if (days === 1) return h('span', { class: 'badge badge-loss' }, ['Amanhã']);
  if (days <= 7) return h('span', { class: 'badge attendance-badge-previsto' }, [`Em ${days} dias`]);
  return h('span', { class: 'badge badge-neutral' }, [`Em ${days} dias`]);
}

// Calendario de torneios previstos + lembretes -- mostra os que ja estao em
// cartaz (end_date >= hoje, mesmo com start_date no passado) ordenados por
// data, destacando os que faltam poucos dias (lembrete visual)
function buildTournamentsCard(tournaments, athletes, canEdit, onReload) {
  const todayStr = toISODateStr(new Date());
  const upcoming = tournaments
    .filter((t) => (t.end_date || t.start_date) >= todayStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const reminders = upcoming.filter((t) => daysUntil(t.start_date) >= 0 && daysUntil(t.start_date) <= 7);

  const card = h('div', { class: 'card' }, [
    h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
      h('div', {}, [
        h('h3', { style: 'margin:0' }, ['Torneios previstos']),
        h('p', { style: 'margin:2px 0 0' }, ['Calendário de torneios e atletas participantes.']),
      ]),
      canEdit ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openTournamentModal(null, athletes, onReload) }, ['+ Novo torneio']) : null,
    ]),
  ]);

  if (reminders.length) {
    card.appendChild(h('div', { class: 'hint-box', style: 'margin-bottom:12px' }, [
      h('strong', {}, ['⏰ Lembretes: ']),
      reminders.map((t, i) => `${t.name} (${daysUntil(t.start_date) === 0 ? 'hoje' : daysUntil(t.start_date) === 1 ? 'amanhã' : `em ${daysUntil(t.start_date)} dias`})${i < reminders.length - 1 ? ' · ' : ''}`).join(''),
    ]));
  }

  if (!upcoming.length) {
    card.appendChild(h('div', { class: 'empty-state' }, ['Nenhum torneio previsto no momento.']));
    return card;
  }

  upcoming.forEach((t) => {
    card.appendChild(h('div', { class: 'card', style: 'margin-bottom:10px;background:var(--surface-2)' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
        h('div', {}, [
          h('h4', { style: 'margin:0' }, [t.name]),
          h('p', { style: 'margin:2px 0 0' }, [`${tournamentDateRangeLabel(t)}${t.location ? ' · ' + t.location : ''}`]),
        ]),
        h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
          reminderBadge(daysUntil(t.start_date)),
          canEdit ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openTournamentModal(t, athletes, onReload) }, ['Editar']) : null,
          canEdit ? h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmModal('Excluir torneio?', async () => { await api.del(`/api/tournaments/${t.id}`); onReload(); }),
          }, ['Excluir']) : null,
        ]),
      ]),
      t.athletes.length
        ? h('p', { style: 'margin:0' }, [h('strong', {}, ['Atletas: ']), t.athletes.map((a) => a.name).join(', ')])
        : h('p', { style: 'margin:0;color:var(--text-muted)' }, ['Nenhum atleta confirmado ainda.']),
      t.notes ? h('p', { style: 'margin:6px 0 0;font-size:12.5px;color:var(--text-secondary)' }, [t.notes]) : null,
    ]));
  });

  return card;
}

function openTournamentModal(tournament, athletes, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Ex: Copa Regional de Tênis', value: tournament ? tournament.name : '' });
  const location = h('input', { placeholder: 'Local (opcional)', value: tournament && tournament.location ? tournament.location : '' });
  const startDate = h('input', { type: 'date', required: true, value: tournament ? tournament.start_date : '' });
  const endDate = h('input', { type: 'date', value: tournament && tournament.end_date ? tournament.end_date : '' });
  const notes = h('textarea', { placeholder: 'Notas (opcional)' });
  if (tournament && tournament.notes) notes.value = tournament.notes;
  const errorBox = h('div', { class: 'error-msg' });

  const memberIds = new Set(tournament ? tournament.athletes.map((a) => a.id) : []);
  const tagList = h('div', { class: 'tag-list' }, athletes.map((a) => {
    const checked = memberIds.has(a.id);
    const cb = h('input', {
      type: 'checkbox', checked,
      onChange: (e) => { if (e.target.checked) memberIds.add(a.id); else memberIds.delete(a.id); label.classList.toggle('checked', e.target.checked); },
    });
    const label = h('label', { class: `tag-checkbox${checked ? ' checked' : ''}` }, [cb, a.name]);
    return label;
  }));

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      if (endDate.value && endDate.value < startDate.value) {
        errorBox.textContent = 'A data final não pode ser antes da data de início.';
        return;
      }
      try {
        const payload = {
          name: name.value, location: location.value || null,
          startDate: startDate.value, endDate: endDate.value || null,
          notes: notes.value || null, athleteIds: Array.from(memberIds),
        };
        if (tournament) await api.put(`/api/tournaments/${tournament.id}`, payload);
        else await api.post('/api/tournaments', payload);
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, [tournament ? 'Editar torneio' : 'Novo torneio']),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome do torneio']), name]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Local']), location]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data de início']), startDate]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data de término (opcional)']), endDate]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Notas']), notes]),
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px' }, [
      h('label', {}, ['Atletas participantes']),
      athletes.length ? tagList : h('p', {}, ['Nenhum atleta cadastrado ainda.']),
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

export async function renderDashboard(main, ctx) {
  const data = await api.get('/api/dashboard');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [
      h('h1', {}, [`Olá, ${ctx.user.name.split(' ')[0]}`]),
      h('p', {}, ['Aqui está um resumo do que está acontecendo.']),
    ]),
  ]));

  if (ctx.user.role === 'responsavel') {
    const tournaments = await api.get('/api/tournaments');
    renderGuardianDashboard(main, data, tournaments);
    return;
  }

  const canEditTournaments = ctx.user.role === 'head_coach';
  const [groups, athletes, tournaments, sessions] = await Promise.all([
    api.get('/api/groups'),
    api.get('/api/athletes'),
    api.get('/api/tournaments'),
    api.get('/api/training-sessions'),
  ]);
  const activeAthletes = athletes.filter((a) => a.active);

  const stats = h('div', { class: 'grid grid-3' });
  [
    { label: 'Atletas ativos', value: activeAthletes.length },
    { label: 'Próximas sessões', value: data.upcomingSessions.length },
    { label: 'Jogos recentes registrados', value: data.recentMatches.length },
  ].forEach((s) => {
    const card = h('div', { class: 'card' });
    stats.appendChild(card);
    statTile(card, s);
  });
  main.appendChild(stats);

  main.appendChild(buildAthleteSummaryCard(activeAthletes));

  main.appendChild(buildWeekCard(groups, sessions));

  main.appendChild(buildTournamentsCard(tournaments, athletes, canEditTournaments, () => renderDashboard(main, ctx)));

  const matchesCard = h('div', { class: 'card' }, [h('h3', {}, ['Jogos recentes'])]);
  if (!data.recentMatches.length) {
    matchesCard.appendChild(h('div', { class: 'empty-state' }, ['Nenhum jogo registrado ainda.']));
  } else {
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Data']), h('th', {}, ['Atleta']), h('th', {}, ['Tipo']), h('th', {}, ['Resultado'])])]),
      h('tbody', {}, data.recentMatches.map((m) => h('tr', {}, [
        h('td', {}, [fmtDate(m.date)]),
        h('td', {}, [m.athlete_name]),
        h('td', {}, [m.match_type]),
        h('td', {}, [h('span', { class: `badge ${m.result === 'vitoria' ? 'badge-win' : m.result === 'derrota' ? 'badge-loss' : 'badge-neutral'}` }, [m.result || '-'])]),
      ]))),
    ]);
    matchesCard.appendChild(table);
  }
  main.appendChild(matchesCard);

  if (ctx.user.role === 'head_coach' && data.attentionAthletes && data.attentionAthletes.length) {
    const alertCard = h('div', { class: 'card' }, [
      h('h3', {}, ['⚠️ Atletas que merecem atenção']),
      h('p', {}, ['Média de erros não forçados acima de 15 nas últimas partidas.']),
      h('ul', {}, data.attentionAthletes.map((a) => h('li', {}, [`${a.name} — média de ${a.avg_unforced.toFixed(1)} erros não forçados`]))),
    ]);
    main.appendChild(alertCard);
  }
}

function buildAthleteSummaryCard(athletes) {
  const genderCounts = { masculino: 0, feminino: 0, unset: 0 };
  athletes.forEach((a) => {
    if (a.gender === 'masculino') genderCounts.masculino++;
    else if (a.gender === 'feminino') genderCounts.feminino++;
    else genderCounts.unset++;
  });

  const categoryCounts = {};
  CATEGORY_OPTS.forEach((c) => { categoryCounts[c] = 0; });
  let uncategorized = 0;
  athletes.forEach((a) => {
    if (a.category && categoryCounts[a.category] !== undefined) categoryCounts[a.category] += 1;
    else uncategorized += 1;
  });

  const total = athletes.length;
  const card = h('div', { class: 'card' }, [
    h('h3', {}, ['Atletas ativos — resumo']),
    h('p', {}, [`${total} atleta${total === 1 ? '' : 's'} ativo${total === 1 ? '' : 's'} no total.`]),
  ]);

  const grid = h('div', { class: 'grid grid-2', style: 'margin-top:10px' }, [
    h('div', {}, [
      h('h4', { style: 'font-size:13px;color:var(--text-secondary);margin-bottom:8px' }, ['Por sexo']),
      h('div', { class: 'dash-breakdown-list' }, [
        breakdownRow(GENDER_LABEL.masculino, genderCounts.masculino, total, 'var(--series-1)'),
        breakdownRow(GENDER_LABEL.feminino, genderCounts.feminino, total, 'var(--series-5)'),
        genderCounts.unset ? breakdownRow('Não informado', genderCounts.unset, total, 'var(--text-muted)') : null,
      ]),
    ]),
    h('div', {}, [
      h('h4', { style: 'font-size:13px;color:var(--text-secondary);margin-bottom:8px' }, ['Por faixa etária']),
      h('div', { class: 'dash-breakdown-list' }, [
        ...CATEGORY_OPTS.map((c) => breakdownRow(c, categoryCounts[c], total)),
        uncategorized ? breakdownRow('Sem categoria', uncategorized, total) : null,
      ]),
    ]),
  ]);
  card.appendChild(grid);
  return card;
}

function breakdownRow(label, count, total, color) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const barStyle = color ? `width:${pct}%;background:${color}` : `width:${pct}%`;
  return h('div', { class: 'dash-breakdown-row' }, [
    h('span', { class: 'dash-breakdown-label' }, [label]),
    h('div', { class: 'dash-breakdown-bar-track' }, [h('div', { class: 'dash-breakdown-bar-fill', style: barStyle })]),
    h('span', { class: 'dash-breakdown-count' }, [String(count)]),
  ]);
}

function renderGuardianDashboard(main, data, tournaments) {
  const grid = h('div', { class: 'grid grid-2' });

  const athletesCard = h('div', { class: 'card' }, [h('h3', {}, ['Atleta(s) vinculado(s)'])]);
  if (!data.athletes.length) {
    athletesCard.appendChild(h('div', { class: 'empty-state' }, ['Nenhum atleta vinculado a esta conta ainda.']));
  } else {
    athletesCard.appendChild(h('ul', {}, data.athletes.map((a) => h('li', {}, [`${a.name} — ${a.category || 'sem categoria'}`]))));
  }
  grid.appendChild(athletesCard);

  const todayStr = toISODateStr(new Date());
  const upcomingTournaments = (tournaments || [])
    .filter((t) => (t.end_date || t.start_date) >= todayStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const tournamentsCard = h('div', { class: 'card' }, [h('h3', {}, ['Próximos torneios'])]);
  if (!upcomingTournaments.length) {
    tournamentsCard.appendChild(h('div', { class: 'empty-state' }, ['Nenhum torneio previsto no momento.']));
  } else {
    tournamentsCard.appendChild(h('ul', {}, upcomingTournaments.map((t) => h('li', {}, [
      `${t.name} — ${tournamentDateRangeLabel(t)}${t.location ? ' · ' + t.location : ''} `,
      reminderBadge(daysUntil(t.start_date)),
    ]))));
  }
  grid.appendChild(tournamentsCard);

  const evalCard = h('div', { class: 'card' }, [h('h3', {}, ['Últimas avaliações'])]);
  if (!data.recentEvaluations.length) {
    evalCard.appendChild(h('div', { class: 'empty-state' }, ['Sem avaliações registradas.']));
  } else {
    evalCard.appendChild(h('ul', {}, data.recentEvaluations.map((e) => h('li', {}, [`${fmtDate(e.date)} — avaliação registrada`]))));
  }
  grid.appendChild(evalCard);

  main.appendChild(grid);

  const matchesCard = h('div', { class: 'card' }, [h('h3', {}, ['Últimos jogos'])]);
  if (!data.recentMatches.length) {
    matchesCard.appendChild(h('div', { class: 'empty-state' }, ['Nenhum jogo registrado ainda.']));
  } else {
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Data']), h('th', {}, ['Tipo']), h('th', {}, ['Adversário']), h('th', {}, ['Resultado'])])]),
      h('tbody', {}, data.recentMatches.map((m) => h('tr', {}, [
        h('td', {}, [fmtDate(m.date)]), h('td', {}, [m.match_type]), h('td', {}, [m.opponent_name || '-']),
        h('td', {}, [h('span', { class: `badge ${m.result === 'vitoria' ? 'badge-win' : 'badge-loss'}` }, [m.result || '-'])]),
      ]))),
    ]);
    matchesCard.appendChild(table);
  }
  main.appendChild(matchesCard);
}
