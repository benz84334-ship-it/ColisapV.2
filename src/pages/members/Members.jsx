import { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiEye, FiFileText, FiSearch, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { BARANGAYS, GENDERS, MEMBER_STATUSES, ROLES } from '../../utils/constants.js';
import { formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { getBranchScopedData } from '../../utils/analytics.js';
import { getComputedMemberStatus } from '../../utils/memberStatus.js';
import { buildErrorMap, isPhone, required, uniqueBy } from '../../utils/validation.js';
import { uploadMemberPhoto } from '../../services/supabaseFileStorage.js';

const BENEFIT_CATEGORY_OPTIONS = ['40K or PHP 40,000.00', '60K or PHP 60,000.00'];
const APPLICATION_STATUS_OPTIONS = ['New', 'Re-application'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated'];
const ACTION_TAKEN_OPTIONS = ['Pending', 'Approved', 'Disapproved'];

function emptyBeneficiary() {
  return {
    name: '',
    age: '',
    address: '',
    relationship: '',
  };
}

function blankBeneficiaries() {
  return [emptyBeneficiary(), emptyBeneficiary(), emptyBeneficiary()];
}

const blankMember = {
  memberId: '',
  cifNumber: '',
  applicationStatus: APPLICATION_STATUS_OPTIONS[0],
  benefitCategory: BENEFIT_CATEGORY_OPTIONS[0],
  firstName: '',
  lastName: '',
  middleName: '',
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
  status: 'Active',
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
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">CIFK No. {member.memberId}</p>
        </div>
        <img alt="" className="h-28 w-28 rounded-xl object-cover" src={member.photo} />
      </div>

      <Section title="Customer Identification">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="CIFK Number" value={member.memberId} />
          <DetailItem label="Customer Status" value={member.status} />
          <DetailItem label="COLISAP Category" value={member.benefitCategory} />
          <DetailItem label="Application Status" value={member.applicationStatus} />
          <DetailItem label="Membership Date" value={formatDate(member.membershipDate)} />
          <DetailItem label="Savings Account No." value={member.savingsAccountNo} />
          <DetailItem label="Share Capital" value={formatCurrency(member.shareCapital)} />
          <DetailItem label="Last Capital Deposit" value={formatDate(member.lastShareCapitalDepositDate)} />
        </div>
      </Section>

      <Section title="Personal Information">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="Full Name" value={member.fullName} />
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
  };
}

function formatFullName(member) {
  const name = [member.firstName, member.middleName, member.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || String(member.fullName || '').trim();
}

function normalizeBeneficiaries(beneficiaries) {
  const rows = Array.isArray(beneficiaries) ? beneficiaries : [];
  return Array.from({ length: 3 }, (_, index) => ({ ...emptyBeneficiary(), ...(rows[index] || {}) }));
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
      membershipDate: today,
      signedDate: today,
      lastShareCapitalDepositDate: today,
    };
  }

  const nameParts = member.firstName || member.lastName ? member : splitName(member.fullName);
  const ageParts = member.ageYears || member.ageMonths ? member : calculateAgeParts(member.birthdate);
  return {
    ...blankMember,
    ...member,
    firstName: nameParts.firstName || '',
    middleName: nameParts.middleName || '',
    lastName: nameParts.lastName || '',
    ageYears: ageParts.ageYears ?? '',
    ageMonths: ageParts.ageMonths ?? '',
    beneficiaries: normalizeBeneficiaries(member.beneficiaries),
    barangay: barangayOnly(member.barangay || BARANGAYS[0]),
    applicationStatus: member.applicationStatus || APPLICATION_STATUS_OPTIONS[0],
    benefitCategory: member.benefitCategory || BENEFIT_CATEGORY_OPTIONS[0],
    civilStatus: member.civilStatus || CIVIL_STATUS_OPTIONS[0],
    actionTaken: member.actionTaken || ACTION_TAKEN_OPTIONS[0],
    membershipDate: member.membershipDate || today,
    signedDate: member.signedDate || today,
    lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || member.membershipDate || today,
  };
}

export default function Members() {
  const navigate = useNavigate();
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = currentUser?.role === ROLES.ADMIN;
  const scopedData = useMemo(
    () => (isAdmin ? data : getBranchScopedData(data, currentUser?.branch)),
    [currentUser?.branch, data, isAdmin],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [customerFile, setCustomerFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankMember);
  const [photoFile, setPhotoFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const computedStatus = useMemo(
    () => getComputedMemberStatus({ ...form, id: editing?.id || form.id }, scopedData.loans),
    [editing?.id, form, scopedData.loans],
  );
  const barangayFilterOptions = useMemo(
    () => Array.from(new Set([...BARANGAYS, ...scopedData.members.map((member) => barangayOnly(member.barangay)).filter(Boolean)])).sort((a, b) => a.localeCompare(b)),
    [scopedData.members],
  );

  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        label: 'Member',
        render: (row) => (
          <div className="flex min-w-60 items-center gap-3">
            <img alt="" className="h-11 w-11 rounded-lg object-cover" src={row.photo} />
            <div>
              <p className="font-bold text-slate-950 dark:text-white">{row.fullName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.memberId}</p>
            </div>
          </div>
        ),
      },
      { key: 'barangay', label: 'Barangay / Municipality', render: (row) => barangayOnly(row.barangay) },
      { key: 'contactNumber', label: 'Contact' },
      { key: 'membershipDate', label: 'Membership Date', render: (row) => formatDate(row.membershipDate) },
      { key: 'shareCapital', label: 'Share Capital', render: (row) => formatCurrency(row.shareCapital), sortKey: (row) => Number(row.shareCapital) },
      { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [],
  );

  const openForm = (member = null) => {
    const today = todayIso();
    setEditing(member);
    setForm(memberForForm(member, today, scopedData.members));
    setPhotoFile(null);
    setErrors({});
    setModalOpen(true);
  };

  const updateShareCapital = (value) => {
    const nextShareCapital = Number(value);
    setForm((current) => ({
      ...current,
      shareCapital: nextShareCapital,
      lastShareCapitalDepositDate: nextShareCapital > Number(current.shareCapital || 0) ? todayIso() : current.lastShareCapitalDepositDate,
    }));
  };

  const updateBeneficiary = (index, field, value) => {
    setForm((current) => ({
      ...current,
      beneficiaries: normalizeBeneficiaries(current.beneficiaries).map((beneficiary, rowIndex) =>
        rowIndex === index ? { ...beneficiary, [field]: value } : beneficiary,
      ),
    }));
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
      { field: 'memberId', valid: required(form.memberId), message: 'CIFK number is required.' },
      { field: 'memberId', valid: uniqueBy(scopedData.members, 'memberId', form.memberId, editing?.id), message: 'CIFK number already exists.' },
      { field: 'firstName', valid: required(form.firstName), message: 'First name is required.' },
      { field: 'lastName', valid: required(form.lastName), message: 'Last name is required.' },
      { field: 'address', valid: required(form.address), message: 'Present address is required.' },
      { field: 'contactNumber', valid: isPhone(form.contactNumber), message: 'Use a valid PH mobile number.' },
      { field: 'birthdate', valid: required(form.birthdate), message: 'Date of birth is required.' },
      { field: 'membershipDate', valid: required(form.membershipDate), message: 'Membership date is required.' },
      { field: 'lastShareCapitalDepositDate', valid: required(form.lastShareCapitalDepositDate), message: 'Last capital deposit date is required.' },
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
    const fullName = formatFullName(form);
    try {
      const photoUrl = photoFile ? await uploadMemberPhoto(photoFile, form.memberId || editing?.id) : form.photo;
      const nextMember = {
        ...form,
        barangay: barangayOnly(form.barangay),
        fullName,
        status: computedStatus,
        photo: photoUrl,
        dependents: Number(form.dependents || 0),
        shareCapital: Number(form.shareCapital || 0),
        beneficiaries: normalizeBeneficiaries(form.beneficiaries),
      };

      if (!editing) return;
      data.updateMember(editing.id, nextMember, currentUser.username);
      showToast('Member profile updated.');
      setPhotoFile(null);
      setModalOpen(false);
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

  const profileBeneficiaries = profile ? normalizeBeneficiaries(profile.beneficiaries).filter((beneficiary) => beneficiary.name) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Member Management</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Register, update, search, export, and inspect cooperative member profiles.
        </p>
      </div>

      <DataTable
        actions={(row) => (
          <div className="flex justify-end gap-2">
            <Button className="px-3" icon={FiEye} variant="secondary" onClick={() => setProfile(row)}>
              View
            </Button>
            <Button className="px-3" icon={FiFileText} variant="secondary" onClick={() => setCustomerFile(row)}>
              Profile
            </Button>
            <Button
              className="px-3"
              icon={FiFileText}
              onClick={() => navigate(`/reports?${new URLSearchParams({
                type: 'Member',
                memberId: row.id,
                dateFrom: row.membershipDate || '2000-01-01',
                dateTo: todayIso(),
              })}`)}
            >
              Report
            </Button>
            {isAdmin ? (
              <>
                <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openForm(row)}>
                  Edit
                </Button>
                <Button className="px-3" icon={FiTrash2} variant="danger" onClick={() => setDeleteTarget(row)}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        )}
        columns={columns}
        data={scopedData.members}
        description={isAdmin ? 'Admin: all branches with edit and delete access.' : `Manager: view and search access for ${currentUser?.branch || 'assigned branch'}.`}
        filters={[
          { key: 'status', label: 'Status', options: MEMBER_STATUSES },
          { key: 'barangay', label: 'Barangay / Municipality', options: barangayFilterOptions },
          { key: 'gender', label: 'Gender', options: GENDERS },
        ]}
        searchFields={['memberId', 'fullName', 'firstName', 'lastName', 'middleName', 'barangay', 'contactNumber', 'address', 'occupation', 'employer']}
        title="Members"
      />

      <Modal
        open={modalOpen}
        title="Customer Information File"
        maxWidth="max-w-6xl"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={saveMember} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Section title="I. Desired Benefits Category and Status">
            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                error={errors.memberId}
                inputClassName="bg-slate-50 dark:bg-slate-900"
                label="CIFK Number"
                readOnly
                value={form.memberId}
              />
              <FormField as="select" label="Type of Category Applied For" options={BENEFIT_CATEGORY_OPTIONS} value={form.benefitCategory} onChange={(event) => setForm((current) => ({ ...current, benefitCategory: event.target.value }))} />
              <FormField as="select" label="Status" options={APPLICATION_STATUS_OPTIONS} value={form.applicationStatus} onChange={(event) => setForm((current) => ({ ...current, applicationStatus: event.target.value }))} />
              <FormField error={errors.membershipDate} label="Membership Date" type="date" value={form.membershipDate} onChange={(event) => setForm((current) => ({ ...current, membershipDate: event.target.value }))} />
            </div>
          </Section>

          <Section title="II. Personal Information">
            <div className="grid gap-4 md:grid-cols-6">
              <FormField className="md:col-span-2" error={errors.firstName} label="First Name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} />
              <FormField className="md:col-span-2" error={errors.lastName} label="Last Name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} />
              <FormField className="md:col-span-2" label="Middle Name" value={form.middleName} onChange={(event) => setForm((current) => ({ ...current, middleName: event.target.value }))} />
              <FormField error={errors.birthdate} label="Date of Birth" type="date" value={form.birthdate} onChange={(event) => updateBirthdate(event.target.value)} />
              <FormField inputClassName="bg-slate-50 dark:bg-slate-900" label="Age - Yrs" readOnly type="number" value={form.ageYears} />
              <FormField inputClassName="bg-slate-50 dark:bg-slate-900" label="Age - Mos" readOnly type="number" value={form.ageMonths} />
              <FormField as="select" label="Sex" options={GENDERS} value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))} />
              <FormField as="select" label="Civil Status" options={CIVIL_STATUS_OPTIONS} value={form.civilStatus} onChange={(event) => setForm((current) => ({ ...current, civilStatus: event.target.value }))} />
              <FormField error={errors.contactNumber} label="Contact No." value={form.contactNumber} onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))} />
              <FormField className="md:col-span-4" error={errors.address} label="Present Address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              <BarangaySearchField value={form.barangay} options={BARANGAYS} onChange={(barangay) => setForm((current) => ({ ...current, barangay }))} />
              <FormField className="md:col-span-2" label="Occupation" value={form.occupation} onChange={(event) => setForm((current) => ({ ...current, occupation: event.target.value }))} />
              <FormField className="md:col-span-2" label="Employer" value={form.employer} onChange={(event) => setForm((current) => ({ ...current, employer: event.target.value }))} />
              <FormField className="md:col-span-2" label="Religion" value={form.religion} onChange={(event) => setForm((current) => ({ ...current, religion: event.target.value }))} />
              <FormField className="md:col-span-4" label="Office Address" value={form.officeAddress} onChange={(event) => setForm((current) => ({ ...current, officeAddress: event.target.value }))} />
              <FormField label="No. of Dependents" min="0" step="1" type="number" value={form.dependents} onChange={(event) => setForm((current) => ({ ...current, dependents: Number(event.target.value) }))} />
              <FormField label="Share Capital" min="0" step="500" type="number" value={form.shareCapital} onChange={(event) => updateShareCapital(event.target.value)} />
              <FormField error={errors.lastShareCapitalDepositDate} label="Last Capital Deposit" type="date" value={form.lastShareCapitalDepositDate} onChange={(event) => setForm((current) => ({ ...current, lastShareCapitalDepositDate: event.target.value }))} />
              <FormField as="select" label="Member Status" options={MEMBER_STATUSES} value={computedStatus} disabled onChange={() => {}} />
              <FormField className="md:col-span-2" label="Photo URL" placeholder="Optional image URL" value={form.photo} onChange={(event) => setForm((current) => ({ ...current, photo: event.target.value }))} />
              <FormField
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="md:col-span-2"
                label="Upload Photo"
                type="file"
                onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
              />
            </div>
          </Section>

          <Section title="III. Beneficiaries">
            <div className="space-y-4">
              {normalizeBeneficiaries(form.beneficiaries).map((beneficiary, index) => (
                <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-[1.5fr_.5fr_1.5fr_1fr]">
                  <FormField label={`Name ${index + 1}`} value={beneficiary.name} onChange={(event) => updateBeneficiary(index, 'name', event.target.value)} />
                  <FormField label="Age" min="0" step="1" type="number" value={beneficiary.age} onChange={(event) => updateBeneficiary(index, 'age', event.target.value)} />
                  <FormField label="Address" value={beneficiary.address} onChange={(event) => updateBeneficiary(index, 'address', event.target.value)} />
                  <FormField label="Relationship" value={beneficiary.relationship} onChange={(event) => updateBeneficiary(index, 'relationship', event.target.value)} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="IV. Authorization and Processing">
            <div className="grid gap-4 md:grid-cols-4">
              <FormField label="Savings Account No." value={form.savingsAccountNo} onChange={(event) => setForm((current) => ({ ...current, savingsAccountNo: event.target.value }))} />
              <FormField label="Signed Date" type="date" value={form.signedDate} onChange={(event) => setForm((current) => ({ ...current, signedDate: event.target.value }))} />
              <FormField label="Witness / BMPC Staff" value={form.witnessStaff} onChange={(event) => setForm((current) => ({ ...current, witnessStaff: event.target.value }))} />
              <FormField as="select" label="Action Taken" options={ACTION_TAKEN_OPTIONS} value={form.actionTaken} onChange={(event) => setForm((current) => ({ ...current, actionTaken: event.target.value }))} />
              <FormField label="Approving Authority" value={form.approvingAuthority} onChange={(event) => setForm((current) => ({ ...current, approvingAuthority: event.target.value }))} />
              <FormField label="Approval Date" type="date" value={form.approvalDate} onChange={(event) => setForm((current) => ({ ...current, approvalDate: event.target.value }))} />
              <FormField as="textarea" className="md:col-span-2" label="Findings" value={form.findings} onChange={(event) => setForm((current) => ({ ...current, findings: event.target.value }))} />
            </div>
          </Section>
        </div>
      </Modal>

      <Modal
        open={Boolean(profile)}
        title="Member Profile"
        description={profile ? `${profile.memberId} - ${profile.barangay}` : ''}
        maxWidth="max-w-5xl"
        onClose={() => setProfile(null)}
        footer={<Button onClick={() => setProfile(null)}>Close</Button>}
      >
        {profile ? (
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-[12rem_1fr]">
              <img alt="" className="h-48 w-48 rounded-xl object-cover" src={profile.photo} />
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <DetailItem label="Full Name" value={profile.fullName} />
                <DetailItem label="COLISAP Category" value={profile.benefitCategory} />
                <DetailItem label="Application Status" value={profile.applicationStatus} />
                <DetailItem label="Member Status" value={profile.status} />
                <DetailItem label="Sex" value={profile.gender} />
                <DetailItem label="Civil Status" value={profile.civilStatus} />
                <DetailItem label="Birthdate" value={formatDate(profile.birthdate)} />
                <DetailItem label="Contact" value={profile.contactNumber} />
                <DetailItem label="Membership Date" value={formatDate(profile.membershipDate)} />
                <DetailItem label="Share Capital" value={formatCurrency(profile.shareCapital)} />
                <DetailItem label="Last Capital Deposit" value={formatDate(profile.lastShareCapitalDepositDate)} />
                <DetailItem label="Savings Account No." value={profile.savingsAccountNo} />
                <DetailItem label="Occupation" value={profile.occupation} />
                <DetailItem label="Employer" value={profile.employer} />
                <DetailItem label="Religion" value={profile.religion} />
                <DetailItem label="No. of Dependents" value={profile.dependents} />
                <DetailItem label="Present Address" value={profile.address} />
                <DetailItem label="Office Address" value={profile.officeAddress} />
              </div>
            </div>

            <Section title="Beneficiaries">
              {profileBeneficiaries.length ? (
                <div className="grid gap-3">
                  {profileBeneficiaries.map((beneficiary, index) => (
                    <div key={`${beneficiary.name}-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900 md:grid-cols-[1.5fr_.5fr_1.5fr_1fr]">
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

            <Section title="Processing">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <DetailItem label="Signed Date" value={formatDate(profile.signedDate)} />
                <DetailItem label="Witness / BMPC Staff" value={profile.witnessStaff} />
                <DetailItem label="Action Taken" value={profile.actionTaken} />
                <DetailItem label="Approving Authority" value={profile.approvingAuthority} />
                <DetailItem label="Approval Date" value={formatDate(profile.approvalDate)} />
                <DetailItem label="Findings" value={profile.findings} />
              </div>
            </Section>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(customerFile)}
        title="Member Profile"
        description={customerFile ? customerFile.fullName : ''}
        maxWidth="max-w-6xl"
        onClose={() => setCustomerFile(null)}
        footer={<Button onClick={() => setCustomerFile(null)}>Close</Button>}
      >
        {customerFile ? <CustomerInformationFile member={customerFile} /> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete member?"
        message={`This will remove ${deleteTarget?.fullName || 'this member'} from LocalStorage records.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
