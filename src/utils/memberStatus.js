import { todayIso } from './formatters.js';

const LOW_SHARE_CAPITAL_LIMIT = 2000;
const DORMANT_MONTHS_WITHOUT_DEPOSIT = 3;

export function getLastShareCapitalDepositDate(member = {}) {
  return member.lastShareCapitalDepositDate || member.lastCapitalDepositDate || member.membershipDate || member.createdAt || todayIso();
}

export function getRequiredShareCapitalForLoan(principalAmount = 0) {
  const amount = Number(principalAmount) || 0;
  if (amount >= 60000) return 2000;
  if (amount >= 40000) return 500;
  return 0;
}

function isOutstandingLoan(loan = {}) {
  return loan.status !== 'Completed';
}

function isMemberLoan(member = {}, loan = {}) {
  return Boolean(member.id) && loan.memberId === member.id;
}

export function getRequiredShareCapitalForMember(member = {}, loans = []) {
  return loans.filter((loan) => isOutstandingLoan(loan) && isMemberLoan(member, loan)).reduce((highest, loan) => Math.max(highest, getRequiredShareCapitalForLoan(loan.principalAmount)), 0);
}

export function hasNoShareCapitalDepositForThreeMonths(member = {}, today = todayIso()) {
  const lastDeposit = new Date(getLastShareCapitalDepositDate(member));
  if (Number.isNaN(lastDeposit.getTime())) return false;

  const threshold = new Date(today);
  threshold.setMonth(threshold.getMonth() - DORMANT_MONTHS_WITHOUT_DEPOSIT);
  return lastDeposit <= threshold;
}

export function getComputedMemberStatus(member = {}, loans = [], today = todayIso()) {
  if (['Active', 'Inactive', 'Dormant'].includes(member.statusOverride)) return member.statusOverride;
  const shareCapital = Number(member.shareCapital || 0);
  const requiredShareCapital = getRequiredShareCapitalForMember(member, loans);
  const noDepositForThreeMonths = hasNoShareCapitalDepositForThreeMonths(member, today);

  if (requiredShareCapital > 0 && shareCapital < requiredShareCapital) {
    return noDepositForThreeMonths ? 'Dormant' : 'Inactive';
  }
  if (shareCapital <= LOW_SHARE_CAPITAL_LIMIT && noDepositForThreeMonths) return 'Dormant';
  return 'Active';
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

export function getMembersApproachingStatusChange(members = [], loans = [], today = todayIso()) {
  const oneWeek = 7;
  const oneMonth = 30;

  return members
    .map((member) => {
      const lastDeposit = new Date(getLastShareCapitalDepositDate(member));
      if (Number.isNaN(lastDeposit.getTime())) return null;

      const shareCapital = Number(member.shareCapital || 0);
      const requiredShareCapital = getRequiredShareCapitalForMember(member, loans);
      const currentStatus = getComputedMemberStatus(member, loans, today);

      // Only warn currently active members
      if (currentStatus !== 'Active') return null;

      // Calculate when they would become inactive/dormant
      const dormantThreshold = new Date(lastDeposit);
      dormantThreshold.setMonth(dormantThreshold.getMonth() + DORMANT_MONTHS_WITHOUT_DEPOSIT);

      const daysUntilDormant = Math.ceil((dormantThreshold - new Date(today)) / (1000 * 60 * 60 * 24));
      
      // Check if they're within warning period
      if (daysUntilDormant > 0 && daysUntilDormant <= oneMonth) {
        const projectedStatus = requiredShareCapital > 0 && shareCapital < requiredShareCapital ? 'Inactive' : 'Dormant';
        const timeframe = daysUntilDormant <= oneWeek ? '1 week' : '1 month';
        return {
          member,
          daysUntilStatusChange: daysUntilDormant,
          projectedStatus,
          statusChangeDate: dormantThreshold.toISOString().split('T')[0],
          timeframe,
        };
      }

      return null;
    })
    .filter(Boolean);
}
