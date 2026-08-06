export function normalizePhilippineMobile(value = '') {
  const raw = String(value || '').replace(/\s+/g, '');
  if (/^09\d{9}$/.test(raw)) return raw;
  if (/^\+639\d{9}$/.test(raw)) return `09${raw.slice(4)}`;
  return '';
}

function createLocalSmsFallback(to, message, meta = {}, reason = 'Backend unavailable; SMS saved locally.') {
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ok: true,
    data: {
      message_id: localId,
      status: 'saved_locally',
      to,
      message,
      saved_locally: true,
      response: {
        saved_locally: true,
        reason,
        member_id: meta.memberId || meta.member_id || null,
        member_name: meta.memberName || meta.member_name || null,
        reminder_day: meta.reminderDay || meta.reminder_day || null,
      },
    },
  };
}

export async function sendSms(to, message, meta = {}) {
  const recipient = normalizePhilippineMobile(to);
  const body = String(message || '').trim();
  if (!recipient || !body) {
    const error = new Error('Invalid recipient phone number. Use 09XXXXXXXXX or +639XXXXXXXXX.');
    error.code = 'INVALID_RECIPIENT';
    throw error;
  }

  return createLocalSmsFallback(recipient, body, meta);
}
