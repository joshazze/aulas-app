import { h, icon, emptyState, copyWithFeedback } from '../components/ui.js';
import { openModal, confirm } from '../components/modal.js';
import { getState, addLesson, updateLesson, deleteLesson, setLessonStatus, markCalendarAdded } from '../lib/state.js';
import { fmtMoney, fmtTime, fmtDateRelative, fmtMonthYear, toDateTimeLocal, fromDateTimeLocal, startOfMonth, endOfMonth, dayKey, addDays } from '../lib/format.js';
import { rerender } from '../lib/router.js';
import { buildConfirmation } from '../lib/whatsapp.js';
import { buildICS, downloadICS, icsFilename } from '../lib/ics.js';
import {
  getSelectionMode,
  enterSelection,
  exitSelection,
  getSelectedIds,
  getSelectedStudentId,
  toggleSelection,
  isUpcomingScheduled,
  pruneSelection,
  selectionBar,
} from '../lib/selection.js';

let viewMonth = startOfMonth(new Date());

async function lessonDialog(existing, defaultDate) {
  const { data } = getState();
  const students = data.students.filter(s => !s.archived);
  if (students.length === 0) {
    await openModal({
      title: 'Sem alunos',
      body: h('p', null, 'Cadastre um aluno antes de marcar uma aula.'),
      actions: [{ label: 'OK', variant: 'btn-primary', value: null }],
    });
    return null;
  }

  const form = h('form');
  form.append(
    h('div', { class: 'field' },
      h('label', null, 'Aluno'),
      h('select', { name: 'studentId', required: true },
        ...students.map(s => h('option', { value: s.id, selected: existing?.studentId === s.id }, s.name)),
      ),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Data e hora'),
      h('input', {
        name: 'start',
        type: 'datetime-local',
        required: true,
        value: existing ? toDateTimeLocal(existing.startISO) : (defaultDate ? toDateTimeLocal(defaultDate.toISOString()) : ''),
      }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Duração (minutos)'),
      h('input', { name: 'duration', type: 'number', step: '15', min: '15', required: true, value: existing?.durationMinutes ?? 60 }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Notas'),
      h('textarea', { name: 'notes', rows: 2 }, existing?.notes || ''),
    ),
  );

  return openModal({
    title: existing ? 'Editar aula' : 'Nova aula',
    body: form,
    actions: [
      existing && {
        label: 'Apagar',
        variant: 'btn-danger btn-sm',
        close: false,
        onClick: async (_, close) => {
          const ok = await confirm('Apagar esta aula?');
          if (ok) { await deleteLesson(existing.id); close({ deleted: true }); }
        },
      },
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Salvar', variant: 'btn-primary', onClick: async (_, close) => {
        if (!form.reportValidity()) return false;
        close({
          studentId: form.studentId.value,
          startISO: fromDateTimeLocal(form.start.value),
          durationMinutes: form.duration.value,
          notes: form.notes.value,
        });
      } },
    ].filter(Boolean),
  });
}

