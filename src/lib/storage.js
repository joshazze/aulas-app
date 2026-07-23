import { deriveKey, decryptJSON, checkVerifier, fromB64 } from './crypto.js';

const AUTH_KEY = 'aulas:auth';
const DATA_KEY = 'aulas:data';

const EMPTY_DATA = { students: [], lessons: [], payments: [], settings: { createdAt: null } };

function freshMeta() {
  return { createdAt: new Date().toISOString() };
}

function readMeta() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Completa coleções faltantes em vez de descartar o objeto inteiro.
function repairShape(data) {
  for (const k of ['students', 'lessons', 'payments']) {
    if (!Array.isArray(data[k])) data[k] = [];
  }
  // Paridade com o import: backup editado à mão sem method quebraria a lista.
  for (const p of data.payments) {
    p.amount = Number(p.amount) || 0;
    if (typeof p.method !== 'string' || !p.method) p.method = 'pix';
  }
  if (!data.settings || typeof data.settings !== 'object') data.settings = { createdAt: null };
  return data;
}

export function loadOrInit() {
  let meta = readMeta();
  if (!meta || meta.salt || meta.verifier) {
    meta = freshMeta();
    localStorage.setItem(AUTH_KEY, JSON.stringify(meta));
  }
  const rawData = localStorage.getItem(DATA_KEY);
  let data;
  if (!rawData) {
    data = { ...EMPTY_DATA, settings: { createdAt: meta.createdAt } };
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch {}
  } else {
    try {
      data = JSON.parse(rawData);
      if (!data || typeof data !== 'object') throw new Error('shape inválido');
      repairShape(data);
    } catch {
      // Nunca sobrescrever o blob corrompido: copiar pra chave de resgate antes.
      try { localStorage.setItem(DATA_KEY + ':corrompido', rawData); } catch {}
      data = { ...EMPTY_DATA, settings: { createdAt: meta.createdAt } };
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch {}
    }
  }
  return { data, meta };
}

export function persist(data) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function wipeAll() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(DATA_KEY);
}

export function exportData() {
  const rawData = localStorage.getItem(DATA_KEY);
  if (!rawData) throw new Error('Nada para exportar.');
  return JSON.stringify({ version: 2, data: JSON.parse(rawData) }, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 2 || !parsed.data || typeof parsed.data !== 'object' || !Array.isArray(parsed.data.students)) {
    throw new Error('Arquivo inválido ou em formato antigo (cifrado).');
  }
  repairShape(parsed.data);
  for (const p of parsed.data.payments) p.amount = Number(p.amount) || 0;
  for (const l of parsed.data.lessons) {
    l.durationMinutes = Number(l.durationMinutes) || 60;
    if ('hourlyRate' in l && !Number.isFinite(Number(l.hourlyRate))) delete l.hourlyRate;
  }
  for (const s of parsed.data.students) s.hourlyRate = Number(s.hourlyRate) || 0;
  // Snapshot dos dados atuais: um import ruim deixa de ser irreversível.
  const current = localStorage.getItem(DATA_KEY);
  if (current) {
    try { localStorage.setItem(DATA_KEY + ':pre-import', current); } catch {}
  }
  localStorage.setItem(DATA_KEY, JSON.stringify(parsed.data));
  const meta = readMeta() || freshMeta();
  localStorage.setItem(AUTH_KEY, JSON.stringify({ createdAt: meta.createdAt || new Date().toISOString() }));
  return { data: parsed.data, meta: readMeta() };
}

export function legacyEncryptedDataExists() {
  const meta = readMeta();
  return !!(meta && meta.salt && meta.verifier);
}

export async function migrateLegacy(password) {
  const meta = readMeta();
  if (!meta || !meta.salt || !meta.verifier) throw new Error('Nada para migrar.');
  const salt = fromB64(meta.salt);
  const key = await deriveKey(password, salt);
  const ok = await checkVerifier(key, meta.verifier);
  if (!ok) throw new Error('Senha incorreta.');

  const rawBlob = localStorage.getItem(DATA_KEY);
  let data;
  if (rawBlob) {
    const blob = JSON.parse(rawBlob);
    data = await decryptJSON(key, blob);
  } else {
    data = { ...EMPTY_DATA, settings: { createdAt: new Date().toISOString() } };
  }
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
  localStorage.setItem(AUTH_KEY, JSON.stringify({ createdAt: new Date().toISOString() }));
  return { data, meta: readMeta() };
}
