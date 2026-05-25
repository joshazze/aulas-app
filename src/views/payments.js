import { h, icon, emptyState } from '../components/ui.js';
import { openModal, confirm } from '../components/modal.js';
import { getState, addPayment, deletePayment } from '../lib/state.js';
import { fmtMoney, fmtDateLong } from '../lib/format.js';
import { rerender } from '../lib/router.js';

function lessonsValueByStudent(data) {
  const map = new Map();
  for (const l of data.lessons) {
    if (l.status !== 'completed') continue;
    const s = data.students.find(s => s.id === l.studentId);
    if (!s) continue;
    const v = (l.durationMinutes / 60) * s.hourlyRate;
    map.set(l.studentId, (map.get(l.studentId) || 0) + v);
  }
  return map;
}

function paymentsByStudent(data) {
  const map = new Map();
  for (const p of data.payments) {
    map.set(p.studentId, (map.get(p.studentId) || 0) + p.amount);
  }
  return map;
}

async function paymentDialog() {
  const { data } = getState();
  const students = data.students.filter(s => !s.archived);
  if (students.length === 0) {
    await openModal({
      title: 'Sem alunos',
      body: h('p', null, 'Cadastre um aluno antes de registrar um pagamento.'),
      actions: [{ label: 'OK', variant: 'btn-primary', value: null }],
    });
    return null;
  }

  const earned = lessonsValueByStudent(data);
  const paid = paymentsByStudent(data);

  const form = h('form');
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const balanceHint = h('div', { class: 'hint' }, '');
  const select = h('select', { name: 'studentId', required: true,
    onChange: (e) => {
      const id = e.target.value;
      const owed = (earned.get(id) || 0) - (paid.get(id) || 0);
      balanceHint.textContent = owed > 0 ? `Deve: ${fmtMoney(owed)}` : owed < 0 ? `Adiantado: ${fmtMoney(-owed)}` : 'Em dia';
    },
  },
    ...students.map(s => h('option', { value: s.id }, s.name)),
  );

  form.append(
    h('div', { class: 'field' },
      h('label', null, 'Aluno'),
      select,
      balanceHint,
    ),
    h('div', { class: 'field' },
      h('label', null, 'Valor (R$)'),
      h('input', { name: 'amount', type: 'number', step: '0.01', min: '0.01', required: true }),
    ),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' },
        h('label', null, 'Data'),
        h('input', { name: 'date', type: 'date', required: true, value: todayLocal }),
      ),
      h('div', { class: 'field' },
        h('label', null, 'Método'),
        h('select', { name: 'method' },
          h('option', { value: 'pix' }, 'PIX'),
          h('option', { value: 'cash' }, 'Dinheiro'),
          h('option', { value: 'other' }, 'Outro'),
        ),
      ),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Notas'),
      h('input', { name: 'notes', type: 'text' }),
    ),
  );
  // trigger initial hint
  select.dispatchEvent(new Event('change'));

  return openModal({
    title: 'Registrar pagamento',
    body: form,
    actions: [
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Salvar', variant: 'btn-primary', onClick: async (_, close) => {
        if (!form.reportValidity()) return false;
        close({
          studentId: form.studentId.value,
          amount: form.amount.value,
          dateISO: new Date(form.date.value + 'T12:00:00').toISOString(),
          method: form.method.value,
          notes: form.notes.value,
        });
      } },
    ],
  });
}

export async function renderPayments() {
  const root = h('div');
  const { data } = getState();

  const head = h('div', { class: 'section-head' },
    h('h2', null, 'Pagamentos'),
    h('button', {
      class: 'btn btn-primary btn-sm',
      onClick: async () => {
        const r = await paymentDialog();
        if (r) { await addPayment(r); rerender(); }
      },
    }, icon('plus'), 'Pagamento'),
  );
  root.appendChild(head);

  // Per-student balance card
  const earned = lessonsValueByStudent(data);
  const paid = paymentsByStudent(data);
  const studentIds = new Set([...earned.keys(), ...paid.keys()]);

  if (studentIds.size > 0) {
    const balCard = h('div', { class: 'card', style: { marginBottom: '14px' } });
    balCard.appendChild(h('div', { class: 'label', style: { fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '10px' } }, 'Saldo por aluno'));
    for (const id of studentIds) {
      const s = data.students.find(x => x.id === id);
      if (!s) continue;
      const e = earned.get(id) || 0;
      const p = paid.get(id) || 0;
      const owed = e - p;
      balCard.appendChild(h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
        h('div', { style: { width: '8px', height: '8px', borderRadius: '999px', background: s.color } }),
        h('div', { style: { flex: 1, fontWeight: 600 } }, s.name),
        h('div', { class: 'tabular small muted' }, fmtMoney(p) + ' / ' + fmtMoney(e)),
        h('div', { class: 'tabular', style: { width: '90px', textAlign: 'right', fontWeight: 600, color: owed > 0.005 ? 'var(--warn)' : owed < -0.005 ? 'var(--accent)' : 'var(--text-2)' } },
          owed > 0.005 ? fmtMoney(owed) : owed < -0.005 ? '+' + fmtMoney(-owed) : 'OK'),
      ));
    }
    root.appendChild(balCard);
  }

  // Payment list
  if (data.payments.length === 0) {
    root.appendChild(emptyState('Sem pagamentos registrados', 'Registre quando receber dinheiro via PIX, dinheiro ou outro método.'));
    return root;
  }

  const sorted = [...data.payments].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  for (const p of sorted) {
    const s = data.students.find(x => x.id === p.studentId);
    root.appendChild(h('div', { class: 'payment' },
      h('div', { class: `badge ${p.method}` }, p.method.toUpperCase()),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 600 } }, s?.name || 'Aluno apagado'),
        h('div', { class: 'small muted' }, fmtDateLong(p.dateISO) + (p.notes ? ' · ' + p.notes : '')),
      ),
      h('div', { class: 'amount tabular' }, fmtMoney(p.amount)),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Apagar',
        onClick: async () => {
          const ok = await confirm('Apagar este pagamento?');
          if (ok) { await deletePayment(p.id); rerender(); }
        },
      }, icon('trash')),
    ));
  }

  return root;
}
