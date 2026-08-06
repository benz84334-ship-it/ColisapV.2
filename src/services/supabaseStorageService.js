import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { normalizeContactNumber } from '../utils/formatters.js';

const AVAILMENT_TYPES = [
  'Natural Death Claim',
  'Accidental Death Claim',
  'Disability Claim',
  'Burial Assistance',
];
const AVAILMENT_STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Released'];
const LEGACY_AVAILMENT_TYPES = new Set([
  'New Enrollment',
  'Policy Renewal',
  'Additional Coverage',
  'Benefit Claim',
  'Claim Settlement',
  'Regular Monitoring',
  'Renewal',
  'Additional Availment',
]);
const LEGACY_AVAILMENT_STATUSES = new Set(['Completed', 'Active', 'Overdue', 'Partial', 'Paid']);

export const DATA_KEYS = [
  'users', 'members', 'requests', 'loans', 'collections', 'payments', 'reports', 'availments',
  'shareCapitalTransactions', 'settings', 'activityLogs', 'notifications', 'dashboard',
];

export function loadCachedDatabase() {
  return freshDatabase();
}

export function cacheDatabase(database) {
  return database;
}

export function clearCachedDatabase() {
  return undefined;
}

function assertSupabaseConfigured() {
  if (isSupabaseConfigured) return;
  if (import.meta.env.PROD) {
    throw new Error(
      'Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel project environment variables.',
    );
  }
}

export function freshDatabase() {
  return {
    users: [],
    members: [],
    memberBeneficiaries: [],
    requests: [],
    loans: [],
    collections: [],
    payments: [],
    reports: [],
    availments: [],
    shareCapitalTransactions: [],
    settings: {},
    activityLogs: [],
    notifications: [],
    dashboard: {},
  };
}

function isBlankInitialDatabase(database) {
  return DATA_KEYS.every((key) => {
    const value = database[key];
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === 'object') return Object.keys(value).length === 0;
    return value == null;
  });
}

function withTimeout(promise, timeoutMs = 8000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Supabase connection timed out.')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function normalizeAvailments(availments = []) {
  return availments.map((item, index) => {
    const isApproved = Boolean(item.approvedBy || item.dateApproved || String(item.claimStatus || item.status || '').trim() === 'Approved');
    const status = LEGACY_AVAILMENT_STATUSES.has(item.status)
      ? AVAILMENT_STATUSES[index % AVAILMENT_STATUSES.length]
      : (item.status || (isApproved ? 'Approved' : AVAILMENT_STATUSES[0]));

    return {
      ...item,
      availmentType: LEGACY_AVAILMENT_TYPES.has(item.availmentType)
      ? AVAILMENT_TYPES[index % AVAILMENT_TYPES.length]
      : item.availmentType || AVAILMENT_TYPES[0],
      status: isApproved ? 'Approved' : status,
      claimStatus: isApproved ? 'Approved' : (item.claimStatus || status),
      supportingDocuments: item.supportingDocuments || (isApproved ? 'Approved claim form and valid supporting records' : ''),
      remarks: item.remarks || (isApproved ? 'Approved and ready for release processing.' : ''),
    };
  });
}

function mergeUsers(currentUsers = [], seededUsers = []) {
  const merged = [...currentUsers];
  const coreUsernames = new Set(['admin', 'manager', 'staff']);

  seededUsers.forEach((user) => {
    const keys = [
      String(user.id || '').toLowerCase(),
      String(user.username || '').toLowerCase(),
      String(user.email || '').toLowerCase(),
    ];
    const matchIndex = merged.findIndex((item) =>
      keys.some((key) => [
        String(item.id || '').toLowerCase(),
        String(item.username || '').toLowerCase(),
        String(item.email || '').toLowerCase(),
      ].includes(key)),
    );

    if (matchIndex === -1) {
      merged.push(user);
      return;
    }

    if (coreUsernames.has(String(user.username || '').toLowerCase())) {
      merged[matchIndex] = { ...merged[matchIndex], ...user };
    } else if (merged[matchIndex]?.status !== 'Active' && user.status === 'Active') {
      merged[matchIndex] = { ...merged[matchIndex], ...user };
    }
  });

  return merged;
}

