import { fmtCompactDateTime, fmtDuration, firstName } from './format.js';

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

export function buildSummary(data) {
  const studentMap = Object.fromEntries(data.students.map((s) => [s.id, s]));
  const now = new Date();
  const cycleStart = lastCycleStart(now);
  const cycleStartMs = cycleStart.getTime();
  const nowMs = now.getTime();

  const completed = data.lessons
    .filter((l) => {
      if (l.status === 'cancelled') return false;
      const t = new Date(l.startISO).getTime();
      return t >= cycleStartMs && t <= nowMs;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const header = `📚 *Aulas dadas* _(${fmtDM(cycleStart)} a ${fmtDM(now)})_`;

  if (completed.length === 0) {
    return [header, '', `_Nenhuma aula dada desde ${fmtDM(cycleStart)}._`].join('\n');
  }

  const lines = [header, ''];
  for (const l of completed) {
    const s = studentMap[l.studentId];
    lines.push(`• ${fmtCompactDateTime(l.startISO)} — ${s?.name || 'aluno'} (${fmtDuration(l.durationMinutes)})`);
  }
  return lines.join('\n').trim();
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
