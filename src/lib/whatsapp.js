import { fmtCompactDateTime, fmtDuration, firstName } from './format.js';

function isPast(iso) {
  return new Date(iso).getTime() < Date.now();
}

export function buildSummary(data) {
  const studentMap = Object.fromEntries(data.students.map((s) => [s.id, s]));
  const now = Date.now();
  const weekAgoMs = now - 7 * 86400000;
  const twoWeeksAheadMs = now + 14 * 86400000;

  const completed = data.lessons
    .filter((l) => {
      const t = new Date(l.startISO).getTime();
      return (l.status === 'completed' || (l.status === 'scheduled' && t < now))
        && t >= weekAgoMs;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const upcoming = data.lessons
    .filter((l) => {
      if (l.status === 'cancelled') return false;
      const t = new Date(l.startISO).getTime();
      return t >= now && t <= twoWeeksAheadMs;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const lines = ['📚 *Resumo de aulas*', ''];

  if (completed.length > 0) {
    lines.push('✅ *Já dadas* _(últimos 7 dias)_');
    for (const l of completed) {
      const s = studentMap[l.studentId];
      lines.push(`• ${fmtCompactDateTime(l.startISO)} — ${s?.name || 'aluno'} (${fmtDuration(l.durationMinutes)})`);
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push('📅 *Próximas* _(até 14 dias)_');
    for (const l of upcoming) {
      const s = studentMap[l.studentId];
      lines.push(`• ${fmtCompactDateTime(l.startISO)} — ${s?.name || 'aluno'} (${fmtDuration(l.durationMinutes)})`);
    }
  }

  if (completed.length === 0 && upcoming.length === 0) {
    lines.push('_Nada nas últimas semanas nem nos próximos dias._');
  }

  return lines.join('\n').trim();
}

export function buildConfirmation(lesson, student) {
  const nome = firstName(student?.name) || 'aluno';
  return [
    `Oi ${nome}! Tudo bem?`,
    '',
    `Confirmando nossa aula:`,
    `📅 *${fmtCompactDateTime(lesson.startISO)}*`,
    `⏱️ ${fmtDuration(lesson.durationMinutes)}`,
    '',
    `Combinado? 🤝`,
  ].join('\n');
}
