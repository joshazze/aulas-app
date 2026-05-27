import { h, icon } from './ui.js';

const tabs = [
  { path: '/', label: 'Hoje', icon: 'home' },
  { path: '/agenda', label: 'Agenda', icon: 'calendar' },
  { path: '/historico', label: 'Histórico', icon: 'history' },
  { path: '/alunos', label: 'Alunos', icon: 'users' },
  { path: '/pagamentos', label: 'Pagar', icon: 'money' },
  { path: '/stats', label: 'Stats', icon: 'stats' },
];

const titles = {
  '/': 'Próximas aulas',
  '/agenda': 'Agenda',
  '/historico': 'Histórico',
  '/alunos': 'Alunos',
  '/pagamentos': 'Pagamentos',
  '/stats': 'Estatísticas',
};

export function topBar() {
  const path = (location.hash || '#/').slice(1) || '/';
  return h('header', { class: 'topbar' },
    h('div', { class: 'title' }, titles[path] || 'Aulas'),
  );
}

export function bottomNav() {
  const path = (location.hash || '#/').slice(1) || '/';
  const nav = h('nav', { class: 'bottomnav' });
  for (const t of tabs) {
    const a = h('a', {
      href: '#' + t.path,
      class: path === t.path ? 'active' : '',
    }, icon(t.icon), h('span', null, t.label));
    nav.appendChild(a);
  }
  return nav;
}
