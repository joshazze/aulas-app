const pad = (n) => String(n).padStart(2, '0');

function toICSUtc(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeICS(text) {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function fold(line) {
  if (line.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 75);
    out.push(i === 0 ? chunk : ' ' + chunk);
    i += 75;
  }
  return out.join('\r\n');
}

export function buildICS(lessons, studentMap) {
  const stamp = toICSUtc(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//aulas-app//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const l of lessons) {
    const s = studentMap[l.studentId];
    const start = new Date(l.startISO);
    const end = new Date(start.getTime() + l.durationMinutes * 60_000);
    const cancelled = l.status === 'cancelled';
    const name = s?.name || l.studentName || 'aluno';
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${l.id}@aulas-app`),
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${l.calSeq || 0}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      `DTSTART:${toICSUtc(start)}`,
      `DTEND:${toICSUtc(end)}`,
      fold(`SUMMARY:${escapeICS((cancelled ? 'Cancelada: ' : '') + 'Aula com ' + name)}`),
    );
    if (l.notes) lines.push(fold(`DESCRIPTION:${escapeICS(l.notes)}`));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(filename, ics) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function icsFilename(prefix = 'aulas') {
  const slug = prefix.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'aulas';
  const today = new Date().toISOString().slice(0, 10);
  return `${slug}-${today}.ics`;
}
