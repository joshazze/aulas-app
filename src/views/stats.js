import { h } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { getState, wipeAccount } from '../lib/state.js';
import { exportEncrypted, importEncrypted } from '../lib/storage.js';
import { setSession } from '../lib/state.js';
import { fmtMoney, fmtMonthShort, startOfMonth } from '../lib/format.js';

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
  let countCompleted = 0;
  let countScheduledFuture = 0;
  const lessonsByMonth = new Map();
  const minutesByStudent = new Map();

  for (const l of data.lessons) {
    const s = studentMap[l.studentId];
    if (!s) continue;
    const value = (l.durationMinutes / 60) * s.hourlyRate;
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
      if (d <= monthAhead) plannedNext28 += value;
    }
  }

  const totalReceived = data.payments.reduce((s, p) => s + p.amount, 0);
  const toReceive = Math.max(0, totalEarned - totalReceived);
  const totalHours = totalMinutes / 60;
  const avgRate = totalHours > 0 ? totalEarned / totalHours : 0;

  root.appendChild(h('div', { class: 'stat-grid' },
    statCard('Recebido', fmtMoney(totalReceived), 'good', `${data.payments.length} pagamentos`),
    statCard('A receber', fmtMoney(toReceive), toReceive > 0 ? 'warn' : '', 'aulas concluídas não pagas'),
    statCard('Ganho total', fmtMoney(totalEarned), '', `${countCompleted} aula${countCompleted === 1 ? '' : 's'}`),
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

  // Settings card
  const meta = getState().meta;
  root.appendChild(h('div', { class: 'chart-card' },
    h('h3', null, 'Conta & backup'),
    h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-sm', onClick: doExport }, 'Exportar backup cifrado'),
      h('button', { class: 'btn btn-sm', onClick: doImport }, 'Importar backup'),
      h('button', { class: 'btn btn-sm btn-danger', onClick: async () => {
        const ok = window.confirm('Apagar TODOS os dados deste dispositivo? Sem volta.');
        if (ok) wipeAccount();
      } }, 'Apagar tudo'),
    ),
    h('p', { class: 'small muted', style: { marginTop: '12px', marginBottom: 0 } },
      `Conta: @${meta?.username}. Dados ficam apenas neste dispositivo; o backup é um JSON cifrado com a mesma senha.`,
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
  const json = await exportEncrypted();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aulas-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function doImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const text = await f.text();
    const pwInput = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
    const result = await openModal({
      title: 'Importar backup',
      body: h('div', null,
        h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Digite a senha do backup. Vai substituir os dados atuais.'),
        h('div', { class: 'field' },
          h('label', null, 'Senha do backup'),
          pwInput,
        ),
      ),
      actions: [
        { label: 'Cancelar', variant: 'btn-ghost', value: null },
        { label: 'Importar', variant: 'btn-primary', onClick: async (_, close) => {
          try {
            const session = await importEncrypted(text, pwInput.value);
            await setSession(session);
            close(true);
            location.hash = '#/';
          } catch (e) {
            alert(e.message);
            return false;
          }
        } },
      ],
    });
  };
  input.click();
}
