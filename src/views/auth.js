import { h } from '../components/ui.js';
import { errorBox } from '../components/ui.js';
import { hasAccount, register, login, wipeAll } from '../lib/storage.js';
import { setSession } from '../lib/state.js';
import { navigate } from '../lib/router.js';

export function renderAuth() {
  const isRegister = !hasAccount();
  const wrap = h('div', { class: 'auth-wrap' });
  const errorSlot = h('div');
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, isRegister ? 'Criar conta' : 'Entrar');

  const onSubmit = async (e) => {
    e.preventDefault();
    errorSlot.innerHTML = '';
    const username = form.querySelector('[name=username]')?.value || '';
    const password = form.querySelector('[name=password]').value;
    const confirm = form.querySelector('[name=confirm]')?.value;
    if (isRegister && password !== confirm) {
      errorSlot.appendChild(errorBox('Senhas não conferem.'));
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando...';
    try {
      const session = isRegister
        ? await register(username, password)
        : await login(password);
      await setSession(session);
      navigate('/');
    } catch (err) {
      errorSlot.appendChild(errorBox(err.message));
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? 'Criar conta' : 'Entrar';
    }
  };

  const form = h('form', { onSubmit });

  if (isRegister) {
    form.appendChild(h('div', { class: 'field' },
      h('label', null, 'Usuário'),
      h('input', { type: 'text', name: 'username', required: true, autocomplete: 'username', placeholder: 'seu nome' }),
    ));
  }
  form.appendChild(h('div', { class: 'field' },
    h('label', null, 'Senha'),
    h('input', { type: 'password', name: 'password', required: true, autocomplete: isRegister ? 'new-password' : 'current-password', minLength: 4 }),
    isRegister ? h('div', { class: 'hint' }, 'Mínimo 4 caracteres. Deriva a chave AES-GCM que cifra seus dados — não tem reset.') : null,
  ));
  if (isRegister) {
    form.appendChild(h('div', { class: 'field' },
      h('label', null, 'Confirmar senha'),
      h('input', { type: 'password', name: 'confirm', required: true, autocomplete: 'new-password', minLength: 4 }),
    ));
  }
  form.appendChild(errorSlot);
  form.appendChild(submitBtn);

  if (!isRegister) {
    form.appendChild(h('div', { style: { textAlign: 'center', marginTop: '14px' } },
      h('button', {
        type: 'button',
        class: 'btn-ghost btn btn-sm',
        onClick: () => {
          if (window.confirm('Apagar a conta e todos os dados deste dispositivo? Sem volta.')) {
            wipeAll();
            location.reload();
          }
        },
      }, 'Esqueci a senha — recomeçar do zero'),
    ));
  }

  wrap.appendChild(h('div', { class: 'auth-card' },
    h('h1', null, isRegister ? 'Aulas' : 'Bem-vindo de volta'),
    h('p', { class: 'sub' }, isRegister
      ? 'Crie sua conta local. Tudo fica cifrado no seu dispositivo.'
      : 'Insira sua senha para abrir os dados cifrados.'),
    form,
  ));
  return wrap;
}
