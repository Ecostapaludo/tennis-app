import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';

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
    'Head coach tem acesso total. Treinador só visualiza o planejamento de treinos (planos de aula). ',
    'Responsável/aluno só visualiza jogos e avaliações do(s) atleta(s) vinculado(s) a ele.',
  ]));

  const table = h('table', {}, [
    h('thead', {}, [h('tr', {}, [h('th', {}, ['Nome']), h('th', {}, ['Email']), h('th', {}, ['Papel']), h('th', {}, ['Atletas vinculados']), h('th', {}, ['Status']), h('th', {}, [''])])]),
    h('tbody', {}, users.map((u) => h('tr', {}, [
      h('td', {}, [u.name]),
      h('td', {}, [u.email]),
      h('td', {}, [h('span', { class: 'badge badge-neutral' }, [ROLE_LABEL[u.role] || u.role])]),
      h('td', {}, [u.athletes.length ? u.athletes.map((a) => a.athleteName).join(', ') : '-']),
      h('td', {}, [u.active ? h('span', { class: 'badge badge-win' }, ['ativo']) : h('span', { class: 'badge badge-loss' }, ['inativo'])]),
      h('td', {}, [
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
  const errorBox = h('div', { class: 'error-msg' });

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
  }
  role.addEventListener('change', toggleAthleteField);

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/users', {
          name: name.value, email: email.value, password: password.value, role: role.value,
          athleteIds: Array.from(checkedIds), relationship: relationship.value || null,
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
