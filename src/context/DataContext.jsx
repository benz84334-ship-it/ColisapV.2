import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBackupPayload } from '../utils/exporters.js';
import { nextCifNumber, normalizeContactNumber, todayIso } from '../utils/formatters.js';
import { getLoanBalance, getLoanMonthlyPenalty, getLoanPenaltyDue } from '../utils/analytics.js';
import { normalizeBenefitCategory, normalizeBranchName, STORAGE_KEYS } from '../utils/constants.js';
import { applyComputedMemberStatuses, getComputedMemberStatus, getLastShareCapitalDepositDate, getMembersApproachingStatusChange } from '../utils/memberStatus.js';
import { sendSms } from '../services/smsService.js';
import {
  freshDatabase,
  loadDatabaseFromSupabase,
  approveMemberRequestInSupabase,
  resetSupabaseDatabase,
  restoreSupabaseDatabase,
  saveSupabaseKey,
  subscribeToSupabaseDatabase,
} from '../services/supabaseStorageService.js';

const DataContext = createContext(null);

function nextId(prefix, items) {
  const max = items.reduce((highest, item) => {
    const value = Number(String(item.id || '').split('-').pop());
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function uniqueRequestId(prefix = 'MR') {
  const token = globalThis.crypto?.randomUUID?.()
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return `${prefix}-${token}`;
}

function currentYearValue(date = new Date()) {
  return new Date(date).getFullYear();
}

function nextYearlySequence(items = [], pattern) {
  return items.reduce((max, item) => {
    const match = String(item.id || '').match(pattern);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
}

function nextMemberId(members = [], registrationDate = todayIso()) {
  const year = currentYearValue(new Date(registrationDate));
  const used = new Set(members.reduce((values, member) => {
    const cifMatch = String(member.cifNumber || '').match(/^CIFK-\d{4}-(\d{5})$/i);
    const memberMatch = String(member.memberId || '').match(/^CIFK-\d{4}-(\d{5})$/i);
    const legacyDigits = String(member.memberId || '').match(/(\d+)$/);
    const value = cifMatch?.[1] || memberMatch?.[1] || legacyDigits?.[1];
    if (value) values.push(String(value).padStart(6, '0'));
    return values;
  }, []));

  let randomValue = '';
  do {
    randomValue = String(Math.floor(100000 + Math.random() * 900000));
  } while (used.has(randomValue));

  return `CIFK-${year}-${randomValue}`;
}

function nextMemberRowId(members = []) {
  const year = currentYearValue();
  const highest = nextYearlySequence(members, new RegExp(`^REQ-(${year})-(\\d{5})$`, 'i'));
  return `REQ-${year}-${String(highest + 1).padStart(5, '0')}`;
}

function nextRandomCifNumber(members = [], date = new Date()) {
  const year = currentYearValue(date);
  const used = new Set(
    members.flatMap((member) => {
      const matches = [];
      const cifMatch = String(member.cifNumber || '').match(/^CIFK-\d{4}-(\d{5})$/i);
      const memberMatch = String(member.memberId || '').match(/^CIFK-\d{4}-(\d{5})$/i);
      if (cifMatch?.[1]) matches.push(cifMatch[1]);
      if (memberMatch?.[1]) matches.push(memberMatch[1]);
      return matches;
    }),
  );

  let suffix = '';
  do {
    suffix = String(Math.floor(10000 + Math.random() * 90000));
  } while (used.has(suffix));

  return `CIFK-${year}-${suffix}`;
}

function placeholderPhoto() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="36" fill="#e2e8f0"/>
    <rect x="44" y="52" width="152" height="136" rx="24" fill="#f8fafc"/>
    <circle cx="120" cy="102" r="38" fill="#94a3b8"/>
    <path d="M78 180c8-24 34-36 42-36s34 12 42 36" fill="#64748b"/>
    <circle cx="104" cy="96" r="4" fill="#fff"/>
    <circle cx="136" cy="96" r="4" fill="#fff"/>
    <path d="M108 118c6 6 18 6 24 0" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function avatarForName(name = 'Member') {
  const initials = String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'M';
  const palette = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
  const colorIndex = Array.from(String(name)).reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="36" fill="${palette[colorIndex]}"/>
    <circle cx="184" cy="54" r="46" fill="rgba(255,255,255,.18)"/>
    <text x="120" y="140" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#fff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function withMemberPhoto(member = {}) {
  const currentPhoto = String(member.photo || '');
  const usesInitialsAvatar = !currentPhoto || currentPhoto.startsWith('data:image/svg+xml');
  const numericId = Number(String(member.id || member.memberId || '').match(/(\d+)$/)?.[1]);
  const photoSlot = Number.isFinite(numericId)
    ? (Math.max(1, numericId) - 1) % 200
    : Array.from(String(member.fullName || '')).reduce((total, character) => total + character.charCodeAt(0), 0) % 200;
  const photoType = photoSlot < 100 ? 'women' : 'men';
  const photoNumber = photoSlot % 100;

  return {
    ...member,
    benefitCategory: normalizeBenefitCategory(member.benefitCategory || member.plan || ''),
    barangay: /,\s*Antique$/i.test(String(member.barangay || ''))
      ? member.barangay
      : `${String(member.barangay || '').trim()}, Antique`.replace(/^,\s*/, ''),
    photo: usesInitialsAvatar ? `https://randomuser.me/api/portraits/${photoType}/${photoNumber}.jpg` : member.photo,
  };
}

function getActorBranch(users = [], actor) {
  if (!actor) return 'Main Office';
  if (actor && typeof actor === 'object') return normalizeBranchName(actor.branch || 'Main Office');
  const actorValue = String(actor).trim();
  const matchedUser = users.find((item) => item.username === actorValue || item.id === actorValue || item.fullName === actorValue);
  return normalizeBranchName(matchedUser?.branch || 'Main Office');
}

function getLoanStatus(loan, paymentTotal = loan.paidAmount) {
  if (Number(paymentTotal || 0) >= Number(loan.totalPayable || 0)) return 'Completed';
  if (new Date(loan.releaseDate) > new Date()) return 'Pending';
  if (new Date(loan.dueDate) < new Date()) return 'Overdue';
  return 'Active';
}

function memberRowToAppMember(row = {}) {
  return {
    id: row.id,
    memberId: row.member_id,
    cifNumber: row.cif_number,
    applicationStatus: row.application_status,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    fullName: row.full_name,
    address: row.address,
    barangay: row.barangay,
    birthdate: row.birthdate,
    ageYears: row.age_years,
    ageMonths: row.age_months,
    gender: row.gender,
    civilStatus: row.civil_status,
    contactNumber: normalizeContactNumber(row.contact_number),
    occupation: row.occupation,
    employer: row.employer,
    officeAddress: row.office_address,
    religion: row.religion,
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
    benefitCategory: normalizeBenefitCategory(row.benefit_category),
    beneficiaries: row.beneficiaries || [],
    photo: row.photo,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchesRequestKey(request = {}, key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return false;
  return request.id === normalizedKey || request.requestId === normalizedKey;
}

function stripRequestIdentity(request = {}) {
  const {
    id,
    requestId,
    ...rest
  } = request || {};
  return rest;
}

function normalizeBeneficiaries(beneficiaries) {
  if (!Array.isArray(beneficiaries)) return [];
  return beneficiaries
    .filter(Boolean)
    .map((beneficiary) => ({
      id: beneficiary.id ?? beneficiary.beneficiaryId ?? '',
      name: beneficiary.name ?? beneficiary.fullName ?? '',
      ageYears: beneficiary.ageYears ?? beneficiary.age ?? '',
      address: beneficiary.address ?? '',
      relationship: beneficiary.relationship ?? '',
      relationshipOther: beneficiary.relationshipOther ?? '',
      sortOrder: beneficiary.sortOrder ?? beneficiary.sort_order ?? 0,
      metadata: beneficiary.metadata ?? {},
    }));
}

export function DataProvider({ children }) {
  const [database, setDatabase] = useState(() => freshDatabase());
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState('');
  const [systemDate, setSystemDate] = useState(() => todayIso());
  const [smsDebugLogs, setSmsDebugLogs] = useState([]);

  useEffect(() => {
    let active = true;
    loadDatabaseFromSupabase()
      .then((remoteDatabase) => {
        if (active) {
          setDatabase(remoteDatabase);
          setDatabaseError('');
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) setDatabaseError(error.message || 'Supabase unavailable.');
      })
      .finally(() => {
        if (active) setIsDatabaseLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeToSupabaseDatabase((key, value) => {
    setDatabase((current) => ({ ...current, [key]: value }));
  }), []);

  useEffect(() => {
    const refreshSystemDate = () => {
      const nextDate = todayIso();
      setSystemDate((current) => current === nextDate ? current : nextDate);
    };
    const timer = window.setInterval(refreshSystemDate, 60_000);
    window.addEventListener('focus', refreshSystemDate);
    document.addEventListener('visibilitychange', refreshSystemDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshSystemDate);
      document.removeEventListener('visibilitychange', refreshSystemDate);
    };
  }, []);

  const membersWithComputedStatuses = useMemo(
    () => applyComputedMemberStatuses((database.members || []).map(withMemberPhoto), database.loans || [], systemDate),
    [database.loans, database.members, systemDate],
  );

  const requestsWithComputedCifNumbers = useMemo(
    () => (database.requests || []).map((request) => {
      const matchedMember = membersWithComputedStatuses.find((member) =>
        member.memberId === request.memberId
        || member.cifNumber === request.cifNumber
        || (request.fullName && member.fullName === request.fullName),
      );
      const requestKind = request.requestKind || request.metadata?.requestKind || request.metadata?.claimantApplication?.requestKind || 'member';
      const approvalQueue = request.approvalQueue || request.metadata?.approvalQueue || request.metadata?.claimantApplication?.approvalQueue || '';

      return {
        ...request,
        requestKind,
        approvalQueue,
        cifNumber: request.cifNumber || request.memberId || matchedMember?.memberId || matchedMember?.cifNumber || '',
        memberId: request.memberId || request.cifNumber || matchedMember?.memberId || matchedMember?.cifNumber || '',
        benefitCategory: normalizeBenefitCategory(request.benefitCategory || request.plan || matchedMember?.benefitCategory || ''),
      };
    }),
    [database.requests, membersWithComputedStatuses],
  );

  const visibleDatabase = useMemo(
    () => ({
      ...database,
      members: membersWithComputedStatuses,
      requests: requestsWithComputedCifNumbers,
      systemDate,
    }),
    [database, membersWithComputedStatuses, requestsWithComputedCifNumbers, systemDate],
  );

  useEffect(() => {
    const theme = database.settings?.theme || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [database.settings?.theme]);

  const persistKey = useCallback(
    async (key, nextValue) => {
      await saveSupabaseKey(key, nextValue);
    },
    [],
  );

  const updateKey = useCallback((key, updater) => {
    setDatabase((current) => {
      const nextValue = typeof updater === 'function' ? updater(current[key]) : updater;
      persistKey(key, nextValue).catch((error) => {
        console.error(error);
        setDatabaseError(error.message || 'Unable to sync to Supabase.');
      });
      return { ...current, [key]: nextValue };
    });
  }, [persistKey]);

  const addActivity = useCallback(
    (action, detail, user = 'System') => {
      updateKey('activityLogs', (logs = []) => [
        {
          id: nextId('ACT', logs),
          action,
          detail,
          user,
          createdAt: new Date().toISOString(),
        },
        ...logs,
      ].slice(0, 250));
    },
    [updateKey],
  );

  const addNotification = useCallback(
    (title, message, type = 'info', extra = {}) => {
      updateKey('notifications', (items = []) => [
        {
          id: nextId('NOT', items),
          title,
          message,
          type,
          ...extra,
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...items,
      ].slice(0, 100));
    },
    [updateKey],
  );

  const markNotificationRead = useCallback(
    (id) => {
      updateKey('notifications', (items = []) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));
    },
    [updateKey],
  );

  const markAllNotificationsRead = useCallback(
    () => {
      updateKey('notifications', (items = []) => items.map((item) => (item.read ? item : { ...item, read: true })));
    },
    [updateKey],
  );

  const createMember = useCallback(
    (member, user) => {
      const currentMembers = database.members || [];
      const generatedMemberRowId = nextMemberRowId(currentMembers);
      const nextMemberIdCode = member.memberId || nextMemberId(currentMembers, member.membershipDate || todayIso());
      const nextBeneficiaries = normalizeBeneficiaries(member.beneficiaries).map((beneficiary, index) => ({
        ...beneficiary,
        memberId: generatedMemberRowId,
        sortOrder: index,
      }));
      updateKey('members', (members = []) => {
        const nextMember = {
          ...member,
          branch: member.branch || getActorBranch(database.users, user),
          id: generatedMemberRowId,
          memberId: nextMemberIdCode,
          cifNumber: member.cifNumber || nextCifNumber(members),
          photo: member.photo || avatarForName(member.fullName),
          lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || todayIso(),
          beneficiaries: nextBeneficiaries,
          createdAt: new Date().toISOString(),
        };

        return [{ ...nextMember, status: getComputedMemberStatus(nextMember, database.loans) }, ...members];
      });
      saveSupabaseKey('memberBeneficiaries', nextBeneficiaries).catch((error) => {
        console.error(error);
        setDatabaseError(error.message || 'Unable to sync beneficiaries to Supabase. Changes saved locally.');
      });
      addActivity('Added Member', `${member.fullName} was added to member records.`, user);
      addNotification('New member', `${member.fullName} is now registered.`, 'success');
    },
    [addActivity, addNotification, database.loans, updateKey],
  );

  const nextRequestNumber = useCallback((requests = []) => {
    const year = currentYearValue();
    const candidatePools = [...(database.members || []), ...requests];
    const highest = candidatePools.reduce((max, item) => {
      const value = String(item.requestId || item.id || item.memberId || '').trim();
      const match = value.match(/^REQ-(\d{4})-(\d{5})$/i);
      if (!match || Number(match[1]) !== year) return max;
      return Math.max(max, Number(match[2]));
    }, 0);
    return `REQ-${year}-${String(highest + 1).padStart(5, '0')}`;
  }, [database.members]);

  const createRequest = useCallback(
    async (request, user) => {
      const requests = database.requests || [];
      const nextCifValue = request.cifNumber || nextCifNumber([...(database.members || []), ...requests]);
      const requestKind = request.requestKind || request.metadata?.requestKind || 'member';
      const approvalQueue = request.approvalQueue || request.metadata?.approvalQueue || '';
      const claimNumber = request.claimNumber || request.metadata?.claimantApplication?.claimNumber || '';
      const claimantName = request.claimantName || request.metadata?.claimantName || '';
      const isClaimantRequest = requestKind === 'claimant' || approvalQueue === 'claimant' || request.requestType === 'Claimant Application';
      const nextRequestNumberValue = isClaimantRequest ? uniqueRequestId('CLM') : nextRequestNumber(requests);
      const nextRequest = {
        ...stripRequestIdentity(request),
        id: request.id || nextRequestNumberValue,
        requestId: request.requestId || nextRequestNumberValue,
        requestType: isClaimantRequest ? 'Claimant Application' : (request.requestType || 'Member Request'),
        requestKind,
        approvalQueue: isClaimantRequest ? 'claimant' : approvalQueue,
        memberId: null,
        cifNumber: nextCifValue,
        requestStatus: 'Pending',
        requestedBy: request.requestedBy || user,
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        claimNumber,
        claimantName,
      };
      const nextRequests = [nextRequest, ...requests];
      setDatabase((current) => ({ ...current, requests: nextRequests }));
      await saveSupabaseKey('requests', [nextRequest]);
      addActivity('Submitted Member Request', `${request.fullName || 'Member request'} was submitted.`, user);
      addNotification('New member request', `${request.fullName || 'A member request'} was sent for manager approval.`, 'info');
    },
    [addActivity, addNotification, database.requests, nextRequestNumber],
  );

  const updateRequest = useCallback(
    async (id, request, user) => {
      const requests = (database.requests || []).map((item) => {
        if (!matchesRequestKey(item, id)) return item;
        const merged = { ...item, ...request };
        const isClaimantRequest = merged.requestKind === 'claimant' || merged.approvalQueue === 'claimant' || merged.requestType === 'Claimant Application';
        return {
          ...merged,
          requestType: isClaimantRequest ? 'Claimant Application' : (merged.requestType || 'Member Request'),
          requestKind: isClaimantRequest ? 'claimant' : (merged.requestKind || 'member'),
          approvalQueue: isClaimantRequest ? 'claimant' : (merged.approvalQueue || ''),
        };
      });
      setDatabase((current) => ({ ...current, requests }));
      const updatedRequest = requests.find((item) => matchesRequestKey(item, id));
      if (updatedRequest) {
        await saveSupabaseKey('requests', [updatedRequest]);
      }
      addActivity('Updated Member Request', `${request.fullName || 'Request'} was updated.`, user);
    },
    [addActivity, database.requests],
  );

  const approveRequest = useCallback(
    async (idOrRequestKey, approvalData = {}, user) => {
      const request = database.requests.find(
        (item) => matchesRequestKey(item, idOrRequestKey),
      );
      if (!request) return;
      const approvalReason = String(approvalData.approvalReason || '').trim() || `Approved by ${user || 'reviewer'}.`;
      const approvedBy = approvalData.approvedBy || user || 'System';
      const now = new Date().toISOString();
      const isClaimRequest = request.requestKind === 'claimant' || request.requestType === 'Claimant Application';
      const matchedDeceasedMember = isClaimRequest
        ? (database.members || []).find((member) =>
            String(member.id || '').trim() === String(request.memberId || '').trim()
            || String(member.memberId || '').trim() === String(request.memberId || '').trim()
            || String(member.cifNumber || '').trim() === String(request.cifNumber || '').trim()
            || (request.fullName && String(member.fullName || '').trim() === String(request.fullName || '').trim()))
        : null;
      const resolvedMemberId = matchedDeceasedMember?.id || request.memberId || null;
      const resolvedCifNumber = matchedDeceasedMember?.cifNumber || matchedDeceasedMember?.memberId || request.cifNumber || null;
      const resolvedMemberName = matchedDeceasedMember?.fullName || request.fullName || request.memberName || '';
      const resolveClaimAmount = (source) => {
        const text = String(source || '').toLowerCase();
        if (text.includes('60')) return 60000;
        if (text.includes('40')) return 40000;
        return Number(request.shareCapital || 0);
      };
      const resolvedAvailmentAmount = resolveClaimAmount(
        request.benefitCategory
        || request.metadata?.claimantApplication?.benefitCategory
        || matchedDeceasedMember?.benefitCategory
        || request.metadata?.claimantApplication?.deceased?.coverageStatus
        || '',
      );
      const nextMemberRowIdValue = nextMemberRowId(database.members || []);
      const approvedMember = isClaimRequest ? null : {
        id: nextMemberRowIdValue,
        memberId: nextMemberId(database.members || [], request.membershipDate || now.slice(0, 10)),
        cifNumber: request.cifNumber || nextRandomCifNumber(database.members || [], request.membershipDate || now.slice(0, 10)),
        applicationStatus: request.applicationStatus || 'New',
        firstName: request.firstName,
        middleName: request.middleName,
        lastName: request.lastName,
        fullName: request.fullName,
        address: request.address,
        barangay: request.barangay,
        birthdate: request.birthdate,
        ageYears: request.ageYears,
        ageMonths: request.ageMonths,
        gender: request.gender,
        civilStatus: request.civilStatus,
      contactNumber: normalizeContactNumber(request.contactNumber),
        occupation: request.occupation,
        employer: request.employer,
        officeAddress: request.officeAddress,
        religion: request.religionOther || request.religion,
        dependents: request.dependents ?? 0,
        savingsAccountNo: request.savingsAccountNo,
        membershipDate: request.membershipDate || now.slice(0, 10),
        signedDate: request.signedDate || now.slice(0, 10),
        witnessStaff: request.witnessStaff,
        actionTaken: 'Approved',
        approvingAuthority: approvedBy,
        approvalDate: now.slice(0, 10),
        findings: request.findings,
        status: 'Active',
        statusOverride: null,
        branch: request.branch || 'Main Office',
        shareCapital: request.shareCapital ?? 0,
        lastShareCapitalDepositDate: request.lastShareCapitalDepositDate || now.slice(0, 10),
        benefitCategory: request.benefitCategory,
        beneficiaries: request.beneficiaries || [],
        photo: request.photo,
        metadata: request.metadata || {},
        createdAt: request.createdAt || now,
        updatedAt: now,
      };
      const approvedAvailment = isClaimRequest ? {
        memberId: resolvedMemberId,
        memberName: resolvedMemberName,
        reference: resolvedCifNumber || request.claimNumber || request.requestId || '',
        claimNumber: request.claimNumber || request.requestId || '',
        dateFiled: request.submittedAt ? request.submittedAt.slice(0, 10) : now.slice(0, 10),
        claimantFirstName: request.metadata?.claimantApplication?.claimantFirstName || request.firstName || '',
        claimantMiddleName: request.metadata?.claimantApplication?.claimantMiddleName || request.middleName || '',
        claimantLastName: request.metadata?.claimantApplication?.claimantLastName || request.lastName || '',
        claimantSuffix: request.metadata?.claimantApplication?.claimantSuffix || request.suffixName || '',
        claimantName: request.metadata?.claimantName || request.fullName || '',
        relationshipToDeceased: request.metadata?.claimantApplication?.relationshipToDeceased || '',
        contactNumber: normalizeContactNumber(request.metadata?.claimantApplication?.contactNumber || request.contactNumber || ''),
        claimantAddress: request.metadata?.claimantApplication?.claimantAddress || request.address || '',
        validIdType: request.metadata?.claimantApplication?.validIdType || '',
        validIdNumber: request.metadata?.claimantApplication?.validIdNumber || '',
        registeredBeneficiary: request.metadata?.claimantApplication?.registeredBeneficiary || '',
        claimantSignature: request.metadata?.claimantApplication?.claimantSignature || '',
        dateSigned: request.metadata?.claimantApplication?.dateSigned || request.signedDate || now.slice(0, 10),
        verifiedBy: approvalData.verifiedBy || approvedBy,
        recommendation: approvalData.recommendation || 'For Approval',
        approvedAmount: resolvedAvailmentAmount,
        approvedBy,
        dateApproved: now.slice(0, 10),
        availmentType: 'Burial Assistance',
        branch: request.branch || 'Main Office',
        amount: resolvedAvailmentAmount,
        status: 'Approved',
        claimStatus: 'Approved',
        availmentDate: now.slice(0, 10),
        deceasedMemberId: resolvedMemberId,
        deceasedCifNumber: resolvedCifNumber,
        deceasedFirstName: matchedDeceasedMember?.firstName || request.firstName || '',
        deceasedMiddleName: matchedDeceasedMember?.middleName || request.middleName || '',
        deceasedLastName: matchedDeceasedMember?.lastName || request.lastName || '',
        deceasedSuffix: matchedDeceasedMember?.suffixName || request.suffixName || '',
        deceasedFullName: matchedDeceasedMember?.fullName || request.fullName || '',
        deceasedDateOfBirth: matchedDeceasedMember?.birthdate || request.birthdate || null,
        deceasedDateOfDeath: request.metadata?.claimantApplication?.deceased?.dateOfDeath || null,
        deceasedCivilStatus: matchedDeceasedMember?.civilStatus || request.civilStatus || '',
        deceasedMembershipDate: matchedDeceasedMember?.membershipDate || request.membershipDate || null,
        deceasedCoverageStatus: request.metadata?.claimantApplication?.deceased?.coverageStatus || matchedDeceasedMember?.status || '',
        deceasedBenefitCategory: matchedDeceasedMember?.benefitCategory || request.benefitCategory || '',
        placeOfDeath: request.findings || '',
        causeOfDeath: request.actionTaken || '',
        dateOfBurial: request.lastShareCapitalDepositDate || null,
        placeOfBurial: request.officeAddress || '',
        funeralHome: request.metadata?.claimantApplication?.deceased?.funeralHome || '',
        totalFuneralExpenses: resolvedAvailmentAmount,
        supportingDocuments: Array.isArray(request.metadata?.claimantApplication?.docs) ? request.metadata.claimantApplication.docs.join(', ') : '',
        remarks: request.approvalReason || '',
        metadata: request.metadata || {},
      } : null;
      const approvedRequest = {
        ...request,
        requestStatus: 'Approved',
        approvedBy,
        approvedAt: now,
        updatedAt: now,
        status: 'Approved',
        memberId: isClaimRequest ? (approvedMember?.id || request.memberId || null) : null,
        cifNumber: approvedMember?.cifNumber || request.cifNumber || null,
        actionTaken: 'Approved',
        approvalReason,
      };
      const requestKeys = new Set([request.id, request.requestId].filter(Boolean));
      const nextRequests = (database.requests || []).map((item) =>
        requestKeys.has(item.id) || requestKeys.has(item.requestId) ? approvedRequest : item,
      );
      const nextMembers = isClaimRequest
        ? (database.members || [])
        : [
            approvedMember,
            ...(database.members || []).filter((member) => member.id !== approvedMember.id),
          ];
      if (isClaimRequest && approvedAvailment) {
        const availments = database.availments || [];
        const existingAvailment = availments.find((item) =>
          String(item.claimNumber || '').trim() === String(approvedAvailment.claimNumber || '').trim()
          || String(item.reference || '').trim() === String(approvedAvailment.reference || '').trim()
        );
        const nextAvailment = existingAvailment
          ? {
              ...existingAvailment,
              ...approvedAvailment,
              id: existingAvailment.id,
              monitoringReference: existingAvailment.monitoringReference,
              updatedAt: now,
            }
          : {
              ...approvedAvailment,
              id: nextId('AVM', availments),
              monitoringReference: `AVM-${String(availments.length + 1).padStart(5, '0')}`,
              createdAt: now,
              createdBy: user,
            };
        const nextAvailments = existingAvailment
          ? availments.map((item) => (item.id === existingAvailment.id ? nextAvailment : item))
          : [nextAvailment, ...availments];
        setDatabase((current) => ({ ...current, availments: nextAvailments }));
        await saveSupabaseKey('availments', nextAvailments);
      } else {
        setDatabase((current) => ({ ...current, members: nextMembers }));
      }
      setDatabase((current) => ({
        ...current,
        requests: nextRequests,
        members: nextMembers,
      }));
      await saveSupabaseKey('requests', [approvedRequest]);

      addActivity(isClaimRequest ? 'Approved Claimant Application' : 'Approved Member Request', `${approvedRequest.fullName || 'Request'} was approved.`, user);
      addNotification('Request approved', `${approvedRequest.fullName || 'A member request'} was approved.`, 'success', {
        actionType: 'approve',
        reason: approvalReason,
        recipient: approvedRequest.requestedBy,
      });
    },
    [addActivity, addNotification, database.requests],
  );

  const rejectRequest = useCallback(
    (id, rejectionData = {}, user) => {
      const request = database.requests.find((item) => matchesRequestKey(item, id));
      if (!request) return;

      const reason = String(rejectionData.rejectionReason || '').trim();
      const rejectedRequest = { ...request, ...rejectionData, requestStatus: 'Rejected', rejectedAt: new Date().toISOString() };
      updateKey('requests', (requests = []) =>
        requests.map((item) => (matchesRequestKey(item, id) ? rejectedRequest : item)),
      );
      saveSupabaseKey('requests', [rejectedRequest]).catch((error) => {
        console.error(error);
        setDatabaseError(error.message || 'Unable to sync rejected request to Supabase.');
      });
      addActivity('Rejected Member Request', `${rejectionData.fullName || 'Request'} was rejected.`, user);
      addNotification('Request rejected', `${rejectionData.fullName || 'A member request'} was rejected.`, 'warning', {
        actionType: 'reject',
        reason,
        recipient: rejectedRequest.requestedBy,
      });
    },
    [addActivity, addNotification, database.requests, updateKey],
  );

  const returnRequest = useCallback(
    (id, returnData = {}, user) => {
      const request = database.requests.find((item) => matchesRequestKey(item, id));
      if (!request) return;

      const reason = String(returnData.returnReason || '').trim();
      const returnedRequest = { ...request, ...returnData, requestStatus: 'Returned', returnedAt: new Date().toISOString() };
      updateKey('requests', (requests = []) =>
        requests.map((item) => (matchesRequestKey(item, id) ? returnedRequest : item)),
      );
      saveSupabaseKey('requests', [returnedRequest]).catch((error) => {
        console.error(error);
        setDatabaseError(error.message || 'Unable to sync returned request to Supabase.');
      });
      addActivity('Returned Member Request', `${returnData.fullName || 'Request'} was returned to staff for editing.`, user);
      addNotification('Request returned to staff', `${returnData.fullName || 'A member request'} was sent back for editing due to missing requirements.`, 'info', {
        actionType: 'return',
        reason,
        recipient: returnedRequest.requestedBy,
      });
    },
    [addActivity, addNotification, database.requests, updateKey],
  );

  const updateMember = useCallback(
    (id, member, user) => {
      const nextBeneficiaries = normalizeBeneficiaries(member.beneficiaries || []).map((beneficiary, index) => ({
        ...beneficiary,
        memberId: id,
        sortOrder: index,
      }));
      updateKey('members', (members = []) =>
        members.map((item) => {
          if (item.id !== id) return item;

          const shareCapitalIncreased = Number(member.shareCapital || 0) > Number(item.shareCapital || 0);
          const nextMember = {
            ...item,
            ...member,
            beneficiaries: nextBeneficiaries,
            lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || (shareCapitalIncreased ? todayIso() : getLastShareCapitalDepositDate(item)),
            photo: member.photo || item.photo || avatarForName(member.fullName),
          };

          return { ...nextMember, status: getComputedMemberStatus(nextMember, database.loans) };
        }),
      );
      saveSupabaseKey('memberBeneficiaries', nextBeneficiaries).catch((error) => {
        console.error(error);
        setDatabaseError(error.message || 'Unable to sync beneficiaries to Supabase. Changes saved locally.');
      });
      addActivity('Updated Member', `${member.fullName} profile was updated.`, user);
    },
    [addActivity, database.loans, updateKey],
  );

  const createContribution = useCallback(
    async (contribution, user) => {
      const member = database.members.find((item) => item.id === contribution.memberId || item.memberId === contribution.memberId);
      if (!member) return null;

      const amount = Number(contribution.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return null;

      const contributionDate = contribution.transactionDate || contribution.contributionDate || todayIso();
      const recordedBy = contribution.recordedBy || contribution.encodedBy || user || 'Staff';
      const currentShareCapital = Number(member.shareCapital || 0);
      const nextShareCapital = currentShareCapital + amount;
      const transactionId = contribution.id || nextId('CON', database.shareCapitalTransactions || []);
      const nextContribution = {
        ...contribution,
        id: transactionId,
        memberId: member.id,
        memberName: member.fullName,
        transactionDate: contributionDate,
        transactionType: contribution.transactionType || 'Deposit',
        amount,
        runningBalance: Number.isFinite(Number(contribution.runningBalance))
          ? Number(contribution.runningBalance)
          : nextShareCapital,
        referenceNumber: contribution.referenceNumber || transactionId,
        encodedBy: recordedBy,
        remarks: contribution.remarks || '',
        createdAt: new Date().toISOString(),
      };

      const nextTransactions = [nextContribution, ...(database.shareCapitalTransactions || [])];
      const nextMembers = (database.members || []).map((item) => item.id === member.id
        ? {
            ...item,
            shareCapital: nextShareCapital,
            lastShareCapitalDepositDate: contributionDate,
            lastContributionId: transactionId,
            lastContributionAmount: amount,
            lastContributionRecordedBy: recordedBy,
          }
        : item,
      );

      updateKey('shareCapitalTransactions', nextTransactions);
      updateKey('members', nextMembers);

      await saveSupabaseKey('shareCapitalTransactions', nextContribution);
      await saveSupabaseKey('members', [nextMembers.find((item) => item.id === member.id)]).catch((memberSaveError) => {
        console.error(memberSaveError);
      });

      addActivity(
        'Recorded Contribution',
        `${member.fullName || 'Member'} contributed ${amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}.`,
        recordedBy,
      );

      return nextContribution;
    },
    [addActivity, database.members, database.shareCapitalTransactions, setDatabase],
  );

  const deleteMember = useCallback(
    (id, user) => {
      const member = database.members.find((item) => item.id === id);
      updateKey('members', (members = []) => members.filter((item) => item.id !== id));
      addActivity('Deleted Member', `${member?.fullName || 'Member'} was deleted.`, user);
    },
    [addActivity, database.members, updateKey],
  );

  useEffect(() => {
    if (isDatabaseLoading) return undefined;

    const reminders = getMembersApproachingStatusChange(visibleDatabase.members || [], visibleDatabase.loans || [], systemDate);
    if (!reminders.length) return undefined;

    const prioritizedReminders = [...reminders].sort((left, right) => {
      const leftIsMiguel = String(left.member?.fullName || '').trim().toLowerCase() === 'miguel herrera';
      const rightIsMiguel = String(right.member?.fullName || '').trim().toLowerCase() === 'miguel herrera';
      if (leftIsMiguel && !rightIsMiguel) return -1;
      if (!leftIsMiguel && rightIsMiguel) return 1;
      return 0;
    });

    let cancelled = false;

    prioritizedReminders.forEach((item) => {
      const member = item.member || {};
      const reminderDay = item.reminderDay;
      const contactNumber = normalizeContactNumber(member.contactNumber);

      const memberName = member.fullName || 'Member';
      const message = `Hello ${memberName}, this is a friendly reminder from Barbaza MPC. Your account will become dormant in ${reminderDay} days if no transaction or activity is made. Please visit any Barbaza MPC branch or contact us for assistance. Thank you.`;
      const baseLog = {
        id: `SMS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        memberId: member.id || item.member?.memberId || memberName,
        memberName,
        contactNumber: contactNumber || 'None',
        reminderDay,
        message,
        createdAt: new Date().toISOString(),
      };

      if (!member.id || !contactNumber) {
        setSmsDebugLogs((current) => [
          { ...baseLog, status: 'skipped', error: !member.id ? 'Missing member id' : 'Missing contact number' },
          ...current,
        ].slice(0, 25));
        return;
      }

      setSmsDebugLogs((current) => [
        { ...baseLog, status: 'pending' },
        ...current,
      ].slice(0, 25));

      sendSms(contactNumber, message, {
        memberId: member.id,
        memberName: memberName,
        reminderDay,
      })
        .then((result) => {
          if (cancelled || result?.skipped) return;
          const isLocallySaved = result?.data?.status === 'saved_locally' || result?.data?.saved_locally;
          setSmsDebugLogs((current) => [
            {
              ...baseLog,
              status: isLocallySaved ? 'saved_locally' : 'success',
              contactNumber,
              messageId: result?.data?.message_id || null,
              response: result?.data || null,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 25));
          addNotification(
            isLocallySaved ? 'Dormant reminder saved locally' : 'Dormant reminder sent',
            isLocallySaved
              ? `${memberName} was saved locally for a ${reminderDay}-day reminder SMS.`
              : `${memberName} received a ${reminderDay}-day reminder SMS.`,
            isLocallySaved ? 'info' : 'success',
          );
          addActivity(
            isLocallySaved ? 'Dormant Reminder Saved Locally' : 'Dormant Reminder Sent',
            isLocallySaved
              ? `Saved locally ${reminderDay}-day reminder SMS for ${memberName}.`
              : `Sent ${reminderDay}-day reminder SMS to ${memberName}.`,
            'System',
          );
        })
        .catch((error) => {
          if (cancelled) return;
          console.error(error);
          setSmsDebugLogs((current) => [
            {
              ...baseLog,
              status: 'failed',
              error: error?.message || 'SMS send failed',
              response: error?.response || null,
              contactNumber,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 25));
          addNotification('Dormant reminder failed', `${memberName} reminder SMS could not be sent: ${error?.message || 'Unknown error'}.`, 'warning');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [addActivity, addNotification, isDatabaseLoading, systemDate, visibleDatabase.loans, visibleDatabase.members]);

  const createLoan = useCallback(
    (loan, user) => {
      const member = database.members.find((item) => item.id === loan.memberId);
      const principal = Number(loan.principalAmount);
      const interest = Number(loan.interest);
      const interestAmount = Math.round(principal * (interest / 100));
      const penaltyRate = Number(database.settings?.penaltyRate ?? loan.penaltyRate ?? 0);
      const penalty = getLoanMonthlyPenalty({ principalAmount: principal }, penaltyRate);
      const nextLoan = {
        ...loan,
        branch: loan.branch || getActorBranch(database.users, user),
        id: nextId('LOAN', database.loans),
        loanNumber: loan.loanNumber || `CLP-${String(database.loans.length + 1).padStart(5, '0')}`,
        memberName: member?.fullName || loan.memberName,
        principalAmount: principal,
        interest,
        interestAmount,
        totalPayable: principal + interestAmount,
        penaltyRate,
        paidAmount: Number(loan.paidAmount || 0),
        penalty,
        status: loan.status || 'Pending',
        createdAt: new Date().toISOString(),
      };
      nextLoan.status = getLoanStatus(nextLoan);
      updateKey('loans', (loans = []) => [nextLoan, ...loans]);
      addActivity('Created Loan', `${nextLoan.loanNumber} was created for ${nextLoan.memberName}.`, user);
    },
    [addActivity, database.loans, database.members, database.settings?.penaltyRate, updateKey],
  );

  const updateLoan = useCallback(
    (id, loan, user) => {
      const member = database.members.find((item) => item.id === loan.memberId);
      updateKey('loans', (loans = []) =>
        loans.map((item) => {
          if (item.id !== id) return item;
          const principal = Number(loan.principalAmount);
          const interest = Number(loan.interest);
          const interestAmount = Math.round(principal * (interest / 100));
          const penaltyRate = Number(database.settings?.penaltyRate ?? loan.penaltyRate ?? item.penaltyRate ?? 0);
          const penalty = getLoanMonthlyPenalty({ principalAmount: principal }, penaltyRate);
          const nextLoan = {
            ...item,
            ...loan,
            principalAmount: principal,
            memberName: member?.fullName || item.memberName,
            interest,
            interestAmount,
            totalPayable: principal + interestAmount,
            penaltyRate,
            penalty,
          };
          return { ...nextLoan, status: getLoanStatus(nextLoan) };
        }),
      );
      addActivity('Updated Loan', `${loan.loanNumber || 'Loan'} details were updated.`, user);
    },
    [addActivity, database.members, database.settings?.penaltyRate, updateKey],
  );

  const deleteLoan = useCallback(
    (id, user) => {
      const loan = database.loans.find((item) => item.id === id);
      updateKey('loans', (loans = []) => loans.filter((item) => item.id !== id));
      updateKey('collections', (items = []) => items.filter((item) => item.loanId !== id));
      addActivity('Deleted Loan', `${loan?.loanNumber || 'Loan'} was deleted.`, user);
    },
    [addActivity, database.loans, updateKey],
  );

  const createCollection = useCallback(
    (collection, user) => {
      const loan = database.loans.find((item) => item.id === collection.loanId);
      const nextCollection = {
        ...collection,
        branch: collection.branch || getActorBranch(database.users, user),
        id: nextId('COL', database.collections),
        collectionId: collection.collectionId || `COLS-${String(database.collections.length + 1).padStart(5, '0')}`,
        loanNumber: loan?.loanNumber || collection.loanNumber,
        memberId: loan?.memberId || collection.memberId,
        memberName: loan?.memberName || collection.memberName,
        amountDue: Number(collection.amountDue || loan?.totalPayable || 0),
        amountPaid: Number(collection.amountPaid || 0),
        balance: Number(collection.balance || 0),
        penalty: Number(collection.penalty ?? getLoanPenaltyDue(loan, database.payments, todayIso(), database.settings?.penaltyRate)),
      };
      updateKey('collections', (items = []) => [nextCollection, ...items]);
      addActivity('Collection Created', `${nextCollection.collectionId} was added.`, user);
    },
    [addActivity, database.collections, database.loans, database.payments, database.settings?.penaltyRate, updateKey],
  );

  const updateCollection = useCallback(
    (id, collection, user) => {
      updateKey('collections', (items = []) => items.map((item) => (item.id === id ? { ...item, ...collection } : item)));
      addActivity('Collection Updated', `${collection.collectionId || 'Collection'} was updated.`, user);
    },
    [addActivity, updateKey],
  );

  const deleteCollection = useCallback(
    (id, user) => {
      const collection = database.collections.find((item) => item.id === id);
      updateKey('collections', (items = []) => items.filter((item) => item.id !== id));
      addActivity('Collection Deleted', `${collection?.collectionId || 'Collection'} was deleted.`, user);
    },
    [addActivity, database.collections, updateKey],
  );

  const recordPayment = useCallback(
    (payment, user) => {
      const loan = database.loans.find((item) => item.id === payment.loanId);
      if (!loan) return null;

      const amount = Number(payment.amount);
      const paymentDate = payment.paymentDate || todayIso();
      const penaltyRate = Number(database.settings?.penaltyRate ?? loan.penaltyRate ?? 0);
      const loanWithPenaltyRate = { ...loan, penaltyRate };
      const hasPenaltyValue = payment.penalty !== undefined && payment.penalty !== null && String(payment.penalty).trim() !== '';
      const penalty = hasPenaltyValue ? Number(payment.penalty || 0) : getLoanPenaltyDue(loanWithPenaltyRate, database.payments, paymentDate, penaltyRate);
      const nextPayment = {
        ...payment,
        branch: payment.branch || getActorBranch(database.users, user),
        id: nextId('PAY', database.payments),
        receiptNumber: payment.receiptNumber || `RCT-${String(database.payments.length + 1).padStart(6, '0')}`,
        loanNumber: loan.loanNumber,
        memberId: loan.memberId,
        memberName: loan.memberName,
        amount,
        penalty,
        paymentDate,
        status: 'Completed',
        createdAt: new Date().toISOString(),
      };

      const nextPaidAmount = Number(loan.paidAmount || 0) + amount;
      const nextLoanState = { ...loanWithPenaltyRate, paidAmount: nextPaidAmount };
      const nextPayments = [nextPayment, ...database.payments];
      const nextPenaltyDue = getLoanPenaltyDue(nextLoanState, nextPayments, paymentDate, penaltyRate);
      updateKey('payments', (payments = []) => [nextPayment, ...payments]);
      updateKey('loans', (loans = []) =>
        loans.map((item) =>
          item.id === loan.id
            ? {
                ...item,
                paidAmount: nextPaidAmount,
                status: getLoanStatus(item, nextPaidAmount),
              }
            : item,
        ),
      );
      updateKey('collections', (collections = []) => {
        const existing = collections.find((item) => item.loanId === loan.id);
        const nextBalance = getLoanBalance(nextLoanState);
        if (!existing) {
          const nextCollectionStatus = nextBalance <= 0 && nextPenaltyDue <= 0 ? 'Paid' : nextPenaltyDue > 0 ? 'Overdue' : 'Partial';
          return [
            {
              id: nextId('COL', collections),
              collectionId: `COLS-${String(collections.length + 1).padStart(5, '0')}`,
              loanId: loan.id,
              loanNumber: loan.loanNumber,
              memberId: loan.memberId,
              memberName: loan.memberName,
              collector: payment.collectedBy || user,
              amountDue: loan.totalPayable,
              amountPaid: nextPaidAmount,
              balance: nextBalance,
              penalty: nextPenaltyDue,
              collectionDate: paymentDate,
              status: nextCollectionStatus,
            },
            ...collections,
          ];
        }
        const nextCollectionStatus = nextBalance <= 0 && nextPenaltyDue <= 0 ? 'Paid' : nextPenaltyDue > 0 ? 'Overdue' : 'Partial';
        return collections.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                amountPaid: nextPaidAmount,
                balance: nextBalance,
                penalty: nextPenaltyDue,
                status: nextCollectionStatus,
              }
            : item,
        );
      });
      addActivity('Payment Recorded', `${nextPayment.receiptNumber} was posted for ${loan.memberName}.`, user);
      addNotification('Payment received', `${loan.memberName} paid PHP ${(amount + penalty).toLocaleString('en-PH')}.`, 'success');
      return nextPayment;
    },
    [addActivity, addNotification, database.loans, database.payments, database.settings?.penaltyRate, updateKey],
  );

  const createUser = useCallback(
    async (userRecord, user) => {
      const normalizedId = String(userRecord.id || '').trim();
      const payload = {
        ...userRecord,
        id: normalizedId || undefined,
        branch: userRecord.branch || 'Main Office',
        status: userRecord.status || 'Active',
      };
      const createdId = globalThis.crypto?.randomUUID?.() || `usr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const nextUser = {
        ...payload,
        id: normalizedId || createdId,
        branch: payload.branch || 'Main Office',
        createdAt: new Date().toISOString(),
        lastLogin: null,
      };
      const nextUsers = [
        nextUser,
        ...(database.users || []).filter((item) =>
          item.id !== nextUser.id && String(item.username || '').toLowerCase().trim() !== String(nextUser.username || '').toLowerCase().trim(),
        ),
      ];
      await saveSupabaseKey('users', nextUsers);
      const refreshedDatabase = await loadDatabaseFromSupabase();
      setDatabase(refreshedDatabase);
      addActivity('Created User', `${userRecord.username} account was created.`, user);
    },
    [addActivity, database.users],
  );

  const updateUser = useCallback(
    async (id, userRecord, user) => {
      const nextUsers = (database.users || []).map((item) => (item.id === id ? { ...item, ...userRecord } : item));
      setDatabase((current) => ({ ...current, users: nextUsers }));
      await saveSupabaseKey('users', nextUsers);
      const refreshedDatabase = await loadDatabaseFromSupabase();
      setDatabase(refreshedDatabase);
      addActivity('Updated User', `${userRecord.username || 'User'} account was updated.`, user);
    },
    [addActivity, database.users],
  );

  const deleteUser = useCallback(
    (id, user) => {
      const target = database.users.find((item) => item.id === id);
      updateKey('users', (users = []) => users.filter((item) => item.id !== id));
      addActivity('Deleted User', `${target?.username || 'User'} account was deleted.`, user);
    },
    [addActivity, database.users, updateKey],
  );

  const deleteOtherUsers = useCallback(
    (currentUser) => {
      const counterpartRole = currentUser.role === 'Manager' ? 'Admin' : 'Manager';
      const counterpart = database.users.find(
        (item) => item.role === counterpartRole && item.status === 'Active' && normalizeBranchName(item.branch) === normalizeBranchName(currentUser.branch),
      ) || database.users.find(
        (item) => item.role === counterpartRole && normalizeBranchName(item.branch) === normalizeBranchName(currentUser.branch),
      );
      const keepIds = new Set([currentUser.id, counterpart?.id].filter(Boolean));
      const removedCount = database.users.filter((item) => !keepIds.has(item.id)).length;
      updateKey('users', (users = []) => users.filter((item) => keepIds.has(item.id)));
      addActivity('Erased Accounts', `${removedCount} account(s) were erased; only the signed-in account and its matching branch Admin/Manager were retained.`, currentUser.username);
      return removedCount;
    },
    [addActivity, database.users, updateKey],
  );

  const createReport = useCallback(
    (report, user) => {
      const now = new Date().toISOString();
      const totalAmount = Number(report.totalAmount ?? (report.rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0) ?? 0);
      const nextReport = {
        ...report,
        branch: report.branch || getActorBranch(database.users, user),
        id: nextId('RPT', database.reports || []),
        generatedAt: report.generatedAt || now,
        generatedBy: user,
        payload: {
          ...(report.payload || {}),
          title: report.title,
          type: report.type,
          period: report.period,
          rows: report.rows || [],
          totalAmount,
          generatedAt: report.generatedAt || now,
          generatedBy: user,
        },
      };
      updateKey('reports', (reports = []) => [nextReport, ...reports]);
      addActivity('Generated Report', `${report.title} was generated.`, user);
    },
    [addActivity, updateKey],
  );

  const createAvailment = useCallback(
    (availment, user) => {
      const resolveBenefitAmount = (value) => {
        const text = String(value || '').toLowerCase();
        if (text.includes('60')) return 60000;
        if (text.includes('40')) return 40000;
        return Number(availment.amount || 0);
      };
      updateKey('availments', (items = []) => {
        const nextNumber = items.reduce((highest, item) => {
          const value = Number(String(item.monitoringReference || '').split('-').pop());
          return Number.isNaN(value) ? highest : Math.max(highest, value);
        }, 0) + 1;
        const resolvedAmount = resolveBenefitAmount(availment.availmentType || availment.benefitCategory || availment.deceasedBenefitCategory);
        return [{
          ...availment,
          id: nextId('AVM', items),
          reference: availment.memberReference,
          monitoringReference: `AVM-${String(nextNumber).padStart(5, '0')}`,
          amount: resolvedAmount,
          approvedAmount: resolvedAmount,
          branch: availment.branch || getActorBranch(database.users, user),
          createdAt: new Date().toISOString(),
          createdBy: user,
        }, ...items];
      });
      addActivity('Added Availment Monitoring', `${availment.memberName} was added to availment monitoring.`, user);
    },
    [addActivity, database.users, updateKey],
  );

  const updateSettings = useCallback(
    (settings, user) => {
      updateKey('settings', (current = {}) => ({ ...current, ...settings }));
      addActivity('Settings Changed', 'System settings were updated.', user);
    },
    [addActivity, updateKey],
  );

  const setTheme = useCallback(
    (theme) => {
      updateKey('settings', (current = {}) => ({ ...current, theme }));
    },
    [updateKey],
  );

  const downloadBackup = useCallback(() => createBackupPayload(visibleDatabase), [visibleDatabase]);

  const restoreFromBackup = useCallback(
    async (payload, user) => {
      const nextDatabase = await restoreSupabaseDatabase(payload);
      setDatabase(nextDatabase);
      addActivity('Database Restored', 'A Supabase backup was restored.', user);
    },
    [addActivity],
  );

  const resetAllData = useCallback(
    async (user) => {
      const nextDatabase = await resetSupabaseDatabase();
      setDatabase(nextDatabase);
      addActivity('Database Reset', 'Supabase was reset to fresh sample data.', user);
    },
    [addActivity],
  );

  const clearLocalData = useCallback(() => {
    setDatabase(freshDatabase());
    setDatabaseError('');
    setSmsDebugLogs([]);
  }, []);

  const value = useMemo(
    () => ({
      ...visibleDatabase,
      addActivity,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead,
      createMember,
      createRequest,
      updateMember,
      updateRequest,
      approveRequest,
      rejectRequest,
      returnRequest,
      deleteMember,
      createLoan,
      updateLoan,
      deleteLoan,
      createCollection,
      updateCollection,
      deleteCollection,
      createContribution,
      recordPayment,
      createUser,
      updateUser,
      deleteUser,
      deleteOtherUsers,
      createReport,
      createAvailment,
      updateSettings,
      setTheme,
      downloadBackup,
      restoreFromBackup,
      resetAllData,
      clearLocalData,
      isDatabaseLoading,
      databaseError,
      smsDebugLogs,
    }),
    [
      addActivity,
      addNotification,
      createCollection,
      createContribution,
      createLoan,
      createMember,
      createRequest,
      createReport,
      createAvailment,
      createUser,
      visibleDatabase,
      deleteCollection,
      deleteLoan,
      deleteMember,
      deleteUser,
      deleteOtherUsers,
      downloadBackup,
      markNotificationRead,
      markAllNotificationsRead,
      recordPayment,
      resetAllData,
      clearLocalData,
      isDatabaseLoading,
      databaseError,
      smsDebugLogs,
      restoreFromBackup,
      setTheme,
      updateCollection,
      updateLoan,
      updateMember,
      updateRequest,
      approveRequest,
      rejectRequest,
      returnRequest,
      updateSettings,
      updateUser,
    ],
  );

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}
