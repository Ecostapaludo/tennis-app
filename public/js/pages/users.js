import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';
import { MODALITY_OPTS, MODALITY_LABEL } from '../modality.js';

const ROLE_LABEL = { head_coach: 'Head Coach', treinador: 'Treinador', responsavel: 'Responsável' };

export async function renderUsers(main, ctx) {
  if (ctx.user.role !== 'head_coach') {
    clear(main);
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Apenas o head coach pode gerenciar usuários.'])]));
    return;
  }

  const [users, athletes] = await Promise.all([api.get('/api/users'), api.get('/api/athletes')]);
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Usuários e permissões']), h('p', {}, ['Contas de treinadores e responsáveis/alunos com acesso ao app.'])]),
    h('button', { class: 'btn btn-primary', onClick: () => openUserModal(athletes, () => renderUsers(main, ctx)) }, ['+ Novo usuário']),
  ]));

  main.appendChild(h('div', { class: 'notice-banner' }, [
    h('strong', {}, ['Permissões: ']),
    'Head coach tem acesso total. Treinador monta planos de aula (turmas, atletas e drills) só dentro da própria modalidade e só depois que o foco da semana está definido. ',
    'Responsável/aluno só visualiza jogos e avaliações do(s) atleta(s) vinculado(s) a ele.',
  ]));

  const table = h('table', {}, [
    h('thead', {}, [h('tr', {}, [h('th', {}, ['Nome']), h('th', {}, ['Email']), h('th', {}, ['Papel']), h('th', {}, ['Modalidade']), h('th', {}, ['Atletas vinculados']), h('th', {}, ['Status']), h('th', {}, [''])])]),
    h('tbody', {}, users.map((u) => h('tr', {}, [
      h('td', {}, [u.name]),
      h('td', {}, [u.email]),
      h('td', {}, [h('span', { class: 'badge badge-neutral' }, [ROLE_LABEL[u.role] || u.role])]),
      h('td', {}, [u.role === 'treinador' ? (MODALITY_LABEL[u.modality] || u.modality) : '-']),
      h('td', {}, [u.athletes.length ? u.athletes.map((a) => a.athleteName).join(', ') : '-']),
      h('td', {}, [u.active ? h('span', { class: 'badge badge-win' }, ['ativo']) : h('span', { class: 'badge badge-loss' }, ['inativo'])]),
      h('td', { style: 'display:flex;gap:6px' }, [
        h('button', {
          class: 'btn btn-sm', onClick: () => openEditUserModal(u, () => renderUsers(main, ctx)),
        }, ['Editar']),
        u.role === 'head_coach' ? null : h('button', {
          class: 'btn btn-sm', onClick: async () => { await api.patch(`/api/users/${u.id}`, { active: !u.active }); renderUsers(main, ctx); },
        }, [u.active ? 'Desativar' : 'Ativar']),
      ]),
    ]))),
  ]);
  main.appendChild(h('div', { class: 'card' }, [table]));
}

function openUserModal(athletes, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Nome completo' });
  const email = h('input', { type: 'email', required: true, placeholder: 'email@exemplo.com' });
  const password = h('input', { type: 'password', required: true, placeholder: 'Senha provisória' });
  const role = h('select', { required: true }, [
    h('option', { value: 'treinador' }, ['Treinador (monta planos de treino quando o foco da semana já está definido)']),
    h('option', { value: 'responsavel' }, ['Responsável/aluno (visualiza jogos e avaliações)']),
  ]);
  const relationship = h('input', { placeholder: 'Ex: mãe, pai, o próprio atleta' });
  const modality = h('select', {}, MODALITY_OPTS.map((m) => h('option', { value: m.value }, [m.label])));
  const errorBox = h('div', { class: 'error-msg' });

  const modalityField = h('div', { class: 'form-field span-2' }, [
    h('label', {}, ['Modalidade (apenas para Treinador)']), modality,
    h('p', { style: 'font-size:11.5px;color:var(--text-muted);margin-top:4px' }, [
      'O treinador só vai conseguir montar planos de aula com turmas/atletas/drills dessa modalidade.',
    ]),
  ]);

  const checkedIds = new Set();
  const athleteField = h('div', { class: 'form-field', style: 'margin-top:10px' }, [
    h('label', {}, ['Atleta(s) vinculado(s) (apenas para Responsável)']),
    h('div', { class: 'tag-list' }, athletes.map((a) => {
      const cb = h('input', { type: 'checkbox', onChange: (e) => { if (e.target.checked) checkedIds.add(a.id); else checkedIds.delete(a.id); label.classList.toggle('checked', e.target.checked); } });
      const label = h('label', { class: 'tag-checkbox' }, [cb, a.name]);
      return label;
    })),
    relationship,
  ]);

  function toggleAthleteField() {
    athleteField.style.display = role.value === 'responsavel' ? '' : 'none';
    modalityField.style.display = role.value === 'treinador' ? '' : 'none';
  }
  role.addEventListener('change', toggleAthleteField);

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/users', {
          name: name.value, email: email.value, password: password.value, role: role.value,
          modality: modality.value, athleteIds: Array.from(checkedIds), relationship: relationship.value || null,
        });
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, ['Novo usuário']),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome']), name]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Email']), email]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Senha provisória']), password]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Papel']), role]),
      modalityField,
    ]),
    athleteField,
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Criar usuário']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  toggleAthleteField();
}

// Edita um usuario ja existente (nome, email, senha opcional) -- inclusive o
// head coach, que so nao tem o botao de ativar/desativar (pra nao correr o
// risco de desativar a propria conta e ficar sem acesso).
function openEditUserModal(user, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Nome completo', value: user.name });
  const email = h('input', { type: 'email', required: true, placeholder: 'email@exemplo.com', value: user.email });
  const password = h('input', { type: 'password', placeholder: 'Deixe em branco para manter a senha atual' });
  const modality = h('select', {}, MODALITY_OPTS.map((m) => h('option', { value: m.value, selected: user.modality === m.value }, [m.label])));
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.patch(`/api/users/${user.id}`, {
          name: name.value, email: email.value, password: password.value || undefined,
          modality: user.role === 'treinador' ? modality.value : undefined,
        });
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, [`Editar usuário — ${ROLE_LABEL[user.role] || user.role}`]),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome']), name]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Email']), email]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nova senha (opcional)']), password]),
      user.role === 'treinador' ? h('div', { class: 'form-field span-2' }, [h('label', {}, ['Modalidade']), modality]) : null,
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
