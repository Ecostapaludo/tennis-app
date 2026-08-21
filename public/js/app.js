import { api } from './api.js';
import { h, clear } from './dom.js';
import { renderSidebar } from './components/nav.js';

import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderAthletes, renderAthleteDetail } from './pages/athletes.js';
import { renderGroups } from './pages/groups.js';
import { renderTraining } from './pages/training.js';
import { renderAttendance } from './pages/attendance.js';
import { renderDrills } from './pages/drills.js';
import { renderEvaluations } from './pages/evaluations.js';
import { renderMatches } from './pages/matches.js';
import { renderVideo } from './pages/video.js';
import { renderReports } from './pages/reports.js';
import { renderTrainingPlan } from './pages/trainingPlan.js';
import { renderUsers } from './pages/users.js';

const root = document.getElementById('root');
let currentUser = null;

function parseHash() {
  const raw = (location.hash || '#/dashboard').replace(/^#\//, '');
  const [route, ...params] = raw.split('/').filter(Boolean);
  return { route: route || 'dashboard', params };
}

async function logout() {
  await api.post('/api/auth/logout');
  currentUser = null;
  location.hash = '#/login';
  await boot();
}

async function boot() {
  const { route, params } = parseHash();

  if (route === 'login') {
    if (currentUser) { location.hash = '#/dashboard'; return; }
    clear(root);
    root.appendChild(renderLogin(async () => { await boot(); }));
    return;
  }

  if (!currentUser) {
    try {
      currentUser = await api.get('/api/auth/me');
    } catch {
      location.hash = '#/login';
      clear(root);
      root.appendChild(renderLogin(async () => { await boot(); }));
      return;
    }
  }

  renderShell(route, params);
}

const PAGES = {
  dashboard: { title: 'Painel', render: renderDashboard },
  athletes: { title: 'Atletas', render: (main, ctx) => (ctx.params[0] ? renderAthleteDetail(main, ctx) : renderAthletes(main, ctx)) },
  turmas: { title: 'Turmas', render: renderGroups },
  training: { title: 'Planejamento de treinos', render: renderTraining },
  attendance: { title: 'Confirmação de presença', render: renderAttendance },
  drills: { title: 'Biblioteca de drills', render: renderDrills },
  evaluations: { title: 'Avaliações de desempenho', render: renderEvaluations },
  matches: { title: 'Scout de jogos', render: renderMatches },
  video: { title: 'Análise de vídeo', render: renderVideo },
  reports: { title: 'Relatórios e evolução', render: renderReports },
  'training-plan': { title: 'Plano de treino com IA', render: renderTrainingPlan },
  users: { title: 'Usuários e permissões', render: renderUsers },
};

function renderShell(route, params) {
  clear(root);
  const page = PAGES[route] || PAGES.dashboard;

  const shell = h('div', { class: 'app-shell' });
  shell.appendChild(renderSidebar(currentUser, route, logout));
  const main = h('main', { class: 'content' });
  shell.appendChild(main);
  root.appendChild(shell);

  const ctx = { user: currentUser, params, navigate: (r) => { location.hash = `#/${r}`; } };
  main.appendChild(h('div', { class: 'loading' }, ['Carregando...']));
  Promise.resolve(page.render(main, ctx)).catch((err) => {
    clear(main);
    main.appendChild(h('div', { class: 'card' }, [
      h('h2', {}, ['Não foi possível carregar esta página']),
      h('p', {}, [err.message || 'Erro desconhecido.']),
    ]));
  });
}

window.addEventListener('hashchange', boot);
boot();
