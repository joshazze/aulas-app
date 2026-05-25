const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_LONG = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const DATE_FULL = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

export const fmtMoney = (n) => BRL.format(Number(n) || 0);
export const fmtTime = (iso) => TIME.format(new Date(iso));
export const fmtDateLong = (iso) => DATE_LONG.format(new Date(iso));
export const fmtDateFull = (iso) => DATE_FULL.format(new Date(iso));
export const fmtMonthYear = (d) => MONTH_YEAR.format(d);
export const fmtMonthShort = (d) => MONTH_SHORT.format(d);

export function fmtHours(minutes) {
  const h = minutes / 60;
  if (h % 1 === 0) return `${h}h`;
  return `${h.toFixed(1).replace('.', ',')}h`;
}

export function fmtDuration(minutes) {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

const DOW_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DOW_LONG  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

export function fmtCompactDateTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(d) - dayStart(now)) / 86400000);
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  if (diff === 0) return `Hoje (${dd}/${mm}) ${time}`;
  if (diff === 1) return `Amanhã (${dd}/${mm}) ${time}`;
  if (diff === -1) return `Ontem (${dd}/${mm}) ${time}`;
  if (diff > 1 && diff < 7) return `${DOW_LONG[d.getDay()]} (${dd}/${mm}) ${time}`;
  return `${DOW_SHORT[d.getDay()]} ${dd}/${mm} ${time}`;
}

export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function fmtDateRelative(iso) {
  const d = new Date(iso);
  const now = new Date();
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(d) - dayStart(now)) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';
  if (diffDays > 1 && diffDays < 7) {
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  }
  if (diffDays < -1 && diffDays > -7) {
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  }
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()]} ${dd}/${mm}`;
}

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function toDateTimeLocal(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value) {
  return new Date(value).toISOString();
}
