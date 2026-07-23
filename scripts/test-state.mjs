// Testes do state (Node puro): stub de localStorage ANTES do import dinamico.
// node scripts/test-state.mjs
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { setSession, getState, deleteStudent, addPayment } = await import('../src/lib/state.js');

const iso = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString();
const future = new Date(Date.now() + 7 * 86400000).toISOString();

const data = {
  students: [
    { id: 'a', name: 'Ana', hourlyRate: 100, archived: false },
    { id: 'b', name: 'Bia', hourlyRate: 80, archived: false },
  ],
  lessons: [
    { id: 'l1', studentId: 'a', startISO: iso(2026, 7, 1), durationMinutes: 60, status: 'completed', hourlyRate: 100 },
    { id: 'l2', studentId: 'b', startISO: future, durationMinutes: 60, status: 'scheduled' },
  ],
  payments: [
    { id: 'p-legado', studentId: 'a', amount: 50, dateISO: iso(2026, 6, 16), method: 'pix', notes: '' },
    { id: 'p-novo', amount: 200, dateISO: iso(2026, 7, 16), method: 'pix', notes: '' },
  ],
  settings: { createdAt: null },
};

await setSession({ data, meta: { createdAt: null } });

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

ok('apagar aluno remove as aulas dele', async () => {
  await deleteStudent('a');
  const d = getState().data;
  assert.equal(d.students.length, 1);
  assert.ok(!d.lessons.some((l) => l.studentId === 'a'));
});
ok('apagar aluno NAO apaga payments (nem o legado dele)', () => {
  const d = getState().data;
  assert.equal(d.payments.length, 2);
  assert.ok(d.payments.some((p) => p.id === 'p-legado'));
});
ok('addPayment novo nao escreve studentId', async () => {
  await addPayment({ amount: '300.50', dateISO: iso(2026, 7, 20), method: 'pix', notes: 'acerto julho' });
  const p = getState().data.payments.at(-1);
  assert.equal(p.amount, 300.5);
  assert.ok(!('studentId' in p));
});
ok('persistiu no localStorage', () => {
  const raw = JSON.parse(store.get('aulas:data'));
  assert.equal(raw.payments.length, 3);
});

console.log(`\n${n} asserts de state OK`);
