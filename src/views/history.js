import { h, emptyState } from '../components/ui.js';
import { getState } from '../lib/state.js';
import { fmtMoney, fmtMonthYear, fmtDateRelative, dayKey } from '../lib/format.js';
import { lessonValue } from '../lib/pricing.js';
import { lessonRow } from './schedule.js';
import { rerender } from '../lib/router.js';

let filterStudentId = 'all';

export async function renderHistory() {
  const root = h('div');
  const { data } = getState();
  const studentMap = Object.fromEntries(data.students.map((s) => [s.id, s]));
  const nowMs = Date.now();

  const studentIds = new Set(data.students.map((s) => s.id));
  if (filterStudentId !== 'all' && !studentIds.has(filterStudentId)) {
    filterStudentId = 'all';
  }

  const past = data.lessons
    .filter((l) => new Date(l.startISO).getTime() < nowMs)
    .filter((l) => filterStudentId === 'all' || l.studentId === filterStudentId)
    .sort((a, b) => new Date(b.startISO) - new Date(a.startISO));

  // Filter bar
  const sortedStudents = [...data.students].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const select = h('select', {
    class: 'filter-select',
    onChange: (e) => { filterStudentId = e.target.value; rerender(); },
  },
    h('option', { value: 'all', selected: filterStudentId === 'all' }, 'Todos os alunos'),
    ...sortedStudents.map((s) => h('option', { value: s.id, selected: filterStudentId === s.id }, s.name)),
  );
  root.appendChild(h('div', { class: 'section-head', style: { marginBottom: '12px' } },
    h('div', { class: 'small muted' }, `${past.length} aula${past.length === 1 ? '' : 's'}`),
    select,
  ));

  if (past.length === 0) {
    root.appendChild(emptyState(
      'Sem histórico ainda',
      'Quando aulas passarem, aparecem aqui.',
    ));
    return root;
  }

  // Group by month (year-month key)
  const groups = new Map();
  for (const l of past) {
    const d = new Date(l.startISO);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { date: new Date(d.getFullYear(), d.getMonth(), 1), lessons: [] });
    groups.get(key).lessons.push(l);
  }

  for (const { date, lessons } of groups.values()) {
    const total = lessons.reduce((sum, l) => {
      const s = studentMap[l.studentId];
      return sum + lessonValue(l, s);
    }, 0);
    root.appendChild(h('div', { class: 'day-head', style: { marginTop: '14px' } },
      h('span', { class: 'day-name' }, capitalize(fmtMonthYear(date))),
      h('span', { class: 'day-meta' }, `${lessons.length} · ${fmtMoney(total)}`),
    ));

    let lastDay = '';
    for (const l of lessons) {
      const k = dayKey(l.startISO);
      if (k !== lastDay) {
        lastDay = k;
        root.appendChild(h('div', { class: 'day-sub', style: { marginTop: '8px' } },
          fmtDateRelative(l.startISO),
        ));
      }
      root.appendChild(lessonRow(l, studentMap[l.studentId]));
    }
  }

  return root;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
