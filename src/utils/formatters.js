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

function numericSuffix(value) {
  const match = String(value || '').match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function formatCifNumber(member = {}) {
  const cifNumber = String(member.cifNumber || '').trim();
  if (cifNumber) return cifNumber;

  const memberId = String(member.memberId || '').trim();
  const suffix = numericSuffix(memberId);
  return suffix ? `CIF-${String(suffix).padStart(5, '0')}` : 'Not provided';
}

export function nextCifNumber(members = []) {
  const highest = members.reduce((max, member) => Math.max(max, numericSuffix(member.cifNumber) || numericSuffix(member.memberId)), 0);
  return `CIF-${String(highest + 1).padStart(5, '0')}`;
}