export async function renderSchedule() {
  const root = h('div');
  const { data } = getState();
  const studentMap = Object.fromEntries(data.students.map(s => [s.id, s]));
  const selectionMode = getSelectionMode();

  pruneSelection(data.lessons);

  // Navigation
  const nav = h('div', { class: 'cal-nav' },
    h('button', { class: 'btn btn-sm', onClick: () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); rerender(); } }, icon('chevronL')),
    h('div', { class: 'month' }, fmtMonthYear(viewMonth)),
    h('button', { class: 'btn btn-sm', onClick: () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); rerender(); } }, icon('chevronR')),
  );
  root.appendChild(nav);

  const head = h('div', { class: 'section-head', style: { marginBottom: '10px' } },
    h('button', { class: 'btn btn-sm', onClick: () => { viewMonth = startOfMonth(new Date()); rerender(); } }, 'Hoje'),
    h('div', { class: 'row', style: { gap: '6px' } },
      h('button', {
        class: 'btn btn-sm' + (selectionMode ? ' btn-danger' : ''),
        onClick: () => {
          if (selectionMode) exitSelection();
          else enterSelection();
          rerender();
        },
      }, selectionMode ? 'Cancelar' : 'Selecionar'),
      h('button', {
        class: 'btn btn-primary btn-sm',
        onClick: async () => {
          const r = await lessonDialog(null, new Date());
          if (r && !r.deleted) { await addLesson(r); rerender(); }
        },
      }, icon('plus'), 'Aula'),
    ),
  );
  root.appendChild(head);

  // Build grid: 7 cols, start on Sunday
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const today = new Date(); today.setHours(0,0,0,0);

  const lessonsByDay = new Map();
  for (const l of data.lessons) {
    const k = dayKey(l.startISO);
    if (!lessonsByDay.has(k)) lessonsByDay.set(k, []);
    lessonsByDay.get(k).push(l);
  }

  const grid = h('div', { class: 'cal-grid' });
  ['D','S','T','Q','Q','S','S'].forEach(d => grid.appendChild(h('div', { class: 'cal-dow' }, d)));

  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const outside = d.getMonth() !== viewMonth.getMonth();
    const isToday = d.getTime() === today.getTime();
    const k = dayKey(d.toISOString());
    const ls = lessonsByDay.get(k) || [];

    const cell = h('div', {
      class: `cal-cell${outside ? ' outside' : ''}${isToday ? ' today' : ''}${ls.length > 0 ? ' has-lessons' : ''}`,
      onClick: async () => {
        const dt = new Date(d);
        dt.setHours(14, 0, 0, 0);
        const r = await lessonDialog(null, dt);
        if (r && !r.deleted) { await addLesson(r); rerender(); }
      },
    },
      h('div', { class: 'num' }, d.getDate()),
      h('div', { class: 'pip-row' },
        ...ls.slice(0, 4).map(l => h('div', {
          class: 'pip',
          style: { background: studentMap[l.studentId]?.color || '#5eead4' },
        })),
      ),
    );
    grid.appendChild(cell);
    if (d > monthEnd && i % 7 === 6) break; // stop at end of week containing month end
  }
  root.appendChild(grid);

  // List below the grid: all future scheduled lessons (independente do mês visualizado).
  const nowMs = Date.now();
  const futureLessons = data.lessons
    .filter((l) => {
      const t = new Date(l.startISO).getTime();
      if (t < nowMs) return false;
      if (selectionMode && !isUpcomingScheduled(l)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  root.appendChild(h('div', { class: 'cal-list' }));
  if (futureLessons.length === 0) {
    root.appendChild(emptyState('Sem aulas futuras', 'Toque em um dia ou no botão Aula pra adicionar.'));
  } else {
    let lastDay = '';
    for (const l of futureLessons) {
      const s = studentMap[l.studentId];
      const k = dayKey(l.startISO);
      if (k !== lastDay) {
        lastDay = k;
        root.appendChild(h('div', { class: 'day-head', style: { marginTop: '14px' } },
          h('span', { class: 'day-name' }, fmtDateRelative(l.startISO)),
        ));
      }
      root.appendChild(lessonRow(l, s, { selectable: selectionMode }));
    }
  }

  if (selectionMode && getSelectedIds().size > 0) {
    root.appendChild(selectionBar(studentMap));
  }

  return root;
}

export function lessonRow(l, s, opts = {}) {
  const valor = ((l.durationMinutes / 60) * (s?.hourlyRate || 0));
  const isUpcoming = isUpcomingScheduled(l);
  const selectable = opts.selectable;
  const selectedIds = getSelectedIds();
  const selectedStudentId = getSelectedStudentId();
  const selected = selectable && selectedIds.has(l.id);
  const eligible = isUpcoming && (!selectedStudentId || l.studentId === selectedStudentId || selected);
  const disabled = selectable && !eligible;

  return h('div', {
    class: `lesson ${l.status}${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`,
    onClick: selectable ? () => { toggleSelection(l); rerender(); } : null,
  },
    selectable && h('div', { class: 'sel-check' }, selected ? icon('check') : null),
    h('div', { class: 'dot', style: { background: s?.color || '#5eead4' } }),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, s?.name || 'Aluno apagado'),
      h('div', { class: 'meta' },
        fmtTime(l.startISO),
        ' · ',
        (l.durationMinutes / 60).toString().replace('.', ',') + 'h',
        l.notes ? ' · ' + l.notes : '',
      ),
    ),
    h('div', { class: 'price' }, fmtMoney(valor)),
    !selectable && h('div', { class: 'lesson-actions' },
      isUpcoming && h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Copiar confirmação p/ WhatsApp',
        onClick: (e) => copyWithFeedback(buildConfirmation(l, s), e.currentTarget),
      }, icon('copy')),
      l.status === 'completed' && h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Reabrir',
        onClick: async () => { await setLessonStatus(l.id, 'scheduled'); rerender(); },
      }, '↺'),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Editar aula',
        onClick: async () => {
          const r = await editLesson(l);
          if (r === 'deleted' || r === 'synced') return rerender();
          if (r) { await updateLesson(l.id, r); rerender(); }
        },
      }, icon('edit')),
    ),
  );
}

