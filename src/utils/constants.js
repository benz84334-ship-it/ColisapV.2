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
export const MEMBER_BENEFIT_CATEGORIES = ['40K (PHP 40,000.00)', '60K (PHP 60,000.00)'];
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
  { label: 'Claimant Application', path: '/claimant-application', roles: [ROLES.STAFF] },
  { label: 'Request Approval', path: '/request-approval', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { label: 'Reports', path: '/reports', roles: WORKSPACE_ROLES },
  { label: 'Settings', path: '/settings', roles: [ROLES.ADMIN] },
];

export const STATUS_STYLES = {
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  Inactive: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  Dormant: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
  Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  'Under Review': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
  Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  Released: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  Completed: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  Overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  Paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  Partial: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200',
  Reversed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
};

export function normalizeBenefitCategory(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  if (/basic life savings|40k/i.test(text)) return MEMBER_BENEFIT_CATEGORIES[0];
  if (/premium life savings|60k/i.test(text)) return MEMBER_BENEFIT_CATEGORIES[1];

  const matched = MEMBER_BENEFIT_CATEGORIES.find((option) => option.toLowerCase() === text.toLowerCase());
  return matched || text;
}

export const CHART_COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
