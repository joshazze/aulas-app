// Testes puros de Node do canal de calendário por prompt + do pedido de
// conteúdo na confirmação. Sem DOM, sem localStorage: calprompt.js e
// whatsapp.js só dependem de format/pricing/settlement, todos puros.
import assert from 'node:assert/strict';

const { calendarOps, buildCalendarPrompt, calSlot, CAL_HEADER, MARCA } =
  await import('../src/lib/calprompt.js');
const { buildConfirmation, PEDIDO_CONTEUDO } = await import('../src/lib/whatsapp.js');

// Datas construídas por componentes LOCAIS de propósito: se alguém trocar o
// render pra UTC, a asserção de horário quebra alto em vez de passar batido.
const localISO = (y, m, d, h, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();

const maria = { id: 's1', name: 'Maria Noronha' };
const luiza = { id: 's2', name: 'Luiza Neves' };
const studentMap = { s1: maria, s2: luiza };

const aula = (over = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  studentId: 's1',
  startISO: localISO(2026, 8, 12, 14),
  durationMinutes: 60,
  status: 'scheduled',
  notes: '',
  addedToCalendar: false,
  ...over,
});

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('\ncalprompt: derivação de operação');

ok('aula nunca sincronizada vira CRIAR', () => {
  const [o] = calendarOps([aula()], [], studentMap);
  assert.equal(o.op, 'CRIAR');
  assert.equal(o.name, 'Maria Noronha');
});

ok('aula com calSynced vira MOVER', () => {
  const [o] = calendarOps([aula({ calSynced: true })], [], studentMap);
  assert.equal(o.op, 'MOVER');
});

ok('legado só com addedToCalendar também vira MOVER', () => {
  const [o] = calendarOps([aula({ addedToCalendar: true })], [], studentMap);
  assert.equal(o.op, 'MOVER');
});

ok('aula cancelada que já foi vira CANCELAR', () => {
  const [o] = calendarOps([aula({ status: 'cancelled', calSynced: true })], [], studentMap);
  assert.equal(o.op, 'CANCELAR');
});

ok('aula cancelada que nunca foi não vira operação nenhuma', () => {
  assert.equal(calendarOps([aula({ status: 'cancelled' })], [], studentMap).length, 0);
});

ok('tombstone sempre vira CANCELAR e usa studentName', () => {
  const t = { id: 't1', startISO: localISO(2026, 8, 13, 17, 30), durationMinutes: 60, studentName: 'Luiza Neves' };
  const [o] = calendarOps([], [t], studentMap);
  assert.equal(o.op, 'CANCELAR');
  assert.equal(o.name, 'Luiza Neves');
});

ok('aluno apagado cai pro rótulo genérico', () => {
  const [o] = calendarOps([aula({ studentId: 'sumiu' })], [], studentMap);
  assert.equal(o.name, 'aluno');
});

ok('ordem é CRIAR, MOVER, CANCELAR e data crescente dentro do grupo', () => {
  const ops = calendarOps([
    aula({ id: 'b', startISO: localISO(2026, 8, 20, 14) }),
    aula({ id: 'c', startISO: localISO(2026, 8, 14, 14), calSynced: true }),
    aula({ id: 'a', startISO: localISO(2026, 8, 11, 14) }),
    aula({ id: 'd', startISO: localISO(2026, 8, 9, 14), status: 'cancelled', calSynced: true }),
  ], [], studentMap);
  assert.deepEqual(ops.map((o) => o.id), ['a', 'b', 'c', 'd']);
});

console.log('\ncalprompt: horário local e janela');

ok('60 min sai como 14:00-15:00 em horário local', () => {
  assert.equal(calSlot(localISO(2026, 8, 12, 14), 60), '2026-08-12 14:00-15:00');
});

ok('90 min sai como 14:00-15:30', () => {
  assert.equal(calSlot(localISO(2026, 8, 12, 14), 90), '2026-08-12 14:00-15:30');
});

ok('20 min sai como 14:00-14:20', () => {
  assert.equal(calSlot(localISO(2026, 8, 12, 14), 20), '2026-08-12 14:00-14:20');
});

ok('aula que atravessa a meia-noite avisa (+1 dia)', () => {
  assert.equal(calSlot(localISO(2026, 8, 12, 23, 30), 90), '2026-08-12 23:30-01:00 (+1 dia)');
});

console.log('\ncalprompt: montagem do texto');

