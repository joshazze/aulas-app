import { h, icon, emptyState, copyWithFeedback } from '../components/ui.js';
import { buildSettlementNote } from '../lib/whatsapp.js';
import { openModal, confirm } from '../components/modal.js';
import { getState, addPayment, deletePayment } from '../lib/state.js';
import { fmtMoney, fmtDateLong, fmtDM } from '../lib/format.js';
import { totalEarned, totalReceived, runningBalance, expectedSettlement, earnedByStudent } from '../lib/settlement.js';
import { rerender } from '../lib/router.js';

async function settlementDialog(expected) {
  const form = h('form');
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  form.append(
    h('div', { class: 'field' },
      h('label', null, 'Valor (R$)'),
      h('input', { name: 'amount', type: 'number', step: '0.01', min: '0.01', required: true,
        value: expected > 0.005 ? expected.toFixed(2) : '' }),
      h('div', { class: 'hint' }, expected > 0.005 ? `Esperado: ${fmtMoney(expected)}` : ''),
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

  return openModal({
    title: 'Registrar acerto',
    body: form,
    actions: [
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Salvar', variant: 'btn-primary', onClick: async (_, close) => {
        if (!form.reportValidity()) return false;
        close({
          amount: form.amount.value,
          dateISO: new Date(form.date.value + 'T12:00:00').toISOString(),
          method: form.method.value,
          notes: form.notes.value,
        });
      } },
    ],
  });
}

const cardLabel = (text) => h('div', { class: 'label', style: { fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '10px' } }, text);

