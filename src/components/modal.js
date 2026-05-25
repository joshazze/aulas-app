import { h } from './ui.js';

export function openModal({ title, body, actions }) {
  return new Promise((resolve) => {
    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);

    const actionBtns = (actions || []).map((a) =>
      h('button', {
        class: `btn ${a.variant || ''}`,
        type: a.type || 'button',
        onClick: async (e) => {
          if (a.onClick) {
            const r = await a.onClick(e, close);
            if (r === false) return;
          }
          if (a.close !== false) close(a.value ?? null);
        },
      }, a.label),
    );

    const modal = h('div', { class: 'modal' },
      h('h3', null, title),
      body,
      actionBtns.length ? h('div', { class: 'modal-actions' }, ...actionBtns) : null,
    );

    const backdrop = h('div', {
      class: 'modal-backdrop',
      onClick: (e) => { if (e.target === backdrop) close(null); },
    }, modal);

    document.body.appendChild(backdrop);
    const first = modal.querySelector('input, select, textarea, button');
    if (first) first.focus();
  });
}

export async function confirm(message, { confirmLabel = 'Confirmar', variant = 'btn-danger' } = {}) {
  return openModal({
    title: 'Confirmar',
    body: h('p', { class: 'muted', style: { margin: '0 0 4px' } }, message),
    actions: [
      { label: 'Cancelar', variant: 'btn-ghost', value: false },
      { label: confirmLabel, variant, value: true },
    ],
  });
}
