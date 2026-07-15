import { COLLECTION_STATUSES, LOAN_STATUSES, PAYMENT_STATUSES, normalizeBranchName } from './constants.js';
import { monthKey, monthLabel, percentage, todayIso } from './formatters.js';

export function getLoanBalance(loan) {
  return Math.max(Number(loan.totalPayable || 0) - Number(loan.paidAmount || 0), 0);
}

export function getLoanTotalPayable(loan) {
  const principal = Number(loan.principalAmount || 0);
  const interest = Number(loan.interest || 0);
  return Number(loan.totalPayable || 0) || Math.round(principal + principal * (interest / 100));
}

export function getLoanMonthlyPenalty(loan, penaltyRate = loan?.penaltyRate) {
  const principal = Number(loan.principalAmount || 0);
  const rate = Number(penaltyRate ?? loan?.penaltyRate);
  if (!principal || Number.isNaN(rate)) return Math.round(Number(loan?.penalty || 0));
  return Math.round(principal * (rate / 100));
}

export function getOverduePenaltyMonths(loan, referenceDate = todayIso()) {
  const due = new Date(loan?.dueDate);
  const reference = new Date(referenceDate || todayIso());
  if (Number.isNaN(due.getTime()) || Number.isNaN(reference.getTime()) || reference <= due) return 0;

  const calendarMonths = (reference.getFullYear() - due.getFullYear()) * 12 + (reference.getMonth() - due.getMonth());
  return Math.max(1, calendarMonths + (reference.getDate() > due.getDate() ? 1 : 0));
}

export function getLoanAccruedPenalty(loan, referenceDate = todayIso(), penaltyRate) {
  return getLoanMonthlyPenalty(loan, penaltyRate) * getOverduePenaltyMonths(loan, referenceDate);
}

export function getLoanPenaltyPaid(payments = [], loanId, referenceDate) {
  const reference = referenceDate ? new Date(referenceDate) : null;
  return payments
    .filter((payment) => !loanId || payment.loanId === loanId)
    .filter((payment) => {
      if (!reference || Number.isNaN(reference.getTime())) return true;
      const paymentDate = new Date(payment.paymentDate);
      return Number.isNaN(paymentDate.getTime()) || paymentDate <= reference;
    })
    .reduce((sum, payment) => sum + Number(payment.penalty || 0), 0);
}

export function getLoanPenaltyDue(loan, payments = [], referenceDate = todayIso(), penaltyRate) {
  const accruedPenalty = getLoanAccruedPenalty(loan, referenceDate, penaltyRate);
  const paidPenalty = getLoanPenaltyPaid(payments, loan?.id, referenceDate);
  return Math.max(accruedPenalty - paidPenalty, 0);
}

export function getLoanOutstandingBalance(loan, payments = [], referenceDate = todayIso(), penaltyRate) {
  return getLoanBalance(loan) + getLoanPenaltyDue(loan, payments, referenceDate, penaltyRate);
}

export function getLoanTermMonths(loan) {
  const contractMonths = Number(loan.contractMonths || 0);
  if (contractMonths > 0) return Math.ceil(contractMonths);

  const release = new Date(loan.releaseDate);
  const due = new Date(loan.dueDate);
  if (Number.isNaN(release.getTime()) || Number.isNaN(due.getTime()) || due <= release) return 1;

  const days = Math.ceil((due - release) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(days / 30));
}

export function getMonthlyContractAmount(loan) {
  return Math.ceil(getLoanTotalPayable(loan) / getLoanTermMonths(loan));
}

export function getContractAmount(loan) {
  return getMonthlyContractAmount(loan);
}

export function getContractPeriodLabel() {
  return 'Monthly Contract';
}

export function getCollectionTotal(payments) {
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0) + Number(payment.penalty || 0), 0);
}

export function groupByStatus(items, statuses, key = 'status') {
  return statuses.map((status) => ({
    name: status,
    value: items.filter((item) => item[key] === status).length,
  }));
}

export function monthlyCollections(payments) {
  const buckets = payments.reduce((map, payment) => {
    const key = monthKey(payment.paymentDate);
    map[key] = (map[key] || 0) + Number(payment.amount || 0) + Number(payment.penalty || 0);
    return map;
  }, {});

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([key, total]) => ({ month: monthLabel(key), total }));
}

