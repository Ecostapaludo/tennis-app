import { h, clear, fmtDate, scoreClass } from '../dom.js';
import { api } from '../api.js';

const STROKES = [['forehand', 'Forehand'], ['backhand', 'Backhand'], ['serve', 'Saque'], ['volley', 'Voleio'], ['smash', 'Smash']];
const SERVE_TYPE_LABEL = { FLAT: 'Flat', SLICE: 'Slice', KICK: 'Kick' };

export async function renderVideo(main, ctx) {
  const athletes = await api.get('/api/athletes');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Análise de vídeo']), h('p', {}, ['Upload de vídeo de golpe e análise biomecânica.'])]),
    h('a', { class: 'btn btn-sm', href: '#/biomech' }, ['📐 Base biomecânica']),
  ]));

  main.appendChild(h('div', { class: 'notice-banner' }, [
    '⚠️ A análise abaixo é SIMULADA para fins de demonstração deste MVP — as notas e comentários não vêm de um ',
    'processamento real de visão computacional. O ponto de integração para conectar um serviço real de análise ',
    'de vídeo (pose estimation) já está pronto em src/lib/videoAnalysis.js no backend.',
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Cadastre um atleta primeiro.'])]));
    return;
  }

  const athleteSelect = h('select', {}, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  const strokeSelect = h('select', {}, STROKES.map(([v, l]) => h('option', { value: v }, [l])));
  const dateInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const fileInput = h('input', { type: 'file', accept: 'video/*' });
  const noteInput = h('textarea', { placeholder: 'Observações sobre o vídeo (opcional)' });
  const errorBox = h('div', { class: 'error-msg' });
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, ['Enviar e analisar']);

  const resultWrap = h('div');

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Analisando...';
      try {
        const fd = new FormData();
        fd.append('athleteId', athleteSelect.value);
        fd.append('strokeType', strokeSelect.value);
        fd.append('date', dateInput.value);
        fd.append('note', noteInput.value || '');
        if (fileInput.files[0]) fd.append('video', fileInput.files[0]);
        const analysis = await api.upload('/api/video-analyses', fd);
        renderResult(resultWrap, analysis, strokeSelect.options[strokeSelect.selectedIndex].text);
        fileInput.value = '';
        await loadHistory();
      } catch (err) {
        errorBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar e analisar';
      }
    },
  }, [
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), athleteSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Golpe']), strokeSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data']), dateInput]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Vídeo (opcional neste MVP)']), fileInput]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Notas']), noteInput]),
    ]),
    errorBox,
    h('div', { class: 'form-actions' }, [submitBtn]),
  ]);

  main.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Novo upload']), form]));
  main.appendChild(resultWrap);

  const history = h('div', { class: 'card' }, [h('h3', {}, ['Histórico de análises'])]);
  const historyList = h('div');
  history.appendChild(historyList);
  main.appendChild(history);

  async function loadHistory() {
    const items = await api.get(`/api/video-analyses?athleteId=${athleteSelect.value}`);
    clear(historyList);
    if (!items.length) { historyList.appendChild(h('div', { class: 'empty-state' }, ['Sem análises para este atleta.'])); return; }
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Data']), h('th', {}, ['Golpe']), h('th', {}, ['Tipo de saque']), h('th', {}, ['Técnica']), h('th', {}, ['Potência']), h('th', {}, ['Consistência']), h('th', {}, ['Equilíbrio']), h('th', {}, ['Geral'])])]),
      h('tbody', {}, items.slice().reverse().map((v) => h('tr', {}, [
        h('td', {}, [fmtDate(v.date)]), h('td', {}, [v.stroke_type]),
        h('td', {}, [v.serve_type ? `${SERVE_TYPE_LABEL[v.serve_type] || v.serve_type} (${Math.round(v.serve_confidence * 100)}%)` : '-']),
        h('td', {}, [pill(v.technique_score)]), h('td', {}, [pill(v.power_score)]),
        h('td', {}, [pill(v.consistency_score)]), h('td', {}, [pill(v.balance_score)]),
        h('td', {}, [pill(v.overall_score)]),
      ]))),
    ]);
    historyList.appendChild(table);
  }
  athleteSelect.addEventListener('change', loadHistory);
  await loadHistory();
}

function pill(v) {
  return h('span', { class: `score-pill ${scoreClass(v)}` }, [v ?? '-']);
}

function renderResult(wrap, analysis, strokeLabel) {
  clear(wrap);
  wrap.appendChild(h('div', { class: 'card' }, [
    h('h3', {}, [`Resultado da análise — ${strokeLabel}`]),
    (analysis.serveType || analysis.impactFrameIndex != null) ? h('p', { style: 'margin:-6px 0 10px;display:flex;gap:6px;flex-wrap:wrap' }, [
      analysis.serveType ? h('span', { class: 'badge badge-torneio' }, [
        `Tipo de saque: ${SERVE_TYPE_LABEL[analysis.serveType] || analysis.serveType} (confiança ${Math.round(analysis.serveConfidence * 100)}%)`,
      ]) : null,
      analysis.impactFrameIndex != null ? h('span', { class: 'badge badge-ranking' }, [
        `Impacto: quadro ${analysis.impactFrameIndex} (t=${analysis.impactTimestampMs}ms) · confiança ${Math.round(analysis.impactConfidence * 100)}%`,
      ]) : null,
    ]) : null,
    h('div', { class: 'grid grid-4', style: 'margin:12px 0' }, [
      scoreBlock('Técnica', analysis.techniqueScore),
      scoreBlock('Potência', analysis.powerScore),
      scoreBlock('Consistência', analysis.consistencyScore),
      scoreBlock('Equilíbrio', analysis.balanceScore),
    ]),
    analysis.kneeFlexion != null ? h('div', { style: 'margin-bottom:12px' }, [
      h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 6px' }, ['Ângulos articulares (frame analisado)']),
      h('div', { class: 'grid grid-4' }, [
        angleBlock('Joelho', analysis.kneeFlexion),
        angleBlock('Cotovelo', analysis.elbowFlexion),
        angleBlock('Abdução ombro', analysis.shoulderAbduction),
        angleBlock('Inclinação ombros', analysis.shoulderTilt),
      ]),
    ]) : null,
    h('p', { class: 'video-note' }, [analysis.aiComments]),
  ]));
}
function scoreBlock(label, val) {
  return h('div', {}, [
    h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [label]),
    h('span', { class: `score-pill ${scoreClass(val)}` }, [val]),
  ]);
}
function angleBlock(label, val) {
  return h('div', {}, [
    h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [label]),
    h('span', { class: 'score-pill score-mid' }, [`${val}°`]),
  ]);
}
