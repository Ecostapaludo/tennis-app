import { h, clear, fmtDate, confirmModal } from '../dom.js';
import { api } from '../api.js';

const CRITICALITY_VARIANT = {
  'Crítica': 'critical',
  'Alta': 'critical',
  'Média-Alta': 'warning',
  'Média': 'warning',
  'Baixa': 'low',
};

export async function renderBiomech(main, ctx) {
  const canEdit = ctx.user.role === 'head_coach';
  const models = await api.get('/api/biomech-criteria');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [
      h('h1', {}, ['Base biomecânica']),
      h('p', {}, ['Critérios de referência por golpe — usados para comparar com o vídeo enviado pelo aluno.']),
    ]),
    canEdit ? h('button', { class: 'btn btn-primary', onClick: () => openImportModal(async () => renderBiomech(main, ctx)) }, ['+ Importar critérios (JSON)']) : null,
  ]));

  main.appendChild(h('div', { class: 'notice-banner' }, [
    'Esta base guarda apenas conhecimento técnico (fases do movimento, ângulos e faixas-alvo) digitado ou importado ',
    'por você — nenhum vídeo de terceiros é armazenado aqui.',
  ]));

  if (!models.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, [
      canEdit ? 'Nenhum golpe com critérios cadastrados ainda. Use "+ Importar critérios (JSON)" para começar.' : 'Nenhum golpe com critérios cadastrados ainda.',
    ])]));
    return;
  }

  const grid = h('div', { class: 'grid grid-2' });
  models.forEach((m) => {
    const detailWrap = h('div');
    const card = h('div', { class: 'card' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
        h('div', {}, [
          h('h3', {}, [m.strokeLabel]),
          h('p', {}, [`v${m.modelVersion} · ${m.markerCount} marcadores · atualizado em ${fmtDate(m.updatedAt)}`]),
        ]),
        canEdit ? h('button', {
          class: 'btn btn-sm btn-danger', type: 'button',
          onClick: () => confirmModal(`Excluir os critérios de ${m.strokeLabel}?`, async () => {
            await api.del(`/api/biomech-criteria/${m.strokeType}`);
            renderBiomech(main, ctx);
          }),
        }, ['Excluir']) : null,
      ]),
      h('button', {
        class: 'btn btn-sm', type: 'button',
        onClick: async () => {
          if (detailWrap.childNodes.length) { clear(detailWrap); return; }
          const detail = await api.get(`/api/biomech-criteria/${m.strokeType}`);
          detailWrap.appendChild(buildDetail(detail));
        },
      }, ['Ver fases e marcadores']),
      detailWrap,
    ]);
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

function buildDetail(detail) {
  const wrap = h('div', { style: 'margin-top:12px' });
  detail.phases.forEach((phase) => {
    wrap.appendChild(h('div', { style: 'margin-top:14px' }, [
      h('h4', { style: 'margin-bottom:2px' }, [`${phase.phaseOrder}. ${phase.phaseName}`]),
      phase.timeframe ? h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 8px' }, [phase.timeframe]) : null,
      ...phase.markers.map((marker) => h('div', { class: 'card', style: 'background:var(--surface-2);margin-bottom:8px;padding:12px' }, [
        h('div', { class: 'page-header', style: 'margin-bottom:4px' }, [
          h('strong', { style: 'font-size:13.5px' }, [marker.name]),
          marker.criticality ? h('span', { class: `badge badge-${CRITICALITY_VARIANT[marker.criticality] || 'neutral'}` }, [marker.criticality]) : null,
        ]),
        marker.description ? h('p', { style: 'font-size:13px;margin:0 0 4px' }, [marker.description]) : null,
        marker.targetRange ? h('p', { style: 'font-size:13px;margin:0 0 4px' }, [h('strong', {}, ['Alvo: ']), marker.targetRange]) : null,
        marker.faultIndicator ? h('p', { style: 'font-size:13px;margin:0;color:var(--status-critical)' }, [h('strong', {}, ['Indicador de erro: ']), marker.faultIndicator]) : null,
      ])),
    ]));
  });
  return wrap;
}

function openImportModal(onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const json = h('textarea', {
    placeholder: '{\n  "stroke_type": "forehand",\n  "biomechanical_model_version": "1.0",\n  "phases": [ ... ]\n}',
    style: 'min-height:320px;font-family:monospace;font-size:12.5px',
  });
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      let parsed;
      try {
        parsed = JSON.parse(json.value);
      } catch {
        errorBox.textContent = 'JSON inválido — confira a formatação e tente novamente.';
        return;
      }
      try {
        await api.post('/api/biomech-criteria/import', parsed);
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, ['Importar critérios biomecânicos']),
    h('p', { style: 'font-size:13px;color:var(--text-secondary)' }, [
      'Cole o JSON com "stroke_type", "biomechanical_model_version" e "phases" (cada fase com "markers"). ',
      'Importar de novo para o mesmo golpe substitui os critérios anteriores dele.',
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px' }, [json]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Importar']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box', style: 'width:640px' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}
