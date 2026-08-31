import { h, clear, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { FOCUS_OPTS, TECHNICAL_SUBCATEGORY_OPTS } from '../focus.js';
import { KIDS_STAGE_OPTS, KIDS_STAGE_LABEL } from '../kidsStages.js';
import { MODALITY_OPTS, MODALITY_LABEL } from '../modality.js';
import { courtDiagramSVG } from '../components/courtDiagram.js';

export async function renderDrills(main, ctx) {
  const canEdit = ctx.user.role === 'head_coach';
  const drills = await api.get('/api/drills');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Biblioteca de drills']), h('p', {}, ['Exercícios reutilizáveis para montar sessões de treino por foco.'])]),
    h('div', { style: 'display:flex;gap:8px' }, [
      canEdit ? h('a', { class: 'btn btn-sm', href: '/api/drills/export', download: 'drills-prompts-imagens.csv' }, ['Exportar prompts p/ imagens (CSV)']) : null,
      canEdit ? h('button', { class: 'btn btn-primary', onClick: () => openDrillModal(null, async () => renderDrills(main, ctx)) }, ['+ Novo drill']) : null,
    ]),
  ]));

  if (!drills.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Nenhum drill cadastrado ainda.'])]));
    return;
  }

  FOCUS_OPTS.forEach((focus) => {
    const list = drills.filter((d) => d.focus_category === focus.value);
    if (!list.length) return;
    main.appendChild(h('h3', { style: 'margin-top:22px' }, [`Foco ${focus.label}`]));

    if (focus.value !== 'technical') {
      main.appendChild(buildDrillGrid(list, canEdit, main, ctx));
      return;
    }

    const subgroups = [
      ...TECHNICAL_SUBCATEGORY_OPTS,
      { value: null, label: 'Outros' },
    ];
    subgroups.forEach((sub) => {
      const subList = list.filter((d) => (d.subcategory || null) === sub.value);
      if (!subList.length) return;
      main.appendChild(h('h4', { style: 'margin-top:14px;color:var(--text-secondary)' }, [sub.label]));
      main.appendChild(buildDrillGrid(subList, canEdit, main, ctx));
    });
  });
}

function buildDrillGrid(list, canEdit, main, ctx) {
  const grid = h('div', { class: 'grid grid-3' });
  list.forEach((d) => {
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'drill-card-top' }, [
        h('div', { class: 'drill-diagram-thumb', title: d.court_zone || '', html: courtDiagramSVG(d) }),
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { class: 'page-header', style: 'margin-bottom:8px' }, [
            h('div', {}, [
              h('h3', {}, [d.name]),
              h('p', {}, [d.duration_minutes ? `${d.duration_minutes} min` : 'Duração não informada']),
              d.kids_stage ? h('span', { class: 'badge badge-neutral' }, [KIDS_STAGE_LABEL[d.kids_stage] || d.kids_stage]) : null,
              d.modality === 'beach_tennis' ? h('span', { class: 'badge badge-neutral' }, [MODALITY_LABEL[d.modality]]) : null,
            ]),
            canEdit ? h('div', {}, [
              h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openDrillModal(d, async () => renderDrills(main, ctx)) }, ['Editar']),
              h('button', {
                class: 'btn btn-sm btn-danger', style: 'margin-left:6px', type: 'button',
                onClick: () => confirmModal('Excluir drill?', async () => { await api.del(`/api/drills/${d.id}`); renderDrills(main, ctx); }),
              }, ['Excluir']),
            ]) : null,
          ]),
        ]),
      ]),
      d.description ? h('p', { style: 'white-space:pre-wrap' }, [d.description]) : null,
      d.equipment ? h('p', {}, [h('strong', {}, ['Material: ']), d.equipment]) : null,
    ]));
  });
  return grid;
}

function openDrillModal(drill, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Ex: Cross-court consistência', value: drill ? drill.name : '' });
  const focusCategory = h('select', {}, FOCUS_OPTS.map((f) => h('option', { value: f.value }, [f.label])));
  if (drill) focusCategory.value = drill.focus_category;
  const subcategory = h('select', {}, [
    h('option', { value: '' }, ['Nenhuma']),
    ...TECHNICAL_SUBCATEGORY_OPTS.map((s) => h('option', { value: s.value }, [s.label])),
  ]);
  if (drill && drill.subcategory) subcategory.value = drill.subcategory;
  const subcategoryField = h('div', { class: 'form-field' }, [h('label', {}, ['Subdivisão (golpe)']), subcategory]);
  subcategoryField.style.display = focusCategory.value === 'technical' ? '' : 'none';
  focusCategory.addEventListener('change', () => {
    subcategoryField.style.display = focusCategory.value === 'technical' ? '' : 'none';
    if (focusCategory.value !== 'technical') subcategory.value = '';
  });
  const duration = h('input', { type: 'number', min: '1', placeholder: 'Duração (min)' });
  if (drill && drill.duration_minutes) duration.value = drill.duration_minutes;
  const equipment = h('input', { placeholder: 'Material necessário' });
  if (drill && drill.equipment) equipment.value = drill.equipment;
  const description = h('textarea', { placeholder: 'Como executar o drill' });
  if (drill && drill.description) description.value = drill.description;
  const kidsStage = h('select', {}, [
    h('option', { value: '' }, ['Nenhum (drill regular)']),
    ...KIDS_STAGE_OPTS.map((s) => h('option', { value: s.value }, [s.label])),
  ]);
  if (drill && drill.kids_stage) kidsStage.value = drill.kids_stage;
  const modality = h('select', {}, MODALITY_OPTS.map((m) => h('option', { value: m.value, selected: (drill?.modality || 'tenis') === m.value }, [m.label])));
  const courtZone = h('input', { placeholder: 'Ex: Fundo de Quadra, Meia-Quadra, Rede...' });
  if (drill && drill.court_zone) courtZone.value = drill.court_zone;
  const courtZonePreview = h('div', { class: 'drill-diagram-thumb', style: 'width:56px;height:112px;margin-top:6px' });
  function refreshCourtZonePreview() {
    courtZonePreview.innerHTML = courtDiagramSVG({ name: name.value, court_zone: courtZone.value, description: description.value });
  }
  refreshCourtZonePreview();
  courtZone.addEventListener('input', refreshCourtZonePreview);
  name.addEventListener('input', refreshCourtZonePreview);
  description.addEventListener('input', refreshCourtZonePreview);
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        const payload = {
          name: name.value, focusCategory: focusCategory.value,
          subcategory: focusCategory.value === 'technical' ? (subcategory.value || null) : null,
          durationMinutes: duration.value ? Number(duration.value) : null,
          equipment: equipment.value || null, description: description.value || null,
          courtZone: courtZone.value || null, kidsStage: kidsStage.value || null, modality: modality.value,
        };
        if (drill) await api.put(`/api/drills/${drill.id}`, payload);
        else await api.post('/api/drills', payload);
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, [drill ? 'Editar drill' : 'Novo drill']),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome do drill']), name]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Foco']), focusCategory]),
      subcategoryField,
      h('div', { class: 'form-field' }, [h('label', {}, ['Duração (min)']), duration]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Material necessário']), equipment]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Descrição / como executar']), description]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Zona da quadra (para o diagrama)']), courtZone, courtZonePreview]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Estágio (mini-tênis)']), kidsStage]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Modalidade']), modality]),
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
