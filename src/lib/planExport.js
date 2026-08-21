import { PdfDocument } from './pdfWriter.js';

const WEEKDAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function nextWeekdays(count, startFrom = new Date()) {
  const dates = [];
  const d = new Date(startFrom);
  d.setDate(d.getDate() + 1);
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function fmtDateBr(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Distribui os focos prioritarios do plano em sessoes propostas nos proximos
// dias uteis, uma sessao por foco (na ordem de prioridade)
export function buildScheduleFromPlan(plan) {
  const areas = (plan.focusAreas || []).filter((f) => f.drills && f.drills.length);
  const dates = nextWeekdays(areas.length);
  return areas.map((f, idx) => {
    const date = dates[idx];
    const isoDate = date.toISOString().slice(0, 10);
    return {
      date: isoDate,
      dateBr: fmtDateBr(isoDate),
      weekday: WEEKDAY_NAMES[date.getDay()],
      focusLabel: f.label,
      reason: f.reason,
      drills: f.drills,
      athletes: plan.athleteNames || [],
    };
  });
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/["\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildPlanCsv(plan) {
  const schedule = buildScheduleFromPlan(plan);
  const header = ['Data', 'Dia da semana', 'Atleta(s)', 'Foco', 'Motivo', 'Drills', 'Duração estimada (min)'];
  const rows = schedule.map((s) => {
    const totalDuration = s.drills.reduce((sum, d) => sum + (d.duration_minutes || 0), 0);
    return [
      s.dateBr,
      s.weekday,
      s.athletes.join(', '),
      s.focusLabel,
      s.reason,
      s.drills.map((d) => d.name).join(' | '),
      totalDuration || '',
    ];
  });
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(';'));
  return `﻿${lines.join('\r\n')}`;
}

export function buildPlanPdf(plan) {
  const schedule = buildScheduleFromPlan(plan);
  const doc = new PdfDocument();

  const title = plan.isGroup
    ? `Plano de treino em grupo - ${plan.athleteNames.join(', ')}`
    : `Plano de treino - ${plan.athleteNames.join(', ')}`;
  doc.heading(title, 16);
  doc.text(plan.periodLabel, 10);
  doc.space(6);
  doc.text(plan.summary || '', 11);
  doc.space(10);

  doc.heading('Focos prioritários', 13);
  (plan.focusAreas || []).forEach((f) => {
    doc.heading(`${f.priority}. ${f.label}${f.score !== null && f.score !== undefined ? ` (${f.score}/10)` : ''}`, 11);
    doc.text(f.reason, 10);
    if (f.drills && f.drills.length) {
      f.drills.forEach((d) => {
        doc.text(`- ${d.name}${d.duration_minutes ? ` (${d.duration_minutes} min)` : ''}`, 10);
      });
    } else {
      doc.text('- Nenhum drill cadastrado na biblioteca para este foco.', 10);
    }
    doc.space(6);
  });

  if (plan.matchInsights && plan.matchInsights.length) {
    doc.space(4);
    doc.heading('Sinais táticos dos jogos recentes', 13);
    plan.matchInsights.forEach((m) => doc.text(`- ${m}`, 10));
    doc.space(10);
  }

  doc.space(4);
  doc.heading('Agendamento de treinos proposto', 13);
  if (!schedule.length) {
    doc.text('Nenhum drill disponível na biblioteca para montar um agendamento ainda.', 10);
  }
  schedule.forEach((s) => {
    doc.heading(`${s.dateBr} (${s.weekday}) - ${s.focusLabel}`, 11);
    doc.text(`Atleta(s): ${s.athletes.join(', ')}`, 10);
    s.drills.forEach((d) => {
      doc.text(`- ${d.name}${d.duration_minutes ? ` (${d.duration_minutes} min)` : ''}`, 10);
    });
    doc.space(6);
  });

  return doc.build();
}
