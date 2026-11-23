// AES-GCM encryption with a key derived from the team password (PBKDF2, SHA-256).
// The page decrypts the same format in the browser with Web Crypto.
import {webcrypto as crypto} from 'node:crypto';

export const ITERATIONS = 250000;
const b64 = (buf) => Buffer.from(buf).toString('base64');

export async function encryptJson(obj, password) {
  if (!password || password.length < 10) throw new Error('TRACKER_PASSWORD must be at least 10 characters.');
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'},
    base, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify(obj)));
  return {v: 1, alg: 'PBKDF2-SHA256/AES-256-GCM', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct)};
}

export async function decryptJson(box, password) {
  const dec = new TextDecoder();
  const from = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: from(box.salt), iterations: box.iterations, hash: 'SHA-256'},
    base, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: from(box.iv)}, key, from(box.data));
  return JSON.parse(dec.decode(pt));
}
