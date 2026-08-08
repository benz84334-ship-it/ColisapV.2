import { todayIso } from './formatters.js';

const DORMANCY_WARNING_MONTHS = 2;
const DORMANT_MONTHS_WITHOUT_DEPOSIT = 3;
const DORMANT_REMINDER_DAYS = Array.from({ length: 30 }, (_, index) => 30 - index);

export function getLastShareCapitalDepositDate(member = {}) {
  return member.lastShareCapitalDepositDate || member.lastCapitalDepositDate || member.membershipDate || member.createdAt || todayIso();
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthDiff(later, earlier) {
  return (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth());
}

export function getMonthsWithoutContribution(member = {}, today = todayIso()) {
  const lastContribution = normalizeDate(getLastShareCapitalDepositDate(member));
  const currentDate = normalizeDate(today);
  if (!lastContribution || !currentDate) return 0;
  if (lastContribution > currentDate) return 0;
  return Math.max(0, monthDiff(currentDate, lastContribution));
}

export function getStatusChangeReason(status) {
  if (status === 'Active') return 'Latest contribution recorded or member returned to active standing.';
  if (status === 'Inactive') return 'No contribution recorded for 1 to 2 consecutive months.';
  if (status === 'Dormant') return 'No contribution recorded for 3 consecutive months.';
  return 'Status recalculated from contribution activity.';
}

export function getNextStatusFromMonths(monthsWithoutContribution) {
  if (monthsWithoutContribution >= DORMANT_MONTHS_WITHOUT_DEPOSIT) return 'Dormant';
  if (monthsWithoutContribution >= 1) return 'Inactive';
  return 'Active';
}

export function getComputedMemberStatus(member = {}, _loans = [], today = todayIso()) {
  return getNextStatusFromMonths(getMonthsWithoutContribution(member, today));
}

export function withComputedMemberStatus(member = {}, loans = [], today = todayIso()) {
  const normalizedMember = {
    ...member,
    lastShareCapitalDepositDate: getLastShareCapitalDepositDate(member),
  };

  return {
    ...normalizedMember,
    status: getComputedMemberStatus(normalizedMember, loans, today),
  };
}

export function applyComputedMemberStatuses(members = [], loans = [], today = todayIso()) {
  return members.map((member) => withComputedMemberStatus(member, loans, today));
}

export function getMembersApproachingStatusChange(members = [], _loans = [], today = todayIso()) {
  return members
    .map((member) => {
      const lastContribution = normalizeDate(getLastShareCapitalDepositDate(member));
      const currentDate = normalizeDate(today);
      if (!lastContribution || !currentDate) return null;

      const monthsWithoutContribution = getMonthsWithoutContribution(member, today);
      if (monthsWithoutContribution < DORMANCY_WARNING_MONTHS) return null;

      const dormantThreshold = new Date(lastContribution);
      dormantThreshold.setMonth(dormantThreshold.getMonth() + DORMANT_MONTHS_WITHOUT_DEPOSIT);
      const daysUntilDormant = Math.ceil((dormantThreshold - currentDate) / (1000 * 60 * 60 * 24));
      const isAlreadyDormant = daysUntilDormant <= 0;

      if (daysUntilDormant > 0 && daysUntilDormant <= 30) {
        return {
          member,
          daysUntilStatusChange: daysUntilDormant,
          projectedStatus: 'Dormant',
          statusChangeDate: dormantThreshold.toISOString().split('T')[0],
          reminderDay: daysUntilDormant,
        };
      }

      if (isAlreadyDormant) {
        return {
          member,
          daysUntilStatusChange: 0,
          projectedStatus: 'Dormant',
          statusChangeDate: dormantThreshold.toISOString().split('T')[0],
          reminderDay: 0,
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function getDormantReminderDays() {
  return [...DORMANT_REMINDER_DAYS];
}
