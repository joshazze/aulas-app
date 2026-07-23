import { h, showToast } from '../components/ui.js';
import { getState, wipeAllData, setSession, mutate } from '../lib/state.js';
import { exportData, importData } from '../lib/storage.js';
import { fmtMoney, fmtMonthShort, fmtDateLong } from '../lib/format.js';
import { rerender } from '../lib/router.js';
import { lessonValue } from '../lib/pricing.js';
import { totalEarned as settledEarned, totalReceived as settledReceived } from '../lib/settlement.js';

export async function renderStats() {
  const root = h('div');
  const { data } = getState();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthAhead = new Date(todayStart); monthAhead.setDate(monthAhead.getDate() + 28);

  const studentMap = Object.fromEntries(data.students.map(s => [s.id, s]));

  let totalEarned = 0;
  let totalMinutes = 0;
  let plannedNext28 = 0;
  let plannedAllFuture = 0;
  let countCompleted = 0;
  let countScheduledFuture = 0;
  const lessonsByMonth = new Map();
  const minutesByStudent = new Map();

  for (const l of data.lessons) {
    const s = studentMap[l.studentId];
    if (!s) continue;
    const value = lessonValue(l, s);
    const d = new Date(l.startISO);
    if (l.status === 'completed') {
      totalEarned += value;
      totalMinutes += l.durationMinutes;
      countCompleted++;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      lessonsByMonth.set(monthKey, (lessonsByMonth.get(monthKey) || 0) + value);
      minutesByStudent.set(l.studentId, (minutesByStudent.get(l.studentId) || 0) + l.durationMinutes);
    } else if (l.status === 'scheduled' && d >= todayStart) {
      countScheduledFuture++;
      plannedAllFuture += value;
      if (d <= monthAhead) plannedNext28 += value;
    }
  }

  // Saldo corrido com a empresa: um PIX cobre todos os alunos, sem conta por aluno.
  const totalReceived = settledReceived(data);
  const balance = settledEarned(data) - totalReceived;
  const toReceive = Math.max(0, balance);
  const totalHours = totalMinutes / 60;
  const avgRate = totalHours > 0 ? totalEarned / totalHours : 0;

  root.appendChild(h('div', { class: 'stat-grid' },
    statCard('Recebido', fmtMoney(totalReceived), 'good', `${data.payments.length} acerto${data.payments.length === 1 ? '' : 's'}`),
    statCard('A receber', fmtMoney(toReceive), toReceive > 0 ? 'warn' : '',
      toReceive === 0 && balance < -0.005 ? `crédito de ${fmtMoney(-balance)}` : 'saldo corrido (dado menos recebido)'),
    statCard('Ganho total', fmtMoney(totalEarned + plannedAllFuture), '', `${countCompleted} concluídas · ${countScheduledFuture} agendadas`),
    statCard('Planejado', fmtMoney(plannedNext28), 'accent', `próx. 4 semanas · ${countScheduledFuture} agendadas`),
    statCard('Horas trabalhadas', totalHours.toFixed(1).replace('.', ',') + 'h', '', `média ${(totalMinutes / Math.max(countCompleted, 1)).toFixed(0)} min/aula`),
    statCard('R$ médio / hora', fmtMoney(avgRate), 'accent', 'sobre horas concluídas'),
    statCard('Alunos ativos', String(data.students.filter(s => !s.archived).length), '', `${data.students.length} no total`),
    statCard('Próxima aula', nextLessonLabel(data, studentMap), '', ''),
  ));

  // Bar chart: last 6 months
  const chart = h('div', { class: 'chart-card' },
    h('h3', null, 'Ganhos últimos 6 meses'),
  );
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({ d, k, v: lessonsByMonth.get(k) || 0 });
  }
  const max = Math.max(...months.map(m => m.v), 1);
  const bars = h('div', { class: 'bars' });
  for (const m of months) {
    bars.appendChild(h('div', { class: 'bar' },
      h('div', { class: 'val' }, m.v > 0 ? Math.round(m.v).toString() : ''),
      h('div', { class: 'fill', style: { height: `${(m.v / max) * 100}%` } }),
      h('div', { class: 'lbl' }, fmtMonthShort(m.d)),
    ));
  }
  chart.appendChild(bars);
  root.appendChild(chart);

  // Top students by hours
  if (minutesByStudent.size > 0) {
    const topCard = h('div', { class: 'chart-card' }, h('h3', null, 'Top alunos por horas dadas'));
    const sorted = [...minutesByStudent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxMin = sorted[0][1];
    for (const [id, mins] of sorted) {
      const s = studentMap[id];
      const hours = mins / 60;
      topCard.appendChild(h('div', { style: { padding: '8px 0' } },
        h('div', { class: 'row', style: { marginBottom: '4px' } },
          h('div', { style: { width: '8px', height: '8px', borderRadius: '999px', background: s.color } }),
          h('div', { style: { flex: 1, fontWeight: 600, fontSize: '14px' } }, s.name),
          h('div', { class: 'small muted tabular' }, hours.toFixed(1).replace('.', ',') + 'h'),
        ),
        h('div', { style: { height: '6px', background: 'var(--surface-2)', borderRadius: '999px', overflow: 'hidden' } },
          h('div', { style: { width: `${(mins / maxMin) * 100}%`, height: '100%', background: s.color } }),
        ),
      ));
    }
    root.appendChild(topCard);
  }

  // Backup card
  root.appendChild(h('div', { class: 'chart-card' },
    h('h3', null, 'Backup'),
    h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-sm', onClick: doExport }, 'Exportar backup'),
      h('button', { class: 'btn btn-sm', onClick: doImport }, 'Importar backup'),
      h('button', { class: 'btn btn-sm btn-danger', onClick: async () => {
        const ok = window.confirm('Apagar TODOS os dados deste dispositivo? Sem volta.');
        if (ok) wipeAllData();
      } }, 'Apagar tudo'),
    ),
    h('p', { class: 'small muted', style: { marginTop: '12px', marginBottom: 0 } },
      lastBackupLabel(data),
    ),
    h('p', { class: 'small muted', style: { marginTop: '6px', marginBottom: 0 } },
      'Dados ficam apenas neste dispositivo. O backup é um JSON puro — sem senha, qualquer um com o arquivo consegue ler.',
    ),
  ));

  return root;
}

