import { h, icon, emptyState, copyWithFeedback } from '../components/ui.js';
import { getState } from '../lib/state.js';
import { fmtDateRelative, dayKey, fmtMoney } from '../lib/format.js';
import { lessonRow } from './schedule.js';
import { navigate } from '../lib/router.js';
import { buildSummary } from '../lib/whatsapp.js';

export async function renderDashboard() {
  const root = h('div');
  const { data } = getState();
  const studentMap = Object.fromEntries(data.students.map(s => [s.id, s]));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = data.lessons
    .filter(l => l.status === 'scheduled' && new Date(l.startISO) >= todayStart)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  const todayLessons = data.lessons
    .filter(l => {
      const d = new Date(l.startISO);
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      return sameDay;
    });

  // Summary
  const next7 = upcoming.filter(l => {
    const d = new Date(l.startISO);
    return d <= new Date(todayStart.getTime() + 7 * 86400000);
  });
  const next7Value = next7.reduce((sum, l) => sum + (l.durationMinutes / 60) * (studentMap[l.studentId]?.hourlyRate || 0), 0);

  root.appendChild(h('div', { class: 'stat-grid', style: { gridTemplateColumns: 'repeat(2, 1fr)' } },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Hoje'),
      h('div', { class: 'value accent' }, String(todayLessons.length)),
      h('div', { class: 'sub' }, todayLessons.length === 1 ? 'aula marcada' : 'aulas marcadas'),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Próx. 7 dias'),
      h('div', { class: 'value' }, fmtMoney(next7Value)),
      h('div', { class: 'sub' }, `${next7.length} aula${next7.length === 1 ? '' : 's'}`),
    ),
  ));

  root.appendChild(h('button', {
    class: 'btn btn-block',
    style: { marginBottom: '18px', justifyContent: 'flex-start' },
    onClick: (e) => copyWithFeedback(buildSummary(data), e.currentTarget),
  }, icon('copy'), 'Copiar resumo p/ WhatsApp'));

  if (upcoming.length === 0) {
    root.appendChild(emptyState(
      'Sem aulas marcadas',
      h('div', null,
        'Vá pra ',
        h('a', { href: '#/agenda' }, 'Agenda'),
        ' pra marcar a próxima.',
      ),
    ));
    return root;
  }

  // Group by day
  const groups = new Map();
  for (const l of upcoming.slice(0, 30)) {
    const k = dayKey(l.startISO);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }

  for (const [k, lessons] of groups) {
    const total = lessons.reduce((sum, l) => sum + (l.durationMinutes / 60) * (studentMap[l.studentId]?.hourlyRate || 0), 0);
    root.appendChild(h('div', { class: 'day-head' },
      h('span', { class: 'day-name' }, fmtDateRelative(lessons[0].startISO)),
      h('span', { class: 'day-meta' }, `${lessons.length} · ${fmtMoney(total)}`),
    ));
    for (const l of lessons) {
      root.appendChild(lessonRow(l, studentMap[l.studentId]));
    }
  }

  // Floating add button
  root.appendChild(h('button', {
    class: 'btn btn-primary',
    style: { position: 'fixed', right: '20px', bottom: '80px', borderRadius: '999px', padding: '14px 18px', boxShadow: '0 4px 14px rgba(94,234,212,0.3)', zIndex: '5' },
    onClick: () => navigate('/agenda'),
  }, icon('plus'), 'Aula'));

  return root;
}
