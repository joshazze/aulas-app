import { h, icon, copyWithFeedback } from '../components/ui.js';
import { getState, markCalendarAdded } from './state.js';
import { rerender } from './router.js';
import { buildConfirmation } from './whatsapp.js';
import { buildICS, downloadICS, icsFilename } from './ics.js';

let selectionMode = false;
let selectedIds = new Set();
let selectedStudentId = null;

export function getSelectionMode() {
  return selectionMode;
}

export function enterSelection() {
  selectionMode = true;
}

export function exitSelection() {
  selectionMode = false;
  selectedIds = new Set();
  selectedStudentId = null;
}

export function getSelectedIds() {
  return selectedIds;
}

export function getSelectedStudentId() {
  return selectedStudentId;
}

export function isUpcomingScheduled(l) {
  return l.status === 'scheduled' && new Date(l.startISO).getTime() > Date.now();
}

export function toggleSelection(l) {
  if (selectedIds.has(l.id)) {
    selectedIds.delete(l.id);
    if (selectedIds.size === 0) selectedStudentId = null;
    return;
  }
  if (selectedStudentId && l.studentId !== selectedStudentId) return;
  if (!isUpcomingScheduled(l)) return;
  selectedStudentId = l.studentId;
  selectedIds.add(l.id);
}

export function pruneSelection(lessons) {
  if (!selectionMode) return;
  const ids = new Set(lessons.map((l) => l.id));
  selectedIds = new Set([...selectedIds].filter((id) => ids.has(id)));
  if (selectedIds.size === 0) selectedStudentId = null;
}

export function selectionBar(studentMap) {
  const all = getState().data.lessons;
  const lessons = all
    .filter((l) => selectedIds.has(l.id))
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  const student = studentMap[selectedStudentId];
  const count = lessons.length;
  return h('div', { class: 'selection-bar' },
    h('div', { class: 'sb-info' },
      h('strong', null, String(count)),
      ' ',
      count === 1 ? 'aula de ' : 'aulas de ',
      h('strong', null, student?.name || '—'),
    ),
    h('button', {
      class: 'btn btn-sm btn-primary',
      onClick: (e) => copyWithFeedback(buildConfirmation(lessons, student), e.currentTarget),
    }, icon('copy'), 'Copiar'),
    h('button', {
      class: 'btn btn-sm',
      onClick: async () => {
        const ics = buildICS(lessons, studentMap);
        downloadICS(icsFilename('aulas-' + (student?.name || 'aluno')), ics);
        await markCalendarAdded(lessons.map((l) => l.id));
        rerender();
      },
    }, icon('calendar'), 'Calendário'),
    h('button', {
      class: 'btn btn-ghost btn-sm',
      title: 'Sair da seleção',
      onClick: () => { exitSelection(); rerender(); },
    }, icon('x')),
  );
}