export async function renderPayments() {
  const root = h('div');
  const { data } = getState();

  const exp = expectedSettlement(data);
  const earned = totalEarned(data);
  const received = totalReceived(data);
  const balance = runningBalance(data);

  const head = h('div', { class: 'section-head' },
    h('h2', null, 'Acertos'),
    h('button', {
      class: 'btn btn-primary btn-sm',
      onClick: async () => {
        const r = await settlementDialog(exp.expected);
        if (r) { await addPayment(r); rerender(); }
      },
    }, icon('plus'), 'Acerto'),
  );
  root.appendChild(head);

  // Saldo corrido com a empresa
  const balCard = h('div', { class: 'card', style: { marginBottom: '14px' } });
  balCard.appendChild(cardLabel('Saldo com a empresa'));
  const balRow = (label, value) => h('div', { class: 'row', style: { padding: '6px 0' } },
    h('div', { style: { flex: 1 }, class: 'small muted' }, label),
    h('div', { class: 'tabular', style: { fontWeight: 600 } }, value),
  );
  balCard.appendChild(balRow('Dado (aulas concluídas)', fmtMoney(earned)));
  balCard.appendChild(balRow('Recebido', fmtMoney(received)));
  balCard.appendChild(h('div', { class: 'row', style: { padding: '8px 0 0', borderTop: '1px solid var(--border)', marginTop: '6px' } },
    h('div', { style: { flex: 1, fontWeight: 600 } },
      balance > 0.005 ? 'A receber' : balance < -0.005 ? 'Crédito (pago a mais)' : 'Em dia'),
    h('div', { class: 'tabular', style: { fontWeight: 700, color: balance > 0.005 ? 'var(--warn)' : balance < -0.005 ? 'var(--accent)' : 'var(--text-2)' } },
      balance > 0.005 ? fmtMoney(balance) : balance < -0.005 ? fmtMoney(-balance) : 'OK'),
  ));
  root.appendChild(balCard);

  // Próximo acerto (corte no último dia 15)
  const nextCard = h('div', { class: 'card', style: { marginBottom: '14px' } });
  nextCard.appendChild(cardLabel('Próximo acerto'));
  nextCard.appendChild(h('div', { class: 'row' },
    h('div', { style: { flex: 1 } },
      h('div', { style: { fontWeight: 700, fontSize: '22px' }, class: 'tabular' }, fmtMoney(exp.expected)),
      h('div', { class: 'small muted' },
        exp.expected === 0 && exp.expectedRaw < -0.005
          ? `crédito de ${fmtMoney(-exp.expectedRaw)}`
          : `aulas até ${fmtDM(new Date(exp.cutoff.getTime() - 86400000))}`),
    ),
    h('button', {
      class: 'btn btn-sm',
      title: 'Copiar conferência p/ WhatsApp',
      onClick: (e) => copyWithFeedback(buildSettlementNote(data), e.currentTarget),
    }, icon('copy'), 'Conferência'),
  ));
  if (exp.carryOver > 0.005) {
    nextCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '8px' } },
      `ciclo ${fmtDM(exp.cycleStart)} a ${fmtDM(new Date(exp.cutoff.getTime() - 86400000))}: ${fmtMoney(exp.cycleTotal)} · atrasado: ${fmtMoney(exp.carryOver)}`));
  } else if (exp.carryOver < -0.005) {
    // carryOver negativo = pagamentos já cobrem parte (ou todo) o ciclo fechado.
    // O excedente além do ciclo é crédito real e aparece no sub da manchete.
    const covered = Math.min(-exp.carryOver, exp.cycleTotal);
    nextCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '8px' } },
      `ciclo: ${fmtMoney(exp.cycleTotal)} · já pago: ${fmtMoney(covered)}`));
  }
  root.appendChild(nextCard);

  // Conferência por aluno do ciclo fechado (pra bater com o PIX da empresa)
  const per = earnedByStudent(data, { from: exp.cycleStart, until: exp.cutoff });
  if (per.size > 0) {
    const confCard = h('div', { class: 'card', style: { marginBottom: '14px' } });
    confCard.appendChild(cardLabel(`Por aluno · ciclo ${fmtDM(exp.cycleStart)} a ${fmtDM(new Date(exp.cutoff.getTime() - 86400000))}`));
    const entries = [...per.values()]
      .sort((a, b) => (a.student?.name || 'Aluno apagado').localeCompare(b.student?.name || 'Aluno apagado', 'pt-BR'));
    for (const e of entries) {
      confCard.appendChild(h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
        h('div', { style: { width: '8px', height: '8px', borderRadius: '999px', background: e.student?.color || 'var(--text-2)' } }),
        h('div', { style: { flex: 1, fontWeight: 600 } }, e.student?.name || 'Aluno apagado'),
        h('div', { class: 'small muted tabular' }, `${e.count} aula${e.count === 1 ? '' : 's'}`),
        h('div', { class: 'tabular', style: { width: '90px', textAlign: 'right', fontWeight: 600 } }, fmtMoney(e.total)),
      ));
    }
    confCard.appendChild(h('div', { class: 'row', style: { padding: '8px 0 0' } },
      h('div', { style: { flex: 1, fontWeight: 600 } }, 'Total do ciclo'),
      h('div', { class: 'tabular', style: { fontWeight: 700 } }, fmtMoney(exp.cycleTotal)),
    ));
    root.appendChild(confCard);
  }

  // Lista de acertos registrados
  if (data.payments.length === 0) {
    root.appendChild(emptyState('Sem acertos registrados', 'Registre quando a empresa fizer o PIX do ciclo.'));
    return root;
  }

  const sorted = [...data.payments].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  for (const p of sorted) {
    // studentId só existe em registros antigos (época de pagamento por aluno).
    const legacyStudent = p.studentId ? data.students.find(x => x.id === p.studentId) : null;
    const legacyNote = p.studentId ? ` · ${legacyStudent?.name || 'aluno apagado'}` : '';
    root.appendChild(h('div', { class: 'payment' },
      h('div', { class: `badge ${p.method}` }, p.method.toUpperCase()),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 600 } }, 'Acerto'),
        h('div', { class: 'small muted' }, fmtDateLong(p.dateISO) + (p.notes ? ' · ' + p.notes : '') + legacyNote),
      ),
      h('div', { class: 'amount tabular' }, fmtMoney(p.amount)),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Apagar',
        onClick: async () => {
          const ok = await confirm('Apagar este acerto?');
          if (ok) { await deletePayment(p.id); rerender(); }
        },
      }, icon('trash')),
    ));
  }

  return root;
}
