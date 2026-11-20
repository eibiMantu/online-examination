'use strict';
const crypto = require('crypto');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REVOKED_KEY = 'revokedSessions';

/* Sessions are sealed tokens (AES-256-GCM): the session travels inside the
   token, encrypted and tamper-proof, so every server instance that shares the
   secret can verify it — no session table and no sticky routing needed.
   Logging out records the session id in the shared `revokedSessions`
   collection (synced through Supabase), so a logout holds on every instance.
   Disabling or archiving an account still ends its sessions immediately,
   because each request re-checks the account. */
function createAuth(store, options = {}) {
  const attempts = new Map();
  const revokedHere = new Map(); // sid -> expiresAt (works even without a writable store)
  const now = options.now || (() => Date.now());
  const key = crypto.createHash('sha256').update(String(options.secret || crypto.randomBytes(32).toString('hex'))).digest();
  const normalizeRole = value => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
    .replace('administrator', 'admin').replace('collegedean', 'dean')
    .replace('facultycoordinator', 'coordinator').replace('professor', 'faculty');
  const equal = (left, right) => {
    const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  function active(user) {
    const status = String(user?.status || 'active').toLowerCase();
    return !!user && user.disabled !== true && user.permissionsDisabled !== true && !['deactivated', 'archived', 'graduated', 'transferred'].includes(status);
  }
  function attemptKey(username, address) { return `${address || 'local'}:${String(username || '').toLowerCase()}`; }
  function rateState(attempt) {
    const current = attempts.get(attempt);
    if (!current || now() - current.startedAt >= ATTEMPT_WINDOW_MS) return { count: 0, startedAt: now() };
    return current;
  }
  function seal(payload) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  function unseal(token) {
    try {
      const raw = Buffer.from(String(token || ''), 'base64url');
      if (raw.length < 29) return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    } catch (_) { return null; }
  }
  const revokedList = () => { try { const list = store.read(REVOKED_KEY, []); return Array.isArray(list) ? list : []; } catch (_) { return []; } };
  const isRevoked = sid => revokedHere.has(sid) || revokedList().some(item => item.sid === sid);

  function login(username, password, address = '') {
    const attempt = attemptKey(username, address), state = rateState(attempt);
    if (state.count >= MAX_ATTEMPTS) {
      const error = new Error('Too many sign-in attempts. Try again in a few minutes.'); error.status = 429; error.code = 'RATE_LIMITED'; throw error;
    }
    const user = store.read('users', []).find(item => item.username === username);
    if (!user || !equal(user.password, password) || !active(user)) {
      attempts.set(attempt, { count: state.count + 1, startedAt: state.startedAt });
      const error = new Error('Those details do not match an active account.'); error.status = 401; error.code = 'INVALID_CREDENTIALS'; throw error;
    }
    attempts.delete(attempt);
    const issuedAt = now();
    const session = { username: user.username, role: normalizeRole(user.role), issuedAt, expiresAt: issuedAt + SESSION_TTL_MS };
    const token = seal({ ...session, sid: crypto.randomBytes(16).toString('hex') });
    return { token, session: { ...session } };
  }
  function tokenFrom(req) {
    const header = String(req.headers.authorization || '');
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  }
  function resolve(token) {
    const sealed = unseal(token);
    if (!sealed || !sealed.sid || sealed.expiresAt <= now() || isRevoked(sealed.sid)) return null;
    const user = store.read('users', []).find(item => item.username === sealed.username && normalizeRole(item.role) === sealed.role);
    if (!active(user)) return null;
    const { username, role, issuedAt, expiresAt } = sealed;
    return { username, role, issuedAt, expiresAt };
  }
  // Sliding renewal: a valid token is exchanged for one with a fresh expiry (same session id,
  // so a logout still ends it everywhere).
  function refresh(token) {
    const sealed = unseal(token);
    if (!resolve(token) || !sealed) return null;
    const issuedAt = now(), next = { ...sealed, issuedAt, expiresAt: issuedAt + SESSION_TTL_MS };
    return { token: seal(next), session: { username: next.username, role: next.role, issuedAt, expiresAt: next.expiresAt } };
  }
  function requireSession(req, roles = []) {
    const session = resolve(tokenFrom(req));
    if (!session) { const error = new Error('Authentication is required.'); error.status = 401; error.code = 'AUTH_REQUIRED'; throw error; }
    if (roles.length && !roles.includes(session.role)) { const error = new Error('This account is not authorized for that action.'); error.status = 403; error.code = 'FORBIDDEN'; throw error; }
    return session;
  }
  function logout(token) {
    const sealed = unseal(token);
    if (!sealed?.sid) return false;
    revokedHere.set(sealed.sid, sealed.expiresAt);
    if (typeof store.write === 'function') {
      const list = revokedList().filter(item => item.expiresAt > now() && item.sid !== sealed.sid);
      store.write(REVOKED_KEY, [...list, { sid: sealed.sid, expiresAt: sealed.expiresAt }]);
    }
    return true;
  }
  // Drops revocations whose tokens have expired anyway.
  function prune() {
    for (const [sid, expiresAt] of revokedHere) if (expiresAt <= now()) revokedHere.delete(sid);
    if (typeof store.write === 'function') {
      const list = revokedList(), kept = list.filter(item => item.expiresAt > now());
      if (kept.length !== list.length) store.write(REVOKED_KEY, kept);
    }
  }
  return { login, logout, resolve, refresh, requireSession, tokenFrom, prune, normalizeRole, active };
}

module.exports = { createAuth, SESSION_TTL_MS };
