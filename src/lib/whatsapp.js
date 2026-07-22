import { fmtCompactDateTime, fmtDuration, firstName } from './format.js';
import { lessonValue } from './pricing.js';

function lastCycleStart(now) {
  const day = now.getDate();
  if (day >= 15) {
    return new Date(now.getFullYear(), now.getMonth(), 15, 0, 0, 0, 0);
  }
  return new Date(now.getFullYear(), now.getMonth() - 1, 15, 0, 0, 0, 0);
}

function fmtDM(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtBRL(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function lessonLine(l, studentMap, showValues) {
  const s = studentMap[l.studentId];
  const meta = [fmtDuration(l.durationMinutes)];
  if (showValues) meta.push(fmtBRL(lessonValue(l, s)));
  return `• ${fmtCompactDateTime(l.startISO)} — ${s?.name || 'aluno'} (${meta.join(' · ')})`;
}

export function buildSummary(data, opts = {}) {
  const include = opts.include || 'both';
  const showValues = !!opts.showValues;
  const studentMap = Object.fromEntries(data.students.map((s) => [s.id, s]));
  const now = new Date();
  const cycleStart = lastCycleStart(now);
  const cycleStartMs = cycleStart.getTime();
  const nowMs = now.getTime();

  const past = data.lessons
    .filter((l) => {
      if (l.status === 'cancelled') return false;
      const t = new Date(l.startISO).getTime();
      return t >= cycleStartMs && t <= nowMs;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const future = data.lessons
    .filter((l) => l.status === 'scheduled' && new Date(l.startISO).getTime() > nowMs)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const sections = [];

  if (include === 'past' || include === 'both') {
    const header = `📚 *Aulas dadas* _(${fmtDM(cycleStart)} a ${fmtDM(now)})_`;
    if (past.length === 0) {
      sections.push([header, `_Nenhuma aula dada desde ${fmtDM(cycleStart)}._`].join('\n'));
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
    `Combinado? 🤝`,
  ].join('\n');
}
