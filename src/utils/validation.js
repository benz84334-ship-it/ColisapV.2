export function required(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function isPositiveAmount(value) {
  return Number(value) > 0;
}

export function isPhone(value) {
  return /^(\+?63|0)?9\d{9}$/.test(String(value).replace(/\s|-/g, ''));
}

export function dateIsAfter(start, end) {
  return new Date(end) >= new Date(start);
}

export function uniqueBy(items, field, value, currentId) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return !items.some((item) => {
    const sameValue = String(item[field] ?? '').trim().toLowerCase() === normalized;
    return sameValue && item.id !== currentId;
  });
}

export function buildErrorMap(rules) {
  return rules.reduce((errors, rule) => {
    if (!rule.valid) errors[rule.field] = rule.message;
    return errors;
  }, {});
}
