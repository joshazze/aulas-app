import { h, icon, emptyState, copyToClipboard } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { getState, markCalendarAdded, wasEverSynced } from '../lib/state.js';
import { fmtDateRelative, dayKey, fmtMoney } from '../lib/format.js';
import { lessonValue } from '../lib/pricing.js';
import { lessonRow } from './schedule.js';
import { navigate, rerender } from '../lib/router.js';
import { buildSummary } from '../lib/whatsapp.js';
import { buildICS, downloadICS, icsFilename } from '../lib/ics.js';
import {
  getSelectionMode,
  enterSelection,
  exitSelection,
  getSelectedIds,
  pruneSelection,
  selectionBar,
} from '../lib/selection.js';

const SUMMARY_PREFS_KEY = 'aulas:summaryPrefs';

function loadSummaryPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(SUMMARY_PREFS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        include: ['past', 'future', 'both'].includes(raw.include) ? raw.include : 'both',
        showValues: !!raw.showValues,
      };
    }
  } catch {}
  return { include: 'both', showValues: false };
}

function saveSummaryPrefs(prefs) {
  try { localStorage.setItem(SUMMARY_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

async function openSummaryDialog(data) {
  const prefs = loadSummaryPrefs();
  let include = prefs.include;
  let showValues = prefs.showValues;

  const pillRow = (options, current, onPick) => {
    const row = h('div', { class: 'pill-row' });
    const buttons = options.map((opt) => h('button', {
      type: 'button',
      class: `pill${current === opt.value ? ' active' : ''}`,
      onClick: () => {
        current = opt.value;
        for (const b of buttons) b.classList.remove('active');
        const me = buttons.find((b) => b.dataset.value === opt.value);
        if (me) me.classList.add('active');
        onPick(opt.value);
      },
      dataset: { value: opt.value },
    }, opt.label));
    for (const b of buttons) row.appendChild(b);
    return row;
  };

  const body = h('div', {},
    h('div', { class: 'field' },
      h('label', null, 'Quais aulas'),
      pillRow(
        [{ value: 'past', label: 'Dadas' }, { value: 'future', label: 'Marcadas' }, { value: 'both', label: 'Ambas' }],
        include,
        (v) => { include = v; },
      ),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Valores'),
      pillRow(
        [{ value: 'hide', label: 'Ocultar' }, { value: 'show', label: 'Mostrar' }],
        showValues ? 'show' : 'hide',
        (v) => { showValues = v === 'show'; },
      ),
    ),
  );

  return openModal({
    title: 'Resumo p/ WhatsApp',
    body,
    actions: [
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Copiar', variant: 'btn-primary', onClick: async (_, close) => {
        const finalPrefs = { include, showValues };
        saveSummaryPrefs(finalPrefs);
        const text = buildSummary(data, finalPrefs);
        const ok = await copyToClipboard(text);
        close(ok ? 'copied' : 'failed');
      } },
    ],
  });
}

export async function renderDashboard() {
  const root = h('div');
  const { data } = getState();
  const studentMap = Object.fromEntries(data.students.map(s => [s.id, s]));
  const selectionMode = getSelectionMode();

  pruneSelection(data.lessons);

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
  const next7Value = next7.reduce((sum, l) => sum + lessonValue(l, studentMap[l.studentId]), 0);

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

  // Toolbar: Selecionar/Cancelar
  root.appendChild(h('div', { class: 'section-head', style: { marginBottom: '10px' } },
    h('div'),
    h('button', {
      class: 'btn btn-sm' + (selectionMode ? ' btn-danger' : ''),
      onClick: () => {
        if (selectionMode) exitSelection();
        else enterSelection();
        rerender();
      },
    }, selectionMode ? 'Cancelar' : 'Selecionar'),
  ));

  if (!selectionMode) {
    root.appendChild(h('button', {
      class: 'btn btn-block',
      style: { marginBottom: '10px', justifyContent: 'flex-start' },
      onClick: async (e) => {
        const btn = e.currentTarget;
        const original = btn.innerHTML;
        const result = await openSummaryDialog(data);
        if (result === 'copied') {
          btn.textContent = '✓ Copiado';
          btn.disabled = true;
          setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
        } else if (result === 'failed') {
          btn.textContent = 'Falhou ao copiar';
          setTimeout(() => { btn.innerHTML = original; }, 1500);
        }
      },
    }, icon('copy'), 'Copiar resumo p/ WhatsApp'));

    const pendingLessons = data.lessons.filter((l) =>
      !l.addedToCalendar && (
        (l.status === 'scheduled' && new Date(l.startISO).getTime() > Date.now()) ||
        (l.status === 'cancelled' && wasEverSynced(l))
      )
    );
    const pendingTombstones = (data.calendarTombstones || []).map((t) => ({
      id: t.id,
      studentId: null,
      studentName: t.studentName,
      startISO: t.startISO,
      durationMinutes: t.durationMinutes,
      status: 'cancelled',
      calSeq: t.calSeq,
    }));
    const pendingCount = pendingLessons.length + pendingTombstones.length;
    const hasPending = pendingCount > 0;
    root.appendChild(h('button', {
      class: 'btn btn-block',
      style: { marginBottom: '18px', justifyContent: 'flex-start' },
      disabled: !hasPending,
      onClick: hasPending ? async () => {
        const ics = buildICS([...pendingLessons, ...pendingTombstones], studentMap);
        downloadICS(icsFilename('aulas-novas'), ics);
        await markCalendarAdded(pendingLessons.map((l) => l.id), pendingTombstones.map((t) => t.id));
        rerender();
      } : null,
    }, icon('calendar'),
      hasPending
        ? `Sincronizar calendário (${pendingCount})`
        : 'Calendário sincronizado ✓',
    ));
  }

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
    const total = lessons.reduce((sum, l) => sum + lessonValue(l, studentMap[l.studentId]), 0);
    root.appendChild(h('div', { class: 'day-head' },
      h('span', { class: 'day-name' }, fmtDateRelative(lessons[0].startISO)),
      h('span', { class: 'day-meta' }, `${lessons.length} · ${fmtMoney(total)}`),
    ));
    for (const l of lessons) {
      root.appendChild(lessonRow(l, studentMap[l.studentId], { selectable: selectionMode }));
    }
  }

  if (selectionMode && getSelectedIds().size > 0) {
    root.appendChild(selectionBar(studentMap));
  }

  // Floating add button (hide in selection mode to avoid clashing with selection bar)
  if (!selectionMode) {
    root.appendChild(h('button', {
      class: 'btn btn-primary',
      style: { position: 'fixed', right: '20px', bottom: '80px', borderRadius: '999px', padding: '14px 18px', boxShadow: '0 4px 14px rgba(94,234,212,0.3)', zIndex: '5' },
      onClick: () => navigate('/agenda'),
    }, icon('plus'), 'Aula'));
  }

  return root;
}
