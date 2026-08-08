import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  computeDormancyDaysRemaining,
  formatIsoDate as dormancyFormatIsoDate,
  getDormancyMessage,
  isValidPhilippineMobile,
  normalizePhilippineMobile,
  shouldSendDormancyWarning,
} from './dormancy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  throw new Error(`Missing environment file: ${envPath}. Create a root .env with the backend and frontend values.`);
}
dotenv.config({ path: envPath });

const requiredEnv = ['PORT', 'DB_HOST', 'DB_USER', 'DB_NAME', 'SMS_API_URL', 'SMS_API_KEY', 'ADMIN_API_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const PORT = Number(process.env.PORT || 5000);
let pool = null;
let databaseReady = false;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SMS_API_URL = process.env.SMS_API_URL;
const SMS_API_STATUS_URL = String(process.env.SMS_API_STATUS_URL || '').trim();
const SMS_API_KEY = process.env.SMS_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DORMANCY_THRESHOLD_DAYS = Number(process.env.DORMANCY_THRESHOLD_DAYS || 60);
const SMS_OWNER_NUMBER = String(process.env.SMS_OWNER_NUMBER || '').trim();
const isDevelopment = (process.env.NODE_ENV || 'development') !== 'production';
const SMS_DEV_HEALTH_PROBE_ENABLED = String(process.env.SMS_DEV_HEALTH_PROBE_ENABLED || '').trim().toLowerCase() === 'true';
const runtimeDir = path.join(__dirname, 'runtime');
const localQueuePath = path.join(runtimeDir, 'sms-queue.json');
const localLogsPath = path.join(runtimeDir, 'sms-logs.json');
const smsHealthState = {
  checkedAt: 0,
  ok: false,
  reason: 'Not checked yet',
};
const smsHealthBackoffState = {
  failureCount: 0,
  lastFailureAt: 0,
  nextProbeAt: 0,
};
const SMS_HEALTH_PROBE_TIMEOUT_MS = Number(process.env.SMS_HEALTH_PROBE_TIMEOUT_MS || (isDevelopment ? 12000 : 5000));
const SMS_QUEUE_RETRY_BACKOFF_MS = Number(process.env.SMS_QUEUE_RETRY_BACKOFF_MS || 10 * 60_000);
const SMS_QUEUE_RETRY_MAX_BACKOFF_MS = Number(process.env.SMS_QUEUE_RETRY_MAX_BACKOFF_MS || 60 * 60_000);
const smsHealthProbeEnabled = !isDevelopment || SMS_DEV_HEALTH_PROBE_ENABLED;
const smsLocalOnlyMode = true;
const isMysqlConnectionRefused = (error) => String(error?.code || '').toUpperCase() === 'ECONNREFUSED';
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const hasPlaceholderSupabaseAdminKey = !SUPABASE_SERVICE_ROLE_KEY || /your-service-role-key/i.test(SUPABASE_SERVICE_ROLE_KEY);

fs.mkdirSync(runtimeDir, { recursive: true });

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readLocalQueue() {
  return readJsonFile(localQueuePath, []);
}

function writeLocalQueue(queue) {
  writeJsonFile(localQueuePath, queue);
}

function readLocalLogs() {
  return readJsonFile(localLogsPath, []);
}

function writeLocalLogs(logs) {
  writeJsonFile(localLogsPath, logs);
}

function appendLocalLog(entry) {
  const logs = readLocalLogs();
  logs.unshift(entry);
  writeLocalLogs(logs.slice(0, 500));
}

function formatError(error) {
  if (!error) return 'Unknown error';
  const parts = [error.code, error.errno, error.message, error.sqlMessage].filter(Boolean);
  return parts.join(': ');
}

function maskPhone(value = '') {
  const text = String(value || '');
  if (text.length <= 4) return '****';
  return `${text.slice(0, 4)}***${text.slice(-2)}`;
}

function normalizeMobile(value = '') {
  return normalizePhilippineMobile(value);
}

function requireValidMobile(value = '') {
  const normalized = normalizeMobile(value);
  if (!normalized) {
    const error = new Error('Invalid recipient phone number. Use 09XXXXXXXXX or +639XXXXXXXXX.');
    error.status = 400;
    error.code = 'INVALID_RECIPIENT';
    throw error;
  }
  return normalized;
}

function getDormantDate(row = {}) {
  if (row.dormant_date) return new Date(row.dormant_date);
  const lastActivity = row.last_activity_date ? new Date(row.last_activity_date) : null;
  if (!lastActivity || Number.isNaN(lastActivity.getTime())) return null;
  const dormant = new Date(lastActivity);
  dormant.setDate(dormant.getDate() + 30);
  return dormant;
}

function formatIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildSmsMeta(meta = {}) {
  const memberId = meta.memberId || meta.member_id || null;
  const memberName = meta.memberName || meta.member_name || null;
  const reminderDay = meta.reminderDay || meta.reminder_day || null;
  return { memberId, member_id: memberId, memberName, member_name: memberName, reminderDay, reminder_day: reminderDay };
}

function safeSmsBaseUrl() {
  try {
    return new URL(SMS_API_URL);
  } catch {
    return null;
  }
}

function safeSmsStatusUrl(messageId = '') {
  if (SMS_API_STATUS_URL) {
    try {
      return new URL(SMS_API_STATUS_URL);
    } catch {
      return null;
    }
  }

  const base = safeSmsBaseUrl();
  if (!base || !messageId) return null;
  base.pathname = `${base.pathname.replace(/\/send$/, '')}/${encodeURIComponent(messageId)}/status`;
  return base;
}

async function probeSmsUpstream() {
  if (SMS_API_STATUS_URL) {
    const url = safeSmsStatusUrl('health-check');
    if (!url) return { ok: false, reason: 'Invalid SMS_API_STATUS_URL' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`SMS status check timed out after ${Math.round(SMS_HEALTH_PROBE_TIMEOUT_MS / 1000)} seconds`)), SMS_HEALTH_PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': SMS_API_KEY },
        signal: controller.signal,
      });
      const result = { ok: response.ok, status: response.status, reason: response.ok ? null : `SMS status endpoint returned ${response.status}` };
      smsHealthState.checkedAt = Date.now();
      smsHealthState.ok = result.ok;
      smsHealthState.reason = result.reason;
      smsHealthState.status = result.status;
      return result;
    } catch (error) {
      const result = { ok: false, reason: error?.message || 'SMS status endpoint unreachable' };
      smsHealthState.checkedAt = Date.now();
      smsHealthState.ok = result.ok;
      smsHealthState.reason = result.reason;
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  const url = safeSmsBaseUrl();
  if (!url) {
    return { ok: false, reason: 'Invalid SMS_API_URL' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`SMS health check timed out after ${Math.round(SMS_HEALTH_PROBE_TIMEOUT_MS / 1000)} seconds`)), SMS_HEALTH_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'X-API-Key': SMS_API_KEY },
      signal: controller.signal,
    });
    const result = {
      ok: response.ok || response.status === 405,
      status: response.status,
      reason: response.ok || response.status === 405 ? null : `SMS send endpoint returned ${response.status}`,
    };
    smsHealthState.checkedAt = Date.now();
    smsHealthState.ok = result.ok;
    smsHealthState.reason = result.reason;
    smsHealthState.status = result.status;
    return result;
  } catch (error) {
    const result = {
      ok: false,
      reason: error?.message || 'SMS upstream unreachable',
    };
    smsHealthState.checkedAt = Date.now();
    smsHealthState.ok = result.ok;
    smsHealthState.reason = result.reason;
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSmsHealth({ refresh = false } = {}) {
  const ttlMs = isDevelopment ? 30 * 60 * 1000 : 5 * 60 * 1000;
  const now = Date.now();
  if (!smsHealthProbeEnabled) {
    smsHealthState.checkedAt = now;
    smsHealthState.ok = false;
    smsHealthState.reason = 'SMS health probe disabled in local development';
    smsHealthState.status = null;
    return smsHealthState;
  }
  if (!refresh && smsHealthState.checkedAt && (now - smsHealthState.checkedAt) < ttlMs) {
    return smsHealthState;
  }
  if (!refresh && smsHealthBackoffState.nextProbeAt && now < smsHealthBackoffState.nextProbeAt) {
    smsHealthState.checkedAt = now;
    smsHealthState.ok = false;
    smsHealthState.reason = `SMS upstream still in backoff until ${new Date(smsHealthBackoffState.nextProbeAt).toISOString()}`;
    return smsHealthState;
  }

  const result = await probeSmsUpstream();
  smsHealthState.checkedAt = now;
  smsHealthState.ok = result.ok;
  smsHealthState.reason = result.reason || null;
  smsHealthState.status = result.status || null;
  if (result.ok) {
    smsHealthBackoffState.failureCount = 0;
    smsHealthBackoffState.lastFailureAt = 0;
    smsHealthBackoffState.nextProbeAt = 0;
  } else {
    smsHealthBackoffState.failureCount += 1;
    smsHealthBackoffState.lastFailureAt = now;
    const backoffMs = Math.min(SMS_QUEUE_RETRY_MAX_BACKOFF_MS, SMS_QUEUE_RETRY_BACKOFF_MS * smsHealthBackoffState.failureCount);
    smsHealthBackoffState.nextProbeAt = now + backoffMs;
  }
  return smsHealthState;
}

async function sendSms(to, message, meta = {}) {
  const recipient = requireValidMobile(to);
  const smsMeta = buildSmsMeta(meta);
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queuedItem = {
    id: localId,
    ...smsMeta,
    to: recipient,
    message,
    status: 'saved_locally',
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastError: 'SMS sending disabled; saved locally.',
  };
  return {
    message_id: localId,
    status: 'saved_locally',
    to: recipient,
    response: { saved_locally: true, reason: queuedItem.lastError },
    saved_locally: true,
  };
}

async function checkSmsStatus(messageId) {
  return { message_id: messageId, status: 'saved_locally', saved_locally: true };
}

function getMemberDormancyRow(row = {}) {
  const reference = row.last_transaction_date || row.last_activity_date || row.last_share_capital_deposit_date || row.last_contribution_date || row.membership_date || row.created_at;
  return {
    ...row,
    last_activity_date: reference || null,
    days_remaining: computeDormancyDaysRemaining(row, new Date(), DORMANCY_THRESHOLD_DAYS),
  };
}

async function getDormancyCandidates() {
  if (!pool) return [];
  const [rows] = await pool.query(
    `
      SELECT id, member_id, cif_number, full_name, first_name, contact_number, status, status_override,
             application_status, last_transaction_date, last_activity_date, last_share_capital_deposit_date,
             last_contribution_date, membership_date, created_at
      FROM members
      WHERE COALESCE(status_override, status) = 'Active'
    `,
  );

  return rows
    .map(getMemberDormancyRow)
    .filter((member) => shouldSendDormancyWarning(member, member.days_remaining, DORMANCY_THRESHOLD_DAYS))
    .filter((member) => member.days_remaining !== null && member.days_remaining <= 30 && member.days_remaining >= 0);
}

async function getDormancyLogForDay(memberId, scheduledDate, notificationType = 'dormancy_warning') {
  const [rows] = await pool.query(
    `
      SELECT * FROM dormancy_sms_logs
      WHERE member_id = ? AND scheduled_date = ? AND notification_type = ?
      LIMIT 1
    `,
    [memberId, scheduledDate, notificationType],
  );
  return rows[0] || null;
}

async function upsertDormancyLog(entry) {
  const payload = {
    member_id: entry.member_id,
    mobile_number: entry.mobile_number,
    days_remaining: entry.days_remaining,
    message: entry.message,
    message_id: entry.message_id || null,
    api_status: entry.api_status || null,
    delivery_status: entry.delivery_status || 'pending',
    error_message: entry.error_message || null,
    scheduled_date: entry.scheduled_date,
    notification_type: entry.notification_type || 'dormancy_warning',
    attempts: entry.attempts || 0,
    is_dry_run: entry.is_dry_run ? 1 : 0,
    sent_at: entry.sent_at || null,
  };

  await pool.query(
    `
      INSERT INTO dormancy_sms_logs (
        member_id, mobile_number, days_remaining, message, message_id, api_status, delivery_status,
        error_message, scheduled_date, notification_type, attempts, is_dry_run, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mobile_number = VALUES(mobile_number),
        days_remaining = VALUES(days_remaining),
        message = VALUES(message),
        message_id = VALUES(message_id),
        api_status = VALUES(api_status),
        delivery_status = VALUES(delivery_status),
        error_message = VALUES(error_message),
        attempts = VALUES(attempts),
        is_dry_run = VALUES(is_dry_run),
        sent_at = VALUES(sent_at),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      payload.member_id,
      payload.mobile_number,
      payload.days_remaining,
      payload.message,
      payload.message_id,
      payload.api_status,
      payload.delivery_status,
      payload.error_message,
      payload.scheduled_date,
      payload.notification_type,
      payload.attempts,
      payload.is_dry_run,
      payload.sent_at,
    ],
  );
}

async function runDormancyWarnings({ dryRun = false } = {}) {
  if (!pool) {
    return { summary: { checked: 0, queued: 0, skipped: 0, failed: 0, invalid: 0, dryRun: Boolean(dryRun) }, results: [], warning: 'Database unavailable' };
  }

  const today = formatIsoDate(new Date());
  const candidates = await getDormancyCandidates();
  const summary = { checked: candidates.length, queued: 0, skipped: 0, failed: 0, invalid: 0, dryRun: Boolean(dryRun) };
  const results = [];

  for (const member of candidates) {
    const scheduledDate = today;
    const existing = await getDormancyLogForDay(member.id, scheduledDate);
    if (existing) {
      summary.skipped += 1;
      results.push({ memberId: member.id, full_name: member.full_name, status: 'skipped', reason: 'Already sent today' });
      continue;
    }

    const mobile = normalizeMobile(member.contact_number);
    if (!mobile) {
      summary.invalid += 1;
      await upsertDormancyLog({
        member_id: member.id,
        mobile_number: String(member.contact_number || ''),
        days_remaining: member.days_remaining,
        message: '',
        delivery_status: 'failed',
        error_message: 'Invalid contact number',
        scheduled_date: scheduledDate,
        notification_type: 'dormancy_warning',
        attempts: 1,
      });
      results.push({ memberId: member.id, full_name: member.full_name, status: 'invalid', reason: 'Invalid contact number' });
      continue;
    }

    const firstName = String(member.first_name || member.full_name || 'Member').split(' ')[0];
    const message = getDormancyMessage(firstName, member.days_remaining);
    await upsertDormancyLog({
      member_id: member.id,
      mobile_number: mobile,
      days_remaining: member.days_remaining,
      message,
      delivery_status: dryRun ? 'skipped' : 'pending',
      error_message: dryRun ? 'Dry run - not sent' : null,
      scheduled_date: scheduledDate,
      notification_type: 'dormancy_warning',
      attempts: 1,
      is_dry_run: dryRun,
    });

    if (dryRun) {
      summary.skipped += 1;
      results.push({ memberId: member.id, full_name: member.full_name, status: 'dry_run', days_remaining: member.days_remaining });
      continue;
    }

    try {
      const sent = await sendSms(mobile, message);
      await upsertDormancyLog({
        member_id: member.id,
        mobile_number: mobile,
        days_remaining: member.days_remaining,
        message,
        message_id: sent.message_id || null,
        api_status: sent.status || 'queued',
        delivery_status: sent.status === 'queued' || sent.status === 'saved_locally' ? 'queued' : 'sent',
        sent_at: new Date(),
        scheduled_date: scheduledDate,
        notification_type: 'dormancy_warning',
        attempts: 1,
      });
      summary.queued += 1;
      results.push({ memberId: member.id, full_name: member.full_name, status: sent.status || 'queued', message_id: sent.message_id || null, days_remaining: member.days_remaining });
    } catch (error) {
      const retryable = !error?.status || error.status >= 500 || error.code === 'SMS_UPSTREAM_UNREACHABLE';
      await upsertDormancyLog({
        member_id: member.id,
        mobile_number: mobile,
        days_remaining: member.days_remaining,
        message,
        delivery_status: 'failed',
        error_message: error?.message || 'Dormancy SMS failed',
        scheduled_date: scheduledDate,
        notification_type: 'dormancy_warning',
        attempts: retryable ? 1 : 0,
      });
      summary.failed += 1;
      results.push({ memberId: member.id, full_name: member.full_name, status: 'failed', error: error?.message || 'Dormancy SMS failed', days_remaining: member.days_remaining });
    }
  }

  return { summary, results };
}

async function processLocalQueue() {
  const queue = readLocalQueue();
  if (!queue.length) return;

  const nextQueue = [];
  for (const item of queue) {
    try {
      const result = await sendSmsDirect(item.to, item.message, item);
      appendLocalLog({
        ...item,
        event: 'sent-from-queue',
        status: result.status || 'sent',
        message_id: result.message_id || item.id,
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      const attempts = Number(item.attempts || 0) + 1;
      const updated = {
        ...item,
        attempts,
        lastError: error?.message || 'SMS send failed',
      };
      nextQueue.push(updated);
      appendLocalLog({
        ...updated,
        event: 'queue-retry-failed',
        status: 'queued',
        error_message: updated.lastError,
      });
    }
  }

  writeLocalQueue(nextQueue.slice(0, 500));
}

async function sendSmsDirect(to, message, meta = {}) {
  const recipient = requireValidMobile(to);
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const smsMeta = buildSmsMeta(meta);
  return {
    message_id: localId,
    status: 'saved_locally',
    to: recipient,
    response: { saved_locally: true, reason: 'SMS sending disabled; saved locally.' },
    saved_locally: true,
    ...smsMeta,
  };
}

async function ensureTables() {
  if (!pool) throw new Error('Database is not initialized.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      cifk VARCHAR(64) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      contact_number VARCHAR(20) NOT NULL,
      last_activity_date DATE NULL,
      dormant_date DATE NULL,
      member_status ENUM('active','inactive','dormant') NOT NULL DEFAULT 'active',
      sms_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      message_id VARCHAR(191) NULL,
      phone_number VARCHAR(20) NOT NULL,
      notification_type VARCHAR(64) NOT NULL,
      days_before_dormant INT NOT NULL,
      message TEXT NOT NULL,
      status ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
      error_message TEXT NULL,
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_member_notification_days (member_id, notification_type, days_before_dormant),
      CONSTRAINT fk_sms_logs_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);
}

async function ensureDormancyTables() {
  if (!pool) throw new Error('Database is not initialized.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dormancy_sms_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      days_remaining INT NOT NULL,
      message TEXT NOT NULL,
      message_id VARCHAR(191) NULL,
      api_status VARCHAR(64) NULL,
      delivery_status ENUM('pending','sending','sent','failed','queued','skipped') NOT NULL DEFAULT 'pending',
      error_message TEXT NULL,
      scheduled_date DATE NOT NULL,
      notification_type VARCHAR(64) NOT NULL DEFAULT 'dormancy_warning',
      attempts INT NOT NULL DEFAULT 0,
      is_dry_run TINYINT(1) NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_member_schedule_notification (member_id, scheduled_date, notification_type),
      CONSTRAINT fk_dormancy_sms_logs_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS last_transaction_date DATE NULL`);
}

async function getEligibleMembers(daysBeforeDormant = 30) {
  if (!pool) return [];
  const [rows] = await pool.query(
    `
      SELECT id, cifk, full_name, contact_number, last_activity_date, dormant_date, member_status, sms_enabled
      FROM members
      WHERE sms_enabled = 1
        AND member_status = 'active'
        AND DATEDIFF(COALESCE(dormant_date, DATE_ADD(last_activity_date, INTERVAL 30 DAY)), CURDATE()) BETWEEN 0 AND ?
    `,
    [daysBeforeDormant],
  );
  return rows;
}

async function upsertLog(member, payload) {
  if (!pool) return;
  await pool.query(
    `
      INSERT INTO sms_logs (
        member_id, message_id, phone_number, notification_type, days_before_dormant,
        message, status, error_message, attempts, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        message_id = VALUES(message_id),
        phone_number = VALUES(phone_number),
        message = VALUES(message),
        status = VALUES(status),
        error_message = VALUES(error_message),
        attempts = VALUES(attempts),
        sent_at = VALUES(sent_at),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      member.id,
      payload.message_id || null,
      payload.phone_number,
      payload.notification_type,
      payload.days_before_dormant,
      payload.message,
      payload.status,
      payload.error_message || null,
      payload.attempts || 1,
      payload.sent_at || null,
    ],
  );
}

async function runDormancyChecker(daysBeforeDormant = 30) {
  if (!pool) {
    return { summary: { checked: 0, queued: 0, skipped: 0, failed: 0 }, results: [], warning: 'Database unavailable' };
  }
  const members = await getEligibleMembers(daysBeforeDormant);
  const summary = { checked: members.length, queued: 0, skipped: 0, failed: 0 };
  const results = [];

  for (const member of members) {
    const phoneNumber = normalizeMobile(member.contact_number);
    const dormantDate = getDormantDate(member);
    const safeName = member.full_name || 'Member';

    if (!phoneNumber) {
      summary.skipped += 1;
      results.push({ memberId: member.id, status: 'skipped', reason: 'Invalid contact number' });
      continue;
    }

    const [existing] = await pool.query(
      `SELECT id, status, message_id FROM sms_logs WHERE member_id = ? AND notification_type = 'dormancy_30_day' AND days_before_dormant = ? LIMIT 1`,
      [member.id, daysBeforeDormant],
    );
    if (existing.length > 0 && existing[0].status === 'sent') {
      summary.skipped += 1;
      results.push({ memberId: member.id, status: 'skipped', reason: 'Already sent' });
      continue;
    }

    const message = `Hello ${safeName}, this is a reminder from Barbaza MPC. Your account will become dormant in ${daysBeforeDormant} days due to inactivity. Please make a transaction or contact your branch to keep your account active. Thank you.`;

    try {
      await upsertLog(member, {
        phone_number: phoneNumber,
        notification_type: 'dormancy_30_day',
        days_before_dormant: daysBeforeDormant,
        message,
        status: 'sending',
        attempts: existing[0]?.attempts ? Number(existing[0].attempts) + 1 : 1,
      });

      const sent = await sendSms(phoneNumber, message);

      await upsertLog(member, {
        phone_number: phoneNumber,
        notification_type: 'dormancy_30_day',
        days_before_dormant: daysBeforeDormant,
        message,
        status: 'sent',
        message_id: sent.message_id,
        sent_at: new Date(),
        attempts: existing[0]?.attempts ? Number(existing[0].attempts) + 1 : 1,
      });

      summary.queued += 1;
      results.push({
        memberId: member.id,
        cifk: member.cifk,
        full_name: safeName,
        status: 'sent',
        message_id: sent.message_id,
        phone_number: maskPhone(phoneNumber),
        dormant_date: dormantDate ? formatIsoDate(dormantDate) : null,
      });
    } catch (error) {
      summary.failed += 1;
      await upsertLog(member, {
        phone_number: phoneNumber,
        notification_type: 'dormancy_30_day',
        days_before_dormant: daysBeforeDormant,
        message,
        status: 'failed',
        error_message: error?.status === 422 ? 'Customer opted out' : error?.message || 'SMS send failed',
        attempts: existing[0]?.attempts ? Number(existing[0].attempts) + 1 : 1,
      });
      results.push({
        memberId: member.id,
        cifk: member.cifk,
        full_name: safeName,
        status: 'failed',
        phone_number: maskPhone(phoneNumber),
        dormant_date: dormantDate ? formatIsoDate(dormantDate) : null,
      });
    }
  }

  console.log(`Dormancy summary: checked=${summary.checked}, queued=${summary.queued}, skipped=${summary.skipped}, failed=${summary.failed}`);
  return { summary, results };
}

async function retryQueuedSms() {
  const queue = readLocalQueue();
  if (!queue.length) return;

  if (!smsHealthProbeEnabled) return;

  const smsHealth = await getSmsHealth();
  if (!smsHealth.ok) {
    return;
  }

  const remaining = [];
  for (const item of queue) {
    try {
      const result = await sendSmsDirect(item.to, item.message, item);
      appendLocalLog({
        ...item,
        event: 'sent-from-queue',
        status: result.status || 'sent',
        message_id: result.message_id || item.id,
        sent_at: new Date().toISOString(),
        error_message: null,
      });
    } catch (error) {
      const attempts = Number(item.attempts || 0) + 1;
      const nextItem = { ...item, attempts, lastError: error?.message || 'SMS send failed' };
      remaining.push(nextItem);
      appendLocalLog({
        ...nextItem,
        event: 'queue-retry-failed',
        status: 'queued',
        error_message: nextItem.lastError,
      });
    }
  }
  writeLocalQueue(remaining.slice(0, 500));
  if (queue.length) {
    console.log(`SMS queue retry: processed=${queue.length}, remaining=${remaining.length}`);
  }
}

function requireAdmin(req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }
  const token = String(req.headers['x-admin-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '').trim();
  if (!token || token !== ADMIN_API_KEY) {
    res.status(401).json({ ok: false, message: 'Unauthorized' });
    return;
  }
  next();
}

function normalizeNewUserPayload(body = {}) {
  return {
    username: String(body.username || '').trim(),
    password: String(body.password || '').trim(),
    fullName: String(body.fullName || '').trim(),
    role: String(body.role || 'Staff').trim(),
    status: String(body.status || 'Active').trim(),
    branch: String(body.branch || 'Main Office').trim() || 'Main Office',
    email: String(body.email || '').trim(),
    contactNumber: String(body.contactNumber || '').trim(),
  };
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'barbaza-backend', status: 'ready' });
});

app.get('/api/health/sms', async (_req, res) => {
  const upstream = await getSmsHealth({ refresh: smsHealthProbeEnabled });
  res.status(smsHealthProbeEnabled ? (upstream.ok ? 200 : 503) : 200).json({
    ok: upstream.ok,
    service: 'sms-upstream',
    url: SMS_API_URL,
    reachable: upstream.ok,
    status: upstream.status || null,
    reason: upstream.reason || null,
    probeEnabled: smsHealthProbeEnabled,
    development: isDevelopment,
    backoff: {
      failureCount: smsHealthBackoffState.failureCount,
      lastFailureAt: smsHealthBackoffState.lastFailureAt ? new Date(smsHealthBackoffState.lastFailureAt).toISOString() : null,
      nextProbeAt: smsHealthBackoffState.nextProbeAt ? new Date(smsHealthBackoffState.nextProbeAt).toISOString() : null,
      nextProbeInMs: smsHealthBackoffState.nextProbeAt ? Math.max(0, smsHealthBackoffState.nextProbeAt - Date.now()) : 0,
    },
  });
});

app.post('/api/sms/send', async (req, res) => {
  try {
    const to = requireValidMobile(req.body?.to);
    const message = String(req.body?.message || '').trim();
    const meta = {
      memberId: req.body?.member_id || req.body?.memberId || null,
      memberName: req.body?.member_name || req.body?.memberName || null,
      reminderDay: req.body?.reminder_day || req.body?.reminderDay || null,
    };
    if (!message) return res.status(400).json({ ok: false, message: 'Message is required.' });
    const result = await sendSms(to, message, meta);
    let ownerCopy = null;
    const normalizedOwnerNumber = normalizeMobile(SMS_OWNER_NUMBER);
    if (normalizedOwnerNumber && normalizedOwnerNumber !== to) {
      try {
        ownerCopy = await sendSmsDirect(normalizedOwnerNumber, message, {
          ...meta,
          memberName: meta.memberName ? `${meta.memberName} (owner copy)` : 'Owner copy',
        });
      } catch (ownerError) {
        ownerCopy = {
          status: 'failed',
          error: ownerError?.message || 'Failed to send owner copy',
        };
      }
    }
    res.json({ ok: true, ...result, ownerCopy });
  } catch (error) {
    res.status(error?.status || 500).json({
      ok: false,
      code: error?.code || 'SMS_SEND_FAILED',
      message: error?.status === 422 ? 'Customer has opted out' : error?.message || 'SMS send failed',
      error: error?.status === 422 ? 'Customer has opted out' : undefined,
    });
  }
});

app.get('/api/sms/:messageId/status', async (req, res) => {
  try {
    const payload = await checkSmsStatus(req.params.messageId);
    res.json({ ok: true, data: payload });
  } catch (error) {
    res.status(error?.status || 500).json({
      ok: false,
      message: 'SMS status lookup failed',
    });
  }
});

app.get('/api/sms/send-logs', requireAdmin, async (req, res) => {
  if (!databaseReady) {
    return res.json({ ok: true, data: readLocalLogs() });
  }

  const [rows] = await pool.query(
    `
      SELECT l.*, m.cifk, m.full_name, m.contact_number, m.dormant_date, m.member_status
      FROM sms_logs l
      JOIN members m ON m.id = l.member_id
      ORDER BY l.created_at DESC
      LIMIT 200
    `,
  );

  res.json({ ok: true, data: rows });
});

app.get('/api/admin/dormancy-notifications/overview', requireAdmin, async (_req, res) => {
  if (!databaseReady) {
    return res.json({ ok: true, data: { summary: { total: 0, warning: 0, sentToday: 0, queued: 0, failed: 0, invalid: 0 }, rows: [] } });
  }

  const today = formatIsoDate(new Date());
  const [rows] = await pool.query(
    `
      SELECT d.*, m.cifk, m.full_name, m.first_name, m.contact_number, m.status AS member_status, m.status_override
      FROM dormancy_sms_logs d
      JOIN members m ON m.id = d.member_id
      ORDER BY d.created_at DESC
      LIMIT 200
    `,
  );

  const [warningRows] = await pool.query(
    `
      SELECT id, full_name, first_name, contact_number, last_transaction_date, last_activity_date, last_share_capital_deposit_date,
             last_contribution_date, membership_date, created_at, status, status_override
      FROM members
      WHERE COALESCE(status_override, status) = 'Active'
    `,
  );

  const warningCount = warningRows
    .map(getMemberDormancyRow)
    .filter((member) => member.days_remaining !== null && member.days_remaining <= 30 && member.days_remaining >= 0)
    .length;

  const summary = {
    total: warningRows.length,
    warning: warningCount,
    sentToday: rows.filter((row) => row.scheduled_date === today && ['sent', 'queued'].includes(row.delivery_status)).length,
    queued: rows.filter((row) => row.delivery_status === 'queued').length,
    failed: rows.filter((row) => row.delivery_status === 'failed').length,
    invalid: rows.filter((row) => String(row.error_message || '').toLowerCase().includes('invalid contact')).length,
  };

  res.json({ ok: true, data: { summary, rows } });
});

app.post('/api/admin/dormancy-notifications/run', requireAdmin, async (req, res) => {
  try {
    if (!databaseReady) {
      return res.status(503).json({ ok: false, message: 'Database is unavailable.' });
    }
    const dryRun = Boolean(req.body?.dryRun);
    const result = await runDormancyWarnings({ dryRun });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, message: error?.message || 'Dormancy notification run failed' });
  }
});

app.post('/api/dormancy-reminders/run', requireAdmin, async (req, res) => {
  try {
    if (!databaseReady) {
      return res.status(503).json({ ok: false, message: 'Database is unavailable.' });
    }
    const result = await runDormancyWarnings({ dryRun: Boolean(req.body?.dryRun) });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, message: error?.message || 'Dormancy checker failed' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    if (!SUPABASE_URL) {
      return res.status(500).json({ ok: false, message: 'SUPABASE_URL is missing from the root .env file.' });
    }
    if (hasPlaceholderSupabaseAdminKey || !supabaseAdmin) {
      return res.status(500).json({ ok: false, message: 'SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value. Replace it with the real Supabase service role key from your project settings and restart the backend.' });
    }

    const user = normalizeNewUserPayload(req.body);
    if (!user.username || !user.password || !user.fullName) {
      return res.status(400).json({ ok: false, message: 'Username, password, and full name are required.' });
    }
    if (!user.email) {
      return res.status(400).json({ ok: false, message: 'Email is required to create a Supabase Auth user.' });
    }

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        branch: user.branch,
        contact_number: user.contactNumber,
      },
    });
    if (authError) {
      console.error('Supabase Auth createUser failed:', authError);
      throw authError;
    }
    if (!authResult?.user?.id) throw new Error('Supabase Auth did not return a user id.');

    const userRow = {
      id: authResult.user.id,
      username: user.username,
      password: user.password,
      full_name: user.fullName,
      role: user.role,
      status: user.status,
      branch: user.branch,
      email: user.email,
      contact_number: user.contactNumber || null,
      created_at: new Date().toISOString(),
      last_login: null,
      updated_at: new Date().toISOString(),
    };
    const { error: rowError } = await supabaseAdmin.from('users').upsert(userRow, { onConflict: 'id' });
    if (rowError) {
      console.error('Supabase public.users upsert failed:', rowError);
      throw rowError;
    }

    res.json({ ok: true, data: userRow });
  } catch (error) {
    res.status(error?.status || 500).json({ ok: false, message: error?.message || 'Failed to create user.' });
  }
});

app.post('/api/sms/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ ok: false, message: 'Not found' });
  }
  try {
    const to = normalizeMobile(req.body?.to);
    if (!to) return res.status(400).json({ ok: false, message: 'Invalid phone number.' });
    const message = 'Test SMS from Barbaza MPC backend.';
    const result = await sendSms(to, message, { reminderDay: 30, memberName: 'Test Recipient' });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error?.status || 500).json({ ok: false, message: 'Test SMS failed' });
  }
});

app.get('/api/dormancy-notifications', requireAdmin, async (req, res) => {
  if (!databaseReady) {
    return res.status(503).json({ ok: false, message: 'Database is unavailable.' });
  }
  const status = String(req.query.status || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const params = [];
  const where = [];

  if (status) {
    where.push('l.status = ?');
    params.push(status);
  }
  if (from) {
    where.push('l.created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('l.created_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.query(
    `
      SELECT l.*, m.cifk, m.full_name, m.contact_number, m.dormant_date, m.member_status
      FROM sms_logs l
      JOIN members m ON m.id = l.member_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC
      LIMIT 200
    `,
    params,
  );

  res.json({ ok: true, data: rows });
});

app.post('/api/dormancy-notifications/:id/resend', requireAdmin, async (req, res) => {
  try {
    if (!databaseReady) {
      return res.status(503).json({ ok: false, message: 'Database is unavailable.' });
    }
    const [rows] = await pool.query(
      `SELECT m.* FROM sms_logs l JOIN members m ON m.id = l.member_id WHERE l.id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Notification not found' });

    const member = rows[0];
    const phoneNumber = normalizeMobile(member.contact_number);
    if (!phoneNumber) return res.status(400).json({ ok: false, message: 'Invalid contact number' });
    const message = `Hello ${member.full_name}, this is a reminder from Barbaza MPC. Your account will become dormant in 30 days due to inactivity. Please make a transaction or contact your branch to keep your account active. Thank you.`;
    const sent = await sendSms(phoneNumber, message, { memberId: member.id, memberName: member.full_name, reminderDay: 30 });
    res.json({ ok: true, ...sent });
  } catch (error) {
    res.status(error?.status || 500).json({ ok: false, message: 'Resend failed' });
  }
});