function createUserId(user = {}) {
  return String(user.id || '').trim() || globalThis.crypto?.randomUUID?.() || `usr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIntegerOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toNumberOrZero(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  return value;
}

function fallbackRequestKey(item = {}, index = 0) {
  const yearMatch = String(item.requestId || item.id || item.claimNumber || item.reference || '').match(/(20\d{2})/);
  const year = yearMatch?.[1] || String(new Date().getFullYear());
  const seed = String(item.requestId || item.id || item.claimNumber || item.reference || index + 1)
    .replace(/\D/g, '')
    .slice(-5)
    .padStart(5, '0');
  return `REQ-${year}-${seed}`;
}

function randomCifSuffix(used = new Set()) {
  let suffix = '';
  do {
    suffix = String(Math.floor(10000 + Math.random() * 90000));
  } while (used.has(suffix));
  return suffix;
}

function toDbUserRow(user = {}) {
  return {
    id: createUserId(user),
    username: user.username,
    password: user.password ?? null,
    full_name: user.fullName,
    role: user.role,
    status: user.status,
    branch: user.branch,
    email: user.email ?? null,
    contact_number: user.contactNumber ?? null,
    created_at: user.createdAt || new Date().toISOString(),
    last_login: user.lastLogin || null,
    updated_at: user.updatedAt || user.createdAt || new Date().toISOString(),
  };
}

function stripMetaKeys(row) {
  const { createdAt, updatedAt, ...rest } = row || {};
  return rest;
}

function dedupeRequestRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row?.id || row?.request_id || row?.requestId || '').trim();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TABLE_SYNCERS = {
  users: {
    table: 'users',
    toRow: toDbUserRow,
    fromRow: (row) => ({
      id: row.id,
      username: row.username,
      password: row.password ?? '',
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      branch: row.branch,
      email: row.email ?? '',
      contactNumber: row.contact_number ?? '',
      createdAt: row.created_at,
      lastLogin: row.last_login ?? null,
      updatedAt: row.updated_at,
    }),
  },
  members: {
    table: 'members',
    toRow: (item) => ({
      id: item.id,
      member_id: item.memberId,
      cif_number: item.cifNumber ?? null,
      full_name: item.fullName,
      application_status: item.applicationStatus ?? 'New',
      first_name: item.firstName ?? null,
      middle_name: item.middleName ?? null,
      last_name: item.lastName ?? null,
      suffix_name: item.suffixName ?? null,
      address: item.address ?? null,
      barangay: item.barangay ?? null,
      birthdate: item.birthdate ?? null,
      age_years: item.ageYears ?? null,
      age_months: item.ageMonths ?? null,
      gender: item.gender ?? null,
      civil_status: item.civilStatus ?? null,
      contact_number: normalizeContactNumber(item.contactNumber) || null,
      occupation: item.occupation ?? null,
      employer: item.employer ?? null,
      office_address: item.officeAddress ?? null,
      religion: item.religion ?? null,
      religion_other: item.religionOther ?? null,
      dependents: item.dependents ?? 0,
      savings_account_no: item.savingsAccountNo ?? null,
      membership_date: item.membershipDate ?? null,
      signed_date: item.signedDate ?? null,
      witness_staff: item.witnessStaff ?? null,
      action_taken: item.actionTaken ?? null,
      approving_authority: item.approvingAuthority ?? null,
      approval_date: item.approvalDate ?? null,
      findings: item.findings ?? null,
      last_share_capital_deposit_date: item.lastShareCapitalDepositDate ?? null,
      benefit_category: item.benefitCategory ?? null,
      share_capital: item.shareCapital ?? 0,
      status_override: item.statusOverride ?? null,
      status: item.status ?? 'Active',
      branch: item.branch ?? 'Main Office',
      photo: item.photo ?? null,
      beneficiaries: item.beneficiaries ?? [],
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      memberId: row.member_id,
      cifNumber: row.cif_number,
      applicationStatus: row.application_status,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      suffixName: row.suffix_name,
      fullName: row.full_name,
      address: row.address,
      barangay: row.barangay,
      birthdate: row.birthdate,
      ageYears: row.age_years,
      ageMonths: row.age_months,
      gender: row.gender,
      civilStatus: row.civil_status,
      contactNumber: row.contact_number,
      occupation: row.occupation,
      employer: row.employer,
      officeAddress: row.office_address,
      religion: row.religion,
      religionOther: row.religion_other,
      dependents: row.dependents,
      savingsAccountNo: row.savings_account_no,
      membershipDate: row.membership_date,
      signedDate: row.signed_date,
      witnessStaff: row.witness_staff,
      actionTaken: row.action_taken,
      approvingAuthority: row.approving_authority,
      approvalDate: row.approval_date,
      findings: row.findings,
      status: row.status,
      statusOverride: row.status_override,
      branch: row.branch,
      shareCapital: row.share_capital,
      lastShareCapitalDepositDate: row.last_share_capital_deposit_date,
      benefitCategory: row.benefit_category,
      beneficiaries: row.beneficiaries || [],
      photo: row.photo,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  memberBeneficiaries: {
    table: 'member_beneficiaries',
    toRow: (item) => ({
      id: item.id,
      member_id: item.memberId,
      name: item.name || `${String(item.firstName || '').trim()} ${String(item.middleName || '').trim()} ${String(item.lastName || '').trim()} ${String(item.suffixName || '').trim()}`.trim(),
      age: item.ageYears === '' || item.ageYears === undefined ? null : Number(item.ageYears),
      address: item.address ?? null,
      relationship: item.relationshipOther || item.relationship || null,
      sort_order: Number(item.sortOrder || 0),
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      memberId: row.member_id,
      name: row.name,
      ageYears: row.age,
      address: row.address,
      relationship: row.relationship,
      sortOrder: row.sort_order,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  requests: {
    table: 'requests',
    toRow: (item, index = 0) => {
      const fallbackId = fallbackRequestKey(item, index);
      return {
      id: item.id || item.requestId || fallbackId,
      request_id: item.requestId || item.id || fallbackId,
      request_type: item.requestType ?? null,
      request_kind: item.requestKind ?? item.metadata?.requestKind ?? item.metadata?.claimantApplication?.requestKind ?? null,
      approval_queue: item.approvalQueue ?? item.metadata?.approvalQueue ?? item.metadata?.claimantApplication?.approvalQueue ?? null,
      member_id: item.memberId ?? null,
      cif_number: item.cifNumber ?? null,
      request_status: item.requestStatus ?? 'Pending',
      approved_by: item.approvedBy ?? null,
      requested_by: item.requestedBy ?? null,
      requested_by_name: item.requestedByName ?? null,
      submitted_at: item.submittedAt ?? null,
      approved_at: item.approvedAt ?? null,
      rejected_at: item.rejectedAt ?? null,
      returned_at: item.returnedAt ?? null,
      resubmitted_at: item.resubmittedAt ?? null,
      return_reason: item.returnReason ?? null,
      rejection_reason: item.rejectionReason ?? null,
      approval_reason: item.approvalReason ?? null,
      branch: item.branch ?? 'Main Office',
      application_status: item.applicationStatus ?? 'New',
      benefit_category: item.benefitCategory ?? null,
      first_name: item.firstName ?? null,
      middle_name: item.middleName ?? null,
      last_name: item.lastName ?? null,
      suffix_name: item.suffixName ?? null,
      full_name: item.fullName || item.memberName || item.claimantName || item.requestedByName || 'Unnamed request',
      address: item.address ?? null,
      barangay: item.barangay ?? null,
      birthdate: toDateOrNull(item.birthdate),
      age_years: toIntegerOrNull(item.ageYears),
      age_months: toIntegerOrNull(item.ageMonths),
      gender: item.gender ?? null,
      civil_status: item.civilStatus ?? null,
      contact_number: normalizeContactNumber(item.contactNumber) || null,
      occupation: item.occupation ?? null,
      employer: item.employer ?? null,
      office_address: item.officeAddress ?? null,
      religion: item.religion ?? null,
      religion_other: item.religionOther ?? null,
      dependents: item.dependents ?? 0,
      savings_account_no: item.savingsAccountNo ?? null,
      membership_date: toDateOrNull(item.membershipDate),
      signed_date: toDateOrNull(item.signedDate),
      witness_staff: item.witnessStaff ?? null,
      action_taken: item.actionTaken ?? null,
      approving_authority: item.approvingAuthority ?? null,
      approval_date: toDateOrNull(item.approvalDate),
      findings: item.findings ?? null,
      share_capital: toNumberOrZero(item.shareCapital),
      last_share_capital_deposit_date: toDateOrNull(item.lastShareCapitalDepositDate),
      status: item.status ?? 'Pending',
      beneficiaries: item.beneficiaries ?? [],
      photo: item.photo ?? null,
      metadata: {
        ...(item.metadata ?? {}),
        requestKind: item.requestKind ?? item.metadata?.requestKind ?? null,
        approvalQueue: item.approvalQueue ?? item.metadata?.approvalQueue ?? null,
        claimantApplication: {
          ...(item.metadata?.claimantApplication ?? {}),
          claimNumber: item.claimNumber ?? item.metadata?.claimantApplication?.claimNumber ?? null,
          claimantName: item.claimantName ?? item.metadata?.claimantName ?? item.metadata?.claimantApplication?.claimantName ?? null,
          requestKind: item.requestKind ?? item.metadata?.requestKind ?? item.metadata?.claimantApplication?.requestKind ?? null,
          approvalQueue: item.approvalQueue ?? item.metadata?.approvalQueue ?? item.metadata?.claimantApplication?.approvalQueue ?? null,
        },
      },
      };
    },
    fromRow: (row) => ({
      id: row.id,
      requestId: row.request_id,
      requestType: row.request_type,
      memberId: row.member_id,
      cifNumber: row.cif_number,
      requestStatus: row.request_status,
      approvedBy: row.approved_by,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      submittedAt: row.submitted_at,
      approvedAt: row.approved_at,
      rejectedAt: row.rejected_at,
      returnedAt: row.returned_at,
      resubmittedAt: row.resubmitted_at,
      returnReason: row.return_reason,
      rejectionReason: row.rejection_reason,
      approvalReason: row.approval_reason,
      branch: row.branch,
      applicationStatus: row.application_status,
      benefitCategory: row.benefit_category,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      suffixName: row.suffix_name,
      fullName: row.full_name,
      address: row.address,
      barangay: row.barangay,
      birthdate: row.birthdate,
      ageYears: row.age_years,
      ageMonths: row.age_months,
      gender: row.gender,
      civilStatus: row.civil_status,
      contactNumber: row.contact_number,
      occupation: row.occupation,
      employer: row.employer,
      officeAddress: row.office_address,
      religion: row.religion,
      religionOther: row.religion_other,
      dependents: row.dependents,
      savingsAccountNo: row.savings_account_no,
      membershipDate: row.membership_date,
      signedDate: row.signed_date,
      witnessStaff: row.witness_staff,
      actionTaken: row.action_taken,
      approvingAuthority: row.approving_authority,
      approvalDate: row.approval_date,
      findings: row.findings,
      status: row.status,
      shareCapital: row.share_capital,
      lastShareCapitalDepositDate: row.last_share_capital_deposit_date,
      beneficiaries: row.beneficiaries || [],
      photo: row.photo,
      requestKind: row.metadata?.requestKind || row.request_kind || row.metadata?.claimantApplication?.requestKind || 'member',
      approvalQueue: row.metadata?.approvalQueue || row.approval_queue || row.metadata?.claimantApplication?.approvalQueue || '',
      claimNumber: row.metadata?.claimantApplication?.claimNumber || row.claim_number || row.claimNumber || '',
      claimantName: row.metadata?.claimantName || row.metadata?.claimantApplication?.claimantName || row.claimant_name || row.claimantName || '',
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  loans: {
    table: 'loans',
    toRow: (item) => ({
      id: item.id,
      loan_number: item.loanNumber,
      member_id: item.memberId ?? null,
      member_name: item.memberName ?? null,
      loan_type: item.loanType ?? null,
      collection_schedule: item.collectionSchedule ?? null,
      contract_period: item.contractPeriod ?? null,
      contract_months: item.contractMonths ?? null,
      principal_amount: item.principalAmount ?? 0,
      interest_amount: item.interestAmount ?? 0,
      total_payable: item.totalPayable ?? 0,
      paid_amount: item.paidAmount ?? 0,
      penalty_rate: item.penaltyRate ?? 0,
      release_date: item.releaseDate ?? null,
      due_date: item.dueDate ?? null,
      penalty: item.penalty ?? 0,
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      loanNumber: row.loan_number,
      memberId: row.member_id,
      memberName: row.member_name,
      branch: row.branch,
      loanType: row.loan_type,
      collectionSchedule: row.collection_schedule,
      contractPeriod: row.contract_period,
      contractMonths: row.contract_months,
      principalAmount: row.principal_amount,
      interest: row.interest,
      interestAmount: row.interest_amount,
      totalPayable: row.total_payable,
      paidAmount: row.paid_amount,
      penaltyRate: row.penalty_rate,
      penalty: row.penalty,
      releaseDate: row.release_date,
      dueDate: row.due_date,
      status: row.status,
      remarks: row.remarks,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  collections: {
    table: 'collections',
    toRow: (item) => ({
      id: item.id,
      collection_id: item.collectionId,
      loan_id: item.loanId ?? null,
      loan_number: item.loanNumber ?? null,
      member_id: item.memberId ?? null,
      member_name: item.memberName ?? null,
      collection_date: item.collectionDate ?? null,
      amount_due: item.amountDue ?? 0,
      amount_paid: item.amountPaid ?? 0,
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      collectionId: row.collection_id,
      loanId: row.loan_id,
      loanNumber: row.loan_number,
      memberId: row.member_id,
      memberName: row.member_name,
      collector: row.collector,
      branch: row.branch,
      collectionDate: row.collection_date,
      amountDue: row.amount_due,
      amountPaid: row.amount_paid,
      balance: row.balance,
      penalty: row.penalty,
      status: row.status,
      remarks: row.remarks,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  payments: {
    table: 'payments',
    toRow: (item) => ({
      id: item.id,
      receipt_number: item.receiptNumber,
      loan_id: item.loanId ?? null,
      loan_number: item.loanNumber ?? null,
      member_id: item.memberId ?? null,
      member_name: item.memberName ?? null,
      payment_date: item.paymentDate ?? null,
      payment_type: item.paymentType ?? null,
      method: item.method ?? null,
      collected_by: item.collectedBy ?? null,
      encoded_by: item.encodedBy ?? null,
      amount: item.amount ?? 0,
      penalty: item.penalty ?? 0,
      balance: item.balance ?? 0,
      reference_number: item.referenceNumber ?? null,
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      loanId: row.loan_id,
      loanNumber: row.loan_number,
      memberId: row.member_id,
      memberName: row.member_name,
      branch: row.branch,
      paymentDate: row.payment_date,
      paymentType: row.payment_type,
      method: row.method,
      collectedBy: row.collected_by,
      encodedBy: row.encoded_by,
      amount: row.amount,
      penalty: row.penalty,
      balance: row.balance,
      referenceNumber: row.reference_number,
      status: row.status,
      remarks: row.remarks,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  shareCapitalTransactions: {
    table: 'share_capital_transactions',
    toRow: (item) => ({
      id: item.id,
      member_id: item.memberId ?? null,
      transaction_date: item.transactionDate ?? item.contributionDate ?? null,
      transaction_type: item.transactionType ?? 'Deposit',
      amount: item.amount ?? 0,
      running_balance: item.runningBalance ?? 0,
      reference_number: item.referenceNumber ?? item.transactionId ?? null,
      encoded_by: item.encodedBy ?? item.recordedBy ?? null,
      remarks: item.remarks ?? null,
      metadata: item.metadata ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      memberId: row.member_id,
      transactionDate: row.transaction_date,
      transactionType: row.transaction_type,
      amount: row.amount,
      runningBalance: row.running_balance,
      referenceNumber: row.reference_number,
      encodedBy: row.encoded_by,
      remarks: row.remarks,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  reports: {
    table: 'reports',
    toRow: (item) => ({
      id: item.id,
      title: item.title ?? '',
      report_type: item.reportType ?? item.type ?? null,
      type: item.type ?? item.reportType ?? null,
      period: item.period ?? null,
      generated_by: item.generatedBy ?? null,
      generated_at: item.generatedAt ?? null,
      branch: item.branch ?? null,
      period_start: item.periodStart ?? null,
      period_end: item.periodEnd ?? null,
      total_collection: item.totalCollection ?? 0,
      total_members: item.totalMembers ?? 0,
      active_loans: item.activeLoans ?? 0,
      outstanding: item.outstanding ?? 0,
      payload: item.payload ?? {},
    }),
    fromRow: (row) => ({
      id: row.id,
      title: row.title,
      reportType: row.report_type,
      type: row.type,
      period: row.period,
      generatedBy: row.generated_by,
      generatedAt: row.generated_at,
      branch: row.branch,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalCollection: row.total_collection,
      totalMembers: row.total_members,
      activeLoans: row.active_loans,
      outstanding: row.outstanding,
      payload: row.payload || {},
      rows: Array.isArray(row.payload?.rows) ? row.payload.rows : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  availments: {
    table: 'availments',
    toRow: (item) => ({
      id: item.id,
      member_id: item.memberId ?? null,
      member_name: item.memberName ?? null,
      monitoring_reference: item.monitoringReference ?? null,
      claim_number: item.claimNumber ?? null,
      date_filed: item.dateFiled ?? null,
      claimant_first_name: item.claimantFirstName ?? null,
      claimant_middle_name: item.claimantMiddleName ?? null,
      claimant_last_name: item.claimantLastName ?? null,
      claimant_suffix: item.claimantSuffix ?? null,
      claimant_name: item.claimantName ?? null,
      relationship_to_deceased: item.relationshipToDeceased ?? null,
      contact_number: normalizeContactNumber(item.contactNumber) || null,
      claimant_address: item.claimantAddress ?? null,
      valid_id_type: item.validIdType ?? null,
      valid_id_number: item.validIdNumber ?? null,
      registered_beneficiary: item.registeredBeneficiary ?? null,
      claimant_signature: item.claimantSignature ?? null,
      date_signed: item.dateSigned ?? null,
      verified_by: item.verifiedBy ?? null,
      recommendation: item.recommendation ?? null,
      approved_amount: item.approvedAmount ?? 0,
      approved_by: item.approvedBy ?? null,
      date_approved: item.dateApproved ?? null,
      availment_type: item.availmentType ?? null,
      availment_date: item.availmentDate ?? null,
      created_by: item.createdBy ?? null,
      deceased_member_id: item.deceasedMemberId ?? null,
      deceased_cif_number: item.deceasedCifNumber ?? null,
      deceased_first_name: item.deceasedFirstName ?? null,
      deceased_middle_name: item.deceasedMiddleName ?? null,
      deceased_last_name: item.deceasedLastName ?? null,
      deceased_suffix: item.deceasedSuffix ?? null,
      deceased_full_name: item.deceasedFullName ?? null,
      deceased_date_of_birth: item.deceasedDateOfBirth ?? null,
      deceased_date_of_death: item.deceasedDateOfDeath ?? null,
      deceased_civil_status: item.deceasedCivilStatus ?? null,
      deceased_membership_date: item.deceasedMembershipDate ?? null,
      deceased_coverage_status: item.deceasedCoverageStatus ?? null,
      deceased_benefit_category: item.deceasedBenefitCategory ?? null,
      place_of_death: item.placeOfDeath ?? null,
      cause_of_death: item.causeOfDeath ?? null,
      date_of_burial: item.dateOfBurial ?? null,
      place_of_burial: item.placeOfBurial ?? null,
      funeral_home: item.funeralHome ?? null,
      total_funeral_expenses: item.totalFuneralExpenses ?? 0,
      supporting_documents: item.supportingDocuments ?? null,
      metadata: item.metadata ?? {},
      amount: item.amount ?? 0,
    }),
    fromRow: (row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: row.member_name,
      reference: row.reference,
      monitoringReference: row.monitoring_reference,
      claimNumber: row.claim_number,
      dateFiled: row.date_filed,
      claimantFirstName: row.claimant_first_name,
      claimantMiddleName: row.claimant_middle_name,
      claimantLastName: row.claimant_last_name,
      claimantSuffix: row.claimant_suffix,
      claimantName: row.claimant_name,
      relationshipToDeceased: row.relationship_to_deceased,
      contactNumber: row.contact_number,
      claimantAddress: row.claimant_address,
      validIdType: row.valid_id_type,
      validIdNumber: row.valid_id_number,
      registeredBeneficiary: row.registered_beneficiary,
      claimantSignature: row.claimant_signature,
      dateSigned: row.date_signed,
      verifiedBy: row.verified_by,
      recommendation: row.recommendation,
      approvedAmount: row.approved_amount,
      approvedBy: row.approved_by,
      dateApproved: row.date_approved,
      availmentType: row.availment_type,
      branch: row.branch,
      amount: row.amount,
      status: row.status,
      availmentDate: row.availment_date,
      deceasedMemberId: row.deceased_member_id,
      deceasedCifNumber: row.deceased_cif_number,
      deceasedFirstName: row.deceased_first_name,
      deceasedMiddleName: row.deceased_middle_name,
      deceasedLastName: row.deceased_last_name,
      deceasedSuffix: row.deceased_suffix,
      deceasedFullName: row.deceased_full_name,
      deceasedDateOfBirth: row.deceased_date_of_birth,
      deceasedDateOfDeath: row.deceased_date_of_death,
      deceasedCivilStatus: row.deceased_civil_status,
      deceasedMembershipDate: row.deceased_membership_date,
      deceasedCoverageStatus: row.deceased_coverage_status,
      deceasedBenefitCategory: row.deceased_benefit_category,
      placeOfDeath: row.place_of_death,
      causeOfDeath: row.cause_of_death,
      dateOfBurial: row.date_of_burial,
      placeOfBurial: row.place_of_burial,
      funeralHome: row.funeral_home,
      totalFuneralExpenses: row.total_funeral_expenses,
      policyNumber: row.policy_number,
      createdBy: row.created_by,
      supportingDocuments: row.supporting_documents,
      remarks: row.remarks,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  settings: {
    table: 'settings',
    toRow: (item) => ({
      id: 'main',
      cooperative_name: item.cooperativeName,
      short_name: item.shortName,
      address: item.address ?? null,
      telephone: item.telephone ?? null,
      email: item.email ?? null,
      logo_text: item.logoText ?? null,
      theme: item.theme ?? 'light',
      penalty_rate: item.penaltyRate ?? 0,
      interest_rate: item.interestRate ?? 0,
      collection_grace_days: item.collectionGraceDays ?? 0,
      backup_reminder_days: item.backupReminderDays ?? 0,
      loan_types: item.loanTypes ?? [],
      branch_options: item.branchOptions ?? [],
      metadata: item.metadata ?? {},
    }),
  },
  activityLogs: {
    table: 'activity_logs',
    toRow: (item) => ({
      id: item.id,
      action: item.action,
      detail: item.detail,
      user: item.user ?? item.userName ?? null,
      user_name: item.userName ?? null,
      created_at: item.createdAt ?? new Date().toISOString(),
    }),
    fromRow: (row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      user: row.user,
      userName: row.user_name,
      branch: row.branch,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  notifications: {
    table: 'notifications',
    toRow: (item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      type: item.type,
      read: Boolean(item.read),
      branch: item.branch ?? null,
      created_at: item.createdAt ?? new Date().toISOString(),
    }),
    fromRow: (row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.read,
      branch: row.branch,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
};

async function syncTableSlice(key, value) {
  const syncer = TABLE_SYNCERS[key];
  if (!syncer || !isSupabaseConfigured) return;
  const rows = Array.isArray(value) ? value : [value];
  if (syncer.table === 'users') {
    const mapped = rows.filter(Boolean).map(syncer.toRow);
    const { error } = await supabase.from(syncer.table).upsert(mapped, { onConflict: 'id' });
    if (error) throw error;
    return;
  }
  if (syncer.table === 'settings') {
    const row = syncer.toRow(value || {});
    const { error } = await supabase.from(syncer.table).upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return;
  }
  if (syncer.table === 'member_beneficiaries') {
    const mapped = (Array.isArray(value) ? value : []).filter(Boolean).map(syncer.toRow);
    const { error } = await supabase.from(syncer.table).upsert(mapped, { onConflict: 'id' });
    if (error) throw error;
    return;
  }
  const filteredRows = rows.filter(Boolean);
  const mapped = filteredRows.map((row, index) => syncer.toRow(row, index));
  const finalRows = syncer.table === 'requests' ? dedupeRequestRows(mapped) : mapped;
  const { error } = await supabase.from(syncer.table).upsert(finalRows, { onConflict: 'id' });
  if (error) throw error;
}

async function syncUsersToPublicTable(users = []) {
  if (!isSupabaseConfigured) return;
  const uniqueRows = [];
  const seen = new Set();
  for (const user of users) {
    const row = toDbUserRow(user);
    if (!row.id) continue;
    const usernameKey = String(row.username || '').toLowerCase().trim();
    const emailKey = String(row.email || '').toLowerCase().trim();
    const key = usernameKey || emailKey || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  if (!uniqueRows.length) return;
  const { error } = await supabase.from('users').upsert(uniqueRows, { onConflict: 'id' });
  if (error) throw error;
}

function fromDbRows(key, rows = []) {
  const syncer = TABLE_SYNCERS[key];
  if (!syncer) return rows;
  if (key === 'settings') {
    const row = rows[0];
    return row ? {
      cooperativeName: row.cooperative_name,
      shortName: row.short_name,
      address: row.address,
      telephone: row.telephone,
      email: row.email,
      logoText: row.logo_text,
      theme: row.theme,
      penaltyRate: row.penalty_rate,
      interestRate: row.interest_rate,
      collectionGraceDays: row.collection_grace_days,
      backupReminderDays: row.backup_reminder_days,
      loanTypes: row.loan_types,
      branchOptions: row.branch_options,
      metadata: row.metadata || {},
    } : {};
  }
  return rows.map((row) => syncer.fromRow ? syncer.fromRow(row) : row);
}

async function loadTableSlice(key) {
  const syncer = TABLE_SYNCERS[key];
  if (!syncer || !isSupabaseConfigured) return null;
  const { data, error } = await supabase.from(syncer.table).select('*');
  if (error) throw error;
  return fromDbRows(key, data || []);
}

export async function approveMemberRequestInSupabase(requestId, approvedBy, approvalReason = null) {
  assertSupabaseConfigured();
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not connected.');
  }

  const { data, error } = await supabase.rpc('approve_member_request', {
    p_request_id: requestId,
    p_approved_by: approvedBy,
    p_approval_reason: approvalReason,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function loadDatabaseFromSupabase() {
  assertSupabaseConfigured();
  const nextDatabase = freshDatabase();
  const tableKeys = ['users', 'members', 'memberBeneficiaries', 'requests', 'loans', 'collections', 'payments', 'reports', 'availments', 'shareCapitalTransactions', 'settings', 'activityLogs', 'notifications'];
  const loaded = await Promise.allSettled(tableKeys.map((key) => loadTableSlice(key)));
  tableKeys.forEach((key, index) => {
    const result = loaded[index];
    if (result.status === 'fulfilled' && result.value !== null && result.value !== undefined) {
      nextDatabase[key] = result.value;
    }
  });
  if (Array.isArray(nextDatabase.memberBeneficiaries) && nextDatabase.memberBeneficiaries.length) {
    const beneficiariesByMember = new Map();
    nextDatabase.memberBeneficiaries.forEach((beneficiary) => {
      const key = String(beneficiary.memberId || '').trim();
      if (!key) return;
      if (!beneficiariesByMember.has(key)) beneficiariesByMember.set(key, []);
      beneficiariesByMember.get(key).push(beneficiary);
    });
    nextDatabase.members = (nextDatabase.members || []).map((member) => ({
      ...member,
      beneficiaries: beneficiariesByMember.get(String(member.id || '').trim()) || member.beneficiaries || [],
    }));
  }
  nextDatabase.availments = normalizeAvailments(nextDatabase.availments || []);
  return nextDatabase;
}

export async function saveSupabaseKey(key, value) {
  assertSupabaseConfigured();
  try {
    await syncTableSlice(key, value);
    if (key === 'users') await syncUsersToPublicTable(Array.isArray(value) ? value : []);
  } catch (error) {
    console.error(`Supabase save failed for ${key}:`, error);
    throw new Error(`Unable to save ${key} to Supabase: ${error.message}`);
  }
}

export async function replaceSupabaseDatabase(database) {
  assertSupabaseConfigured();
  try {
    for (const key of DATA_KEYS) {
      await syncTableSlice(key, database[key]);
    }
    await syncUsersToPublicTable(Array.isArray(database.users) ? database.users : []);
  } catch (error) {
    console.error('Supabase database upsert failed:', error);
    throw new Error(`Unable to save the database to Supabase: ${error.message}`);
  }
}

export async function resetSupabaseDatabase() {
  const database = freshDatabase();
  await replaceSupabaseDatabase(database);
  return database;
}

export async function restoreSupabaseDatabase(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const source = parsed.data || parsed;
  const defaults = freshDatabase();
  const database = DATA_KEYS.reduce((result, key) => {
    result[key] = key in source ? source[key] : defaults[key];
    return result;
  }, {});
  await replaceSupabaseDatabase(database);
  return database;
}

export function subscribeToSupabaseDatabase(onChange) {
  if (!isSupabaseConfigured) return () => {};
  return () => {};
}
