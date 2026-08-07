import { BARANGAYS, MEMBER_BENEFIT_CATEGORIES } from './constants.js';
import { normalizeBenefitCategory } from './constants.js';
import { todayIso } from './formatters.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  const text = normalizeText(value).replace(/[^0-9+]/g, '');
  if (!text) return '';
  if (text.startsWith('+')) return text;
  return text;
}

function normalizeBarangay(value) {
  const text = normalizeText(value);
  if (!text) return '';
  return /,\s*Antique$/i.test(text) ? text : `${text}, Antique`;
}

function pickValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

export function buildImportedMemberPayload(row = {}) {
  const firstName = normalizeText(pickValue(row, ['firstName', 'firstname', 'First Name', 'FIRST NAME', 'First name', 'First Name ', 'First']));
  const lastName = normalizeText(pickValue(row, ['lastName', 'lastname', 'Last Name', 'LAST NAME', 'Last name', 'Last Name ', 'Last']));
  const fullName = normalizeText(pickValue(row, ['fullName', 'full_name', 'Full Name', 'FULL NAME', 'Member Name', 'Member Name ', 'member name', 'Name', 'name']));
  const memberName = fullName || `${firstName} ${lastName}`.trim();
  const benefitCategory = normalizeBenefitCategory(normalizeText(pickValue(row, ['benefitCategory', 'benefit_category', 'Benefit Category', 'COLISAP Category'])));
  const fallbackCategory = MEMBER_BENEFIT_CATEGORIES[0] || 'Regular';

  return {
    memberId: '',
    cifNumber: '',
    applicationStatus: 'New',
    benefitCategory: benefitCategory || fallbackCategory,
    firstName: firstName || (memberName ? memberName.split(/\s+/)[0] || '' : ''),
    lastName: lastName || (memberName ? memberName.split(/\s+/).slice(1).join(' ') || '' : ''),
    middleName: normalizeText(pickValue(row, ['middleName', 'middlename', 'Middle Name', 'MIDDLE NAME'])),
    suffixName: normalizeText(pickValue(row, ['suffixName', 'suffix', 'Suffix', 'SUFFIX NAME'])),
    fullName: memberName,
    address: normalizeText(pickValue(row, ['address', 'Address', 'Present Address', 'Home Address', 'Home Address ', 'Address ', 'Home Addresss'])),
    barangay: normalizeBarangay(normalizeText(pickValue(row, ['barangay', 'Barangay', 'Barangay / Municipality', 'Municipality', 'Barangay Municipality', 'Brgy', 'Barangay Name']))),
    birthdate: normalizeText(pickValue(row, ['birthdate', 'Birthdate', 'Date of Birth', 'Birth Date'])),
    ageYears: '',
    ageMonths: '',
    gender: normalizeText(pickValue(row, ['gender', 'Gender', 'Sex'])),
    civilStatus: normalizeText(pickValue(row, ['civilStatus', 'civil_status', 'Civil Status'])),
    contactNumber: normalizePhone(pickValue(row, ['contactNumber', 'contact_number', 'Contact Number', 'Contact No.', 'Mobile Number', 'Phone Number', 'Contact', 'Contact ', 'Mobile'])),
    occupation: normalizeText(pickValue(row, ['occupation', 'Occupation'])),
    employer: normalizeText(pickValue(row, ['employer', 'Employer'])),
    officeAddress: normalizeText(pickValue(row, ['officeAddress', 'office_address', 'Office Address'])),
    religion: normalizeText(pickValue(row, ['religion', 'Religion'])),
    religionOther: '',
    dependents: Number(normalizeText(pickValue(row, ['dependents', 'Dependents'])) || 0),
    beneficiaries: [],
    savingsAccountNo: normalizeText(pickValue(row, ['savingsAccountNo', 'savings_account_no', 'Savings Account No.'])),
    membershipDate: normalizeText(pickValue(row, ['membershipDate', 'membership_date', 'Membership Date'])) || todayIso(),
    signedDate: normalizeText(pickValue(row, ['signedDate', 'signed_date', 'Signed Date'])) || todayIso(),
    witnessStaff: normalizeText(pickValue(row, ['witnessStaff', 'witness_staff', 'Witness / BMPC Staff'])),
    actionTaken: 'Pending',
    approvingAuthority: '',
    approvalDate: '',
    findings: '',
    status: 'Pending',
    photo: '',
    shareCapital: Number(normalizeText(pickValue(row, ['shareCapital', 'share_capital', 'Share Capital', 'Savings'])) || 0),
    lastShareCapitalDepositDate: normalizeText(pickValue(row, ['lastShareCapitalDepositDate', 'last_share_capital_deposit_date', 'Last Capital Deposit Date'])) || todayIso(),
    branch: 'Main Office',
    metadata: {
      importedFrom: 'excel',
      importedAt: new Date().toISOString(),
    },
  };
}

export function importMembersFromRows(rows = []) {
  return (rows || []).map((row) => buildImportedMemberPayload(row));
}
