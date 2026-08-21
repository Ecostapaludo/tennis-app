import { h } from '../dom.js';

const NAV_ITEMS = [
  { route: 'dashboard', label: 'Painel', icon: '🎾', roles: ['head_coach', 'treinador', 'responsavel'] },
  { route: 'athletes', label: 'Atletas', icon: '🎾', roles: ['head_coach', 'treinador'] },
  { route: 'turmas', label: 'Turmas', icon: '🎾', roles: ['head_coach'] },
  { route: 'training', label: 'Planejamento de treinos', icon: '🎾', roles: ['head_coach', 'treinador'] },
  { route: 'attendance', label: 'Confirmação de presença', icon: '🎾', roles: ['head_coach', 'treinador', 'responsavel'] },
  { route: 'drills', label: 'Biblioteca de drills', icon: '🎾', roles: ['head_coach'] },
  { route: 'evaluations', label: 'Avaliações', icon: '🎾', roles: ['head_coach', 'responsavel'] },
  { route: 'matches', label: 'Scout de jogos', icon: '🎾', roles: ['head_coach', 'responsavel'] },
  { route: 'video', label: 'Análise de vídeo', icon: '🎾', roles: ['head_coach'] },
  { route: 'reports', label: 'Relatórios', icon: '🎾', roles: ['head_coach'] },
  { route: 'training-plan', label: 'Plano de treino IA', icon: '🎾', roles: ['head_coach'] },
  { route: 'users', label: 'Usuários', icon: '🎾', roles: ['head_coach'] },
];

const ROLE_LABEL = {
  head_coach: 'Head Coach',
  treinador: 'Treinador',
  responsavel: 'Responsável',
};

export function renderSidebar(user, currentRoute, onLogout) {
  const links = NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map((item) =>
    h('a', {
      class: `nav-link${currentRoute === item.route ? ' active' : ''}`,
      href: `#/${item.route}`,
    }, [`${item.icon}  ${item.label}`])
  );

  return h('nav', { class: 'sidebar' }, [
    h('div', { class: 'brand' }, ['🎾 ', h('span', {}, ['CoachPro'])]),
    ...links,
    h('div', { class: 'sidebar-footer' }, [
      h('div', {}, [user.name]),
      h('span', { class: 'role-badge' }, [ROLE_LABEL[user.role] || user.role]),
      h('br'),
      h('span', { class: 'logout-link', onClick: onLogout }, ['Sair']),
    ]),
  ]);
}