const promptCheio = buildCalendarPrompt(calendarOps([
  aula({ id: 'id-criar' }),
  aula({ id: 'id-mover', calSynced: true, startISO: localISO(2026, 8, 15, 20, 30),
         calFrom: { startISO: localISO(2026, 8, 13, 20, 30), name: 'Maria Noronha' } }),
  aula({ id: 'id-notas', notes: 'trazer a\nlista de logaritmo' }),
], [
  { id: 'id-morto', startISO: localISO(2026, 8, 11, 17, 30), durationMinutes: 60, studentName: 'Luiza Neves' },
], studentMap));

ok('lista vazia devolve string vazia', () => {
  assert.equal(buildCalendarPrompt([]), '');
});

ok('cabeçalho aparece uma vez só', () => {
  assert.equal(promptCheio.split('Claude: sincronize').length, 2);
});

ok('cabeçalho diz Odin, EventKit, a marca e o veto ao AppleScript', () => {
  for (const t of ['Odin', 'EventKit', `${MARCA}:<id>`, 'Nunca AppleScript', 'Preparo da aula']) {
    assert.ok(CAL_HEADER.includes(t), `faltou "${t}" no cabeçalho`);
  }
});

ok('cabeçalho manda deixar os dois lançados no choque', () => {
  assert.ok(CAL_HEADER.includes('os dois ficam lançados'));
});

ok('cada id aparece exatamente uma vez', () => {
  for (const id of ['id-criar', 'id-mover', 'id-notas', 'id-morto']) {
    assert.equal(promptCheio.split(id).length, 2, `id ${id} fora de esquadro`);
  }
});

ok('MOVER mostra de onde para onde', () => {
  assert.ok(promptCheio.includes('de 2026-08-13 20:30 para 2026-08-15 20:30-21:30'));
});

ok('notas viram uma linha só embaixo da operação', () => {
  assert.ok(promptCheio.includes('notas: trazer a lista de logaritmo'));
});

ok('linha de operação bate com o formato esperado', () => {
  // O padEnd(8) separa a linha de dados das linhas do cabeçalho, que usam
  // "CRIAR:" com dois pontos.
  const re = /^(CRIAR   |MOVER   |CANCELAR) \S+ {2}(de \d{4}-\d{2}-\d{2} \d{2}:\d{2} para )?\d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}( \(\+1 dia\))?  \S/;
  const linhas = promptCheio.split('\n').filter((l) => /^(CRIAR|MOVER|CANCELAR) /.test(l));
  assert.equal(linhas.length, 4);
  for (const l of linhas) assert.match(l, re);
});

console.log('\nconfirmação: pedido de conteúdo');

const umaAula = buildConfirmation(aula(), maria);
const tresAulas = buildConfirmation([
  aula({ id: 'x1', startISO: localISO(2026, 8, 12, 14) }),
  aula({ id: 'x2', startISO: localISO(2026, 8, 19, 14) }),
  aula({ id: 'x3', startISO: localISO(2026, 8, 26, 14) }),
], maria);

ok('pedido entra na confirmação de uma aula, uma vez só', () => {
  assert.equal(umaAula.split(PEDIDO_CONTEUDO).length, 2);
});

ok('pedido entra na confirmação de várias aulas, uma vez só', () => {
  assert.equal(tresAulas.split(PEDIDO_CONTEUDO).length, 2);
});

ok('pedido vem antes do Combinado nos dois casos', () => {
  for (const txt of [umaAula, tresAulas]) {
    assert.ok(txt.indexOf(PEDIDO_CONTEUDO) < txt.indexOf('Combinado? 🤝'));
    assert.ok(txt.trimEnd().endsWith('Combinado? 🤝'));
  }
});

ok('pedido cita quadro, caderno, livro, PDF e apostila', () => {
  for (const t of ['quadro', 'caderno', 'livro', 'PDFs', 'apostilas']) {
    assert.ok(PEDIDO_CONTEUDO.includes(t), `faltou "${t}" no pedido`);
  }
});

console.log('\ntexto: sem travessão em prosa');

ok('nem o prompt nem as confirmações usam travessão', () => {
  for (const txt of [promptCheio, umaAula, tresAulas]) {
    assert.ok(!/[—–]/.test(txt), 'travessão no texto');
    assert.ok(!/ - /.test(txt), 'hífen solto como pontuação');
  }
});

console.log(`\n${n} asserts de calprompt OK`);