export function monthlyMemberGrowth(members = [], months = 12) {
  const buckets = (members || []).reduce((map, member) => {
    const key = monthKey(member.membershipDate || member.createdAt || new Date().toISOString());
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  const results = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    results.push({ month: monthLabel(key), count: buckets[key] || 0 });
  }

  return results;
}

export function paymentTrend(payments) {
  const buckets = payments.reduce((map, payment) => {
    const key = monthKey(payment.paymentDate);
    map[key] = map[key] || { month: monthLabel(key), regular: 0, penalty: 0 };
    map[key].regular += Number(payment.amount || 0);
    map[key].penalty += Number(payment.penalty || 0);
    return map;
  }, {});

  return Object.values(buckets).slice(-8);
}

export function topPayingMembers(payments, members, limit = 5) {
  const totals = payments.reduce((map, payment) => {
    map[payment.memberId] = (map[payment.memberId] || 0) + Number(payment.amount || 0) + Number(payment.penalty || 0);
    return map;
  }, {});

  return Object.entries(totals)
    .map(([memberId, total]) => ({
      member: members.find((item) => item.id === memberId)?.fullName || 'Unknown member',
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function delayedAccounts(loans, payments = [], limit = 5, penaltyRate) {
  return loans
    .filter((loan) => loan.status === 'Overdue')
    .map((loan) => ({
      loanNumber: loan.loanNumber,
      member: loan.memberName,
      balance: getLoanOutstandingBalance(loan, payments, todayIso(), penaltyRate),
      dueDate: loan.dueDate,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

export function getBranchScopedData(data = {}, branch) {
  const branchName = normalizeBranchName(branch);
  const matchesBranch = (item) => {
    if (!branchName || branchName === 'Main Office') return true;
    return normalizeBranchName(item?.branch) === branchName;
  };

  return {
    ...data,
    members: (data.members || []).filter(matchesBranch),
    loans: (data.loans || []).filter(matchesBranch),
    collections: (data.collections || []).filter(matchesBranch),
    payments: (data.payments || []).filter(matchesBranch),
    availments: (data.availments || []).filter(matchesBranch),
    notifications: (data.notifications || []).filter(matchesBranch),
    activityLogs: (data.activityLogs || []).filter(matchesBranch),
  };
}

export function dashboardStats({ members = [], loans = [], collections = [], payments = [], settings = {} }) {
  const today = todayIso();
  const penaltyRate = settings.penaltyRate;
  const totalCollection = getCollectionTotal(payments);
  const todayCollection = getCollectionTotal(payments.filter((payment) => payment.paymentDate === today));
  const monthlyCollection = getCollectionTotal(payments.filter((payment) => payment.paymentDate?.slice(0, 7) === today.slice(0, 7)));
  const totalPayable = loans.reduce((sum, loan) => sum + Number(loan.totalPayable || 0), 0);
  const totalPaid = loans.reduce((sum, loan) => sum + Number(loan.paidAmount || 0), 0);
  const outstandingBalance = loans.reduce((sum, loan) => sum + getLoanOutstandingBalance(loan, payments, today, penaltyRate), 0);
  const activeLoans = loans.filter((loan) => loan.status === 'Active').length;
  const completedPayments = payments.filter((payment) => payment.status === 'Completed').length;
  const pendingPayments = collections.filter((collection) => ['Pending', 'Partial'].includes(collection.status)).length;
  const overdueAccounts = loans.filter((loan) => loan.status === 'Overdue').length;

  return {
    totalMembers: members.length,
    activeLoans,
    totalCollections: totalCollection,
    todayCollection,
    pendingPayments,
    completedPayments,
    overdueAccounts,
    monthlyCollection,
    outstandingBalance,
    paymentPercentage: percentage(totalPaid, totalPayable),
    collectionEfficiency: percentage(collections.filter((collection) => collection.status === 'Paid').length, collections.length),
  };
}

export function buildDashboardData(data, branch) {
  const scopedData = getBranchScopedData(data, branch);

  return {
    stats: dashboardStats(scopedData),
    collectionTrend: monthlyCollections(scopedData.payments || []),
    paymentTrend: paymentTrend(scopedData.payments || []),
    memberGrowth: monthlyMemberGrowth(scopedData.members || []),
    loanDistribution: groupByStatus(scopedData.loans || [], LOAN_STATUSES),
    paymentStatus: groupByStatus(scopedData.payments || [], PAYMENT_STATUSES),
    collectionStatus: groupByStatus(scopedData.collections || [], COLLECTION_STATUSES),
    topMembers: topPayingMembers(scopedData.payments || [], scopedData.members || []),
    delayedAccounts: delayedAccounts(scopedData.loans || [], scopedData.payments || [], 5, scopedData.settings?.penaltyRate),
  };
}
