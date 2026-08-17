// Testes do resumo p/ WhatsApp (Node puro, sem DOM): node scripts/test-summary.mjs
import assert from 'node:assert/strict';
import { buildSummary, summaryRange, SUMMARY_PERIODS } from '../src/lib/whatsapp.js';

let n = 0;
function ok(name, fn) { fn(); n++; console.log(`  ✓ ${name}`); }
const iso = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString();
const student = (id, rate) => ({ id, name: `Aluno ${id}`, hourlyRate: rate, archived: false });
const lesson = (studentId, startISO, opts = {}) => ({
  id: `${studentId}-${startISO}`, studentId, startISO,
  durationMinutes: opts.dur ?? 60, status: opts.status ?? 'completed',
});
const D = (data) => ({ students: [], lessons: [], payments: [], settings: {}, ...data });

// 17/08/2026, o caso que motivou o seletor: o ciclo 15->hoje engolia julho inteiro.
const hoje = new Date(2026, 7, 17, 9);

console.log('janelas do resumo');
ok('lastMonth = mes calendario anterior inteiro', () => {
  const { from, to } = summaryRange('lastMonth', hoje);
  assert.equal(from.getTime(), new Date(2026, 6, 1).getTime());
  assert.equal(to.getTime(), new Date(2026, 6, 31, 23, 59, 59, 999).getTime());
});
ok('thisMonth = dia 1 deste mes ate agora', () => {
  const { from, to } = summaryRange('thisMonth', hoje);
  assert.equal(from.getTime(), new Date(2026, 7, 1).getTime());
  assert.equal(to.getTime(), hoje.getTime());
});
ok('cycle = ultimo dia 15 ate agora (recorte antigo)', () => {
  const { from, to } = summaryRange('cycle', hoje);
  assert.equal(from.getTime(), new Date(2026, 7, 15).getTime());
  assert.equal(to.getTime(), hoje.getTime());
});
ok('periodo invalido ou ausente cai em lastMonth', () => {
  const alvo = summaryRange('lastMonth', hoje);
  for (const p of [undefined, null, 'trimestre']) {
    assert.equal(summaryRange(p, hoje).from.getTime(), alvo.from.getTime());
  }
  assert.deepEqual(SUMMARY_PERIODS, ['lastMonth', 'thisMonth', 'cycle']);
});
ok('virada de ano: 05/01 -> dezembro inteiro', () => {
  const { from, to } = summaryRange('lastMonth', new Date(2027, 0, 5));
  assert.equal(from.getTime(), new Date(2026, 11, 1).getTime());
  assert.equal(to.getTime(), new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
});

console.log('bloco "Aulas dadas"');
const data = D({
  students: [student('a', 100), student('b', 80)],
  lessons: [
    lesson('a', iso(2026, 6, 28)),                  // junho: fora de tudo
    lesson('a', iso(2026, 7, 1, 8)),                // 01/07 08:00, borda de baixo
    lesson('b', iso(2026, 7, 20), { dur: 90 }),     // meio de julho
    lesson('a', iso(2026, 7, 31, 22)),              // 31/07 22:00, borda de cima
    lesson('b', iso(2026, 7, 15), { status: 'cancelled' }), // cancelada nunca entra
    lesson('a', iso(2026, 8, 10)),                  // agosto, antes do dia 15
    lesson('b', iso(2026, 8, 16)),                  // agosto, dentro do ciclo
    { ...lesson('a', iso(2026, 8, 25)), status: 'scheduled' }, // futura
  ],
});

ok('default pega julho inteiro em 17/08 (o pedido)', () => {
  const txt = buildSummary(data, { include: 'past' }, hoje);
  assert.match(txt, /📚 \*Aulas dadas\* _\(01\/07 a 31\/07\)_/);
  assert.equal((txt.match(/^• /gm) || []).length, 3);
  assert.match(txt, /01\/07/);
  assert.match(txt, /31\/07/);
  assert.doesNotMatch(txt, /28\/06/);
  assert.doesNotMatch(txt, /10\/08/);
  assert.doesNotMatch(txt, /15\/07/); // cancelada
});
ok('thisMonth pega so agosto ate hoje, sem a futura', () => {
  const txt = buildSummary(data, { include: 'past', period: 'thisMonth' }, hoje);
  assert.match(txt, /_\(01\/08 a 17\/08\)_/);
  assert.equal((txt.match(/^• /gm) || []).length, 2);
  assert.doesNotMatch(txt, /25\/08/);
});
ok('cycle mantem o recorte 15->hoje', () => {
  const txt = buildSummary(data, { include: 'past', period: 'cycle' }, hoje);
  assert.match(txt, /_\(15\/08 a 17\/08\)_/);
  assert.equal((txt.match(/^• /gm) || []).length, 1);
  assert.match(txt, /16\/08/);
});
ok('total so aparece com valores ligados e soma o periodo', () => {
  const semValor = buildSummary(data, { include: 'past' }, hoje);
  assert.doesNotMatch(semValor, /Total/);
  const comValor = buildSummary(data, { include: 'past', showValues: true }, hoje);
  // 01/07 1h x100 + 20/07 1h30 x80 + 31/07 1h x100 = 320
  assert.match(comValor, /\*Total: R\$\s?320,00\*/);
});
ok('periodo vazio avisa com a janela, nao com "desde"', () => {
  const vazio = buildSummary(D({ students: [student('a', 100)] }), { include: 'past' }, hoje);
  assert.match(vazio, /_Nenhuma aula dada de 01\/07 a 31\/07\._/);
});

console.log('bloco "Aulas marcadas"');
ok('futuras nao dependem do periodo escolhido', () => {
  for (const period of SUMMARY_PERIODS) {
    const txt = buildSummary(data, { include: 'future', period }, hoje);
    assert.match(txt, /📅 \*Aulas marcadas\*/);
    assert.equal((txt.match(/^• /gm) || []).length, 1);
    assert.match(txt, /25\/08/);
  }
});
ok('ambos os blocos saem separados por linha em branco', () => {
  const txt = buildSummary(data, { include: 'both' }, hoje);
  assert.match(txt, /📚[\s\S]+\n\n📅/);
});

console.log(`\n${n} asserts OK`);