async function editLesson(l) {
  const { data } = getState();
  const students = data.students;
  const s = students.find((x) => x.id === l.studentId);
  const form = h('form');
  form.append(
    h('div', { class: 'field' },
      h('label', null, 'Aluno'),
      h('select', { name: 'studentId', required: true },
        ...students.map(s => h('option', { value: s.id, selected: l.studentId === s.id }, s.name)),
      ),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Data e hora'),
      h('input', { name: 'start', type: 'datetime-local', required: true, value: toDateTimeLocal(l.startISO) }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Duração (minutos)'),
      h('input', { name: 'duration', type: 'number', step: '15', min: '15', required: true, value: l.durationMinutes }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Status'),
      h('select', { name: 'status' },
        h('option', { value: 'scheduled', selected: l.status === 'scheduled' }, 'Agendada'),
        h('option', { value: 'completed', selected: l.status === 'completed' }, 'Concluída'),
        h('option', { value: 'cancelled', selected: l.status === 'cancelled' }, 'Cancelada'),
      ),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Notas'),
      h('textarea', { name: 'notes', rows: 2 }, l.notes || ''),
    ),
  );
  const readForm = () => ({
    studentId: form.studentId.value,
    startISO: fromDateTimeLocal(form.start.value),
    durationMinutes: form.duration.value,
    status: form.status.value,
    notes: form.notes.value,
  });
  return openModal({
    title: 'Editar aula',
    body: form,
    actions: [
      {
        label: [icon('calendar'), 'Calendário'],
        variant: 'btn-sm',
        close: false,
        onClick: async (_, close) => {
          if (!form.reportValidity()) return;
          await updateLesson(l.id, readForm());
          const { data } = getState();
          const saved = data.lessons.find((x) => x.id === l.id);
          const student = data.students.find((x) => x.id === saved.studentId);
          const ics = buildICS([saved], { [saved.studentId]: student });
          downloadICS(icsFilename('aula-' + (student?.name || 'aluno')), ics);
          await markCalendarAdded([saved.id]);
          close('synced');
        },
      },
      {
        label: 'Apagar',
        variant: 'btn-danger btn-sm',
        close: false,
        onClick: async (_, close) => {
          const ok = await confirm('Apagar esta aula?');
          if (ok) { await deleteLesson(l.id); close('deleted'); }
        },
      },
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Salvar', variant: 'btn-primary', onClick: async (_, close) => {
        if (!form.reportValidity()) return false;
        close(readForm());
      } },
    ],
  });
}
