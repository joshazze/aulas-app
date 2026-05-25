import { persist, wipeAll } from './storage.js';

const state = {
  key: null,
  meta: null,
  data: null,
  listeners: new Set(),
};

export function getState() {
  return state;
}

export function isAuthed() {
  return !!state.key;
}

export function subscribe(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function notify() {
  for (const fn of state.listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export async function setSession({ key, data, meta }) {
  state.key = key;
  state.data = data;
  state.meta = meta;
  await autoCompletePastLessons();
  notify();
}

let lastAutoCompleteRun = 0;
export async function autoCompletePastLessons() {
  if (!state.data || !state.key) return 0;
  const now = Date.now();
  if (now - lastAutoCompleteRun < 15_000) return 0;
  lastAutoCompleteRun = now;
  let count = 0;
  for (const l of state.data.lessons) {
    if (l.status !== 'scheduled') continue;
    if (new Date(l.startISO).getTime() < now) {
      l.status = 'completed';
      count++;
    }
  }
  if (count > 0) {
    await persist(state.key, state.data);
  }
  return count;
}

export function clearSession() {
  state.key = null;
  state.data = null;
  state.meta = null;
  notify();
}

export function logout() {
  clearSession();
  location.hash = '#/auth';
}

export function wipeAccount() {
  wipeAll();
  clearSession();
  location.hash = '#/auth';
}

export async function mutate(fn) {
  if (!state.key || !state.data) throw new Error('Sem sessão.');
  fn(state.data);
  await persist(state.key, state.data);
  notify();
}

function uid() {
  return crypto.randomUUID();
}

// Students --------------------------------------------------
export async function addStudent({ name, hourlyRate, color, notes }) {
  await mutate((d) => {
    d.students.push({
      id: uid(),
      name: name.trim(),
      hourlyRate: Number(hourlyRate) || 0,
      color: color || '#5eead4',
      notes: notes || '',
      archived: false,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function updateStudent(id, patch) {
  await mutate((d) => {
    const s = d.students.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    if ('hourlyRate' in patch) s.hourlyRate = Number(patch.hourlyRate) || 0;
  });
}

export async function archiveStudent(id) {
  await updateStudent(id, { archived: true });
}

export async function unarchiveStudent(id) {
  await updateStudent(id, { archived: false });
}

export async function deleteStudent(id) {
  await mutate((d) => {
    d.students = d.students.filter((s) => s.id !== id);
    d.lessons = d.lessons.filter((l) => l.studentId !== id);
    d.payments = d.payments.filter((p) => p.studentId !== id);
  });
}

// Lessons ---------------------------------------------------
export async function addLesson({ studentId, startISO, durationMinutes, notes }) {
  await mutate((d) => {
    d.lessons.push({
      id: uid(),
      studentId,
      startISO,
      durationMinutes: Number(durationMinutes) || 60,
      status: 'scheduled',
      notes: notes || '',
      addedToCalendar: false,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function updateLesson(id, patch) {
  await mutate((d) => {
    const l = d.lessons.find((x) => x.id === id);
    if (!l) return;
    const breaksCalendar =
      ('startISO' in patch && patch.startISO !== l.startISO) ||
      ('durationMinutes' in patch && Number(patch.durationMinutes) !== l.durationMinutes) ||
      ('studentId' in patch && patch.studentId !== l.studentId);
    Object.assign(l, patch);
    if ('durationMinutes' in patch) l.durationMinutes = Number(patch.durationMinutes) || 60;
    if (breaksCalendar) l.addedToCalendar = false;
  });
}

export async function markCalendarAdded(ids) {
  const set = new Set(ids);
  await mutate((d) => {
    for (const l of d.lessons) {
      if (set.has(l.id)) l.addedToCalendar = true;
    }
  });
}

export async function deleteLesson(id) {
  await mutate((d) => {
    d.lessons = d.lessons.filter((l) => l.id !== id);
  });
}

export async function setLessonStatus(id, status) {
  await updateLesson(id, { status });
}

// Payments --------------------------------------------------
export async function addPayment({ studentId, amount, dateISO, method, notes }) {
  await mutate((d) => {
    d.payments.push({
      id: uid(),
      studentId,
      amount: Number(amount) || 0,
      dateISO,
      method: method || 'pix',
      notes: notes || '',
      createdAt: new Date().toISOString(),
    });
  });
}

export async function deletePayment(id) {
  await mutate((d) => {
    d.payments = d.payments.filter((p) => p.id !== id);
  });
}
