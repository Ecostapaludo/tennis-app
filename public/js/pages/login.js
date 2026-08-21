import { h } from '../dom.js';
import { api } from '../api.js';

export function renderLogin(onSuccess) {
  const errorBox = h('div', { class: 'error-msg' });

  const emailInput = h('input', { type: 'email', required: true, placeholder: 'seu@email.com' });
  const passInput = h('input', { type: 'password', required: true, placeholder: '••••••••' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      try {
        await api.post('/api/auth/login', { email: emailInput.value, password: passInput.value });
        location.hash = '#/dashboard';
        onSuccess();
      } catch (err) {
        errorBox.textContent = err.message || 'Falha no login.';
      }
    },
  }, [
    h('div', { class: 'form-field' }, [h('label', {}, ['Email']), emailInput]),
    h('div', { class: 'form-field', style: 'margin-top:12px' }, [h('label', {}, ['Senha']), passInput]),
    h('button', { class: 'btn btn-primary', type: 'submit', style: 'margin-top:18px;width:100%;justify-content:center' }, ['Entrar']),
    errorBox,
  ]);

  return h('div', { class: 'login-shell' }, [
    h('div', { class: 'login-card' }, [
      h('h1', {}, ['🎾 ', h('span', { class: 'brand-mark' }, ['CoachPro'])]),
      h('p', {}, ['App do head coach: treinos, avaliações, scout de jogos e IA.']),
      form,
      h('div', { class: 'hint-box' }, [
        h('strong', {}, ['Contas de demonstração (seed):']), h('br'),
        'Head coach: coach@demo.com / coach123', h('br'),
        'Treinador: treinador@demo.com / treinador123', h('br'),
        'Responsável: responsavel@demo.com / responsavel123',
      ]),
    ]),
  ]);
}
