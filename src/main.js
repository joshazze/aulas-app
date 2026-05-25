import './styles.css';
import { defineRoute, setNotFound, setBeforeEach, start, navigate } from './lib/router.js';
import { isAuthed, subscribe, autoCompletePastLessons } from './lib/state.js';
import { h } from './components/ui.js';
import { topBar, bottomNav } from './components/nav.js';
import { renderAuth } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderStudents } from './views/students.js';
import { renderSchedule } from './views/schedule.js';
import { renderPayments } from './views/payments.js';
import { renderStats } from './views/stats.js';

const app = document.getElementById('app');

function shell(view) {
  return h('div', { class: 'shell' },
    topBar(),
    h('main', { class: 'content' }, view),
    bottomNav(),
  );
}

defineRoute('/auth', () => renderAuth());
defineRoute('/', async () => shell(await renderDashboard()));
defineRoute('/alunos', async () => shell(await renderStudents()));
defineRoute('/agenda', async () => shell(await renderSchedule()));
defineRoute('/pagamentos', async () => shell(await renderPayments()));
defineRoute('/stats', async () => shell(await renderStats()));

setNotFound(async () => shell(h('div', { class: 'empty' },
  h('strong', null, 'Rota não encontrada'),
  h('a', { href: '#/' }, 'Voltar pro início'),
)));

setBeforeEach(async (path) => {
  if (!isAuthed() && path !== '/auth') {
    navigate('/auth');
    return true;
  }
  if (isAuthed() && path === '/auth') {
    navigate('/');
    return true;
  }
  if (isAuthed()) {
    await autoCompletePastLessons();
  }
  return false;
});

subscribe(() => {
  // re-render on session change (login/logout)
});

start(app);

// PWA: register service worker only in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
