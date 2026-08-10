import { toDateTimeLocal } from './format.js';

// Canal de calendário do app: em vez de baixar .ics, o app copia um prompt que
// o Josh cola numa conversa com o Claude no Mac, e o Claude escreve no
// Calendar.app via EventKit. O prompt é autoexplicativo de propósito: a
// instrução viaja junto dos dados, sem depender de skill instalada.
//
// O calendário Odin já tinha 50 aulas criadas por outro script, tituladas
// "Aula <Nome completo>" e sem nota nenhuma. Por isso o título novo segue o
// mesmo formato e a regra 2 do cabeçalho manda adotar em vez de duplicar.

export const CALENDARIO_DESTINO = 'Odin';
export const MARCA = 'aulas-app';

// Os hifens daqui pra baixo são separador de data ISO e de intervalo de hora
// dentro de uma tabela que o Claude lê. Não são pontuação de prosa.
function local(iso) {
  return toDateTimeLocal(iso).replace('T', ' ');
}

function hhmm(iso) {
  return local(iso).slice(11);
}

function endISO(startISO, durationMinutes) {
  const t = new Date(startISO).getTime() + (Number(durationMinutes) || 60) * 60_000;
  return new Date(t).toISOString();
}

export function calSlot(startISO, durationMinutes) {
  const fim = endISO(startISO, durationMinutes);
  const viraODia = local(fim).slice(0, 10) !== local(startISO).slice(0, 10);
  return `${local(startISO)}-${hhmm(fim)}${viraODia ? ' (+1 dia)' : ''}`;
}

function umaLinha(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

// true se a aula já foi pro calendário alguma vez. Espelha wasEverSynced de
// state.js; fica duplicado aqui de propósito pra este módulo não importar
// state.js (e com ele o localStorage) só por causa de um predicado de uma linha.
function jaFoi(l) {
  return !!(l.calSynced || l.addedToCalendar);
}

// Deriva a operação de cada aula e de cada tombstone.
// CRIAR    = nunca foi pro calendário.
// MOVER    = já foi, e mudou desde então.
// CANCELAR = aula cancelada que já tinha ido, ou aula apagada (tombstone).
// Aula cancelada que nunca foi não vira operação nenhuma: não há evento pra remover.
export function calendarOps(lessons, tombstones = [], studentMap = {}) {
  const ops = [];
  for (const l of lessons) {
    const nome = studentMap[l.studentId]?.name || l.studentName || 'aluno';
    const sincronizada = jaFoi(l);
    if (l.status === 'cancelled' && !sincronizada) continue;
    ops.push({
      op: l.status === 'cancelled' ? 'CANCELAR' : sincronizada ? 'MOVER' : 'CRIAR',
      id: l.id,
      startISO: l.startISO,
      durationMinutes: Number(l.durationMinutes) || 60,
      name: nome,
      fromISO: l.calFrom?.startISO || null,
      fromName: l.calFrom?.name || null,
      notes: l.notes || '',
    });
  }
  for (const t of tombstones) {
    ops.push({
      op: 'CANCELAR',
      id: t.id,
      startISO: t.startISO,
      durationMinutes: Number(t.durationMinutes) || 60,
      name: t.studentName || 'aluno',
      fromISO: null,
      fromName: null,
      notes: '',
    });
  }
  const ordem = { CRIAR: 0, MOVER: 1, CANCELAR: 2 };
  return ops.sort((a, b) =>
    ordem[a.op] - ordem[b.op] || new Date(a.startISO) - new Date(b.startISO));
}

export const CAL_HEADER = [
  `Claude: sincronize estas aulas no Calendar.app do Mac, no calendário "${CALENDARIO_DESTINO}" (source iCloud), com EventKit em Swift compilado por swiftc. Nunca AppleScript: consulta com whose trava em calendário grande. O aulas-app é a fonte da verdade desta lista. Fuso America/Sao_Paulo, os horários abaixo já são locais, no formato AAAA-MM-DD HH:MM.`,
  '',
  'Como achar o evento de cada linha:',
  `1. Procure nas notas do evento a linha "${MARCA}:<id>". Essa marca é a identidade do evento. Achou, é esse e acabou.`,
  '2. Sem a marca, procure no mesmo calendário um evento que comece exatamente na data e hora da linha (no MOVER, na data e hora antiga, a que vem depois de "de") e cujo título cite o nome do aluno. O calendário já tem aulas criadas por outro script, tituladas "Aula <Nome completo>" e sem nota nenhuma. Havendo exatamente um candidato, adote: escreva a marca nas notas e siga. Não crie um gêmeo.',
  '3. Mais de um candidato, ou nenhum num MOVER ou CANCELAR: pare nessa linha, não escreva nada e me avise no fim.',
  '',
  'O que cada verbo pede:',
  'CRIAR: se a marca já existir, não faça nada. Senão adote pela regra 2, e só crie evento novo se não houver candidato.',
  'MOVER: ajuste início e fim do evento marcado. Ajuste o título também, se o nome mudou.',
  'CANCELAR: apague o evento que carrega a marca. Se só houver o candidato da regra 2, sem marca, me pergunte antes de apagar.',
  '',
  'Formato do evento: título "Aula <Nome>", alarme de 15 minutos antes, e nas notas a linha da marca preservada. Havendo linha "notas:" embaixo da operação, o texto dela vai pras notas do evento, acima da marca.',
  '',
  'Regras que não se quebram:',
  `Evento sem a marca "${MARCA}:" e que não bata pela regra 2 é de outro contexto. Não edite, não apague, não mova.`,
  'Se o horário novo cair em cima de um compromisso que já existe, os dois ficam lançados. Nunca resolva choque apagando, encurtando ou movendo o compromisso do outro. Só me avise, com data e hora.',
  'Se uma aula mover ou for cancelada e existir um evento de preparo (título começando com "Preparo da aula") preso ao horário antigo, não mexa nele. Só me avise que o preparo ficou órfão.',
  '',
  'No fim, me diga em lista curta: o que criou, o que adotou, o que moveu, o que apagou, o que ficou pendente de decisão e onde houve choque.',
].join('\n');

function linha(o) {
  const alvo = calSlot(o.startISO, o.durationMinutes);
  const quando = o.op === 'MOVER' && o.fromISO
    ? `de ${local(o.fromISO)} para ${alvo}`
    : alvo;
  const nome = o.op === 'MOVER' && o.fromName && o.fromName !== o.name
    ? `${o.name} (era ${o.fromName})`
    : o.name;
  const out = [`${o.op.padEnd(8)} ${o.id}  ${quando}  ${nome}`];
  if (o.notes) out.push(`         notas: ${umaLinha(o.notes)}`);
  return out.join('\n');
}

export function buildCalendarPrompt(ops) {
  if (!ops.length) return '';
  return `${CAL_HEADER}\n\n${ops.map(linha).join('\n')}`;
}
