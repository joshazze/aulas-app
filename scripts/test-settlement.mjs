// Testes da lib de acerto (Node puro, sem DOM): node scripts/test-settlement.mjs
import assert from 'node:assert/strict';
import {
  lastCycleStart, prevCycleStart, totalEarned, totalReceived,
  runningBalance, expectedSettlement, earnedByStudent,
} from '../src/lib/settlement.js';

let n = 0;
function ok(name, fn) { fn(); n++; console.log(`  ✓ ${name}`); }
const iso = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString();
const student = (id, rate, extra = {}) => ({ id, name: `Aluno ${id}`, hourlyRate: rate, archived: false, ...extra });
const lesson = (studentId, startISO, opts = {}) => ({
  id: `${studentId}-${startISO}`, studentId, startISO,
  durationMinutes: opts.dur ?? 60, status: opts.status ?? 'completed',
  ...(opts.rate != null ? { hourlyRate: opts.rate } : {}),
});
const D = (data) => ({ students: [], lessons: [], payments: [], settings: {}, ...data });

console.log('ciclo 15->15');
ok('hoje 10/07 -> corte 15/06, ciclo desde 15/05', () => {
  const now = new Date(2026, 6, 10);
  assert.equal(lastCycleStart(now).getTime(), new Date(2026, 5, 15).getTime());
  assert.equal(prevCycleStart(now).getTime(), new Date(2026, 4, 15).getTime());
});
ok('hoje 23/07 -> corte 15/07', () => {
  assert.equal(lastCycleStart(new Date(2026, 6, 23)).getTime(), new Date(2026, 6, 15).getTime());
});
ok('dia 15 exato 00:00 -> corte 15 do proprio mes', () => {
  assert.equal(lastCycleStart(new Date(2026, 6, 15)).getTime(), new Date(2026, 6, 15).getTime());
});
ok('virada de ano: 05/01 -> corte 15/12, ciclo desde 15/11', () => {
  const now = new Date(2027, 0, 5);
  assert.equal(lastCycleStart(now).getTime(), new Date(2026, 11, 15).getTime());
  assert.equal(prevCycleStart(now).getTime(), new Date(2026, 10, 15).getTime());
});

console.log('esperado do acerto');
const now = new Date(2026, 6, 23); // corte 15/07, ciclo fechado [15/06, 15/07)
ok('aulas antes do corte entram, dia 15 e depois nao', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [
      lesson('a', iso(2026, 6, 10)),        // ciclo anterior
      lesson('a', iso(2026, 7, 14, 23)),    // dentro do ciclo fechado
      lesson('a', iso(2026, 7, 15, 10)),    // dia do corte: ciclo seguinte
      lesson('a', iso(2026, 7, 16)),        // depois do corte
    ],
  });
  const e = expectedSettlement(data, now);
  assert.equal(e.expected, 200);            // 10/06 + 14/07
  assert.equal(e.cycleTotal, 100);          // so a de 14/07
  assert.equal(e.carryOver, 100);           // a de 10/06
  assert.equal(totalEarned(data), 400);     // todas as completed, sem corte
});
ok('cancelada e scheduled nao contam', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [
      lesson('a', iso(2026, 7, 1), { status: 'cancelled' }),
      lesson('a', iso(2026, 7, 2), { status: 'scheduled' }),
      lesson('a', iso(2026, 7, 3)),
    ],
  });
  assert.equal(expectedSettlement(data, now).expected, 100);
});
ok('empresa atrasou um ciclo inteiro: carryOver acumula', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [lesson('a', iso(2026, 5, 20)), lesson('a', iso(2026, 6, 20)), lesson('a', iso(2026, 7, 1))],
  });
  const e = expectedSettlement(data, now);
  assert.equal(e.cycleTotal, 200);          // 20/06 + 01/07
  assert.equal(e.carryOver, 100);           // 20/05 nunca paga
  assert.equal(e.expected, 300);
});
ok('pagamento parcial abate do esperado', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [lesson('a', iso(2026, 6, 20)), lesson('a', iso(2026, 7, 1))],   // 200 ate o corte
    payments: [{ id: 'p1', amount: 150, dateISO: iso(2026, 7, 16), method: 'pix' }],
  });
  const e = expectedSettlement(data, now);
  assert.equal(e.expected, 50);
  assert.equal(runningBalance(data), 50);
});
ok('pagou a mais: expected 0, credito visivel no raw e no saldo', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [lesson('a', iso(2026, 7, 1))],
    payments: [{ id: 'p1', amount: 600, dateISO: iso(2026, 7, 16), method: 'pix' }],
  });
  const e = expectedSettlement(data, now);
  assert.equal(e.expected, 0);
  assert.equal(e.expectedRaw, -500);
  assert.equal(runningBalance(data), -500);
});
ok('payment legado com studentId conta no recebido global', () => {
  const data = D({ payments: [{ id: 'p1', studentId: 'x', amount: 80, dateISO: iso(2026, 7, 1), method: 'cash' }] });
  assert.equal(totalReceived(data), 80);
});
ok('rate congelado vale mesmo com aluno apagado', () => {
  const data = D({ lessons: [lesson('orfa', iso(2026, 7, 1), { rate: 90 })] });  // students vazio
  assert.equal(totalEarned(data), 90);
});
ok('aula gratuita congelada (rate 0) vale 0, nao cai no rate do aluno', () => {
  const data = D({ students: [student('a', 100)], lessons: [lesson('a', iso(2026, 7, 1), { rate: 0 })] });
  assert.equal(totalEarned(data), 0);
});

console.log('breakdown por aluno');
ok('janela fechada: somas, counts, arquivada aparece, dia 15 fora', () => {
  const data = D({
    students: [student('a', 100), student('b', 80, { archived: true })],
    lessons: [
      lesson('a', iso(2026, 6, 20)), lesson('a', iso(2026, 7, 10), { dur: 90 }),
      lesson('b', iso(2026, 7, 5)),
      lesson('a', iso(2026, 7, 15)),   // dia do corte: fora
      lesson('a', iso(2026, 6, 10)),   // antes da janela: fora
    ],
  });
  const e = expectedSettlement(data, now);
  const per = earnedByStudent(data, { from: e.cycleStart, until: e.cutoff });
  assert.equal(per.get('a').total, 250);   // 100 + 150
  assert.equal(per.get('a').count, 2);
  assert.equal(per.get('b').total, 80);    // arquivada entra
  assert.equal([...per.keys()].length, 2);
  const sum = [...per.values()].reduce((s, x) => s + x.total, 0);
  assert.equal(sum, e.cycleTotal);
});
ok('identidade: cycleTotal + carryOver == expectedRaw', () => {
  const data = D({
    students: [student('a', 100)],
    lessons: [lesson('a', iso(2026, 5, 20)), lesson('a', iso(2026, 7, 1)), lesson('a', iso(2026, 7, 20))],
    payments: [{ id: 'p1', amount: 130, dateISO: iso(2026, 7, 16), method: 'pix' }],
  });
  const e = expectedSettlement(data, now);
  assert.equal(e.cycleTotal + e.carryOver, e.expectedRaw);
});
ok('aula orfa entra no breakdown com student null', () => {
  const per = earnedByStudent(D({ lessons: [lesson('sumiu', iso(2026, 7, 1), { rate: 50 })] }));
  assert.equal(per.get('sumiu').student, null);
  assert.equal(per.get('sumiu').total, 50);
});

console.log(`\n${n} asserts de settlement OK`);
