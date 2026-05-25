const ITERATIONS = 250_000;
const HASH = 'SHA-256';
const KEY_LEN = 256;
const VERIFIER_PLAINTEXT = 'aulas-app-verifier-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function deriveKey(password, saltBytes) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: HASH },
    material,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const data = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toB64(iv), ct: toB64(new Uint8Array(cipher)) };
}

export async function decryptJSON(key, blob) {
  const iv = fromB64(blob.iv);
  const ct = fromB64(blob.ct);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(plain));
}

export async function makeVerifier(key) {
  return encryptJSON(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(key, verifier) {
  try {
    const v = await decryptJSON(key, verifier);
    return v === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
