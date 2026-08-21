import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';

const STATUS_OPTS = [
  { value: 'presente', label: 'Presente', variant: 'positive' },
  { value: 'ausente', label: 'Ausente', variant: 'negative' },
  { value: 'justificado', label: 'Justificado', variant: 'neutral' },
];
const STATUS_LABEL = { previsto: 'A confirmar', presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' };

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function renderAttendance(main, ctx) {
  const canManage = ctx.user.role !== 'responsavel';
  let sessions = await api.get('/api/training-sessions');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [
      h('h1', {}, ['Confirmação de presença']),
      h('p', {}, [canManage
        ? 'Toque no status de cada atleta para confirmar presença nas sessões de treino.'
        : 'Acompanhe a presença do seu atleta nas sessões de treino.']),
    ]),
    canManage ? h('button', { class: 'btn', type: 'button', onClick: () => openMonthlyReportModal(sessions) }, ['📊 Relatório mensal']) : null,
  ]));

  if (!canManage) {
    main.appendChild(h('div', { class: 'card' }, [
      h('h3', { style: 'margin-bottom:2px' }, ['Relatório mensal de presença']),
      h('p', { style: 'font-size:13px;color:var(--text-secondary);margin:0 0 10px' }, ['Presenças x faltas do seu atleta no mês selecionado.']),
      buildMonthlyReportBlock(sessions, { showExport: false }),
    ]));
  }

  const filterRow = h('div', { class: 'chip-row' });
  const state = { filter: 'upcoming' };
  const FILTERS = [
    { value: 'today', label: 'Hoje' },
    { value: 'pending', label: 'Pendentes de confirmar' },
    { value: 'upcoming', label: 'Próximas' },
    { value: 'all', label: 'Todas' },
  ];
  function refreshFilterChips() {
    clear(filterRow);
    FILTERS.forEach((f) => {
      const chip = h('button', { type: 'button', class: `chip${state.filter === f.value ? ' active' : ''}` }, [f.label]);
      chip.addEventListener('click', () => { state.filter = f.value; draw(); });
      filterRow.appendChild(chip);
    });
  }
  main.appendChild(filterRow);

  const listWrap = h('div');
  main.appendChild(listWrap);

  async function reload() {
    sessions = await api.get('/api/training-sessions');
    draw();
  }

  function draw() {
    refreshFilterChips();
    clear(listWrap);
    const todayStr = toISODate(new Date());
    const isPending = (s) => (s.athletes || []).some((a) => !a.attendance || a.attendance === 'previsto');
    let list = sessions.filter((s) => (s.athletes || []).length);
    if (state.filter === 'today') list = list.filter((s) => s.date.slice(0, 10) === todayStr);
    else if (state.filter === 'pending') list = list.filter(isPending);
    else if (state.filter === 'upcoming') list = list.filter((s) => s.date.slice(0, 10) >= todayStr);
    list = list.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));

    if (!list.length) {
      const emptyMsg = state.filter === 'today' ? 'Nenhuma sessão com atletas hoje.'
        : state.filter === 'pending' ? 'Nenhuma sessão pendente de confirmação.'
        : 'Nenhuma sessão com atletas nesse período.';
      listWrap.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, [emptyMsg])]));
      return;
    }
    list.forEach((s) => listWrap.appendChild(buildSessionCard(s, reload, canManage)));
  }

  draw();
}

function buildSessionCard(session, onReload, canManage) {
  const confirmedCount = (session.athletes || []).filter((a) => a.attendance === 'presente').length;
  const pendingCount = (session.athletes || []).filter((a) => !a.attendance || a.attendance === 'previsto').length;
  const isFuture = session.date.slice(0, 10) > toISODate(new Date());
  const card = h('div', { class: 'card attendance-session-card' });
  card.appendChild(h('div', { class: 'page-header', style: 'margin-bottom:10px' }, [
    h('div', {}, [
      h('h3', { style: 'margin:0' }, [session.title]),
      h('p', { style: 'margin:2px 0 0' }, [`${fmtDate(session.date)} · ${session.start_time || '--'}${session.end_time ? '–' + session.end_time : ''}`]),
    ]),
    h('div', {}, [
      pendingCount ? h('span', { class: 'badge attendance-badge-previsto', style: 'margin-right:6px' }, [`${pendingCount} pendente${pendingCount === 1 ? '' : 's'}`]) : null,
      h('span', { class: 'badge badge-neutral' }, [`${confirmedCount}/${session.athletes.length} presentes`]),
    ]),
  ]));

  if (canManage && isFuture) {
    card.appendChild(h('p', { style: 'font-size:12px;color:var(--text-muted);margin:-4px 0 10px' }, [
      'Aula futura — só é possível registrar falta justificada antecipadamente. Presença/falta ficam disponíveis a partir do dia da aula.',
    ]));
  }

  const list = h('div', { class: 'attendance-athlete-list' });
  session.athletes.forEach((a) => list.appendChild(buildAthleteRow(session.id, a, onReload, canManage, isFuture)));
  card.appendChild(list);
  return card;
}