function nextLessonLabel(data, studentMap) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const next = data.lessons
    .filter(l => l.status === 'scheduled' && new Date(l.startISO) >= todayStart)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO))[0];
  if (!next) return '—';
  const s = studentMap[next.studentId];
  const d = new Date(next.startISO);
  return `${s?.name?.split(' ')[0] || '?'} · ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function statCard(label, value, tone, sub) {
  return h('div', { class: 'stat' },
    h('div', { class: 'label' }, label),
    h('div', { class: `value${tone ? ' ' + tone : ''}` }, value),
    sub ? h('div', { class: 'sub' }, sub) : null,
  );
}

async function doExport() {
  const json = exportData();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aulas-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await mutate((d) => { d.settings.lastBackupAt = new Date().toISOString(); });
  showToast('Backup baixado. Guarda o arquivo fora do aparelho (iCloud/Drive).');
  rerender();
}

export function lastBackupLabel(data) {
  const at = data.settings?.lastBackupAt;
  if (!at) return 'Nenhum backup exportado ainda.';
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
  const when = days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias (${fmtDateLong(at)})`;
  return `Último backup: ${when}.`;
}

export function backupIsStale(data) {
  if (data.lessons.length === 0 && data.students.length === 0) return false;
  const at = data.settings?.lastBackupAt;
  if (!at) return true;
  return (Date.now() - new Date(at).getTime()) > 30 * 86400000;
}

function doImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    if (!window.confirm('Importar vai substituir os dados atuais. Continuar?')) return;
    try {
      const text = await f.text();
      const session = importData(text);
      await setSession(session);
      location.hash = '#/';
    } catch (e) {
      alert(e.message);
    }
  };
  input.click();
}
