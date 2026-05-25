import { h, errorBox } from '../components/ui.js';
import { migrateLegacy, wipeAll } from '../lib/storage.js';
import { setSession } from '../lib/state.js';
import { navigate } from '../lib/router.js';

export function renderMigrate() {
  const wrap = h('div', { class: 'auth-wrap' });
  const errorSlot = h('div');
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Desbloquear');

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorSlot.innerHTML = '';
      const password = form.querySelector('[name=password]').value;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processando...';
      try {
        const session = await migrateLegacy(password);
        await setSession(session);
        navigate('/');
      } catch (err) {
        errorSlot.appendChild(errorBox(err.message));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Desbloquear';
      }
    },
  });

  form.appendChild(h('div', { class: 'field' },
    h('label', null, 'Senha antiga'),
    h('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password', minLength: 4 }),
    h('div', { class: 'hint' }, 'Última vez — vamos decifrar seus dados e guardar em texto puro. Depois disso o app não pede mais senha.'),
  ));
  form.appendChild(errorSlot);
  form.appendChild(submitBtn);

  form.appendChild(h('div', { style: { textAlign: 'center', marginTop: '14px' } },
    h('button', {
      type: 'button',
      class: 'btn-ghost btn btn-sm',
      onClick: () => {
        if (window.confirm('Apagar todos os dados deste dispositivo e começar do zero? Sem volta.')) {
          wipeAll();
          location.reload();
        }
      },
    }, 'Esqueci a senha — apagar tudo'),
  ));

  wrap.appendChild(h('div', { class: 'auth-card' },
    h('h1', null, 'Migração'),
    h('p', { class: 'sub' }, 'Versão nova do app dispensa senha. Confirme uma última vez pra liberar seus dados.'),
    form,
  ));
  return wrap;
}
