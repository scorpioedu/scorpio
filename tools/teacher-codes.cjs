/**
 * Pure helpers for scripts/generate-teacher-code.mjs (CSV parsing, record building, idempotency planning).
 * CommonJS so jest and the .mjs script can both load it. No Firebase imports here.
 */
const { randomBytes } = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRES_DAYS = 120;
const DEFAULT_BASE_URL = 'https://scorpioedu.org';
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** RFC 4180-style parser: quoted fields, doubled quotes, commas/newlines inside quotes, CRLF, BOM. */
function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let touched = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') { inQuotes = true; touched = true; }
    else if (ch === ',') { row.push(field); field = ''; touched = true; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (touched || row.some(c => c !== '')) rows.push(row);
      row = []; field = ''; touched = false;
    } else { field += ch; touched = true; }
  }
  row.push(field);
  if (touched || row.some(c => c !== '')) rows.push(row);
  return rows;
}

const normaliseEmail = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Header row required (case-insensitive) with at least email, name, school; other columns are ignored.
 * Returns { contacts: [{email,name,school}], errors: [string] }. Duplicate emails keep the first row.
 */
function parseContacts(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { contacts: [], errors: ['The CSV is empty.'] };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = Object.fromEntries(['email', 'name', 'school'].map(k => [k, header.indexOf(k)]));
  const missing = Object.keys(idx).filter(k => idx[k] < 0);
  if (missing.length) return { contacts: [], errors: [`Missing column(s): ${missing.join(', ')}. The header row needs email,name,school.`] };
  const contacts = [];
  const errors = [];
  const seen = new Set();
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const email = normaliseEmail(cells[idx.email]);
    if (!email) { errors.push(`Row ${line}: missing email, skipped.`); return; }
    if (!EMAIL_RE.test(email)) { errors.push(`Row ${line}: "${email}" is not a valid email, skipped.`); return; }
    if (seen.has(email)) { errors.push(`Row ${line}: duplicate of ${email}, skipped.`); return; }
    seen.add(email);
    contacts.push({ email, name: (cells[idx.name] ?? '').trim(), school: (cells[idx.school] ?? '').trim() });
  });
  return { contacts, errors };
}

function generateCode(random = randomBytes) {
  const segment = () => random(2).toString('hex').toUpperCase();
  return `SCORP-${segment()}-${segment()}`;
}

function expiryFrom(now, days) {
  return new Date(now.getTime() + days * DAY_MS);
}

/** The Firestore document body (minus createdAt, which the caller sets with serverTimestamp). */
function buildInviteRecord({ code, contact = null, label = null, organizationId = null, expiresAt }) {
  return {
    code,
    label: label || null,
    organizationId: organizationId || null,
    contactEmail: contact ? normaliseEmail(contact.email) : null,
    contactName: contact?.name || null,
    school: contact?.school || null,
    expiresAt,
    isUsed: false,
    usedAt: null,
    usedBy: null,
    usedByEmail: null,
  };
}

const toDate = (v) => (v instanceof Date ? v : typeof v?.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);

/** An invite that can still be redeemed (not used, not revoked, not expired). */
function isUsableInvite(invite, now = new Date()) {
  if (!invite || invite.isUsed || invite.revokedAt) return false;
  const expires = toDate(invite.expiresAt);
  return !!expires && expires.getTime() > now.getTime();
}

function signupUrl(code, baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl.replace(/\/+$/, '')}/signup?${new URLSearchParams({ teacherInvite: code })}`;
}

/**
 * Decide, per contact, whether to reuse a usable existing code or create one.
 * existingByEmail: Map<email, invite[]> (docs already in Firestore). Newest usable one is reused.
 * Returns [{ contact, code, reused, record|null }] where record is set only for new codes.
 */
function planBatch(contacts, existingByEmail, { label = null, organizationId = null, expiresDays = DEFAULT_EXPIRES_DAYS, now = new Date(), makeCode = generateCode } = {}) {
  const taken = new Set();
  for (const list of existingByEmail.values()) for (const inv of list) if (inv?.code) taken.add(inv.code);
  return contacts.map(contact => {
    const existing = (existingByEmail.get(normaliseEmail(contact.email)) ?? []).filter(inv => isUsableInvite(inv, now));
    existing.sort((a, b) => (toDate(b.expiresAt)?.getTime() ?? 0) - (toDate(a.expiresAt)?.getTime() ?? 0));
    if (existing[0]) return { contact, code: existing[0].code, reused: true, record: null };
    let code = makeCode();
    while (taken.has(code)) code = makeCode();
    taken.add(code);
    return { contact, code, reused: false, record: buildInviteRecord({ code, contact, label, organizationId, expiresAt: expiryFrom(now, expiresDays) }) };
  });
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Mail-merge CSV: email,name,school,code,signupUrl */
function toOutputCsv(plan, baseUrl = DEFAULT_BASE_URL) {
  const header = ['email', 'name', 'school', 'code', 'signupUrl'];
  const lines = plan.map(p => [p.contact.email, p.contact.name, p.contact.school, p.code, signupUrl(p.code, baseUrl)].map(csvCell).join(','));
  return `${[header.join(','), ...lines].join('\n')}\n`;
}

/** input.csv -> input-codes.csv (next to the input). */
function defaultOutPath(inputPath) {
  return /\.csv$/i.test(inputPath) ? inputPath.replace(/\.csv$/i, '-codes.csv') : `${inputPath}-codes.csv`;
}

module.exports = {
  DEFAULT_EXPIRES_DAYS, DEFAULT_BASE_URL, parseCsv, parseContacts, normaliseEmail, generateCode, expiryFrom,
  buildInviteRecord, isUsableInvite, signupUrl, planBatch, toOutputCsv, defaultOutPath,
};
