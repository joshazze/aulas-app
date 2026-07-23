import { persist, wipeAll } from './storage.js';
import { showToast } from '../components/ui.js';

const state = {
  meta: null,
  data: null,
  listeners: new Set(),
};

export function getState() {
  return state;
}

export function hasData() {
  return !!state.data;
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

export async function setSession({ data, meta }) {
  state.data = data;
  state.meta = meta;
  await autoCompletePastLessons();
  notify();
}

// Congela o rate na aula concluída sem override: aula dada é preço fechado,
// mudar o hourlyRate do aluno depois não pode reprecificar o passado.
function freezeRate(d, l) {
  if (l.status !== 'completed' || l.hourlyRate != null) return false;
  const s = d.students.find((x) => x.id === l.studentId);
  if (!s) return false;
  l.hourlyRate = s.hourlyRate;
  return true;
}

let lastAutoCompleteRun = 0;
export async function autoCompletePastLessons() {
  if (!state.data) return 0;
  const now = Date.now();
  if (now - lastAutoCompleteRun < 15_000) return 0;
  lastAutoCompleteRun = now;
  let count = 0;
  for (const l of state.data.lessons) {
    if (l.status === 'scheduled' && new Date(l.startISO).getTime() < now) {
      l.status = 'completed';
      count++;
    }
    if (freezeRate(state.data, l)) count++;
  }
  if (count > 0) {
    safePersist();
  }
  return count;
}

function safePersist() {
  try {
    persist(state.data);
  } catch (e) {
    console.error('persist falhou', e);
    showToast('ERRO: não consegui salvar (armazenamento cheio?). Exporta um backup AGORA em Stats.', { danger: true, duration: 8000 });
  }
}

export function clearSession() {
  state.data = null;
  state.meta = null;
  notify();
}

export function wipeAllData() {
  wipeAll();
  clearSession();
  location.reload();
}

export async function mutate(fn) {
  if (!state.data) throw new Error('Sem dados.');
  fn(state.data);
  // Quota cheia etc.: a memória já mudou mas o disco não. safePersist avisa ALTO,
  // senão a UI mostra como salvo e os dados somem no próximo reload.
  safePersist();
  notify();
}

function uid() {
  return crypto.randomUUID();
}

// true se a aula já foi exportada pro calendário alguma vez.
// Legado: dados antigos não têm calSynced, mas addedToCalendar=true implica sincronizada.
export function wasEverSynced(l) {
  return !!(l.calSynced || l.addedToCalendar);
}

function tombstoneIfSynced(d, l) {
  if (!wasEverSynced(l)) return;
  if (new Date(l.startISO).getTime() <= Date.now()) return;
  const s = d.students.find((x) => x.id === l.studentId);
  (d.calendarTombstones ||= []).push({
    id: l.id,
    calSeq: (l.calSeq || 0) + 1,
    startISO: l.startISO,
    durationMinutes: l.durationMinutes,
    studentName: s?.name || '',
    deletedAt: new Date().toISOString(),
  });
}

// Students --------------------------------------------------
function normalizeExtraRates(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => ({ label: String(r.label || '').trim(), hourlyRate: Number(r.hourlyRate) }))
    .filter((r) => r.label && r.hourlyRate > 0);
}

export async function addStudent({ name, hourlyRate, color, notes, extraRates }) {
  await mutate((d) => {
    d.students.push({
      id: uid(),
      name: name.trim(),
      hourlyRate: Number(hourlyRate) || 0,
      extraRates: normalizeExtraRates(extraRates),
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
    if ('extraRates' in patch) s.extraRates = normalizeExtraRates(patch.extraRates);
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
    for (const l of d.lessons) {
      if (l.studentId === id) tombstoneIfSynced(d, l);
    }
    d.students = d.students.filter((s) => s.id !== id);
    d.lessons = d.lessons.filter((l) => l.studentId !== id);
    d.payments = d.payments.filter((p) => p.studentId !== id);
  });
}

// Lessons ---------------------------------------------------
export async function addLesson({ studentId, startISO, durationMinutes, notes, hourlyRate }) {
  await mutate((d) => {
    const lesson = {
      id: uid(),
      studentId,
      startISO,
      durationMinutes: Number(durationMinutes) || 60,
      status: 'scheduled',
      notes: notes || '',
      addedToCalendar: false,
      createdAt: new Date().toISOString(),
    };
    if (hourlyRate != null && hourlyRate !== '' && Number.isFinite(Number(hourlyRate))) {
      lesson.hourlyRate = Number(hourlyRate);
    }
    d.lessons.push(lesson);
  });
}

export async function updateLesson(id, patch) {
  await mutate((d) => {
    const l = d.lessons.find((x) => x.id === id);
    if (!l) return;
    const affectsCalendar =
      ('startISO' in patch && patch.startISO !== l.startISO) ||
      ('durationMinutes' in patch && Number(patch.durationMinutes) !== l.durationMinutes) ||
      ('studentId' in patch && patch.studentId !== l.studentId) ||
      ('notes' in patch && (patch.notes || '') !== (l.notes || '')) ||
      ('status' in patch && patch.status !== l.status &&
        (patch.status === 'cancelled' || l.status === 'cancelled'));
    const synced = wasEverSynced(l);
    const prevStatus = l.status;
    Object.assign(l, patch);
    if ('durationMinutes' in patch) l.durationMinutes = Number(patch.durationMinutes) || 60;
    if ('hourlyRate' in patch) {
      if (patch.hourlyRate == null || patch.hourlyRate === '' || !Number.isFinite(Number(patch.hourlyRate))) {
        delete l.hourlyRate;
      } else {
        l.hourlyRate = Number(patch.hourlyRate);
      }
    }
    // Reabrir aula concluída: se o congelado é o próprio padrão do aluno,
    // descongela e volta ao dinâmico (o freeze foi automático, não promo).
    if (prevStatus === 'completed' && l.status === 'scheduled') {
      const s = d.students.find((x) => x.id === l.studentId);
      if (s && l.hourlyRate === s.hourlyRate) delete l.hourlyRate;
    }
    freezeRate(d, l);
    if (affectsCalendar) {
      if (synced) {
        l.calSynced = true;
        l.calSeq = (l.calSeq || 0) + 1;
      }
      l.addedToCalendar = false;
    }
  });
}

export async function markCalendarAdded(ids, tombstoneIds = []) {
  const set = new Set(ids);
  await mutate((d) => {
    for (const l of d.lessons) {
      if (set.has(l.id)) {
        l.addedToCalendar = true;
        l.calSynced = true;
      }
    }
    if (tombstoneIds.length && d.calendarTombstones) {
      const gone = new Set(tombstoneIds);
      d.calendarTombstones = d.calendarTombstones.filter((t) => !gone.has(t.id));
    }
  });
}

export async function deleteLesson(id) {
  await mutate((d) => {
    const l = d.lessons.find((x) => x.id === id);
    if (l) tombstoneIfSynced(d, l);
    d.lessons = d.lessons.filter((x) => x.id !== id);
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