app.get('/api/dormancy-reminders/preview', requireAdmin, async (_req, res) => {
  try {
    if (!databaseReady) {
      return res.status(503).json({ ok: false, message: 'Database is unavailable.' });
    }
    const [rows] = await pool.query(
      `
        SELECT id, cifk, full_name, contact_number, last_activity_date, dormant_date, member_status, sms_enabled
        FROM members
        WHERE sms_enabled = 1
      `,
    );
    res.json({
      ok: true,
      data: rows.map((row) => {
        const dormant = getDormantDate(row);
        return {
          ...row,
          dormant_date: dormant ? formatIsoDate(dormant) : null,
          days_before_dormancy: dormant ? Math.ceil((dormant - new Date()) / (1000 * 60 * 60 * 24)) : null,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Preview failed' });
  }
});

async function bootstrap() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: 'Z',
    });
    await pool.getConnection().then((connection) => connection.release());
    await ensureTables();
    await ensureDormancyTables();
    databaseReady = true;
  } catch (error) {
    pool = null;
    databaseReady = false;
    if (isMysqlConnectionRefused(error)) {
      console.info('Database not available in local development; SMS persistence and cron retries are running in local-only mode.');
    } else {
      console.warn(`Database disabled: ${formatError(error)}`);
    }
  }

  cron.schedule('0 8 * * *', async () => {
    try {
      if (!databaseReady) return;
      await runDormancyWarnings({ dryRun: false });
    } catch (error) {
      console.error('Dormancy cron failed:', error.message);
    }
  }, { timezone: 'Asia/Manila' });

  if (!isDevelopment) {
    cron.schedule('* * * * *', async () => {
      try {
        await retryQueuedSms();
      } catch (error) {
        console.error('Queued SMS retry failed:', error.message);
      }
    }, { timezone: 'Asia/Manila' });
  }

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
