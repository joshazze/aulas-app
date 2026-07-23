import { lessonValue } from './pricing.js';

// Acerto da empresa: um PIX único cobre as aulas de todos os alunos até o corte.
// O ciclo fecha todo dia 15, 00:00 LOCAL; aula do próprio dia 15 pertence ao
// ciclo seguinte (mesma regra do buildSummary — card e mensagem nunca divergem).
// `now` explícito em tudo: testes passam datas fixas sem mock de relógio.

export function lastCycleStart(now = new Date()) {
  if (now.getDate() >= 15) {
    return new Date(now.getFullYear(), now.getMonth(), 15, 0, 0, 0, 0);
  }
  return new Date(now.getFullYear(), now.getMonth() - 1, 15, 0, 0, 0, 0);
}

export function prevCycleStart(now = new Date()) {
  const last = lastCycleStart(now);
  return new Date(last.getFullYear(), last.getMonth() - 1, 15, 0, 0, 0, 0);
}

function studentMap(data) {
  return Object.fromEntries(data.students.map((s) => [s.id, s]));
}

// Ganho concluído na janela [from, until). Aluno apagado NÃO é pulado:
// o rate congelado da aula continua valendo (sem aluno e sem freeze, vale 0).
export function totalEarned(data, { from = null, until = null } = {}) {
  const students = studentMap(data);
  let sum = 0;
  for (const l of data.lessons) {
    if (l.status !== 'completed') continue;
    const t = new Date(l.startISO).getTime();
    if (from && t < from.getTime()) continue;
    if (until && t >= until.getTime()) continue;
    sum += lessonValue(l, students[l.studentId]);
  }
  return sum;
}

export function totalReceived(data) {
  return data.payments.reduce((sum, p) => sum + p.amount, 0);
}

// Saldo corrido: > 0 a empresa deve, < 0 crédito (pagou a mais).
export function runningBalance(data) {
  return totalEarned(data) - totalReceived(data);
}

// Decomposição do próximo acerto. Identidade exata (sem floor):
// expectedRaw = cycleTotal + carryOver — é isso que confere com o PIX.
export function expectedSettlement(data, now = new Date()) {
  const cutoff = lastCycleStart(now);
  const cycleStart = prevCycleStart(now);
  const cycleTotal = totalEarned(data, { from: cycleStart, until: cutoff });
  const carryOver = totalEarned(data, { until: cycleStart }) - totalReceived(data);
  const expectedRaw = cycleTotal + carryOver;
  return { cutoff, cycleStart, cycleTotal, carryOver, expectedRaw, expected: Math.max(0, expectedRaw) };
}

// Map<studentId, { student|null, total, count }> das concluídas em [from, until).
// Itera lessons (não students): pega arquivado com aula na janela; aula órfã
// de aluno apagado entra com student null.
export function earnedByStudent(data, { from = null, until = null } = {}) {
  const students = studentMap(data);
  const map = new Map();
  for (const l of data.lessons) {
    if (l.status !== 'completed') continue;
    const t = new Date(l.startISO).getTime();
    if (from && t < from.getTime()) continue;
    if (until && t >= until.getTime()) continue;
    const s = students[l.studentId] || null;
    const entry = map.get(l.studentId) || { student: s, total: 0, count: 0 };
    entry.total += lessonValue(l, s);
    entry.count += 1;
    map.set(l.studentId, entry);
  }
  return map;
}
