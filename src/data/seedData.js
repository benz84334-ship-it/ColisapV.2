import {
  BARANGAYS,
  BRANCH_OPTIONS,
  COLLECTION_SCHEDULES,
  COLLECTION_STATUSES,
  DEFAULT_LOAN_TYPES,
  GENDERS,
  MEMBER_STATUSES,
  PAYMENT_TYPES,
  ROLES,
  AVAILMENT_STATUSES,
  AVAILMENT_TYPES,
} from '../utils/constants.js';
import { getLoanMonthlyPenalty, getLoanOutstandingBalance, getLoanPenaltyDue } from '../utils/analytics.js';
import { addDays, todayIso } from '../utils/formatters.js';
import { applyComputedMemberStatuses } from '../utils/memberStatus.js';

const DEFAULT_PENALTY_RATE = 2;

function createRandom(seed = 43129) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function amount(random, min, max, step = 500) {
  const steps = Math.floor((max - min) / step);
  return min + Math.floor(random() * (steps + 1)) * step;
}

function makeId(prefix, index, size = 4) {
  return `${prefix}-${String(index).padStart(size, '0')}`;
}

function parseSeedDate(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const longMatch = trimmed.match(/^(\d{1,2})[-\s](\w{3})[-\s](\d{4})$/i);
  if (longMatch) {
    const month = monthMap[longMatch[2].toLowerCase()];
    if (month) {
      return `${longMatch[3]}-${month}-${String(longMatch[1]).padStart(2, '0')}`;
    }
  }

  const formalMatch = trimmed.match(/^(\w{3})\s+(\d{1,2}),\s*(\d{4})$/i);
  if (formalMatch) {
    const month = monthMap[formalMatch[1].toLowerCase()];
    if (month) {
      return `${formalMatch[3]}-${month}-${String(formalMatch[2]).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function makeAvatar(name, index) {
  const colors = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${colors[index % colors.length]}"/><circle cx="73" cy="22" r="18" fill="rgba(255,255,255,.18)"/><text x="48" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${initials(name)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function loanStatus(loan, today) {
  if (loan.paidAmount >= loan.totalPayable) return 'Completed';
  if (new Date(loan.releaseDate) > new Date(today)) return 'Pending';
  if (new Date(loan.dueDate) < new Date(today)) return 'Overdue';
  return 'Active';
}

function paymentDateForLoan(random, loan, today) {
  const release = new Date(loan.releaseDate);
  const end = new Date(today) < new Date(loan.dueDate) ? new Date(today) : new Date(loan.dueDate);
  const span = Math.max(1, Math.floor((end - release) / (1000 * 60 * 60 * 24)));
  return addDays(release, Math.floor(random() * span));
}

function makeUsers() {
  const branchUsers = BRANCH_OPTIONS.slice(1).flatMap((branch, branchIndex) => {
    const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const baseId = 3 + branchIndex * 2;

    return [
      {
        id: `USR-${String(baseId).padStart(4, '0')}`,
        username: `admin-${slug}`,
        password: 'admin123',
        fullName: `${branch} Admin`,
        role: ROLES.ADMIN,
        status: 'Active',
        branch,
        email: `admin.${slug}@barbazampc.coop`,
        contactNumber: `09170000${String(baseId + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        lastLogin: null,
      },
      {
        id: `USR-${String(baseId + 1).padStart(4, '0')}`,
        username: `manager-${slug}`,
        password: 'manager123',
        fullName: `${branch} Manager`,
        role: ROLES.MANAGER,
        status: 'Active',
        branch,
        email: `manager.${slug}@barbazampc.coop`,
        contactNumber: `09170000${String(baseId + 2).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        lastLogin: null,
      },
    ];
  });

  return [
    {
      id: 'USR-0001',
      username: 'admin',
      password: 'admin123',
      fullName: 'System Administrator',
      role: ROLES.ADMIN,
      status: 'Active',
      branch: 'Main Office',
      email: 'admin@barbazampc.coop',
      contactNumber: '09170000001',
      createdAt: new Date().toISOString(),
      lastLogin: null,
    },
    {
      id: 'USR-0002',
      username: 'manager',
      password: 'manager123',
      fullName: 'Branch Manager',
      role: ROLES.MANAGER,
      status: 'Active',
      branch: 'Main Office',
      email: 'manager@barbazampc.coop',
      contactNumber: '09170000002',
      createdAt: new Date().toISOString(),
      lastLogin: null,
    },
    ...branchUsers,
  ];
}

function makeMembers(random, today, branches) {
  const firstNames = [
    'Ana',
    'Ramon',
    'Liza',
    'Miguel',
    'Teresa',
    'Nestor',
    'Carmela',
    'Jose',
    'Marites',
    'Daniel',
    'Grace',
    'Elena',
    'Roberto',
    'Fe',
    'Arnel',
    'Janice',
    'Carlo',
    'Rowena',
    'Melchor',
    'Alma',
  ];
  const lastNames = [
    'Alvarez',
    'Bautista',
    'Cruz',
    'Dela Pena',
    'Escario',
    'Flores',
    'Garcia',
    'Herrera',
    'Ilagan',
    'Javier',
    'Lazaro',
    'Mendoza',
    'Navarro',
    'Ocampo',
    'Perez',
    'Quimbo',
    'Ramos',
    'Santos',
    'Torres',
    'Villanueva',
  ];

  const providedMembers = [
    {
      memberId: 'CIFK-2019-000001',
      fullName: 'Arnel Bautista',
      birthdate: parseSeedDate('12-Mar-1985'),
      contactNumber: '09171234567',
      address: 'Tibiao, Antique',
      barangay: 'Tibiao',
      beneficiary: 'Maria Bautista',
      membershipDate: parseSeedDate('Jan 15, 2019'),
      plan: 'Basic Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2019-000002',
      fullName: 'Roberto Lazaro',
      birthdate: parseSeedDate('20-Aug-1978'),
      contactNumber: '09181234567',
      address: 'Tibiao, Antique',
      barangay: 'Tibiao',
      beneficiary: 'Angela Lazaro',
      membershipDate: parseSeedDate('Feb 10, 2019'),
      plan: 'Premium Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2020-000103',
      fullName: 'Janice Mendoza',
      birthdate: parseSeedDate('05-Nov-1990'),
      contactNumber: '09192345678',
      address: 'Barbaza, Antique',
      barangay: 'Barbaza',
      beneficiary: 'Carlo Mendoza',
      membershipDate: parseSeedDate('Apr 08, 2020'),
      plan: 'Basic Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2020-000120',
      fullName: 'Carlo Quimbo',
      birthdate: parseSeedDate('17-May-1987'),
      contactNumber: '09203456789',
      address: 'Culasi, Antique',
      barangay: 'Culasi',
      beneficiary: 'Liza Quimbo',
      membershipDate: parseSeedDate('Jun 21, 2020'),
      plan: 'Premium Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2021-000004',
      fullName: 'Ramon Escario',
      birthdate: parseSeedDate('28-Jan-1982'),
      contactNumber: '09214567890',
      address: 'Tibiao, Antique',
      barangay: 'Tibiao',
      beneficiary: 'Rosa Escario',
      membershipDate: parseSeedDate('Jan 05, 2021'),
      plan: 'Basic Life Savings',
      status: 'Lapsed',
    },
    {
      memberId: 'CIFK-2021-000010',
      fullName: 'Nestor Torres',
      birthdate: parseSeedDate('14-Oct-1989'),
      contactNumber: '09225678901',
      address: 'San Jose, Antique',
      barangay: 'San Jose',
      beneficiary: 'Grace Torres',
      membershipDate: parseSeedDate('Mar 18, 2021'),
      plan: 'Premium Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2022-000015',
      fullName: 'Miguel Herrera',
      birthdate: parseSeedDate('09-Jul-1984'),
      contactNumber: '09236789012',
      address: 'Tibiao, Antique',
      barangay: 'Tibiao',
      beneficiary: 'Helen Herrera',
      membershipDate: parseSeedDate('May 12, 2022'),
      plan: 'Premium Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2022-000017',
      fullName: 'Jose Navarro',
      birthdate: parseSeedDate('02-Dec-1992'),
      contactNumber: '09247890123',
      address: 'Barbaza, Antique',
      barangay: 'Barbaza',
      beneficiary: 'Jenny Navarro',
      membershipDate: parseSeedDate('Jul 30, 2022'),
      plan: 'Basic Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2023-000003',
      fullName: 'Carmela Torres',
      birthdate: parseSeedDate('18-Feb-1993'),
      contactNumber: '09258901234',
      address: 'Tibiao, Antique',
      barangay: 'Tibiao',
      beneficiary: 'Mark Torres',
      membershipDate: parseSeedDate('Jan 09, 2023'),
      plan: 'Premium Life Savings',
      status: 'Active',
    },
    {
      memberId: 'CIFK-2023-000007',
      fullName: 'Nestor Alvarez',
      birthdate: parseSeedDate('30-Jun-1986'),
      contactNumber: '09269012345',
      address: 'Culasi, Antique',
      barangay: 'Culasi',
      beneficiary: 'Joan Alvarez',
      membershipDate: parseSeedDate('Mar 14, 2023'),
      plan: 'Basic Life Savings',
      status: 'Active',
    },
  ];

  const seededMembers = providedMembers.map((member, index) => {
    const shareCapital = amount(random, 500, 50000, 500);
    const branch = branches[index % branches.length];
    const statusOverride = member.status === 'Lapsed' ? 'Inactive' : 'Active';
    return {
      id: makeId('MEM', index + 1),
      memberId: member.memberId,
      cifNumber: makeId('CIF', index + 1, 5),
      fullName: member.fullName,
      address: member.address,
      barangay: member.barangay,
      birthdate: member.birthdate,
      gender: pick(random, GENDERS),
      contactNumber: member.contactNumber,
      membershipDate: member.membershipDate,
      status: statusOverride,
      statusOverride,
      branch,
      shareCapital,
      lastShareCapitalDepositDate:
        shareCapital <= 2000 ? addDays(today, -Math.floor(random() * 180) - 90) : addDays(today, -Math.floor(random() * 90)),
      benefitCategory: member.plan,
      beneficiaries: [{ name: member.beneficiary, age: '', address: member.address, relationship: 'Spouse' }],
      photo: makeAvatar(member.fullName, index),
    };
  });

  const remainingMembers = Array.from({ length: 139 - providedMembers.length }, (_, index) => {
    const fullName = `${pick(random, firstNames)} ${pick(random, lastNames)}`;
    const barangay = pick(random, BARANGAYS);
    const birthYear = 1965 + Math.floor(random() * 39);
    const shareCapital = amount(random, 500, 50000, 500);
    const branch = branches[(providedMembers.length + index) % branches.length];
    const member = {
      id: makeId('MEM', providedMembers.length + index + 1),
      memberId: `CIFK-${today.slice(0, 4)}-${String(providedMembers.length + index + 1).padStart(6, '0')}`,
      cifNumber: makeId('CIF', providedMembers.length + index + 1, 5),
      fullName,
      address: `${Math.floor(random() * 120) + 1} ${barangay}`,
      barangay,
      birthdate: `${birthYear}-${String(Math.floor(random() * 12) + 1).padStart(2, '0')}-${String(
        Math.floor(random() * 27) + 1,
      ).padStart(2, '0')}`,
      gender: pick(random, GENDERS),
      contactNumber: `09${String(100000000 + Math.floor(random() * 899999999)).slice(0, 9)}`,
      membershipDate: addDays(today, -Math.floor(random() * 2400) - 120),
      status: index < 15 ? 'Inactive' : index < 25 ? 'Dormant' : MEMBER_STATUSES[0],
      statusOverride: index < 15 ? 'Inactive' : index < 25 ? 'Dormant' : 'Active',
      branch,
      shareCapital,
      lastShareCapitalDepositDate:
        shareCapital <= 2000 ? addDays(today, -Math.floor(random() * 180) - 90) : addDays(today, -Math.floor(random() * 90)),
    };
    return { ...member, photo: makeAvatar(fullName, providedMembers.length + index) };
  });

  return [...seededMembers, ...remainingMembers];
}

function makeLoans(random, members, today) {
  return Array.from({ length: 100 }, (_, index) => {
    const member = members[index];
    const schedule = pick(random, COLLECTION_SCHEDULES);
    const releaseDate = addDays(today, -Math.floor(random() * 430) + (index % 13 === 0 ? 20 : 0));
    const termDays = schedule === 'Weekly' ? 84 : schedule === 'Biweekly' ? 126 : 180;
    const contractMonths = Math.max(1, Math.ceil(termDays / 30));
    let principal = index < 10 ? 40000 : amount(random, 5000, 120000, 1000);
    if (index >= 10 && principal === 40000) principal = 41000;
    const interestRate = [3, 4, 5, 6][Math.floor(random() * 4)];
    const interestAmount = Math.round(principal * (interestRate / 100));
    const dueDate = addDays(releaseDate, termDays);
    const loan = {
      id: makeId('LOAN', index + 1),
      loanNumber: makeId('CLP', index + 1, 5),
      memberId: member.id,
      memberName: member.fullName,
      principalAmount: principal,
      interest: interestRate,
      interestAmount,
      totalPayable: principal + interestAmount,
      paidAmount: 0,
      loanType: pick(random, DEFAULT_LOAN_TYPES),
      releaseDate,
      dueDate,
      collectionSchedule: schedule,
      contractPeriod: 'Monthly',
      contractMonths,
      penaltyRate: DEFAULT_PENALTY_RATE,
      penalty: getLoanMonthlyPenalty({ principalAmount: principal }, DEFAULT_PENALTY_RATE),
      remarks: random() > 0.7 ? 'Priority monitoring account' : 'Good standing history',
      status: 'Pending',
      branch: member.branch || BRANCH_OPTIONS[0],
      createdAt: addDays(releaseDate, -1),
    };
    return { ...loan, status: loanStatus(loan, today) };
  });
}

function distributePayments(random, loans, today) {
  const payments = [];
  const collectors = ['Maria Santos', 'Joel Alvarez', 'Rhea Flores', 'Victor Ramos'];

  while (payments.length < 250) {
    const loan = pick(random, loans.filter((item) => new Date(item.releaseDate) <= new Date(today)));
    const remaining = Math.max(loan.totalPayable - loan.paidAmount, 0);
    if (remaining <= 0) continue;

    const maxPayment = Math.max(500, Math.min(remaining, loan.totalPayable * 0.2));
    const paymentAmount = Math.min(remaining, amount(random, 500, maxPayment, 250));
    const paymentDate = payments.length < 8 ? today : paymentDateForLoan(random, loan, today);
    const penalty = getLoanPenaltyDue(loan, payments, paymentDate, DEFAULT_PENALTY_RATE);

    loan.paidAmount += paymentAmount;
    loan.status = loanStatus(loan, today);

    payments.push({
      id: makeId('PAY', payments.length + 1),
      receiptNumber: makeId('RCT', payments.length + 1, 6),
      loanNumber: loan.loanNumber,
      loanId: loan.id,
      memberId: loan.memberId,
      memberName: loan.memberName,
      amount: paymentAmount,
      penalty,
      paymentType: pick(random, PAYMENT_TYPES),
      paymentDate,
      method: pick(random, ['Cash', 'GCash', 'Bank Transfer']),
      collectedBy: pick(random, collectors),
      encodedBy: payments.length % 5 === 0 ? 'manager' : 'admin',
      status: 'Completed',
      remarks: penalty ? 'Penalty collected for late payment' : 'Posted to member ledger',
      createdAt: new Date(paymentDate).toISOString(),
      branch: loan.branch,
    });
  }

  loans.forEach((loan) => {
    loan.status = loanStatus(loan, today);
  });

  return payments;
}

function makeCollections(random, loans, payments, today) {
  const collectors = ['Maria Santos', 'Joel Alvarez', 'Rhea Flores', 'Victor Ramos'];
  return loans.slice(0, 100).map((loan, index) => {
    const relatedPayments = payments.filter((payment) => payment.loanId === loan.id);
    const amountPaid = relatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = Math.max(loan.totalPayable - amountPaid, 0);
    const penalty = getLoanPenaltyDue(loan, payments, today, DEFAULT_PENALTY_RATE);
    const collectionDate = index < 15 ? today : addDays(loan.releaseDate, Math.floor(index % 8) * 14);
    const status =
      balance <= 0 && penalty <= 0
        ? COLLECTION_STATUSES[0]
        : penalty > 0 || new Date(loan.dueDate) < new Date(today)
          ? COLLECTION_STATUSES[3]
          : amountPaid > 0
            ? COLLECTION_STATUSES[1]
            : COLLECTION_STATUSES[2];

    return {
      id: makeId('COL', index + 1),
      collectionId: makeId('COLS', index + 1, 5),
      loanId: loan.id,
      loanNumber: loan.loanNumber,
      memberId: loan.memberId,
      memberName: loan.memberName,
      collector: pick(random, collectors),
      amountDue: loan.totalPayable,
      amountPaid,
      balance,
      penalty,
      collectionDate,
      status,
      branch: loan.branch,
    };
  });
}

function makeReports(payments, loans, members, today) {
  const totalCollection = payments.reduce((sum, payment) => sum + payment.amount + payment.penalty, 0);
  const outstanding = loans.reduce((sum, loan) => sum + getLoanOutstandingBalance(loan, payments, today, DEFAULT_PENALTY_RATE), 0);
  return [
    {
      id: 'RPT-0001',
      title: 'Monthly Collection Summary',
      type: 'Monthly',
      period: todayIso().slice(0, 7),
      totalCollection,
      totalMembers: members.length,
      activeLoans: loans.filter((loan) => loan.status === 'Active').length,
      outstanding,
      generatedAt: new Date().toISOString(),
      generatedBy: 'admin',
    },
  ];
}

function makeAvailments(members, today) {
  return members.slice(0, 19).map((member, index) => ({
    id: makeId('AVM', index + 1),
    reference: member.memberId,
    monitoringReference: makeId('AVM', index + 1, 5),
    memberId: member.id,
    memberName: member.fullName,
    availmentDate: addDays(today, -(index % Math.max(1, Number(today.slice(8, 10))))),
    availmentType: AVAILMENT_TYPES[index % AVAILMENT_TYPES.length],
    amount: 5000 + (index % 8) * 2500,
    status: AVAILMENT_STATUSES[index % AVAILMENT_STATUSES.length],
    supportingDocuments: index % 3 === 0 ? 'Death certificate, valid ID' : index % 3 === 1 ? 'Medical certificate, valid ID' : 'Claim form, valid ID',
    remarks: index % 2 === 0 ? 'Filed for review.' : 'Documents received.',
    branch: member.branch,
    createdAt: new Date().toISOString(),
    createdBy: 'System',
  }));
}

function makeActivityLogs(today) {
  return [
    {
      id: 'ACT-0001',
      action: 'Seed Data Created',
      detail: 'Sample members, loans, collections, and payments were prepared.',
      user: 'System',
      createdAt: `${today}T08:00:00.000Z`,
    },
    {
      id: 'ACT-0002',
      action: 'Payment Recorded',
      detail: 'Recent collection payments were posted to member ledgers.',
      user: 'manager',
      createdAt: `${today}T09:30:00.000Z`,
    },
  ];
}

function makeNotifications(loans, collections, today) {
  const dueToday = collections.filter((collection) => collection.collectionDate === today);
  const overdue = loans.filter((loan) => loan.status === 'Overdue');
  return [
    {
      id: 'NOT-0001',
      title: 'Due today',
      message: `${dueToday.length} collection records need follow-up today.`,
      type: 'warning',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'NOT-0002',
      title: 'Overdue accounts',
      message: `${overdue.length} accounts are currently overdue.`,
      type: 'danger',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'NOT-0003',
      title: 'Backup reminder',
      message: 'Download a LocalStorage backup before month-end closing.',
      type: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

function makeSettings() {
  return {
    cooperativeName: 'Barbaza Multi-Purpose Cooperative',
    shortName: 'Barbaza MPC',
    address: 'Poblacion, Barbaza, Antique',
    telephone: '(036) 540-0000',
    email: 'office@barbazampc.coop',
    logoText: 'CM',
    penaltyRate: DEFAULT_PENALTY_RATE,
    interestRate: 5,
    loanTypes: DEFAULT_LOAN_TYPES,
    theme: 'light',
    collectionGraceDays: 3,
    backupReminderDays: 7,
  };
}

export function generateSeedData() {
  const random = createRandom();
  const today = todayIso();
  const users = makeUsers();
  const branches = BRANCH_OPTIONS;
  let members = makeMembers(random, today, branches);
  const loans = makeLoans(random, members, today);
  const payments = distributePayments(random, loans, today);
  const collections = makeCollections(random, loans, payments, today);
  members = applyComputedMemberStatuses(members, loans, today);
  const reports = makeReports(payments, loans, members, today);
  const availments = makeAvailments(members, today);
  const settings = makeSettings();
  const activityLogs = makeActivityLogs(today);
  const notifications = makeNotifications(loans, collections, today);

  return {
    users,
    members,
    loans,
    collections,
    payments,
    reports,
    availments,
    settings,
    activityLogs,
    notifications,
    dashboard: {},
  };
}
