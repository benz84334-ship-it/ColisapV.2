import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiCopy, FiEdit2, FiFile, FiPrinter, FiSearch, FiUpload, FiUserPlus } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import SearchableTextField from '../../components/forms/SearchableTextField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { BARANGAYS, GENDERS, MEMBER_BENEFIT_CATEGORIES, MEMBER_STATUSES, ROLES, normalizeBenefitCategory } from '../../utils/constants.js';
import { ANTIQUE_BARANGAYS } from '../../utils/antiqueBarangays.js';
import { formatCurrency, formatDate, formatCifNumber, nextCifNumber, todayIso } from '../../utils/formatters.js';
import { getComputedMemberStatus } from '../../utils/memberStatus.js';
import { buildErrorMap, isPhone, required, uniqueBy } from '../../utils/validation.js';
import parseFile from '../../utils/importers.js';

const APPLICATION_STATUS_OPTIONS = ['New', 'Re-application'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated'];
const ACTION_TAKEN_OPTIONS = ['Pending', 'Approved', 'Disapproved'];
const RELIGION_OPTIONS = [
  'Roman Catholic',
  'Islam',
  'Iglesia ni Cristo (INC)',
  'Born Again Christian',
  'Philippine Independent Church (Aglipayan)',
  'Seventh-day Adventist',
  "Jehovah's Witnesses",
  'Baptist',
  'Methodist',
  'Others',
];
const RELATIONSHIP_OPTIONS = [
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Grandparent',
  'Grandchild',
  'Relative',
  'Others',
];
const NATIONALITY_OPTIONS = [
  'Filipino',
  'American',
  'Australian',
  'British',
  'Canadian',
  'Chinese',
  'Indian',
  'Indonesian',
  'Japanese',
  'Korean',
  'Malaysian',
  'Singaporean',
  'Thai',
  'Vietnamese',
  'Others (specify)',
];
const SUFFIX_NAME_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const IMPORT_HEADERS = [
  'CIFK Number',
  'Member',
  'Barangay / Municipality',
  'Contribution',
  'Category',
  'Contact',
  'Last Contribution Date',
  'Status',
];
const BENEFIT_CATEGORY_OPTIONS = MEMBER_BENEFIT_CATEGORIES.map((value) => ({
  value,
  label: value.startsWith('40K') ? '40K' : '60K',
}));

function normalizeImportText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeImportKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pickImportValue(row = {}, keys = []) {
  const lookup = Object.entries(row).reduce((accumulator, [key, value]) => {
    accumulator[normalizeImportKey(key)] = value;
    return accumulator;
  }, {});

  for (const key of keys) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const value = lookup[normalizedKey];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }

  return '';
}

function excelSerialToIso(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const utcDays = Math.floor(value - 25569);
  const utcValue = utcDays * 86400;
  const fractional = Math.round((value - Math.floor(value)) * 86400);
  const date = new Date((utcValue + fractional) * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function normalizeImportedDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    return excelSerialToIso(value);
  }
  const text = normalizeImportText(value);
  if (!text || text.toLowerCase() === 'not set') return '';
  const serialMatch = text.match(/^\d+(\.\d+)?$/);
  if (serialMatch) {
    return excelSerialToIso(Number(text));
  }

  const parts = text.split(/[\/.-]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const [first, second, third] = parts.map(Number);
    const year = third >= 1000 ? third : null;
    if (year) {
      const candidates = [
        { month: first - 1, day: second },
        { month: second - 1, day: first },
      ];

      for (const candidate of candidates) {
        const parsed = new Date(year, candidate.month, candidate.day);
        const normalized = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
        if (
          !Number.isNaN(parsed.getTime())
          && normalized.getFullYear() === year
          && normalized.getMonth() === candidate.month
          && normalized.getDate() === candidate.day
        ) {
          return normalized.toISOString().slice(0, 10);
        }
      }
    }
  }

  const normalizedText = text.includes('T') ? text : text.replace(' ', 'T');
  const parsed = new Date(normalizedText);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  return text;
}

function normalizeImportedNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeImportText(value).replace(/,/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getImportedContributionDate(row = {}) {
  return normalizeImportedDate(pickImportValue(row, [
    'lastContributionDate',
    'Last Contribution Date',
    'last contribution date',
    'LastContributionDate',
    'LastContribution Date',
    'membershipDate',
    'Membership Date',
    'Membership date',
    'Date Joined',
    'Date Joined ',
    'dateJoined',
    'date joined',
    'membership_date',
    'last_contribution_date',
  ]));
}

function splitFullName(fullName = '') {
  const parts = normalizeImportText(fullName).split(' ').filter(Boolean);
  if (!parts.length) {
    return { firstName: '', middleName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], middleName: '', lastName: '' };
  }

  if (parts.length === 2) {
    return { firstName: parts[0], middleName: '', lastName: parts[1] };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function mapImportedMemberRow(row = {}, generatedCifNumber = '') {
  const fullName = normalizeImportText(pickImportValue(row, [
    'fullName',
    'Full Name',
    'Fullname',
    'Member Name',
    'Member',
    'Member full name',
    'Name',
    'Applicant Name',
    'Name of Member',
    'name',
    'membername',
  ]));
  const sheetCifNumber = normalizeImportText(pickImportValue(row, [
    'cifNumber',
    'CIFK Number',
    'CIFK No.',
    'CIFK No',
    'CIFK',
    'Member ID',
    'Member No.',
    'Member No',
  ]));
  const firstName = normalizeImportText(pickImportValue(row, ['firstName', 'First Name', 'First name', 'Firstname', 'firstname', 'first_name', 'first'])) || splitFullName(fullName).firstName;
  const middleName = normalizeImportText(pickImportValue(row, ['middleName', 'Middle Name', 'Middle name', 'Middlename', 'middlename', 'middle_name', 'middle'])) || splitFullName(fullName).middleName;
  const lastName = normalizeImportText(pickImportValue(row, ['lastName', 'Last Name', 'Last name', 'Lastname', 'lastname', 'last_name', 'last'])) || splitFullName(fullName).lastName;
  const importName = fullName || [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  const sourceRow = Number(row.__rowNumber || row.__sourceRow || 0);
  const contributionDate = getImportedContributionDate(row);
  const sourceIdentity = [
    sourceRow || '',
    sheetCifNumber || '',
    fullName || '',
    firstName || '',
    lastName || '',
  ].filter(Boolean).join('|');
  const benefitCategory = normalizeBenefitCategory(
    pickImportValue(row, ['benefitCategory', 'Benefit Category', 'Category', 'category'])
    || MEMBER_BENEFIT_CATEGORIES[0],
  );
  return {
    memberId: sheetCifNumber || generatedCifNumber || '',
    cifNumber: sheetCifNumber || generatedCifNumber || '',
    applicationStatus: normalizeImportText(pickImportValue(row, ['applicationStatus', 'Application Status'])) || '',
    benefitCategory,
    firstName,
    middleName,
    lastName,
    fullName: importName || 'Imported Member',
    address: normalizeImportText(pickImportValue(row, ['address', 'Address', 'Present Address', 'Home Address', 'homeaddress'])),
    barangay: normalizeImportText(pickImportValue(row, ['barangay', 'Barangay', 'Municipality', 'Barangay / Municipality', 'brgy'])),
    birthdate: normalizeImportedDate(pickImportValue(row, ['birthdate', 'Date of Birth', 'Birth Date', 'dateofbirth', 'DOB', 'Date of birth'])) || '',
    ageYears: '',
    ageMonths: '',
    gender: normalizeImportText(pickImportValue(row, ['gender', 'Gender', 'Sex', 'sex'])),
    civilStatus: normalizeImportText(pickImportValue(row, ['civilStatus', 'Civil Status', 'civil_status', 'civilstatus'])),
    contactNumber: normalizeImportText(pickImportValue(row, ['contactNumber', 'Contact', 'Contact Number', 'Contact No.', 'Contact No', 'Mobile Number', 'Phone Number', 'Mobile No.'])),
    occupation: normalizeImportText(pickImportValue(row, ['occupation', 'Occupation', 'job'])),
    employer: normalizeImportText(pickImportValue(row, ['employer', 'Employer'])),
    officeAddress: normalizeImportText(pickImportValue(row, ['officeAddress', 'Office Address', 'office_address', 'office'])),
    religion: normalizeImportText(pickImportValue(row, ['religion', 'Religion'])),
    religionOther: '',
    dependents: 0,
    beneficiaries: [],
    savingsAccountNo: normalizeImportText(pickImportValue(row, ['savingsAccountNo', 'Savings Account No.', 'Savings Account No', 'savings_account_no'])),
    lastContributionDate: contributionDate,
    membershipDate: contributionDate,
    signedDate: normalizeImportedDate(pickImportValue(row, ['signedDate', 'Signed Date'])),
    witnessStaff: normalizeImportText(pickImportValue(row, ['witnessStaff', 'Witness / BMPC Staff'])),
    actionTaken: normalizeImportText(pickImportValue(row, ['actionTaken', 'Action Taken'])) || '',
    approvingAuthority: '',
    approvalDate: '',
    findings: '',
    status: normalizeImportText(pickImportValue(row, ['status', 'Member Status'])),
    photo: '',
    shareCapital: normalizeImportedNumber(pickImportValue(row, ['shareCapital', 'Contribution', 'Saving', 'Contribution Amount', 'Amount Contributed', 'share_capital'])),
    lastShareCapitalDepositDate: contributionDate || normalizeImportedDate(pickImportValue(row, ['lastShareCapitalDepositDate', 'Last Share Capital Deposit Date', 'last contribution date', 'Last Contribution Date', 'Membership Date', 'membershipDate'])),
    branch: 'Main Office',
    metadata: {
      importedFrom: 'excel',
      importedAt: new Date().toISOString(),
      sourceRow: sourceRow || null,
      sourceSheetRow: sourceRow || null,
      sourceIdentity,
    },
  };
}

function normalizeImportStatus(value = '') {
  const normalized = normalizeImportText(value).toLowerCase();
  if (normalized === 'active') return 'Active';
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'dormant') return 'Dormant';
  return '';
}

function normalizeComparableText(value = '') {
  return normalizeImportText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function formatTemplateCsv() {
  return [
    IMPORT_HEADERS.join(','),
    'CIFK-2026-58321,Juan Dela Cruz,"Bayo Grande, Anini-y, Antique",500,09171234567,08/08/2026,Active',
  ].join('\n');
}

function createCsvDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function validateImportedMemberRow(row = {}, currentMembers = [], seenCifs = new Set()) {
  const errors = [];
  const warnings = [];
  const rowNumber = Number(row.__rowNumber || row.__sourceRow || 0);
  const emptyRow = Object.entries(row).every(([key, value]) => key.startsWith('__') || String(value ?? '').trim() === '');
  if (emptyRow) {
    return { status: 'invalid', errors: ['Completely empty row'], warnings: [], isEmpty: true };
  }

  const cifNumber = normalizeImportText(row.cifNumber || row['CIFK Number'] || row['CIFK No.'] || row['CIFK No'] || row.CIFK || '');
  const memberName = normalizeImportText(row.member || row.Member || '');
  const barangay = normalizeImportText(row['Barangay / Municipality'] || row.barangay || '');
  const savingsRaw = String(row.Contribution ?? row.contribution ?? row.Savings ?? row.savings ?? '').trim();
  const benefitCategory = normalizeBenefitCategory(
    row.benefitCategory
    || row.BenefitCategory
    || row.Category
    || row.category
    || '',
  );
  const contact = normalizeImportText(row.Contact || row.contact || '');
  const lastContributionDateRaw = row['Last Contribution Date'] || row.lastContributionDate || '';
  const contributionDateRaw = pickImportValue(row, [
    'lastContributionDate',
    'Last Contribution Date',
    'last contribution date',
    'membershipDate',
    'Membership Date',
    'Date Joined',
    'Membership date',
    'dateJoined',
    'last_contribution_date',
    'Date Joined ',
  ]) || lastContributionDateRaw;
  const status = normalizeImportStatus(row.Status || row.status || '');
  const duplicatedInFile = cifNumber && seenCifs.has(cifNumber);
  const normalizedMemberName = normalizeComparableText(memberName);
  const normalizedContact = normalizeComparableText(contact);
  const existingSupabase = currentMembers.some((member) => {
    const memberCif = normalizeImportText(member.cifNumber || '');
    const memberId = normalizeImportText(member.memberId || '');
    const memberFullName = normalizeComparableText(member.fullName || [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' '));
    const memberContact = normalizeComparableText(member.contactNumber || '');
    const sameCif = cifNumber && (memberCif === cifNumber || memberId === cifNumber);
    const sameIdentity = normalizedMemberName && memberFullName && normalizedMemberName === memberFullName
      && (!normalizedContact || !memberContact || normalizedContact === memberContact);
    const sameContact = normalizedContact && memberContact && normalizedContact === memberContact;
    return sameCif || sameIdentity || sameContact;
  });

  if (!memberName) errors.push('Member name is required');

  if (cifNumber && !/^CIFK-\d{4}-\d{5}$/.test(cifNumber)) errors.push('Invalid CIFK format');
  if (!cifNumber) warnings.push('CIFK will be generated');
  if (duplicatedInFile) warnings.push('Duplicate CIFK');
  if (existingSupabase) errors.push('Member already exists');

  if (savingsRaw) {
    const parsedSavings = Number(String(savingsRaw).replace(/,/g, ''));
    if (!Number.isFinite(parsedSavings)) errors.push('Contribution must be numeric');
  }

  if (contact && !isPhone(contact)) errors.push('Invalid Contact');
  if (contributionDateRaw && String(contributionDateRaw).trim().toLowerCase() !== 'not set' && !normalizeImportedDate(contributionDateRaw)) errors.push('Invalid contribution date');
  if (row.Status || row.status) {
    if (!status) errors.push('Invalid member status');
  }

  const validation = errors[0] || warnings[0] || 'Valid';
  const level = errors.length ? 'invalid' : warnings.length ? 'warning' : 'valid';
  if (cifNumber) seenCifs.add(cifNumber);

  return {
    status: level,
    validation,
    errors,
    warnings,
    rowNumber,
    normalized: {
      cifNumber,
      member: memberName,
      barangay,
      savings: savingsRaw,
      benefitCategory,
      contact,
      lastContributionDate: normalizeImportedDate(contributionDateRaw),
      status: status,
    },
  };
}
function emptyBeneficiary() {
  return {
    name: '',
    firstName: '',
    lastName: '',
    middleName: '',
    suffixName: '',
    birthdate: '',
    ageYears: '',
    ageMonths: '',
    gender: GENDERS[0],
    civilStatus: CIVIL_STATUS_OPTIONS[0],
    religion: RELIGION_OPTIONS[0],
    religionOther: '',
    nationality: NATIONALITY_OPTIONS[0],
    nationalityOther: '',
    contactNumber: '',
    address: '',
    relationship: '',
    relationshipOther: '',
  };
}

function blankBeneficiaries() {
  return [emptyBeneficiary()];
}

const blankMember = {
  memberId: '',
  cifNumber: '',
  applicationStatus: APPLICATION_STATUS_OPTIONS[0],
  benefitCategory: MEMBER_BENEFIT_CATEGORIES[0],
  firstName: '',
  lastName: '',
  middleName: '',
  suffixName: '',
  fullName: '',
  address: '',
  barangay: barangayOnly(BARANGAYS[0]),
  birthdate: '',
  ageYears: '',
  ageMonths: '',
  gender: GENDERS[0],
  civilStatus: CIVIL_STATUS_OPTIONS[0],
  contactNumber: '',
  occupation: '',
  employer: '',
  officeAddress: '',
  religion: '',
  religionOther: '',
  dependents: 0,
  beneficiaries: blankBeneficiaries(),
  savingsAccountNo: '',
  membershipDate: todayIso(),
  lastContributionDate: todayIso(),
  signedDate: todayIso(),
  witnessStaff: '',
  actionTaken: ACTION_TAKEN_OPTIONS[0],
  approvingAuthority: '',
  approvalDate: '',
  findings: '',
  status: 'Pending',
  photo: '',
  shareCapital: 0,
  lastShareCapitalDepositDate: todayIso(),
};

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-4 text-sm font-black uppercase tracking-normal text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function DetailItem({ label, value }) {
  const displayValue = value === undefined || value === null || value === '' ? 'Not provided' : value;

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-900 dark:text-white">{displayValue}</p>
    </div>
  );
}

function CustomerInformationFile({ member }) {
  const beneficiaries = normalizeBeneficiaries(member.beneficiaries).filter((beneficiary) =>
    [beneficiary.name, beneficiary.age, beneficiary.address, beneficiary.relationship].some((value) => String(value || '').trim()),
  );
  const ageParts = member.ageYears || member.ageMonths ? member : calculateAgeParts(member.birthdate);
  const age = ageParts.ageYears !== '' || ageParts.ageMonths !== '' ? `${ageParts.ageYears || 0} yrs / ${ageParts.ageMonths || 0} mos` : '';

  return (
    <div className="print-area space-y-5 rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-teal-700 dark:text-teal-200">Member Profile</p>
          <h3 className="mt-1 text-2xl font-black tracking-normal text-slate-950 dark:text-white">{member.fullName}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">CIFK No. {formatCifNumber(member)}</p>
        </div>
      </div>

      <Section title="Customer Identification">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="CIFK Number" value={formatCifNumber(member)} />
          <DetailItem label="Customer Status" value={member.status} />
          <DetailItem label="COLISAP Category" value={member.benefitCategory} />
          <DetailItem label="Application Status" value={member.applicationStatus} />
          <DetailItem label="Membership Date" value={formatDate(member.membershipDate)} />
          <DetailItem label="Savings Account No." value={member.savingsAccountNo} />
        </div>
      </Section>

      <Section title="Personal Information">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="Full Name" value={member.fullName} />
          <DetailItem label="Suffix Name" value={member.suffixName} />
          <DetailItem label="Sex" value={member.gender} />
          <DetailItem label="Civil Status" value={member.civilStatus} />
          <DetailItem label="Date of Birth" value={formatDate(member.birthdate)} />
          <DetailItem label="Age" value={age} />
          <DetailItem label="Religion" value={member.religion} />
          <DetailItem label="Contact No." value={member.contactNumber} />
          <DetailItem label="Barangay / Municipality" value={barangayOnly(member.barangay)} />
          <DetailItem label="No. of Dependents" value={member.dependents} />
          <DetailItem label="Present Address" value={member.address} />
          <DetailItem label="Occupation" value={member.occupation} />
          <DetailItem label="Employer" value={member.employer} />
          <DetailItem label="Office Address" value={member.officeAddress} />
        </div>
      </Section>

      <Section title="Beneficiaries">
        {beneficiaries.length ? (
          <div className="grid gap-3">
            {beneficiaries.map((beneficiary, index) => (
              <div key={`${beneficiary.name}-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-[1.4fr_.5fr_1.5fr_1fr]">
                <DetailItem label="Name" value={beneficiary.name} />
                <DetailItem label="Age" value={beneficiary.age} />
                <DetailItem label="Address" value={beneficiary.address} />
                <DetailItem label="Relationship" value={beneficiary.relationship} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No beneficiaries recorded.</p>
        )}
      </Section>

      <Section title="Authorization and Processing">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="Signed Date" value={formatDate(member.signedDate)} />
          <DetailItem label="Witness / BMPC Staff" value={member.witnessStaff} />
          <DetailItem label="Action Taken" value={member.actionTaken} />
          <DetailItem label="Approving Authority" value={member.approvingAuthority} />
          <DetailItem label="Approval Date" value={formatDate(member.approvalDate)} />
          <DetailItem label="Findings" value={member.findings} />
        </div>
      </Section>
    </div>
  );
}

function barangayOnly(value = '') {
  const location = String(value).trim();
  if (!location) return '';
  return /,\s*Antique$/i.test(location) ? location : `${location}, Antique`;
}

function BarangaySearchField({ value, options, error, onChange }) {
  const [query, setQuery] = useState(barangayOnly(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(barangayOnly(value));
  }, [value]);

  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? options.filter((option) => option.toLowerCase().includes(normalizedQuery))
      : options;
    return filtered.slice(0, 50);
  }, [options, query]);

  const selectBarangay = (nextValue) => {
    onChange(nextValue);
    setQuery(nextValue);
    setOpen(false);
  };

  return (
    <label className="relative block md:col-span-2">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Barangay / Municipality</span>
      <div className="relative">
        <input
          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          placeholder="Search barangay or municipality"
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          aria-label="Search barangay"
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-900 dark:hover:text-teal-200"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <FiSearch />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-[4.55rem] z-20 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {matches.length ? (
            matches.map((option) => (
              <button
                key={option}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-500/10 dark:hover:text-teal-100"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectBarangay(option)}
              >
                {option}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">No barangay found.</p>
          )}
        </div>
      ) : null}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-300">{error}</span> : null}
    </label>
  );
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
    suffixName: '',
  };
}

function formatFullName(member) {
  const name = [member.firstName, member.middleName, member.lastName, member.suffixName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || String(member.fullName || '').trim();
}

function normalizeBeneficiaries(beneficiaries) {
  const rows = Array.isArray(beneficiaries) ? beneficiaries : [];
  return rows.length ? rows.map((row) => {
    const nameParts = row.firstName || row.lastName ? row : splitName(row.name);
    return {
      ...emptyBeneficiary(),
      ...row,
      firstName: nameParts.firstName || '',
      middleName: nameParts.middleName || '',
      lastName: nameParts.lastName || '',
      suffixName: row.suffixName || nameParts.suffixName || '',
    };
  }) : blankBeneficiaries();
}

function formatBeneficiaryName(beneficiary) {
  const name = [beneficiary.firstName, beneficiary.middleName, beneficiary.lastName, beneficiary.suffixName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || String(beneficiary.name || '').trim();
}

function isAdminRole(role) {
  return String(role || '').trim().toLowerCase() === String(ROLES.ADMIN || 'Admin').trim().toLowerCase()
    || String(role || '').trim().toLowerCase() === 'administrator'
    || String(role || '').trim().toLowerCase() === 'admin';
}

function calculateBeneficiaryAgeParts(birthdate, referenceDate = todayIso()) {
  if (!birthdate) return { ageYears: '' };
  const birth = new Date(birthdate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || birth > reference) return { ageYears: '' };

  let years = reference.getFullYear() - birth.getFullYear();
  if (reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())) {
    years -= 1;
  }

  return { ageYears: years };
}

function nextMemberId(members = [], registrationDate = todayIso()) {
  const highest = members.reduce((max, member) => {
    const match = String(member.memberId || '').match(/(\d+)$/);
    const value = match ? Number(match[1]) : Number(member.memberId);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 0);
  return String(highest + 1).padStart(6, '0');
}

function currentCifYear() {
  return new Date().getFullYear();
}

function calculateAgeParts(birthdate, referenceDate = todayIso()) {
  if (!birthdate) return { ageYears: '', ageMonths: '' };
  const birth = new Date(birthdate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || birth > reference) return { ageYears: '', ageMonths: '' };

  let years = reference.getFullYear() - birth.getFullYear();
  let months = reference.getMonth() - birth.getMonth();
  if (reference.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { ageYears: years, ageMonths: months };
}

function memberForForm(member, today) {
  if (!member) {
    return {
      ...blankMember,
      beneficiaries: blankBeneficiaries(),
      cifNumber: '',
      membershipDate: today,
      lastContributionDate: today,
      signedDate: today,
      lastShareCapitalDepositDate: today,
    };
  }

  const nameParts = member.firstName || member.lastName ? member : splitName(member.fullName);
  const ageParts = member.ageYears !== undefined && member.ageYears !== '' ? member : calculateAgeParts(member.birthdate);
  return {
    ...blankMember,
    ...member,
    firstName: nameParts.firstName || '',
    middleName: nameParts.middleName || '',
    lastName: nameParts.lastName || '',
    suffixName: member.suffixName || nameParts.suffixName || '',
    ageYears: ageParts.ageYears ?? '',
    beneficiaries: normalizeBeneficiaries(member.beneficiaries),
    barangay: barangayOnly(member.barangay || BARANGAYS[0]),
    applicationStatus: member.applicationStatus || APPLICATION_STATUS_OPTIONS[0],
    benefitCategory: normalizeBenefitCategory(member.benefitCategory || member.plan || MEMBER_BENEFIT_CATEGORIES[0]),
    civilStatus: member.civilStatus || CIVIL_STATUS_OPTIONS[0],
    religionOther: member.religionOther || '',
    actionTaken: member.actionTaken || ACTION_TAKEN_OPTIONS[0],
    cifNumber: new RegExp(`^CIFK-${currentCifYear()}-\\d{5}$`, 'i').test(String(member.cifNumber || '')) ? member.cifNumber : '',
    membershipDate: member.membershipDate || today,
    lastContributionDate: member.lastContributionDate || member.membershipDate || today,
    signedDate: member.signedDate || today,
    lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || member.membershipDate || today,
  };
}

function buildMemberPayload(form, { photoUrl, status, branch, cifNumber, existingMember } = {}) {
  const existingShareCapital = existingMember?.shareCapital;
  const shareCapital = form.shareCapital === '' || form.shareCapital === undefined || form.shareCapital === null
    ? Number(existingShareCapital || 0)
    : Number(form.shareCapital || 0);

  return {
    id: form.id || '',
    memberId: form.memberId || '',
    cifNumber: cifNumber || form.cifNumber || '',
    applicationStatus: form.applicationStatus || APPLICATION_STATUS_OPTIONS[0],
    firstName: form.firstName || '',
    middleName: form.middleName || '',
    lastName: form.lastName || '',
    suffixName: form.suffixName || '',
    fullName: formatFullName(form),
    address: form.address || '',
    barangay: barangayOnly(form.barangay),
    birthdate: form.birthdate || '',
    ageYears: form.ageYears === '' ? '' : Number(form.ageYears || 0),
    ageMonths: form.ageMonths === '' ? '' : Number(form.ageMonths || 0),
    gender: form.gender || GENDERS[0],
    civilStatus: form.civilStatus || CIVIL_STATUS_OPTIONS[0],
    contactNumber: form.contactNumber || '',
    occupation: form.occupation || '',
    employer: form.employer || '',
    officeAddress: form.officeAddress || '',
    religion: form.religionOther ? 'Others' : (form.religion || RELIGION_OPTIONS[0]),
    religionOther: form.religionOther || '',
    dependents: Number(form.dependents || 0),
    beneficiaries: normalizeBeneficiaries(form.beneficiaries).map((beneficiary) => ({
      ...emptyBeneficiary(),
      ...beneficiary,
      name: formatBeneficiaryName(beneficiary),
      ageYears: beneficiary.ageYears === '' ? '' : Number(beneficiary.ageYears || 0),
      ageMonths: beneficiary.ageMonths === '' ? '' : Number(beneficiary.ageMonths || 0),
    })),
    savingsAccountNo: form.savingsAccountNo || '',
    membershipDate: form.membershipDate || '',
    lastContributionDate: form.lastContributionDate || '',
    signedDate: form.signedDate || '',
    witnessStaff: form.witnessStaff || '',
    actionTaken: form.actionTaken || ACTION_TAKEN_OPTIONS[0],
    approvingAuthority: form.approvingAuthority || '',
    approvalDate: form.approvalDate || '',
    findings: form.findings || '',
    status: status || form.status || 'Pending',
    statusOverride: form.statusOverride || '',
    branch: branch || form.branch || 'Main Office',
    shareCapital,
    lastShareCapitalDepositDate: form.lastShareCapitalDepositDate || '',
    benefitCategory: normalizeBenefitCategory(form.benefitCategory || MEMBER_BENEFIT_CATEGORIES[0]),
    photo: photoUrl || form.photo || '',
    metadata: form.metadata || {},
  };
}

export default function Members() {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = isAdminRole(currentUser?.role);
  const isManager = currentUser?.role === ROLES.MANAGER;
  const isStaff = currentUser?.role === ROLES.STAFF;
  const isRequestMemberPage = location.pathname === '/request-member';
  const isRequestApprovalPage = location.pathname === '/request-approval';
  const canInput = Boolean(currentUser);
  const isApprover = isAdmin || isManager;
  const scopedData = data;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankMember);
  const [isSaving, setIsSaving] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importSummary, setImportSummary] = useState({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);
  const [returnedDraft, setReturnedDraft] = useState(blankMember);
  const [reviewDraft, setReviewDraft] = useState(blankMember);
  const [reviewReason, setReviewReason] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importPreviewOnly, setImportPreviewOnly] = useState(false);
  const [importStatusFilter, setImportStatusFilter] = useState('all');
  const csvInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const previewMembers = (request) => {
    const members = request?.importedMembers || request?.metadata?.importBatch?.members || [];
    return Array.isArray(members) ? members : [];
  };
  const currentForm = isRequestApprovalPage && requestTarget ? reviewDraft : requestTarget ? returnedDraft : form;
  const generatedCifNumber = useMemo(
    () => nextCifNumber([...(scopedData.members || []), ...(scopedData.requests || [])]),
    [scopedData.members, scopedData.requests],
  );
  const requestSummaryRow = useMemo(() => {
    if (!requestTarget) return null;
    const previewCount = previewMembers(requestTarget).length || 0;
    const displayName = requestTarget.fileName
      || requestTarget.metadata?.fileName
      || requestTarget.fullName
      || requestTarget.memberName
      || requestTarget.claimantName
      || '—';
    const submittedBy = requestTarget.submittedByName
      || requestTarget.requestedByName
      || requestTarget.requestedBy
      || '—';
    return {
      requestId: requestTarget.requestId || requestTarget.id || requestTarget.request_id || '—',
      fileName: displayName,
      submittedBy,
      totalMembers: String(requestTarget.totalMembers ?? requestTarget.metadata?.totalMembers ?? (previewCount || (requestTarget.requestType === 'Member Request' ? 1 : 0))),
      dateSubmitted: requestTarget.submittedAt ? formatDate(requestTarget.submittedAt) : '—',
      status: requestTarget.requestStatus || requestTarget.status || 'Pending',
    };
  }, [requestTarget]);

  const computedStatus = useMemo(
    () => getComputedMemberStatus({ ...currentForm, id: editing?.id || currentForm.id }, scopedData.loans),
    [currentForm, editing?.id, scopedData.loans],
  );
  const filteredImportRows = useMemo(() => {
    if (importStatusFilter === 'all') return importRows;
    if (importStatusFilter === 'valid') return importRows.filter((row) => row.isValid);
    if (importStatusFilter === 'invalid') return importRows.filter((row) => row.statusTone === 'invalid' || row.importStatus?.toLowerCase() === 'invalid');
    if (importStatusFilter === 'duplicate') return importRows.filter((row) => row.isDuplicate || row.importStatus?.toLowerCase() === 'duplicate');
    return importRows;
  }, [importRows, importStatusFilter]);
  const barangayFilterOptions = useMemo(
    () => Array.from(new Set([...BARANGAYS, ...scopedData.members.map((member) => barangayOnly(member.barangay)).filter(Boolean)])).sort((a, b) => a.localeCompare(b)),
    [scopedData.members],
  );
  const copyRequestSummary = async () => {
    if (!requestSummaryRow) return;
    const text = [
      `Request ID\tMember / File Name\tSubmitted By\tTotal Members\tDate Submitted\tStatus`,
      `${requestSummaryRow.requestId}\t${requestSummaryRow.fileName}\t${requestSummaryRow.submittedBy}\t${requestSummaryRow.totalMembers}\t${requestSummaryRow.dateSubmitted}\t${requestSummaryRow.status}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Request summary copied to clipboard.', 'success');
    } catch {
      showToast('Unable to copy request summary.', 'error');
    }
  };
  const columns = useMemo(
    () => [
      { key: 'memberId', label: 'CIFK Number', className: 'w-36', cellClassName: 'whitespace-nowrap w-36', render: (row) => row.cifNumber || row.memberId || 'â€”' },
      {
        key: 'fullName',
        label: 'Member',
        className: 'min-w-52',
        cellClassName: 'min-w-52',
        render: (row) => (
          <div className="min-w-0">
            <p className="leading-tight font-semibold text-slate-900">{row.fullName}</p>
          </div>
        ),
      },
      { key: 'barangay', label: 'Barangay / Municipality', className: 'min-w-52 max-w-64', cellClassName: 'min-w-52 max-w-64 whitespace-normal', render: (row) => barangayOnly(row.barangay) },
      {
        key: 'shareCapital',
        label: 'Contribution',
        className: 'whitespace-nowrap',
        cellClassName: 'whitespace-nowrap',
        render: (row) => formatCurrency(Number(row.shareCapital || 0)),
      },
      { key: 'benefitCategory', label: 'Category', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap', render: (row) => row.benefitCategory || '—' },
      { key: 'contactNumber', label: 'Contact', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap' },
      { key: 'membershipDate', label: 'Last Contribution Date', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap', render: (row) => formatDate(row.membershipDate) },
      { key: 'status', label: 'Status', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [],
  );

  
  const requestColumns = useMemo(
    () => [
      { key: 'requestId', label: 'Request ID', sortable: false, render: (row) => row.requestId || row.request_id || row.id || '—' },
      { key: 'fileName', label: 'Member / File Name', render: (row) => row.fileName || row.file_name || row.metadata?.fileName || '—' },
      { key: 'submittedByName', label: 'Submitted By', render: (row) => row.submittedByName || row.requestedByName || row.requestedBy || '—' },
      { key: 'totalMembers', label: 'Total Members', render: (row) => String(row.totalMembers ?? row.total_members ?? previewMembers(row).length ?? 0) },
      { key: 'submittedAt', label: 'Date Submitted', render: (row) => row.submittedAt ? formatDate(row.submittedAt) : '—' },
      { key: 'requestStatus', label: 'Status', render: (row) => <Badge>{row.requestStatus || 'Pending'}</Badge> },
    ],
    [],
  );

  const openForm = (member = null) => {
    const today = todayIso();
    setEditing(member);
    setForm(
      member
        ? { ...memberForForm(member, today, scopedData.members), cifNumber: generatedCifNumber }
        : {
            ...memberForForm(member, today, scopedData.members),
            memberId: nextMemberId(scopedData.members, today),
            cifNumber: generatedCifNumber,
        },
    );
    setErrors({});
    setModalOpen(true);
  };

  const updateBeneficiary = (index, field, value) => {
    setForm((current) => ({
      ...current,
      beneficiaries: normalizeBeneficiaries(current.beneficiaries).map((beneficiary, rowIndex) =>
        rowIndex === index ? { ...beneficiary, [field]: value } : beneficiary,
      ),
    }));
  };

  const addBeneficiary = () => {
    setForm((current) => ({
      ...current,
      beneficiaries: [...normalizeBeneficiaries(current.beneficiaries), emptyBeneficiary()],
    }));
  };

  const updateBeneficiaryBirthdate = (index, birthdate) => {
    setForm((current) => {
      const nextAge = calculateBeneficiaryAgeParts(birthdate);
      return {
        ...current,
        beneficiaries: normalizeBeneficiaries(current.beneficiaries).map((beneficiary, rowIndex) =>
          rowIndex === index
            ? {
                ...beneficiary,
                birthdate,
                ...nextAge,
              }
            : beneficiary,
        ),
      };
    });
  };

  const removeBeneficiary = (index) => {
    setForm((current) => {
      const nextBeneficiaries = normalizeBeneficiaries(current.beneficiaries).filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        beneficiaries: nextBeneficiaries.length ? nextBeneficiaries : blankBeneficiaries(),
      };
    });
  };

  const updateBeneficiaryNationality = (index, value) => {
    if (value === 'Others (specify)') {
      updateBeneficiary(index, 'nationality', 'Others (specify)');
      updateBeneficiary(index, 'nationalityOther', '');
      return;
    }

    updateBeneficiary(index, 'nationality', value);
    updateBeneficiary(index, 'nationalityOther', '');
  };

  const updateBeneficiaryCustomNationality = (index, value) => {
    updateBeneficiary(index, 'nationality', value);
    updateBeneficiary(index, 'nationalityOther', value);
  };

  const updateBeneficiaryRelationship = (index, value) => {
    if (value === 'Others') {
      updateBeneficiary(index, 'relationship', 'Others');
      updateBeneficiary(index, 'relationshipOther', '');
      return;
    }

    updateBeneficiary(index, 'relationship', value);
    updateBeneficiary(index, 'relationshipOther', '');
  };

  const updateBeneficiaryCustomRelationship = (index, value) => {
    updateBeneficiary(index, 'relationship', value);
    updateBeneficiary(index, 'relationshipOther', value);
  };

  const updateMemberReligion = (value) => {
    if (value === 'Others') {
      setForm((current) => ({ ...current, religion: 'Others', religionOther: '' }));
      return;
    }

    setForm((current) => ({ ...current, religion: value, religionOther: '' }));
  };

  const updateMemberCustomReligion = (value) => {
    setForm((current) => ({ ...current, religion: value, religionOther: value }));
  };

  const updateBeneficiaryReligion = (index, value) => {
    if (value === 'Others') {
      updateBeneficiary(index, 'religion', 'Others');
      updateBeneficiary(index, 'religionOther', '');
      return;
    }

    updateBeneficiary(index, 'religion', value);
    updateBeneficiary(index, 'religionOther', '');
  };

  const updateBeneficiaryCustomReligion = (index, value) => {
    updateBeneficiary(index, 'religion', value);
    updateBeneficiary(index, 'religionOther', value);
  };

  const updateBirthdate = (birthdate) => {
    setForm((current) => ({
      ...current,
      birthdate,
      ...calculateAgeParts(birthdate),
    }));
  };

  const validate = () => {
    const existingCifConflict = scopedData.members.some((member) => String(member.cifNumber || member.memberId || '').trim() === String(currentForm.cifNumber || '').trim())
      || (Array.isArray(scopedData.requests) && scopedData.requests.some((request) =>
        ['pending', 'returned', 'approved', 'rejected'].includes(String(request.requestStatus || '').toLowerCase())
        && String(request.cifNumber || request.memberId || '').trim() === String(currentForm.cifNumber || '').trim()));
    const requestMemberFields = isRequestMemberPage ? [
      { field: 'memberId', valid: required(currentForm.cifNumber), message: 'CIFK number is required.' },
      { field: 'memberId', valid: !existingCifConflict, message: 'CIFK number already exists.' },
      { field: 'fullName', valid: required(currentForm.fullName), message: 'Member name is required.' },
      { field: 'barangay', valid: required(currentForm.barangay), message: 'Barangay / Municipality is required.' },
      { field: 'shareCapital', valid: Number.isFinite(Number(currentForm.shareCapital ?? 0)), message: 'Contribution is required.' },
      { field: 'contactNumber', valid: isPhone(currentForm.contactNumber), message: 'Use a valid PH mobile number.' },
      { field: 'lastContributionDate', valid: required(currentForm.lastContributionDate), message: 'Last contribution date is required.' },
    ] : [
      { field: 'memberId', valid: required(currentForm.cifNumber), message: 'CIFK number is required.' },
      { field: 'memberId', valid: uniqueBy(scopedData.members, 'cifNumber', currentForm.cifNumber, editing?.id), message: 'CIFK number already exists.' },
      { field: 'firstName', valid: required(currentForm.firstName), message: 'First name is required.' },
      { field: 'lastName', valid: required(currentForm.lastName), message: 'Last name is required.' },
      { field: 'address', valid: required(currentForm.address), message: 'Present address is required.' },
      { field: 'contactNumber', valid: isPhone(currentForm.contactNumber), message: 'Use a valid PH mobile number.' },
      { field: 'birthdate', valid: required(currentForm.birthdate), message: 'Date of birth is required.' },
      { field: 'membershipDate', valid: required(currentForm.membershipDate), message: 'Membership date is required.' },
      { field: 'lastShareCapitalDepositDate', valid: required(currentForm.lastShareCapitalDepositDate), message: 'Last capital deposit date is required.' },
    ];
    const nextErrors = buildErrorMap(requestMemberFields);
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const saveMember = async () => {
    if (!validate()) {
      showToast('Please correct the highlighted member fields.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const nextMember = buildMemberPayload(currentForm, {
        status: isApprover ? computedStatus : 'Pending',
        branch: currentForm.branch || currentUser?.branch || 'Main Office',
        cifNumber: currentForm.cifNumber || '',
        existingMember: editing,
      });

      if (isRequestMemberPage && requestTarget) {
        await data.updateRequest(requestTarget.id, {
          ...nextMember,
          requestStatus: 'Pending',
          resubmittedAt: new Date().toISOString(),
          returnedAt: null,
          rejectionReason: '',
          returnReason: '',
        }, currentUser.username);
        showToast('Returned request resubmitted for approval.');
      } else if (isStaff && !editing) {
        await data.createRequest({
          ...nextMember,
          requestedBy: currentUser.username,
          requestedByName: currentUser.fullName || currentUser.username,
        }, currentUser.username);
        showToast('Member request submitted for approval.');
      } else if (editing) {
        data.updateMember(editing.id, nextMember, currentUser.username);
        showToast('Member profile updated.');
      } else {
        await data.createMember(nextMember, currentUser.username);
        showToast('Member profile created.');
      }
      setModalOpen(false);
      setRequestTarget(null);
      setReturnedDraft(blankMember);
      setForm(blankMember);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to save member photo.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    data.deleteMember(deleteTarget.id, currentUser.username);
    setDeleteTarget(null);
    showToast('Member deleted.');
  };

  const buildImportPreview = async (rows = []) => {
    const parsedRows = Array.isArray(rows) ? rows : [];
    const seenImportCifs = new Set();
    const seenImportRows = new Set();
    const currentMembers = Array.isArray(scopedData.members) ? scopedData.members : [];
    const allMembers = Array.isArray(data.members) ? data.members : currentMembers;
    const previewRows = parsedRows
      .map((row, index) => ({ row: { ...(row || {}) }, index }))
      .filter(({ row }) => {
        const values = Object.entries(row).filter(([key]) => !key.startsWith('__')).map(([, value]) => String(value ?? '').trim());
        return values.some(Boolean) && (
          normalizeImportText(pickImportValue(row, ['CIFK Number', 'CIFK No.', 'CIFK No', 'CIFK', 'cifNumber']))
          || normalizeImportText(pickImportValue(row, ['Member', 'Member Name', 'Full Name', 'Name']))
        );
      })
      .map(({ row, index }) => {
        const sourceRow = Number(row.__rowNumber || row.__sourceRow || index + 1);
        const sheetCif = normalizeImportText(pickImportValue(row, ['CIFK Number', 'CIFK No.', 'CIFK No', 'CIFK', 'cifNumber']));
        const memberName = normalizeImportText(pickImportValue(row, ['Member', 'Member Name', 'Full Name', 'Name']));
        const barangay = normalizeImportText(pickImportValue(row, ['Barangay / Municipality', 'Barangay', 'Municipality']));
        const savings = normalizeImportText(pickImportValue(row, ['Contribution', 'Savings']));
        const benefitCategory = normalizeBenefitCategory(pickImportValue(row, ['Category', 'Benefit Category', 'benefitCategory', 'category']));
        const contact = normalizeImportText(pickImportValue(row, ['Contact']));
        const lastContribution = getImportedContributionDate(row);
        const status = normalizeImportStatus(pickImportValue(row, ['Status']));
        const validation = validateImportedMemberRow({
          ...row,
          cifNumber: sheetCif,
          member: memberName,
          barangay,
          Contribution: savings,
          Category: benefitCategory,
          benefitCategory,
          Contact: contact,
          'Last Contribution Date': lastContribution,
          Status: status,
          __rowNumber: sourceRow,
          __sourceRow: row.__sourceRow || sourceRow,
        }, allMembers, seenImportCifs);
        const identityKey = [
          sourceRow,
          validation.normalized.cifNumber || sheetCif || '',
          validation.normalized.member || memberName || '',
          validation.normalized.contact || contact || '',
          validation.normalized.lastContributionDate || '',
        ].map((value) => String(value || '').trim().toLowerCase()).join('|');
        if (seenImportRows.has(identityKey)) return null;
        seenImportRows.add(identityKey);
        return {
          ...validation.normalized,
          benefitCategory: validation.normalized.benefitCategory || benefitCategory,
          raw: row,
          rowNumber: sourceRow,
          normalized: validation.normalized,
          validation: validation.validation,
          statusTone: validation.status,
          errors: validation.errors,
          warnings: validation.warnings,
          isDuplicate: validation.errors.some((item) => /duplicate|already exists/i.test(item))
            || validation.warnings.some((item) => /duplicate|already exists/i.test(item)),
          isValid: validation.status === 'valid',
        };
      })
      .filter(Boolean);

    const total = previewRows.length;
    const valid = previewRows.filter((item) => item.isValid).length;
    const invalid = previewRows.filter((item) => item.statusTone === 'invalid').length;
    const duplicates = previewRows.filter((item) => item.isDuplicate).length;
    setImportRows(previewRows);
    setImportSummary({ total, valid, invalid, duplicates });
    return previewRows;
  };

  const handleImportSelection = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      setIsImporting(true);
      setImportFileName(file.name || 'imported-members.csv');
      const rows = await parseFile(file);
      const previewRows = await buildImportPreview(rows);
      if (isStaff) {
        setImportRows(previewRows);
        await importValidMembers(previewRows, file.name || 'imported-members.csv');
      } else {
        setImportRows(previewRows);
        setImportStatusFilter('all');
        setImportSummary({
          total: previewRows.length,
          valid: previewRows.filter((row) => row.isValid).length,
          invalid: previewRows.filter((row) => row.statusTone === 'invalid').length,
          duplicates: previewRows.filter((row) => row.isDuplicate).length,
        });
        setImportModalOpen(true);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to read import file.', 'error');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const importValidMembers = async (rows = importRows, fileName = importFileName) => {
    const validRows = rows.filter((row) => row.isValid);
    if (!validRows.length) {
      showToast('No valid rows to import.', 'error');
      return;
    }

    const importedMembers = rows.map((row, index) => {
      const rowNumber = row.rowNumber || index + 1;
      const member = mapImportedMemberRow({
        ...row.raw,
        __rowNumber: rowNumber,
        __sourceRow: rowNumber,
      }, row.cifNumber || '');
      const contributionDate =
        row.lastContributionDate
        || row.normalized?.lastContributionDate
        || getImportedContributionDate(row.raw)
        || member.lastContributionDate
        || member.membershipDate
        || todayIso();
      return {
        ...member,
        cifNumber: row.cifNumber || member.cifNumber,
        memberId: row.cifNumber || member.memberId,
        fullName: row.member || member.fullName,
        full_name: row.member || member.fullName,
        barangay: row.barangay || member.barangay,
        shareCapital: normalizeImportedNumber(row.savings),
        benefitCategory: row.benefitCategory || row.normalized?.benefitCategory || member.benefitCategory,
        contactNumber: row.contact || row.normalized?.contact || member.contactNumber,
        contact: row.contact || row.normalized?.contact || member.contactNumber,
        lastContributionDate: contributionDate || member.lastContributionDate || member.membershipDate || todayIso(),
        membershipDate: contributionDate || member.membershipDate || member.lastContributionDate || todayIso(),
        status: row.normalized.status,
        importStatus: row.importStatus || row.validation || (row.isDuplicate ? 'Duplicate' : row.isValid ? 'Valid' : 'Invalid'),
        importStatusTone: row.statusTone || (row.isDuplicate ? 'duplicate' : row.isValid ? 'valid' : 'invalid'),
        isValid: Boolean(row.isValid),
        isDuplicate: Boolean(row.isDuplicate),
        metadata: {
          ...(member.metadata || {}),
          importedFrom: 'csv_excel',
          preserveImportedValues: true,
          importOrder: rowNumber,
          sourceRow: rowNumber,
          sourceSheetRow: rowNumber,
          importKey: `${rowNumber}-${row.cifNumber || member.cifNumber}`,
        },
      };
    });

    setImportFileName((current) => current || 'import-file');
    setIsImporting(true);
    try {
      if (isStaff) {
        await data.createRequest({
          requestType: 'Imported Member Batch',
          requestKind: 'batch-import',
          approvalQueue: 'member-import',
          requestStatus: 'Pending',
          submittedAt: new Date().toISOString(),
          submittedBy: currentUser?.username || 'staff',
          submittedByName: currentUser?.fullName || currentUser?.username || 'Staff',
          fileName: fileName || 'imported-members.csv',
          totalMembers: rows.length,
          importedMembers,
          metadata: {
            importedFrom: 'csv_excel',
            fileName: fileName || 'imported-members.csv',
            importSummary: { total: rows.length, valid: rows.filter((row) => row.isValid).length, invalid: rows.filter((row) => row.statusTone === 'invalid').length, duplicates: rows.filter((row) => row.isDuplicate).length },
            importBatch: {
              fileName: fileName || 'imported-members.csv',
              totalMembers: rows.length,
              members: importedMembers,
            },
          },
        }, currentUser?.username || 'staff');
        showToast(`${rows.length} imported row(s) submitted for approval.`, 'success');
      } else {
        const creator = typeof data.createMember === 'function' ? data.createMember : null;
        if (!creator) {
          throw new Error('Member import is unavailable right now.');
        }

        await Promise.all(
          importedMembers.map((member) => creator(member, currentUser?.username || 'System')),
        );
        showToast(`${importedMembers.length} members imported successfully. ${importRows.length - importedMembers.length} row(s) skipped.`, 'success');
      }
      setImportModalOpen(false);
      setImportRows([]);
      setImportSummary({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
      setImportFileName('');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to import members.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const finishRequestReview = (message) => {
    setModalOpen(false);
    setRequestTarget(null);
    setReviewReason('');
    showToast(message);
    navigate('/members', { replace: true });
  };

  const requireReviewReason = () => {
    const reason = reviewReason.trim();
    if (!reason) {
      showToast('Please enter a reason before submitting your decision.', 'error');
      return '';
    }
    return reason;
  };

  const reviewRequest = async (action, message, payload = {}) => {
    if (!requestTarget) return;
    try {
      const requestKey = requestTarget.requestId || requestTarget.id;
      await action(requestKey, { fullName: currentForm.fullName, ...payload }, currentUser.username);
      finishRequestReview(message);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to submit request decision.', 'error');
    }
  };

  const openRequest = (request) => {
    if (isBatchImportRequest(request)) {
      const members = previewMembers(request);
      const previewRows = members.map((member, index) => ({
        rowNumber: index + 1,
        cifNumber: member.cifNumber || member.memberId || '',
        member: member.fullName || member.member || member.full_name || 'Unnamed member',
        barangay: member.barangay || '',
        savings: String(member.shareCapital ?? member.contribution ?? 0),
        contact: member.contactNumber || '',
        lastContributionDate: member.lastContributionDate || member.membershipDate || member.lastShareCapitalDepositDate || '',
        normalized: { status: member.status || 'Active' },
        validation: member.validation || member.importStatus || member.status || 'Valid',
        statusTone: member.statusTone || member.importStatusTone || String(member.importStatus || member.status || '').toLowerCase() || 'valid',
        isValid: Boolean(member.isValid ?? String(member.importStatus || member.status || '').toLowerCase() === 'valid'),
        isDuplicate: Boolean(member.isDuplicate ?? String(member.importStatus || '').toLowerCase() === 'duplicate'),
        importStatus: member.importStatus || member.status || 'Valid',
      }));
      setRequestTarget(request);
      setImportRows(previewRows);
      setImportStatusFilter('all');
      setImportSummary({
        total: previewRows.length,
        valid: previewRows.filter((row) => row.isValid).length,
        invalid: previewRows.filter((row) => row.statusTone === 'invalid').length,
        duplicates: previewRows.filter((row) => row.isDuplicate).length,
      });
      setImportFileName(request.fileName || request.metadata?.fileName || 'imported-members.csv');
      setImportPreviewOnly(true);
      setImportModalOpen(true);
      return;
    }

    setRequestTarget(request);
    setEditing(null);
    setReviewDraft(memberForForm(request, todayIso()));
    setReturnedDraft(blankMember);
    setForm(blankMember);
    setErrors({});
    setReviewReason(request.returnReason || request.rejectionReason || request.approvalReason || '');
    setModalOpen(true);
  };

  const isBatchImportRequest = (request) => String(request?.requestType || '').toLowerCase() === 'imported member batch'
    || String(request?.requestKind || '').toLowerCase() === 'batch-import'
    || String(request?.approvalQueue || '').toLowerCase() === 'member-import';

  const isClaimantRequest = (request) => {
    const requestType = String(request?.requestType || request?.metadata?.claimantApplication?.requestType || '').toLowerCase();
    const requestKind = String(request?.requestKind || request?.metadata?.requestKind || request?.metadata?.claimantApplication?.requestKind || '').toLowerCase();
    const approvalQueue = String(request?.approvalQueue || request?.metadata?.approvalQueue || request?.metadata?.claimantApplication?.approvalQueue || '').toLowerCase();
    return requestType === 'claimant application'
      || requestType.includes('claimant application')
      || requestKind === 'claimant'
      || approvalQueue === 'claimant';
  };
  const requestRows = useMemo(
    () => (data.requests || []).filter((request) =>
      ['pending', 'returned'].includes(String(request.requestStatus || '').toLowerCase())
      && String(request.requestType || request?.metadata?.claimantApplication?.requestType || 'member request').toLowerCase() === 'member request'
    ),
    [data.requests],
  );
  const memberRequestRows = useMemo(
    () => (data.requests || []).filter((request) =>
      ['pending', 'returned'].includes(String(request.requestStatus || '').toLowerCase())
      && (!isClaimantRequest(request) || String(request.requestType || '').toLowerCase() === 'imported member batch')
    ),
    [data.requests],
  );
  const returnedRequests = useMemo(
    () => (data.requests || []).filter((request) => request.requestStatus === 'Returned' && (!currentUser?.username || request.requestedBy === currentUser.username)),
    [currentUser?.username, data.requests],
  );
  const formContent = (
    <div className="space-y-5">
      {true ? (
        <>
      <Section title="I. Membership Summary">
        <div className="grid gap-4 md:grid-cols-12">
          <FormField
            className="md:col-span-2"
            error={errors.memberId}
            inputClassName="bg-slate-50 dark:bg-slate-900"
            label="CIFK Number"
            value={currentForm.cifNumber}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, cifNumber: event.target.value }))
              : setForm((current) => ({ ...current, cifNumber: event.target.value })))}
          />
          <FormField
            className="md:col-span-2"
            disabled={isRequestApprovalPage}
            label="Member"
            value={currentForm.fullName}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, fullName: event.target.value }))
              : setForm((current) => ({ ...current, fullName: event.target.value })))}
          />
          <SearchableTextField
            className="md:col-span-3"
            emptyMessage="No Antique address found."
            label="Barangay / Municipality"
            options={BARANGAYS}
            placeholder="Select barangay / municipality"
            value={currentForm.barangay}
            onChange={(barangay) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, barangay }))
              : setForm((current) => ({ ...current, barangay })))}
          />
          <FormField
            className="md:col-span-1"
            inputClassName="appearance-textfield"
            disabled={isRequestApprovalPage}
            inputMode="decimal"
            label="Contribution"
            type="text"
            value={currentForm.shareCapital ?? 0}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, shareCapital: event.target.value === '' ? 0 : Number(event.target.value) }))
              : setForm((current) => ({ ...current, shareCapital: event.target.value === '' ? 0 : Number(event.target.value) })))}
          />
          <FormField
            as="select"
            className="md:col-span-1"
            disabled={isRequestApprovalPage}
            options={BENEFIT_CATEGORY_OPTIONS}
            label="Category"
            value={currentForm.benefitCategory}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, benefitCategory: event.target.value }))
              : setForm((current) => ({ ...current, benefitCategory: event.target.value })))}
          />
          <FormField
            className="md:col-span-2"
            error={errors.contactNumber}
            disabled={isRequestApprovalPage}
            label="Contact"
            value={currentForm.contactNumber}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, contactNumber: event.target.value }))
              : setForm((current) => ({ ...current, contactNumber: event.target.value })))}
          />
          <FormField
            className="md:col-span-2"
            error={errors.membershipDate}
            disabled={isRequestApprovalPage}
            label="Last Contribution Date"
            type="date"
            value={currentForm.lastContributionDate}
            onChange={(event) => (requestTarget
              ? setReturnedDraft((current) => ({ ...current, lastContributionDate: event.target.value }))
              : setForm((current) => ({ ...current, lastContributionDate: event.target.value })))}
          />
        </div>
      </Section>
        </>
      ) : null}

      {isRequestApprovalPage ? (
        <>
        </>
      ) : null}

    </div>
  );

  return (
    <div className="space-y-6">
      {isRequestMemberPage ? (
        <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="mb-6 flex flex-col gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Member Intake</p>
            <h2 className="text-2xl font-bold text-slate-900">New Member Request Form</h2>
            <p className="text-sm text-slate-500">Complete the same member details here to create a new request and save it to Supabase.</p>
          </div>
          {formContent}
          {returnedRequests.length ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">Returned for correction</h3>
                  <p className="text-xs text-amber-800">Open the returned application form, review the missing requirements, and resubmit it.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {returnedRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{request.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {request.cifNumber || request.memberId || 'â€”'} Â· Returned: {formatDate(request.returnedAt)} Â· Reason: {request.returnReason || 'Please review missing requirements.'}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRequestTarget(request);
                        setEditing(null);
                        setReturnedDraft(memberForForm(request, todayIso()));
                        setReviewDraft(blankMember);
                        setForm(blankMember);
                        setErrors({});
                        setReviewReason(request.returnReason || '');
                        setModalOpen(true);
                      }}
                    >
                      Continue Editing
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button onClick={saveMember} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Submit Request Member'}
            </Button>
          </div>
        </section>
      ) : (
        <>
          {isRequestApprovalPage ? (
            <div className="space-y-6">
              <DataTable
                actions={memberRequestRows.length ? (row) => (
                  <div className="flex justify-end gap-2">
                    <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openRequest(row)}>
                      Preview
                    </Button>
                  </div>
                ) : null}
                columns={requestColumns}
                data={memberRequestRows}
                searchFields={['cifNumber', 'fullName', 'requestedByName', 'benefitCategory']}
                title=""
              />
            </div>
          ) : (
          <DataTable
              addAction={(
                <div className="flex flex-wrap gap-2">
                  {!isRequestMemberPage && isStaff ? (
                    <Button icon={FiUserPlus} variant="secondary" onClick={() => navigate('/request-member')}>
                      Request Member
                    </Button>
                  ) : null}
                  {!isManager && !isAdmin ? (
                    <>
                      <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleImportSelection}
                      />
                      <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={handleImportSelection}
                      />
                      <Button icon={FiUpload} variant="secondary" onClick={() => csvInputRef.current?.click()} disabled={isImporting}>
                        Import CSV
                      </Button>
                      <Button icon={FiFile} onClick={() => excelInputRef.current?.click()} disabled={isImporting}>
                        Import Excel
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
              actions={null}
              columns={columns}
              data={scopedData.members}
              description={isAdmin ? 'Admin: all branches with edit and delete access.' : 'Manage member profiles.'}
              initialSortKey={null}
              filters={[
                { key: 'benefitCategory', label: 'Benefit Category', options: MEMBER_BENEFIT_CATEGORIES },
                { key: 'status', label: 'Status', options: MEMBER_STATUSES },
              ]}
              searchFields={['memberId', 'fullName', 'firstName', 'lastName', 'middleName', 'suffixName', 'barangay', 'contactNumber', 'address', 'occupation', 'employer']}
              title="Members"
            />
          )}

          <Modal
            open={importModalOpen}
            title={importPreviewOnly ? 'Batch Preview' : 'Import Members Preview'}
            maxWidth="max-w-7xl"
            onClose={() => {
              setImportModalOpen(false);
              setImportRows([]);
              setImportStatusFilter('all');
              setImportSummary({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
              setImportFileName('');
              setImportPreviewOnly(false);
            }}
            footer={(
              <>
                <Button variant="secondary" onClick={() => {
                  setImportModalOpen(false);
                  setImportRows([]);
                  setImportStatusFilter('all');
                  setImportSummary({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
                  setImportFileName('');
                  setImportPreviewOnly(false);
                }}>
                  Cancel
                </Button>
                {importPreviewOnly ? (
                  <Button
                    onClick={async () => {
                      if (!requestTarget) return;
                      await data.approveRequest(requestTarget.requestId || requestTarget.id, {
                        approvalReason: `Approved imported batch ${requestTarget.fileName || importFileName || 'request'}.`,
                      }, currentUser.username);
                      setImportModalOpen(false);
                      setImportRows([]);
                      setImportStatusFilter('all');
                      setImportSummary({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
                      setImportFileName('');
                      setImportPreviewOnly(false);
                      setRequestTarget(null);
                    }}
                    disabled={!importRows.some((row) => row.isValid) || isImporting}
                  >
                    Import Member
                  </Button>
                ) : isStaff ? (
                  <Button onClick={importValidMembers} disabled={!importRows.some((row) => row.isValid) || isImporting}>
                    Submit Request
                  </Button>
                ) : (
                  <Button onClick={importValidMembers} disabled={!importRows.some((row) => row.isValid) || isImporting}>
                    Import Valid Members
                  </Button>
                )}
              </>
            )}
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${importStatusFilter === 'all' ? 'border-slate-400 bg-slate-100 shadow-sm' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'}`}
                  onClick={() => setImportStatusFilter('all')}
                >
                  <p className="text-xs font-bold uppercase text-slate-500">Total Rows</p>
                  <p className="text-2xl font-bold text-slate-900">{importSummary.total}</p>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${importStatusFilter === 'valid' ? 'border-emerald-400 bg-emerald-100 shadow-sm' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'}`}
                  onClick={() => setImportStatusFilter('valid')}
                >
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-200">Valid</p>
                  <p className="text-2xl font-black text-emerald-800 dark:text-emerald-100">{importSummary.valid}</p>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${importStatusFilter === 'invalid' ? 'border-rose-400 bg-rose-100 shadow-sm' : 'border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10'}`}
                  onClick={() => setImportStatusFilter('invalid')}
                >
                  <p className="text-xs font-bold uppercase text-rose-700 dark:text-rose-200">Invalid</p>
                  <p className="text-2xl font-black text-rose-800 dark:text-rose-100">{importSummary.invalid}</p>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${importStatusFilter === 'duplicate' ? 'border-amber-400 bg-amber-100 shadow-sm' : 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'}`}
                  onClick={() => setImportStatusFilter('duplicate')}
                >
                  <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-200">Duplicates</p>
                  <p className="text-2xl font-black text-amber-800 dark:text-amber-100">{importSummary.duplicates}</p>
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <p>
                  Showing
                  {' '}
                  <span className="font-semibold text-slate-900">{filteredImportRows.length}</span>
                  {' '}
                  of
                  {' '}
                  <span className="font-semibold text-slate-900">{importSummary.total}</span>
                  {' '}
                  rows
                </p>
                <Button variant="secondary" className="min-h-0 rounded-full px-4 py-2 text-xs font-semibold" onClick={() => setImportStatusFilter('all')}>
                  Clear Filter
                </Button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-5">CIFK Number</th>
                        <th className="px-6 py-5">Member</th>
                        <th className="px-6 py-5">Barangay / Municipality</th>
                        <th className="px-6 py-5">Contribution</th>
                        <th className="px-6 py-5">Category</th>
                        <th className="px-6 py-5">Contact</th>
                        <th className="px-6 py-5">Last Contribution Date</th>
                        <th className="px-6 py-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredImportRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.cifNumber || row.member || ''}`}
                        className={row.statusTone === 'invalid' ? 'bg-rose-50/40' : row.statusTone === 'warning' ? 'bg-amber-50/40' : ''}
                      >
                        <td className="px-6 py-5 whitespace-nowrap">{row.cifNumber || 'Will generate'}</td>
                        <td className="px-6 py-5 whitespace-nowrap font-semibold">{row.member || 'Missing member name'}</td>
                        <td className="px-6 py-5">{row.barangay || 'â€”'}</td>
                        <td className="px-6 py-5 whitespace-nowrap">₱{row.savings ? Number(String(row.savings).replace(/,/g, '')).toLocaleString('en-PH') : '0'}</td>
                        <td className="px-6 py-5 whitespace-nowrap">{row.benefitCategory || row.category || 'â€”'}</td>
                        <td className="px-6 py-5 whitespace-nowrap">{row.contact || row.contactNumber || row.normalized?.contact || 'â€”'}</td>
                        <td className="px-6 py-5 whitespace-nowrap">{row.lastContributionDate ? formatDate(row.lastContributionDate) : 'â€”'}</td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <Badge>
                            {row.validation || row.importStatus || (row.isDuplicate ? 'Duplicate' : row.isValid ? 'Valid' : 'Invalid')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>

          <Modal
            open={modalOpen}
            title={isRequestApprovalPage ? (requestTarget && isBatchImportRequest(requestTarget) ? 'Batch Preview' : 'Request Preview') : isRequestMemberPage ? 'Request Member' : 'Members'}
            maxWidth="max-w-6xl"
            onClose={() => {
              setModalOpen(false);
              setReviewReason('');
            }}
            footer={
              isRequestApprovalPage ? (
                <>
                  {requestTarget && isBatchImportRequest(requestTarget) ? null : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const reason = requireReviewReason();
                          if (!reason) return;
                          reviewRequest(data.returnRequest, 'Member request returned for correction.', { returnReason: reason });
                        }}
                        disabled={isSaving}
                      >
                        Return for Correction
                      </Button>
                      <Button
                        onClick={() => {
                          const reason = requireReviewReason();
                          if (!reason) return;
                          reviewRequest(data.approveRequest, 'Member request approved.', { approvalReason: reason });
                        }}
                        disabled={isSaving}
                      >
                        Approve
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={saveMember} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              )
            }
          >
            {isRequestApprovalPage && requestTarget && isBatchImportRequest(requestTarget) ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-2xl">
                  <table className="min-w-full text-left">
                    <thead className="border-b border-slate-200 bg-white text-sm font-semibold text-slate-900">
                      <tr>
                        <th className="px-4 py-4 whitespace-nowrap">Request ID</th>
                        <th className="px-4 py-4 whitespace-nowrap">Member / File Name</th>
                        <th className="px-4 py-4 whitespace-nowrap">Submitted By</th>
                        <th className="px-4 py-4 whitespace-nowrap">Total Members</th>
                        <th className="px-4 py-4 whitespace-nowrap">Date Submitted</th>
                        <th className="px-4 py-4 whitespace-nowrap">Status</th>
                        <th className="px-4 py-4 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-900">
                      <tr className="border-b border-slate-200 last:border-b-0">
                        <td className="px-4 py-4 whitespace-nowrap">{requestSummaryRow?.requestId || '—'}</td>
                        <td className="px-4 py-4 max-w-[220px] whitespace-normal break-words">{requestSummaryRow?.fileName || '—'}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{requestSummaryRow?.submittedBy || '—'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">{requestSummaryRow?.totalMembers || '0'}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{requestSummaryRow?.dateSubmitted || '—'}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_0_0_1px_rgba(180,83,9,0.15)]" />
                            <span>{requestSummaryRow?.status || 'Pending'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Button variant="secondary" className="min-h-0 rounded-full px-5 py-2.5 text-sm font-medium" onClick={() => setImportPreviewOnly(true)}>
                            Preview
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <>
                {formContent}
                {isRequestApprovalPage ? (
                  <FormField
                    as="textarea"
                    label="Reason"
                    placeholder="Type the reason for approving or returning this request..."
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                  />
                ) : null}
              </>
            )}
          </Modal>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete member?"
        message={`This will remove ${deleteTarget?.fullName || 'this member'} from Supabase records.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}




