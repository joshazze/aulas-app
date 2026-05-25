import { h, icon, emptyState } from '../components/ui.js';
import { openModal, confirm } from '../components/modal.js';
import { getState, addStudent, updateStudent, archiveStudent, unarchiveStudent, deleteStudent } from '../lib/state.js';
import { fmtMoney } from '../lib/format.js';
import { rerender } from '../lib/router.js';

const COLORS = ['#5eead4','#fbbf24','#f87171','#a78bfa','#60a5fa','#f472b6','#34d399','#fb923c'];

function avatarFor(student) {
  const initials = student.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return h('div', { class: 'avatar', style: { background: student.color } }, initials);
}

async function studentDialog(existing) {
  const form = h('form');
  let selectedColor = existing?.color || COLORS[0];

  const colorPicker = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
  COLORS.forEach((c) => {
    const swatch = h('button', {
      type: 'button',
      style: { width: '28px', height: '28px', borderRadius: '8px', background: c, border: c === selectedColor ? '2px solid #ededee' : '2px solid transparent' },
      onClick: () => {
        selectedColor = c;
        colorPicker.querySelectorAll('button').forEach((b) => { b.style.border = '2px solid transparent'; });
        swatch.style.border = '2px solid #ededee';
      },
    });
    colorPicker.appendChild(swatch);
  });

  form.append(
    h('div', { class: 'field' },
      h('label', null, 'Nome'),
      h('input', { name: 'name', required: true, value: existing?.name || '', placeholder: 'Ex: Pedro Silva' }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Valor por hora (R$)'),
      h('input', { name: 'hourlyRate', type: 'number', step: '0.01', min: '0', required: true, value: existing?.hourlyRate ?? '' }),
    ),
    h('div', { class: 'field' },
      h('label', null, 'Cor'),
      colorPicker,
    ),
    h('div', { class: 'field' },
      h('label', null, 'Notas'),
      h('textarea', { name: 'notes', rows: 2, placeholder: 'Anotações privadas' }, existing?.notes || ''),
    ),
  );

  const result = await openModal({
    title: existing ? 'Editar aluno' : 'Novo aluno',
    body: form,
    actions: [
      { label: 'Cancelar', variant: 'btn-ghost', value: null },
      { label: 'Salvar', variant: 'btn-primary', onClick: async (_, close) => {
        if (!form.reportValidity()) return false;
        const data = {
          name: form.name.value,
          hourlyRate: form.hourlyRate.value,
          color: selectedColor,
          notes: form.notes.value,
        };
        close(data);
      } },
    ],
  });
  return result;
}

export async function renderStudents() {
  const root = h('div');
  const { data } = getState();

  const head = h('div', { class: 'section-head' },
    h('h2', null, 'Alunos'),
    h('button', {
      class: 'btn btn-primary btn-sm',
      onClick: async () => {
        const data = await studentDialog();
        if (data) {
          await addStudent(data);
          rerender();
        }
      },
    }, icon('plus'), 'Novo'),
  );
  root.appendChild(head);

  const active = data.students.filter(s => !s.archived);
  const archived = data.students.filter(s => s.archived);

  if (active.length === 0 && archived.length === 0) {
    root.appendChild(emptyState('Sem alunos ainda', 'Adicione seu primeiro aluno pra começar a marcar aulas.'));
    return root;
  }

  for (const s of active) {
    root.appendChild(studentRow(s));
  }

  if (archived.length > 0) {
    root.appendChild(h('div', { class: 'divider' }));
    root.appendChild(h('p', { class: 'muted small', style: { margin: '0 4px 8px' } }, 'Arquivados'));
    for (const s of archived) root.appendChild(studentRow(s));
  }

  return root;
}

function studentRow(s) {
  const openEdit = async () => {
    const patch = await studentDialog(s);
    if (patch) {
      await updateStudent(s.id, patch);
      rerender();
    }
  };
  return h('div', { class: 'student' + (s.archived ? ' archived' : '') },
    avatarFor(s),
    h('div', {
      class: 'info',
      style: { cursor: 'pointer' },
      title: 'Toque pra editar',
      onClick: openEdit,
    },
      h('div', { class: 'name' }, s.name),
      h('div', { class: 'rate' }, fmtMoney(s.hourlyRate) + ' / hora'),
    ),
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn btn-sm',
        title: 'Editar aluno',
        onClick: openEdit,
      }, icon('edit'), 'Editar'),
      s.archived
        ? h('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await unarchiveStudent(s.id); rerender(); } }, 'Reativar')
        : h('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await archiveStudent(s.id); rerender(); } }, 'Arquivar'),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        title: 'Apagar',
        onClick: async () => {
          const ok = await confirm(`Apagar ${s.name}? Isso também apaga aulas e pagamentos vinculados.`);
          if (ok) { await deleteStudent(s.id); rerender(); }
        },
      }, icon('trash')),
    ),
  );
}
