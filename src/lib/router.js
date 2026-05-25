const routes = new Map();
let mountEl = null;
let notFound = null;
let beforeEach = null;

export function defineRoute(path, render) {
  routes.set(path, render);
}

export function setNotFound(fn) {
  notFound = fn;
}

export function setBeforeEach(fn) {
  beforeEach = fn;
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function start(el) {
  mountEl = el;
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function rerender() {
  resolve();
}

function currentPath() {
  const h = location.hash || '#/';
  return h.startsWith('#') ? h.slice(1) : h;
}

async function resolve() {
  const path = currentPath() || '/';
  if (beforeEach) {
    const redirected = beforeEach(path);
    if (redirected) return;
  }
  const handler = routes.get(path) || notFound;
  if (!handler) return;
  mountEl.innerHTML = '';
  const node = await handler();
  if (node) mountEl.appendChild(node);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