function buildAthleteRow(sessionId, athlete, onReload, canManage, isFuture) {
  const wrap = h('div', {});
  const row = h('div', { class: 'attendance-athlete-row' });
  const statusLabel = h('span', { class: `badge attendance-badge-${athlete.attendance}` }, [STATUS_LABEL[athlete.attendance] || 'A confirmar']);
  row.appendChild(h('span', { class: 'attendance-athlete-name' }, [athlete.name]));
  row.appendChild(statusLabel);
  wrap.appendChild(row);

  if (!canManage) return wrap;

  const errorBox = h('div', { class: 'error-msg', style: 'margin:2px 0 0' });

  const chipRow = h('div', { class: 'chip-row', style: 'margin:0' }, STATUS_OPTS.map((opt) => {
    const disabled = isFuture && opt.value !== 'justificado';
    const chip = h('button', {
      type: 'button',
      disabled,
      title: disabled ? 'Disponível a partir do dia da aula' : '',
      class: `attendance-chip attendance-chip-${opt.value}${athlete.attendance === opt.value ? ' active' : ''}`,
    }, [opt.label]);
    chip.addEventListener('click', async () => {
      errorBox.textContent = '';
      const next = athlete.attendance === opt.value ? 'previsto' : opt.value;
      try {
        await api.patch(`/api/training-sessions/${sessionId}/attendance`, { athleteId: athlete.id, attendance: next });
        onReload();
      } catch (err) {
        errorBox.textContent = err.message;
      }
    });
    return chip;
  }));
  row.appendChild(chipRow);
  wrap.appendChild(errorBox);
  return wrap;
}

// ---------------------------------------------------------------------------
// Relatório mensal de presença -- agrega, por atleta, quantas sessões do mes
// escolhido ficaram como presente/ausente/justificado/pendente, calculado a
// partir dos dados de sessoes ja carregados (sem chamada extra ao backend).
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const s = String(value ?? '');
  if (/["\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildMonthlyReport(sessions, monthStr) {
  const byAthlete = new Map();
  sessions.forEach((s) => {
    if (s.date.slice(0, 7) !== monthStr) return;
    (s.athletes || []).forEach((a) => {
      if (!byAthlete.has(a.id)) byAthlete.set(a.id, { name: a.name, presente: 0, ausente: 0, justificado: 0, pendente: 0 });
      const row = byAthlete.get(a.id);
      const status = a.attendance && a.attendance !== 'previsto' ? a.attendance : 'pendente';
      row[status] += 1;
    });
  });
  return Array.from(byAthlete.values())
    .map((r) => {
      const confirmed = r.presente + r.ausente + r.justificado;
      const pct = confirmed ? Math.round((r.presente / confirmed) * 100) : null;
      return { ...r, pct };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function downloadMonthlyReportCsv(rows, monthStr) {
  const header = ['Atleta', 'Presenças', 'Faltas', 'Justificadas', 'Pendentes', '% Presença (sobre confirmadas)'];
  const lines = [header, ...rows.map((r) => [r.name, r.presente, r.ausente, r.justificado, r.pendente, r.pct !== null ? `${r.pct}%` : '-'])]
    .map((r) => r.map(csvEscape).join(';'));
  const csv = `﻿${lines.join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `presenca-${monthStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Bloco reutilizavel (seletor de mes + tabela) usado tanto dentro do modal
// (head_coach/treinador) quanto embutido direto na pagina (responsavel).
function buildMonthlyReportBlock(sessions, { showExport }) {
  const wrap = h('div', {});
  const monthInput = h('input', { type: 'month', value: toISODate(new Date()).slice(0, 7) });
  wrap.appendChild(h('div', { class: 'form-field', style: 'max-width:220px' }, [h('label', {}, ['Mês']), monthInput]));

  const resultWrap = h('div', { style: 'margin-top:10px' });
  wrap.appendChild(resultWrap);

  function draw() {
    clear(resultWrap);
    const rows = buildMonthlyReport(sessions, monthInput.value);
    if (!rows.length) {
      resultWrap.appendChild(h('div', { class: 'empty-state' }, [`Nenhuma sessão com atletas em ${monthLabel(monthInput.value)}.`]));
      return;
    }
    resultWrap.appendChild(h('table', {}, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Atleta']), h('th', { class: 'num' }, ['Presenças']), h('th', { class: 'num' }, ['Faltas']),
        h('th', { class: 'num' }, ['Justificadas']), h('th', { class: 'num' }, ['Pendentes']), h('th', { class: 'num' }, ['% Presença']),
      ])]),
      h('tbody', {}, rows.map((r) => h('tr', {}, [
        h('td', {}, [r.name]),
        h('td', { class: 'num' }, [String(r.presente)]),
        h('td', { class: 'num' }, [String(r.ausente)]),
        h('td', { class: 'num' }, [String(r.justificado)]),
        h('td', { class: 'num' }, [String(r.pendente)]),
        h('td', { class: 'num' }, [r.pct !== null ? h('span', { class: `badge ${r.pct >= 75 ? 'badge-win' : r.pct >= 50 ? 'badge-neutral' : 'badge-loss'}` }, [`${r.pct}%`]) : '-']),
      ]))),
    ]));
    if (showExport) {
      resultWrap.appendChild(h('div', { class: 'form-actions', style: 'margin-top:10px' }, [
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => downloadMonthlyReportCsv(rows, monthInput.value) }, ['Exportar CSV']),
      ]));
    }
  }

  monthInput.addEventListener('change', draw);
  draw();
  return wrap;
}

function openMonthlyReportModal(sessions) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box', style: 'width:640px' });
  box.appendChild(h('h2', {}, ['Relatório mensal de presença']));
  box.appendChild(h('p', { style: 'margin-top:-6px;font-size:13px;color:var(--text-secondary)' }, [
    'Presenças x faltas por atleta no mês selecionado.',
  ]));
  box.appendChild(buildMonthlyReportBlock(sessions, { showExport: true }));
  box.appendChild(h('div', { class: 'form-actions', style: 'margin-top:14px' }, [
    h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Fechar']),
  ]));

  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}
