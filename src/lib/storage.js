import { deriveKey, encryptJSON, decryptJSON, makeVerifier, checkVerifier, randomBytes, toB64, fromB64 } from './crypto.js';

const AUTH_KEY = 'aulas:auth';
const DATA_KEY = 'aulas:data';

const EMPTY_DATA = { students: [], lessons: [], payments: [], settings: { createdAt: null } };

export function hasAccount() {
  return !!localStorage.getItem(AUTH_KEY);
}

export function getAuthMeta() {
  const raw = localStorage.getItem(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function register(username, password) {
  if (hasAccount()) throw new Error('Já existe uma conta neste dispositivo. Faça login.');
  if (!username?.trim()) throw new Error('Informe um nome de usuário.');
  if (!password || password.length < 4) throw new Error('Senha precisa ter pelo menos 4 caracteres.');

  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const verifier = await makeVerifier(key);
  const meta = { username: username.trim(), salt: toB64(salt), verifier };

  const data = { ...EMPTY_DATA, settings: { createdAt: new Date().toISOString() } };
  const blob = await encryptJSON(key, data);

  localStorage.setItem(AUTH_KEY, JSON.stringify(meta));
  localStorage.setItem(DATA_KEY, JSON.stringify(blob));

  return { key, data, meta };
}

export async function login(password) {
  const meta = getAuthMeta();
  if (!meta) throw new Error('Nenhuma conta neste dispositivo. Cadastre-se primeiro.');
  const salt = fromB64(meta.salt);
  const key = await deriveKey(password, salt);
  const ok = await checkVerifier(key, meta.verifier);
  if (!ok) throw new Error('Senha incorreta.');

  const rawBlob = localStorage.getItem(DATA_KEY);
  let data;
  if (!rawBlob) {
    data = { ...EMPTY_DATA, settings: { createdAt: new Date().toISOString() } };
    const blob = await encryptJSON(key, data);
    localStorage.setItem(DATA_KEY, JSON.stringify(blob));
  } else {
    data = await decryptJSON(key, JSON.parse(rawBlob));
  }
  return { key, data, meta };
}

export async function persist(key, data) {
  const blob = await encryptJSON(key, data);
  localStorage.setItem(DATA_KEY, JSON.stringify(blob));
}

export function wipeAll() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(DATA_KEY);
}

export async function exportEncrypted() {
  const meta = localStorage.getItem(AUTH_KEY);
  const blob = localStorage.getItem(DATA_KEY);
  if (!meta || !blob) throw new Error('Nada para exportar.');
  return JSON.stringify({ version: 1, auth: JSON.parse(meta), data: JSON.parse(blob) }, null, 2);
}

export async function importEncrypted(json, password) {
  const parsed = JSON.parse(json);
  if (!parsed?.auth || !parsed?.data) throw new Error('Arquivo inválido.');
  const salt = fromB64(parsed.auth.salt);
  const key = await deriveKey(password, salt);
  const ok = await checkVerifier(key, parsed.auth.verifier);
  if (!ok) throw new Error('Senha não confere com este backup.');
  const data = await decryptJSON(key, parsed.data);
  localStorage.setItem(AUTH_KEY, JSON.stringify(parsed.auth));
  localStorage.setItem(DATA_KEY, JSON.stringify(parsed.data));
  return { key, data, meta: parsed.auth };
}
