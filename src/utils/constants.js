import { ANTIQUE_BARANGAYS } from './antiqueBarangays.js';

export const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export const WORKSPACE_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF];
export const USER_ROLE_OPTIONS = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF];

export const BRANCH_OPTIONS = [
  'Main Office',
];

export function normalizeBranchName(branch = '') {
  const trimmed = String(branch || '').trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const matchedBranch = BRANCH_OPTIONS.find((option) => option.toLowerCase().replace(/[^a-z0-9]+/g, '') === normalized);
  return matchedBranch || trimmed;
}

export const STORAGE_KEYS = {
  users: 'users',
  members: 'members',
  memberStatusHistory: 'memberStatusHistory',
  loans: 'loans',
  collections: 'collections',
  payments: 'payments',
  reports: 'reports',
  availments: 'availments',
  settings: 'settings',
  activityLogs: 'activityLogs',
  notifications: 'notifications',
  dashboard: 'dashboard',
  session: 'colisapSession',
  initialized: 'colisapInitialized',
};

export const BARANGAYS = ANTIQUE_BARANGAYS;

export const GENDERS = ['Female', 'Male'];
export const MEMBER_STATUSES = ['Active', 'Inactive', 'Dormant'];
export const MEMBER_BENEFIT_CATEGORIES = ['40K', '60K'];
export const LOAN_STATUSES = ['Pending', 'Active', 'Completed', 'Overdue'];
export const COLLECTION_STATUSES = ['Paid', 'Partial', 'Pending', 'Overdue'];
export const PAYMENT_STATUSES = ['Completed', 'Pending', 'Reversed'];
export const AVAILMENT_TYPES = [
  'Natural Death Claim',
  'Accidental Death Claim',
  'Disability Claim',
  'Burial Assistance',
];
export const AVAILMENT_STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Released'];
export const COLLECTION_SCHEDULES = ['Weekly', 'Biweekly', 'Monthly'];
export const PAYMENT_TYPES = ['Regular', 'Partial', 'Advance', 'Penalty'];

export const DEFAULT_LOAN_TYPES = [
  'Regular Loan',
  'Emergency Loan',
  'Agricultural Loan',
  'Microenterprise Loan',
  'Salary Loan',
];

export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', roles: WORKSPACE_ROLES },
  { label: 'Members', path: '/members', roles: WORKSPACE_ROLES },
  { label: 'Request Approval', path: '/request-approval', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { label: 'Reports', path: '/reports', roles: WORKSPACE_ROLES },
  { label: 'Settings', path: '/settings', roles: [ROLES.ADMIN] },
];

export const STATUS_STYLES = {
  Active: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  Inactive: 'border border-amber-200 bg-amber-50 text-amber-700',
  Dormant: 'border border-rose-200 bg-rose-50 text-rose-700',
  Pending: 'border border-amber-200 bg-amber-50 text-amber-700',
  'Under Review': 'border border-slate-200 bg-slate-50 text-slate-700',
  Approved: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  Rejected: 'border border-rose-200 bg-rose-50 text-rose-700',
  Released: 'border border-sky-200 bg-sky-50 text-sky-700',
  Completed: 'border border-sky-200 bg-sky-50 text-sky-700',
  Overdue: 'border border-rose-200 bg-rose-50 text-rose-700',
  Paid: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  Partial: 'border border-amber-200 bg-amber-50 text-amber-700',
  Reversed: 'border border-rose-200 bg-rose-50 text-rose-700',
};

export function normalizeBenefitCategory(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  if (/basic life savings|40k|php\s*40,?000\.00/i.test(text)) return MEMBER_BENEFIT_CATEGORIES[0];
  if (/premium life savings|60k|php\s*60,?000\.00/i.test(text)) return MEMBER_BENEFIT_CATEGORIES[1];

  const matched = MEMBER_BENEFIT_CATEGORIES.find((option) => option.toLowerCase() === text.toLowerCase());
  return matched || text;
}

export const CHART_COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
