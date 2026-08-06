export const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

export function formatCurrency(value = 0) {
  return peso.format(Number(value) || 0);
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat('en-PH').format(Number(value) || 0);
}

export function formatDate(value, options = {}) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function toLocalIsoDate(date) {
  const value = new Date(date);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayIso() {
  return toLocalIsoDate(new Date());
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return toLocalIsoDate(next);
}

export function daysBetween(start, end) {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.ceil((new Date(end) - new Date(start)) / oneDay);
}

export function monthKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(year, month - 1, 1));
}

export function percentage(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().trim();
}

export function normalizeContactNumber(value = '') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('09')) return digits.slice(0, 11);
  if (digits.startsWith('639')) return `09${digits.slice(3, 11)}`.slice(0, 11);
  if (digits.startsWith('63')) return `09${digits.slice(2, 10)}`.slice(0, 11);
  if (digits.startsWith('9')) return `0${digits.slice(0, 10)}`.slice(0, 11);
  if (digits.startsWith('0')) return digits.slice(0, 11);
  return `09${digits.slice(-9)}`.slice(0, 11);
}

export function formatContactNumber(value = '') {
  const normalized = normalizeContactNumber(value);
  return normalized || '';
}

function numericSuffix(value) {
  const match = String(value || '').match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function currentCifYear(date = new Date()) {
  return new Date(date).getFullYear();
}

function randomFiveDigitNumber() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function collectUsedCifSuffixes(members = []) {
  return new Set(members.flatMap((member) => {
    const suffixes = [];
    const cifMatch = String(member.cifNumber || '').match(/^CIFK-\d{4}-(\d{5})$/i);
    const memberMatch = String(member.memberId || '').match(/^CIFK-\d{4}-(\d{5})$/i);
    if (cifMatch?.[1]) suffixes.push(cifMatch[1]);
    if (memberMatch?.[1]) suffixes.push(memberMatch[1]);
    return suffixes;
  }));
}

export function formatCifNumber(member = {}) {
  const cifNumber = String(member.cifNumber || '').trim();
  if (cifNumber) {
    if (/^\d{5}$/.test(cifNumber)) {
      return `CIFK-${currentCifYear()}-${cifNumber}`;
    }
    return cifNumber;
  }
  return 'Not provided';
}

export function nextCifNumber(members = []) {
  const year = currentCifYear();
  const used = collectUsedCifSuffixes(members);
  let suffix = '';
  do {
    suffix = randomFiveDigitNumber();
  } while (used.has(suffix));
  return `CIFK-${year}-${suffix}`;
}
