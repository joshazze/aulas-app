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
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } else {
    try {
      data = JSON.parse(rawData);
      if (!data || typeof data !== 'object' || !Array.isArray(data.students)) {
        throw new Error('shape inválido');
      }
    } catch {
      data = { ...EMPTY_DATA, settings: { createdAt: meta.createdAt } };
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
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
  if (!parsed || parsed.version !== 2 || !parsed.data || !Array.isArray(parsed.data.students)) {
    throw new Error('Arquivo inválido ou em formato antigo (cifrado).');
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
