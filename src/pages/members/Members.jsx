import { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiEdit2, FiSearch, FiTrash2, FiUserPlus } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
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
import { uploadMemberPhoto } from '../../services/supabaseFileStorage.js';

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
  signedDate: todayIso(),
  witnessStaff: '',
  actionTaken: ACTION_TAKEN_OPTIONS[0],
  approvingAuthority: '',
  approvalDate: '',
  findings: '',
  status: 'Pending',
  photo: '',
  shareCapital: 5000,
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
        <img alt="" className="h-28 w-28 rounded-xl object-cover" src={member.photo} />
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
  const [photoFile, setPhotoFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);
  const [returnedDraft, setReturnedDraft] = useState(blankMember);
  const [reviewDraft, setReviewDraft] = useState(blankMember);
  const [reviewReason, setReviewReason] = useState('');
  const currentForm = isRequestApprovalPage && requestTarget ? reviewDraft : requestTarget ? returnedDraft : form;
  const generatedCifNumber = useMemo(
    () => nextCifNumber([...(scopedData.members || []), ...(scopedData.requests || [])]),
    [scopedData.members, scopedData.requests],
  );
  const displayedCifNumber = isRequestMemberPage && !editing
    ? generatedCifNumber
    : currentForm.cifNumber || generatedCifNumber;

  useEffect(() => {
    if (!isRequestMemberPage || editing) return;
    setForm((current) => (
      current.memberId
        ? { ...current, cifNumber: generatedCifNumber }
        : { ...current, memberId: nextMemberId(scopedData.members, todayIso()), cifNumber: generatedCifNumber }
    ));
  }, [editing, generatedCifNumber, isRequestMemberPage, scopedData.members]);

  const computedStatus = useMemo(
    () => getComputedMemberStatus({ ...currentForm, id: editing?.id || currentForm.id }, scopedData.loans),
    [currentForm, editing?.id, scopedData.loans],
  );
  const barangayFilterOptions = useMemo(
    () => Array.from(new Set([...BARANGAYS, ...scopedData.members.map((member) => barangayOnly(member.barangay)).filter(Boolean)])).sort((a, b) => a.localeCompare(b)),
    [scopedData.members],
  );
  const columns = useMemo(
    () => [
      { key: 'memberId', label: 'CIFK Number', className: 'w-36', cellClassName: 'whitespace-nowrap w-36', render: (row) => row.cifNumber || row.memberId || '—' },
      {
        key: 'fullName',
        label: 'Member',
        className: 'min-w-52',
        cellClassName: 'min-w-52',
        render: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <img alt="" className="h-10 w-10 rounded-lg object-cover" src={row.photo} />
            <div className="min-w-0">
              <p className="leading-tight font-bold text-slate-950 dark:text-white">{row.fullName}</p>
            </div>
          </div>
        ),
      },
      { key: 'barangay', label: 'Barangay / Municipality', className: 'min-w-52 max-w-64', cellClassName: 'min-w-52 max-w-64 whitespace-normal', render: (row) => barangayOnly(row.barangay) },
      {
        key: 'shareCapital',
        label: 'Savings',
        className: 'whitespace-nowrap',
        cellClassName: 'whitespace-nowrap',
        render: (row) => formatCurrency(Number(row.shareCapital || 0)),
      },
      { key: 'contactNumber', label: 'Contact', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap' },
      { key: 'membershipDate', label: 'Membership Date', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap', render: (row) => formatDate(row.membershipDate) },
      { key: 'status', label: 'Status', className: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [],
  );

  
  const requestColumns = useMemo(
    () => [
      { key: 'cifNumber', label: 'CIFK Number', sortable: false, render: (row) => row.cifNumber || row.memberId || '—' },
      { key: 'fullName', label: 'Member Name' },
      { key: 'requestType', label: 'Request Type', render: (row) => String(row?.requestType || row?.metadata?.claimantApplication?.requestType || (String(row?.approvalQueue || row?.metadata?.approvalQueue || row?.metadata?.claimantApplication?.approvalQueue || '').toLowerCase() === 'claimant' || String(row?.requestKind || row?.metadata?.requestKind || row?.metadata?.claimantApplication?.requestKind || '').toLowerCase() === 'claimant' ? 'Claimant Application' : 'Member Request')) },
      { key: 'requestedByName', label: 'Requested By' },
      { key: 'benefitCategory', label: 'Category', render: (row) => normalizeBenefitCategory(row.benefitCategory) },
      { key: 'submittedAt', label: 'Date Submitted', render: (row) => formatDate(row.submittedAt) },
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
    setPhotoFile(null);
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
    const nextErrors = buildErrorMap([
      { field: 'memberId', valid: required(currentForm.memberId), message: 'CIFK number is required.' },
      { field: 'memberId', valid: uniqueBy(scopedData.members, 'memberId', currentForm.memberId, editing?.id), message: 'CIFK number already exists.' },
      { field: 'firstName', valid: required(currentForm.firstName), message: 'First name is required.' },
      { field: 'lastName', valid: required(currentForm.lastName), message: 'Last name is required.' },
      { field: 'address', valid: required(currentForm.address), message: 'Present address is required.' },
      { field: 'contactNumber', valid: isPhone(currentForm.contactNumber), message: 'Use a valid PH mobile number.' },
      { field: 'birthdate', valid: required(currentForm.birthdate), message: 'Date of birth is required.' },
      { field: 'membershipDate', valid: required(currentForm.membershipDate), message: 'Membership date is required.' },
      { field: 'lastShareCapitalDepositDate', valid: required(currentForm.lastShareCapitalDepositDate), message: 'Last capital deposit date is required.' },
    ]);
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
      const photoUrl = photoFile ? await uploadMemberPhoto(photoFile, currentForm.memberId || editing?.id) : currentForm.photo;
      const generatedCifNumber = nextCifNumber(scopedData.members);
      const nextMember = buildMemberPayload(currentForm, {
        photoUrl,
        status: isApprover ? computedStatus : 'Pending',
        branch: currentForm.branch || currentUser?.branch || 'Main Office',
        cifNumber: generatedCifNumber,
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
        data.createMember(nextMember, currentUser.username);
        showToast('Member profile created.');
      }
      setPhotoFile(null);
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
    setRequestTarget(request);
    setEditing(null);
    setReviewDraft(memberForForm(request, todayIso()));
    setReturnedDraft(blankMember);
    setForm(blankMember);
    setErrors({});
    setReviewReason(request.returnReason || request.rejectionReason || request.approvalReason || '');
    setModalOpen(true);
  };

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
      (request.requestStatus || '').toLowerCase() !== 'approved'
      && String(request.requestType || request?.metadata?.claimantApplication?.requestType || 'member request').toLowerCase() === 'member request'
    ),
    [data.requests],
  );
  const memberRequestRows = useMemo(
    () => (data.requests || []).filter((request) =>
      (request.requestStatus || '').toLowerCase() !== 'approved'
      && !isClaimantRequest(request)
    ),
    [data.requests],
  );
  const claimantRequestRows = useMemo(
    () => (data.requests || []).filter((request) =>
      isClaimantRequest(request)
      && String(request.requestStatus || '').toLowerCase() !== 'approved',
    ),
    [data.requests],
  );
  const returnedRequests = useMemo(
    () => (data.requests || []).filter((request) => request.requestStatus === 'Returned' && (!currentUser?.username || request.requestedBy === currentUser.username)),
    [currentUser?.username, data.requests],
  );
  const activeClaimantApplication = useMemo(
    () => requestTarget?.metadata?.claimantApplication || requestTarget?.claimantApplication || {},
    [requestTarget],
  );
  const activeClaimantDeceased = activeClaimantApplication.deceased || {};
  const isClaimantApprovalItem = isRequestApprovalPage && isClaimantRequest(requestTarget);
  const formContent = (
    <div className="space-y-5">
      {!isClaimantApprovalItem ? (
        <>
      <Section title="I. Membership Application">
        <div className="grid gap-4 md:grid-cols-4">
          <FormField
            error={errors.memberId}
            inputClassName="bg-slate-50 dark:bg-slate-900"
            label="CIFK Number"
            readOnly
            value={displayedCifNumber}
          />
          <FormField as="select" disabled={isRequestApprovalPage} label="Benefit Category" options={MEMBER_BENEFIT_CATEGORIES} value={normalizeBenefitCategory(currentForm.benefitCategory)} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, benefitCategory: event.target.value })) : setForm((current) => ({ ...current, benefitCategory: event.target.value })))} />
          <FormField as="select" disabled={isRequestApprovalPage} label="Application Status" options={APPLICATION_STATUS_OPTIONS} value={currentForm.applicationStatus} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, applicationStatus: event.target.value })) : setForm((current) => ({ ...current, applicationStatus: event.target.value })))} />
          <FormField error={errors.membershipDate} disabled={isRequestApprovalPage} label="Membership Date" type="date" value={currentForm.membershipDate} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, membershipDate: event.target.value })) : setForm((current) => ({ ...current, membershipDate: event.target.value })))} />
        </div>
      </Section>

      <Section title="II. Applicant Information">
        <div className="grid gap-4 md:grid-cols-8">
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} error={errors.firstName} label="First Name" value={currentForm.firstName} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, firstName: event.target.value })) : setForm((current) => ({ ...current, firstName: event.target.value })))} />
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} error={errors.lastName} label="Last Name" value={currentForm.lastName} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, lastName: event.target.value })) : setForm((current) => ({ ...current, lastName: event.target.value })))} />
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} label="Middle Name" value={currentForm.middleName} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, middleName: event.target.value })) : setForm((current) => ({ ...current, middleName: event.target.value })))} />
          <FormField as="select" className="md:col-span-2" disabled={isRequestApprovalPage} label="Suffix Name" options={SUFFIX_NAME_OPTIONS} value={currentForm.suffixName} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, suffixName: event.target.value })) : setForm((current) => ({ ...current, suffixName: event.target.value })))} />
          <FormField className="md:col-span-2" error={errors.birthdate} disabled={isRequestApprovalPage} label="Date of Birth" type="date" value={currentForm.birthdate} onChange={(event) => updateBirthdate(event.target.value)} />
          <FormField className="md:col-span-2" inputClassName="bg-slate-50 dark:bg-slate-900" label="Age" disabled type="number" value={currentForm.ageYears} />
          <FormField as="select" className="md:col-span-2" disabled={isRequestApprovalPage} label="Sex" options={['Male', 'Female']} value={currentForm.gender} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, gender: event.target.value })) : setForm((current) => ({ ...current, gender: event.target.value })))} />
          <FormField as="select" className="md:col-span-2" disabled={isRequestApprovalPage} label="Civil Status" options={CIVIL_STATUS_OPTIONS} value={currentForm.civilStatus} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, civilStatus: event.target.value })) : setForm((current) => ({ ...current, civilStatus: event.target.value })))} />
          <FormField className="md:col-span-2" error={errors.contactNumber} disabled={isRequestApprovalPage} label="Contact Number" value={currentForm.contactNumber} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, contactNumber: event.target.value })) : setForm((current) => ({ ...current, contactNumber: event.target.value })))} />
          <SearchableTextField
            className="md:col-span-4"
            emptyMessage="No Antique address found."
            label="Present Address"
            options={ANTIQUE_BARANGAYS}
            placeholder="Search address in Antique"
            value={currentForm.address}
            onChange={(value) => (requestTarget ? setReturnedDraft((current) => ({ ...current, address: value })) : setForm((current) => ({ ...current, address: value })))}
          />
          <BarangaySearchField value={currentForm.barangay} options={BARANGAYS} onChange={(barangay) => (requestTarget ? setReturnedDraft((current) => ({ ...current, barangay })) : setForm((current) => ({ ...current, barangay })))} />
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} label="Occupation" value={currentForm.occupation} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, occupation: event.target.value })) : setForm((current) => ({ ...current, occupation: event.target.value })))} />
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} label="Employer" value={currentForm.employer} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, employer: event.target.value })) : setForm((current) => ({ ...current, employer: event.target.value })))} />
          {currentForm.religion === 'Others' || currentForm.religionOther ? (
            <FormField className="md:col-span-2" disabled={isRequestApprovalPage} label="Religion" placeholder="Type religion" value={currentForm.religionOther || ''} onChange={(event) => updateMemberCustomReligion(event.target.value)} />
          ) : (
            <FormField as="select" className="md:col-span-2" disabled={isRequestApprovalPage} label="Religion" options={RELIGION_OPTIONS} value={currentForm.religion || RELIGION_OPTIONS[0]} onChange={(event) => updateMemberReligion(event.target.value)} />
          )}
          <FormField className="md:col-span-2" disabled={isRequestApprovalPage} label="No. of Dependents" min="0" step="1" type="number" value={currentForm.dependents} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, dependents: Number(event.target.value) })) : setForm((current) => ({ ...current, dependents: Number(event.target.value) })))} />
          <FormField className="md:col-span-4" disabled={isRequestApprovalPage} label="Office Address" value={currentForm.officeAddress} onChange={(event) => (requestTarget ? setReturnedDraft((current) => ({ ...current, officeAddress: event.target.value })) : setForm((current) => ({ ...current, officeAddress: event.target.value })))} />
          {isRequestApprovalPage ? (
            <div className="md:col-span-2">
              <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">Member Photo</p>
              {currentForm.photo ? (
                <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
                  <img alt="Member photo preview" className="h-14 w-14 rounded-lg object-cover" src={currentForm.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-normal text-teal-700 dark:text-teal-200">Current Photo</p>
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Latest uploaded image for review</p>
                  </div>
                  <a
                    className="inline-flex shrink-0 items-center rounded-lg border border-teal-300 px-3 py-1 text-xs font-semibold text-teal-800 transition hover:bg-white dark:border-teal-400/30 dark:text-teal-100 dark:hover:bg-teal-500/10"
                    href={currentForm.photo}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View
                  </a>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  No member photo uploaded yet.
                </div>
              )}
            </div>
          ) : (
            <FormField
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="md:col-span-2"
              label="Member Photo"
              type="file"
              onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
            />
          )}
        </div>
      </Section>

      <Section title="III. Beneficiary Information">
        <div className="space-y-4">
          {normalizeBeneficiaries(currentForm.beneficiaries).map((beneficiary, index) => (
            <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-4">
              <FormField disabled={isRequestApprovalPage} label="First Name" value={beneficiary.firstName} onChange={(event) => updateBeneficiary(index, 'firstName', event.target.value)} />
              <FormField disabled={isRequestApprovalPage} label="Last Name" value={beneficiary.lastName} onChange={(event) => updateBeneficiary(index, 'lastName', event.target.value)} />
              <FormField disabled={isRequestApprovalPage} label="Middle Name" value={beneficiary.middleName} onChange={(event) => updateBeneficiary(index, 'middleName', event.target.value)} />
              <FormField as="select" disabled={isRequestApprovalPage} label="Suffix Name" options={SUFFIX_NAME_OPTIONS} value={beneficiary.suffixName} onChange={(event) => updateBeneficiary(index, 'suffixName', event.target.value)} />
              <FormField disabled={isRequestApprovalPage} label="Date of Birth" type="date" value={beneficiary.birthdate} onChange={(event) => updateBeneficiaryBirthdate(index, event.target.value)} />
              <FormField label="Age" readOnly value={beneficiary.ageYears !== '' ? String(beneficiary.ageYears || 0) : ''} />
              <FormField as="select" disabled={isRequestApprovalPage} label="Gender" options={['Male', 'Female']} value={beneficiary.gender} onChange={(event) => updateBeneficiary(index, 'gender', event.target.value)} />
              <FormField as="select" disabled={isRequestApprovalPage} label="Civil Status" options={CIVIL_STATUS_OPTIONS} value={beneficiary.civilStatus} onChange={(event) => updateBeneficiary(index, 'civilStatus', event.target.value)} />
              {beneficiary.religion === 'Others' || beneficiary.religionOther ? (
                <FormField disabled={isRequestApprovalPage} label="Religion" placeholder="Type religion" value={beneficiary.religionOther || ''} onChange={(event) => updateBeneficiaryCustomReligion(index, event.target.value)} />
              ) : (
                <FormField as="select" disabled={isRequestApprovalPage} label="Religion" options={RELIGION_OPTIONS} value={beneficiary.religion || RELIGION_OPTIONS[0]} onChange={(event) => updateBeneficiaryReligion(index, event.target.value)} />
              )}
              {beneficiary.nationality === 'Others (specify)' || beneficiary.nationalityOther ? (
                <FormField disabled={isRequestApprovalPage} label="Nationality" placeholder="Type nationality" value={beneficiary.nationalityOther || ''} onChange={(event) => updateBeneficiaryCustomNationality(index, event.target.value)} />
              ) : (
                <FormField as="select" disabled={isRequestApprovalPage} label="Nationality" options={NATIONALITY_OPTIONS} value={beneficiary.nationality || NATIONALITY_OPTIONS[0]} onChange={(event) => updateBeneficiaryNationality(index, event.target.value)} />
              )}
              <FormField disabled={isRequestApprovalPage} label="Contact Number" value={beneficiary.contactNumber} onChange={(event) => updateBeneficiary(index, 'contactNumber', event.target.value)} />
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
                <FormField className="md:col-span-2 xl:col-span-2" disabled={isRequestApprovalPage} label="Present Address" value={beneficiary.address} onChange={(event) => updateBeneficiary(index, 'address', event.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {!isRequestApprovalPage && index === normalizeBeneficiaries(currentForm.beneficiaries).length - 1 ? (
                    <Button className="w-fit" type="button" variant="secondary" onClick={addBeneficiary}>
                      Add Beneficiary
                    </Button>
                  ) : null}
                  {!isRequestApprovalPage ? (
                    <Button
                      className="w-fit text-rose-600 hover:text-rose-700"
                      type="button"
                      variant="secondary"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => removeBeneficiary(index)}
                    >
                      Remove Beneficiary
                    </Button>
                  ) : null}
                </div>
              </div>
              {beneficiary.relationship === 'Others' || beneficiary.relationshipOther ? (
                <FormField disabled={isRequestApprovalPage} label="Relationship" placeholder="Type relationship" value={beneficiary.relationshipOther || ''} onChange={(event) => updateBeneficiaryCustomRelationship(index, event.target.value)} />
              ) : (
                <FormField as="select" disabled={isRequestApprovalPage} label="Relationship" options={RELATIONSHIP_OPTIONS} value={beneficiary.relationship} onChange={(event) => updateBeneficiaryRelationship(index, event.target.value)} />
              )}
            </div>
          ))}
        </div>
      </Section>
        </>
      ) : null}

      {isRequestApprovalPage ? (
        <>
          {isClaimantRequest(requestTarget) ? (
            <>
              <Section title="Claimant Application Summary">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Claim Number" value={requestTarget?.claimNumber || activeClaimantApplication.claimNumber} />
                  <DetailItem label="Claimant Name" value={requestTarget?.claimantName || activeClaimantApplication.claimantName} />
                  <DetailItem label="Request Type" value="Claimant Application" />
                  <DetailItem label="Relationship" value={activeClaimantApplication.relationshipToDeceased} />
                  <DetailItem label="Contact Number" value={activeClaimantApplication.contactNumber} />
                  <DetailItem label="Complete Address" value={activeClaimantApplication.claimantAddress} />
                  <DetailItem label="Valid ID Type" value={activeClaimantApplication.validIdType} />
                  <DetailItem label="Valid ID Number" value={activeClaimantApplication.validIdNumber} />
                  <DetailItem label="Registered Beneficiary" value={activeClaimantApplication.registeredBeneficiary} />
                  <DetailItem label="Claimant's Signature" value={activeClaimantApplication.claimantSignature} />
                  <DetailItem label="Date Signed" value={formatDate(activeClaimantApplication.dateSigned || requestTarget?.signedDate)} />
                  <DetailItem label="Required Documents" value={Array.isArray(activeClaimantApplication.docs) ? activeClaimantApplication.docs.join(', ') : 'None'} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Deceased Member" value={activeClaimantDeceased.fullName || [activeClaimantDeceased.firstName, activeClaimantDeceased.middleName, activeClaimantDeceased.lastName, activeClaimantDeceased.suffix].filter(Boolean).join(' ')} />
                  <DetailItem label="CIFK Number" value={activeClaimantDeceased.cifNumber || activeClaimantDeceased.memberId} />
                  <DetailItem label="Date of Death" value={formatDate(activeClaimantDeceased.dateOfDeath)} />
                  <DetailItem label="Coverage Status" value={activeClaimantDeceased.coverageStatus} />
                  <DetailItem label="Benefit Category" value={activeClaimantDeceased.benefitCategory} />
                  <DetailItem label="Place of Death" value={activeClaimantDeceased.placeOfDeath} />
                  <DetailItem label="Cause of Death" value={activeClaimantDeceased.causeOfDeath} />
                  <DetailItem label="Date of Burial" value={formatDate(activeClaimantDeceased.dateOfBurial)} />
                  <DetailItem label="Place of Burial" value={activeClaimantDeceased.placeOfBurial} />
                  <DetailItem label="Funeral Home" value={activeClaimantDeceased.funeralHome} />
                  <DetailItem label="Total Funeral Expenses" value={formatCurrency(activeClaimantDeceased.totalFuneralExpenses || 0)} />
                </div>
              </Section>
              <Section title="VI. Certification">
                <div className="grid gap-4 sm:grid-cols-2">
                  <p className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">
                    I certify that the claimant information and supporting documents have been reviewed for approval.
                  </p>
                  <FormField className="sm:col-span-2" label="Verified By" readOnly value={currentUser?.fullName || currentUser?.username || ''} />
                  <FormField className="sm:col-span-2" label="Approved By" readOnly value={currentUser?.fullName || currentUser?.username || ''} />
                  <FormField className="sm:col-span-2" as="textarea" label="Reason" placeholder="Type the reason for approving, rejecting, or returning this request..." value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} />
                </div>
              </Section>
            </>
          ) : null}
        </>
      ) : null}

    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isRequestApprovalPage ? 'Review Queue' : isRequestMemberPage ? 'Member Intake' : 'Member Registry'}
        title={isRequestApprovalPage ? 'Request Approval' : isRequestMemberPage ? 'Request Member' : 'Member Management'}
        description={isRequestApprovalPage
          ? 'Review staff-submitted member requests and claimant applications with a clean approval flow for approvers.'
          : isRequestMemberPage
            ? 'Submit a new cooperative member request with a guided, professional form.'
            : 'Register, review, approve, reject, search, export, and inspect cooperative member profiles.'}
      />

      

      {isRequestMemberPage ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700 dark:text-teal-200">Member Intake</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">New Member Request Form</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Complete the same member details here to create a new request and save it to Supabase.</p>
          </div>
          {formContent}
          {returnedRequests.length ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">Returned for correction</h3>
                  <p className="text-xs text-amber-800 dark:text-amber-200">Open the returned application form, review the missing requirements, and resubmit it.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {returnedRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 shadow-sm dark:bg-slate-950">
                    <div>
                      <p className="font-bold text-slate-950 dark:text-white">{request.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {request.cifNumber || request.memberId || '—'} · Returned: {formatDate(request.returnedAt)} · Reason: {request.returnReason || 'Please review missing requirements.'}
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
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 px-5 py-4 dark:border-slate-800">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-200">Queue 1</p>
                  <h3 className="mt-1 text-lg font-black text-white">Member Request Approval</h3>
                  <p className="mt-1 text-sm text-slate-200">Pending member requests awaiting approval.</p>
                </div>
                <div className="p-4 sm:p-5">
                  <DataTable
                    actions={memberRequestRows.length ? (row) => (
                      <div className="flex justify-end gap-2">
                        <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openRequest(row)}>
                          Review
                        </Button>
                      </div>
                    ) : null}
                    columns={requestColumns}
                    data={memberRequestRows}
                    searchFields={['cifNumber', 'fullName', 'requestedByName', 'benefitCategory']}
                    title=""
                  />
                </div>
              </section>

              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 bg-gradient-to-r from-teal-950 via-teal-900 to-cyan-900 px-5 py-4 dark:border-slate-800">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Queue 2</p>
                  <h3 className="mt-1 text-lg font-black text-white">Claimant Application Approval</h3>
                  <p className="mt-1 text-sm text-slate-200">Pending claimant applications awaiting approval.</p>
                </div>
                <div className="p-4 sm:p-5">
                  <DataTable
                    actions={claimantRequestRows.length ? (row) => (
                      <div className="flex justify-end gap-2">
                        <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openRequest(row)}>
                          Review
                        </Button>
                      </div>
                    ) : null}
                    columns={requestColumns}
                    data={claimantRequestRows}
                    searchFields={['claimNumber', 'fullName', 'requestedByName', 'claimantName', 'memberName']}
                    title=""
                  />
                </div>
              </section>
            </div>
          ) : (
            <DataTable
              addAction={!isRequestMemberPage && isStaff ? (
                <Button icon={FiUserPlus} variant="secondary" onClick={() => navigate('/request-member')}>
                  Request Member
                </Button>
              ) : null}
              actions={(scopedData.members).length ? (row) => (
                <div className="flex justify-end gap-2 whitespace-nowrap">
                  <Button className="px-3 py-2 text-sm" icon={FiEdit2} variant="secondary" onClick={() => openForm(row)}>
                    Edit
                  </Button>
                  {(isAdmin || isManager) && !isRequestMemberPage ? (
                    <Button className="px-3 py-2 text-sm" icon={FiTrash2} variant="danger" onClick={() => setDeleteTarget(row)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
              columns={columns}
              data={scopedData.members}
              description={isAdmin ? 'Admin: all branches with edit and delete access.' : 'Manage member profiles.'}
              filters={[
                { key: 'benefitCategory', label: 'Benefit Category', options: MEMBER_BENEFIT_CATEGORIES },
                { key: 'status', label: 'Status', options: MEMBER_STATUSES },
              ]}
              searchFields={['memberId', 'fullName', 'firstName', 'lastName', 'middleName', 'suffixName', 'barangay', 'contactNumber', 'address', 'occupation', 'employer']}
              title="Members"
              />
          )}

          <Modal
            open={modalOpen}
            title={isRequestApprovalPage ? 'Request Approval' : isRequestMemberPage ? 'Request Member' : 'Members'}
            maxWidth="max-w-6xl"
            onClose={() => {
              setModalOpen(false);
              setReviewReason('');
            }}
            footer={
              isRequestApprovalPage ? (
                <>
                  <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSaving}>
                    Close
                  </Button>
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
            {formContent}
            {isRequestApprovalPage && !isClaimantApprovalItem ? (
              <FormField
                as="textarea"
                label="Reason"
                placeholder="Type the reason for approving or returning this request..."
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
              />
            ) : null}
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
