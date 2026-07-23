import './styles.css';
import { defineRoute, setNotFound, setBeforeEach, start, navigate } from './lib/router.js';
import { setSession, autoCompletePastLessons, hasData } from './lib/state.js';
import { loadOrInit, legacyEncryptedDataExists } from './lib/storage.js';
import { h } from './components/ui.js';
import { topBar, bottomNav } from './components/nav.js';
import { renderMigrate } from './views/migrate.js';
import { renderDashboard } from './views/dashboard.js';
import { renderStudents } from './views/students.js';
import { renderSchedule } from './views/schedule.js';
import { renderHistory } from './views/history.js';
import { renderPayments } from './views/payments.js';
import { renderStats } from './views/stats.js';
import { exitSelection } from './lib/selection.js';

const app = document.getElementById('app');

function shell(view) {
  return h('div', { class: 'shell' },
    topBar(),
    h('main', { class: 'content' }, view),
    bottomNav(),
  );
}

defineRoute('/migrate', () => renderMigrate());
defineRoute('/', async () => shell(await renderDashboard()));
defineRoute('/alunos', async () => shell(await renderStudents()));
defineRoute('/agenda', async () => shell(await renderSchedule()));
defineRoute('/historico', async () => shell(await renderHistory()));
defineRoute('/pagamentos', async () => shell(await renderPayments()));
defineRoute('/stats', async () => shell(await renderStats()));

setNotFound(async () => shell(h('div', { class: 'empty' },
  h('strong', null, 'Rota não encontrada'),
  h('a', { href: '#/' }, 'Voltar pro início'),
)));

let lastPath = null;
setBeforeEach(async (path) => {
  // Modo seleção é por tela; trocar de aba não pode levar a seleção junto.
  if (lastPath !== null && path !== lastPath) exitSelection();
  lastPath = path;
  if (legacyEncryptedDataExists()) {
    if (path !== '/migrate') {
      navigate('/migrate');
      return true;
    }
    return false;
  }
  if (path === '/migrate') {
    navigate('/');
    return true;
  }
  if (!hasData()) {
    await setSession(loadOrInit());
  } else {
    await autoCompletePastLessons();
  }
  return false;
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
