import { fmtCompactDateTime, fmtDuration, firstName, fmtDM, startOfMonth, endOfMonth } from './format.js';
import { lessonValue } from './pricing.js';
import { lastCycleStart, expectedSettlement, earnedByStudent } from './settlement.js';

function fmtBRL(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function lessonLine(l, studentMap, showValues) {
  const s = studentMap[l.studentId];
  const meta = [fmtDuration(l.durationMinutes)];
  if (showValues) meta.push(fmtBRL(lessonValue(l, s)));
  return `• ${fmtCompactDateTime(l.startISO)} — ${s?.name || 'aluno'} (${meta.join(' · ')})`;
}

// Janelas possíveis do bloco "Aulas dadas". `lastMonth` é o default porque o
// resumo costuma sair depois do mês fechado (17/08 pede julho inteiro); `cycle`
// preserva o recorte antigo, do último dia 15 até agora.
export const SUMMARY_PERIODS = ['lastMonth', 'thisMonth', 'cycle'];

export function summaryRange(period, now = new Date()) {
  if (period === 'thisMonth') return { from: startOfMonth(now), to: now };
  if (period === 'cycle') return { from: lastCycleStart(now), to: now };
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: startOfMonth(prevMonth), to: endOfMonth(prevMonth) };
}

export function buildSummary(data, opts = {}, now = new Date()) {
  const include = opts.include || 'both';
  const showValues = !!opts.showValues;
  const period = SUMMARY_PERIODS.includes(opts.period) ? opts.period : 'lastMonth';
  const studentMap = Object.fromEntries(data.students.map((s) => [s.id, s]));
  const { from, to } = summaryRange(period, now);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const nowMs = now.getTime();

  const past = data.lessons
    .filter((l) => {
      if (l.status === 'cancelled') return false;
      const t = new Date(l.startISO).getTime();
      return t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const future = data.lessons
    .filter((l) => l.status === 'scheduled' && new Date(l.startISO).getTime() > nowMs)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const sections = [];

  if (include === 'past' || include === 'both') {
    const header = `📚 *Aulas dadas* _(${fmtDM(from)} a ${fmtDM(to)})_`;
    if (past.length === 0) {
      sections.push([header, `_Nenhuma aula dada de ${fmtDM(from)} a ${fmtDM(to)}._`].join('\n'));
    } else {
      const lines = [header, ...past.map((l) => lessonLine(l, studentMap, showValues))];
      if (showValues) {
        const total = past.reduce((sum, l) => sum + lessonValue(l, studentMap[l.studentId]), 0);
        lines.push(`*Total: ${fmtBRL(total)}*`);
      }
      sections.push(lines.join('\n'));
    }
  }

  if (include === 'future' || include === 'both') {
    const header = '📅 *Aulas marcadas*';
    if (future.length === 0) {
      sections.push([header, '_Nenhuma aula marcada._'].join('\n'));
    } else {
      const lines = [header, ...future.map((l) => lessonLine(l, studentMap, showValues))];
      if (showValues) {
        const total = future.reduce((sum, l) => sum + lessonValue(l, studentMap[l.studentId]), 0);
        lines.push(`*Total: ${fmtBRL(total)}*`);
      }
      sections.push(lines.join('\n'));
    }
  }

  return sections.join('\n\n').trim();
}

// Pedido de material, igual nas duas versões da confirmação (uma aula ou várias).
export const PEDIDO_CONTEUDO = [
  'Caso a aula seja confirmada, gentileza mandar o conteúdo a ser trabalhado o mais rápido possível! 📚',
  '_(fotos do quadro, fotos do caderno, fotos do livro, páginas e nome do livro, PDFs, apostilas, etc.)_',
].join('\n');

export function buildConfirmation(lessonOrLessons, student) {
  const arr = Array.isArray(lessonOrLessons) ? lessonOrLessons : [lessonOrLessons];
  const nome = firstName(student?.name) || 'aluno';
  if (arr.length === 1) {
    const l = arr[0];
    return [
      `Oi ${nome}! Tudo bem?`,
      '',
      `Confirmando nossa aula:`,
      `📅 *${fmtCompactDateTime(l.startISO)}*`,
      `⏱️ ${fmtDuration(l.durationMinutes)}`,
      '',
      PEDIDO_CONTEUDO,
      '',
      `Combinado? 🤝`,
    ].join('\n');
  }
  const sorted = [...arr].sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  return [
    `Oi ${nome}! Tudo bem?`,
    '',
    `Confirmando nossas ${arr.length} aulas:`,
    ...sorted.map((l) => `📅 *${fmtCompactDateTime(l.startISO)}* (${fmtDuration(l.durationMinutes)})`),
    '',
    PEDIDO_CONTEUDO,
    '',
    `Combinado? 🤝`,
  ].join('\n');
}

// Nota de conferência do acerto da empresa: por-aluno do ciclo FECHADO
// (15 do mês anterior até o dia 14) + saldo/crédito anterior. A soma bate
// com o "Próximo acerto" do card: cycleTotal + carryOver = expectedRaw.
export function buildSettlementNote(data, now = new Date()) {
  const { cutoff, cycleStart, cycleTotal, carryOver, expectedRaw } = expectedSettlement(data, now);
  const lastDay = new Date(cutoff.getTime() - 86400000);
  const lines = [`📋 *Acerto: aulas de ${fmtDM(cycleStart)} a ${fmtDM(lastDay)}*`];
  const entries = [...earnedByStudent(data, { from: cycleStart, until: cutoff }).values()]
    .sort((a, b) => (a.student?.name || 'Aluno apagado').localeCompare(b.student?.name || 'Aluno apagado', 'pt-BR'));
  if (entries.length === 0) {
    lines.push('_Nenhuma aula no ciclo._');
  } else {
    for (const e of entries) {
      const name = e.student?.name || 'Aluno apagado';
      lines.push(`• ${name}: ${e.count} aula${e.count === 1 ? '' : 's'} · ${fmtBRL(e.total)}`);
    }
  }
  lines.push(`*Total do ciclo: ${fmtBRL(cycleTotal)}*`);
  if (carryOver > 0.005) {
    lines.push(`_Saldo anterior: ${fmtBRL(carryOver)}_`);
    lines.push(`*Total a receber: ${fmtBRL(expectedRaw)}*`);
  } else if (carryOver < -0.005) {
    const covered = Math.min(-carryOver, cycleTotal);
    lines.push(`_Já pago: ${fmtBRL(covered)}_`);
    lines.push(`*Total a receber: ${fmtBRL(Math.max(0, expectedRaw))}*`);
  }
  return lines.join('\n');
}
