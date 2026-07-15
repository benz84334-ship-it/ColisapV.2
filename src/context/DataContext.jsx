import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBackupPayload } from '../utils/exporters.js';
import { nextCifNumber, todayIso } from '../utils/formatters.js';
import { getLoanBalance, getLoanMonthlyPenalty, getLoanPenaltyDue } from '../utils/analytics.js';
import { normalizeBranchName } from '../utils/constants.js';
import { applyComputedMemberStatuses, getComputedMemberStatus, getLastShareCapitalDepositDate, getMembersApproachingStatusChange } from '../utils/memberStatus.js';
import {
  freshDatabase,
  loadDatabaseFromSupabase,
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

function nextMemberId(members = [], registrationDate = todayIso()) {
  const year = String(registrationDate || todayIso()).slice(0, 4);
  const pattern = new RegExp(`^CIFK-${year}-(\\d{6})$`, 'i');
  const highest = members.reduce((max, member) => {
    const match = String(member.memberId || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CIFK-${year}-${String(highest + 1).padStart(6, '0')}`;
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

export function DataProvider({ children }) {
  const [database, setDatabase] = useState(() => freshDatabase());
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState('');
  const [systemDate, setSystemDate] = useState(() => todayIso());

  useEffect(() => {
    let active = true;
    loadDatabaseFromSupabase()
      .then((remoteDatabase) => {
        if (active) setDatabase(remoteDatabase);
      })
      .catch((error) => {
        console.error(error);
        if (active) setDatabaseError(error.message);
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

  const visibleDatabase = useMemo(
    () => ({
      ...database,
      members: membersWithComputedStatuses,
      systemDate,
    }),
    [database, membersWithComputedStatuses, systemDate],
  );

  useEffect(() => {
    const theme = database.settings?.theme || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [database.settings?.theme]);

  const updateKey = useCallback((key, updater) => {
    setDatabase((current) => {
      const nextValue = typeof updater === 'function' ? updater(current[key]) : updater;
      saveSupabaseKey(key, nextValue).catch((error) => {
        console.error(error);
        setDatabaseError(error.message);
      });
      return { ...current, [key]: nextValue };
    });
  }, []);

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
    (title, message, type = 'info') => {
      updateKey('notifications', (items = []) => [
        {
          id: nextId('NOT', items),
          title,
          message,
          type,
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

  const createMember = useCallback(
    (member, user) => {
      updateKey('members', (members = []) => {
        const nextMember = {
          ...member,
          branch: member.branch || getActorBranch(database.users, user),
          id: nextId('MEM', members),
          memberId: member.memberId || nextMemberId(members, member.membershipDate || todayIso()),
          cifNumber: member.cifNumber || nextCifNumber(members),
          photo: member.photo || avatarForName(member.fullName),
          lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || todayIso(),
          createdAt: new Date().toISOString(),
        };

        return [{ ...nextMember, status: getComputedMemberStatus(nextMember, database.loans) }, ...members];
      });
      addActivity('Added Member', `${member.fullName} was added to member records.`, user);
      addNotification('New member', `${member.fullName} is now registered.`, 'success');
    },
    [addActivity, addNotification, database.loans, updateKey],
  );

  const updateMember = useCallback(
    (id, member, user) => {
      updateKey('members', (members = []) =>
        members.map((item) => {
          if (item.id !== id) return item;

          const shareCapitalIncreased = Number(member.shareCapital || 0) > Number(item.shareCapital || 0);
          const nextMember = {
            ...item,
            ...member,
            lastShareCapitalDepositDate: member.lastShareCapitalDepositDate || (shareCapitalIncreased ? todayIso() : getLastShareCapitalDepositDate(item)),
            photo: member.photo || item.photo || avatarForName(member.fullName),
          };

          return { ...nextMember, status: getComputedMemberStatus(nextMember, database.loans) };
        }),
      );
      addActivity('Updated Member', `${member.fullName} profile was updated.`, user);
    },
    [addActivity, database.loans, updateKey],
  );

  const deleteMember = useCallback(
    (id, user) => {
      const member = database.members.find((item) => item.id === id);
      updateKey('members', (members = []) => members.filter((item) => item.id !== id));
      addActivity('Deleted Member', `${member?.fullName || 'Member'} was deleted.`, user);
    },
    [addActivity, database.members, updateKey],
  );

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
    (userRecord, user) => {
      updateKey('users', (users = []) => [
        {
          ...userRecord,
          branch: userRecord.branch || 'Main Office',
          id: nextId('USR', users),
          createdAt: new Date().toISOString(),
          lastLogin: null,
        },
        ...users,
      ]);
      addActivity('Created User', `${userRecord.username} account was created.`, user);
    },
    [addActivity, updateKey],
  );

  const updateUser = useCallback(
    (id, userRecord, user) => {
      updateKey('users', (users = []) => users.map((item) => (item.id === id ? { ...item, ...userRecord } : item)));
      addActivity('Updated User', `${userRecord.username || 'User'} account was updated.`, user);
    },
    [addActivity, updateKey],
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
      updateKey('reports', (reports = []) => [
        {
          ...report,
          branch: report.branch || getActorBranch(database.users, user),
          id: nextId('RPT', reports),
          generatedAt: new Date().toISOString(),
          generatedBy: user,
        },
        ...reports,
      ]);
      addActivity('Generated Report', `${report.title} was generated.`, user);
    },
    [addActivity, updateKey],
  );

  const createAvailment = useCallback(
    (availment, user) => {
      updateKey('availments', (items = []) => {
        const nextNumber = items.reduce((highest, item) => {
          const value = Number(String(item.monitoringReference || '').split('-').pop());
          return Number.isNaN(value) ? highest : Math.max(highest, value);
        }, 0) + 1;
        return [{
          ...availment,
          id: nextId('AVM', items),
          reference: availment.memberReference,
          monitoringReference: `AVM-${String(nextNumber).padStart(5, '0')}`,
          amount: Number(availment.amount || 0),
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

  const value = useMemo(
    () => ({
      ...visibleDatabase,
      addActivity,
      addNotification,
      markNotificationRead,
      createMember,
      updateMember,
      deleteMember,
      createLoan,
      updateLoan,
      deleteLoan,
      createCollection,
      updateCollection,
      deleteCollection,
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
      isDatabaseLoading,
      databaseError,
    }),
    [
      addActivity,
      addNotification,
      createCollection,
      createLoan,
      createMember,
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
      recordPayment,
      resetAllData,
      isDatabaseLoading,
      databaseError,
      restoreFromBackup,
      setTheme,
      updateCollection,
      updateLoan,
      updateMember,
      updateSettings,
      updateUser,
    ],
  );

  return (
    <DataContext.Provider value={value}>
      {isDatabaseLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Connecting to Supabase...
        </div>
      ) : children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}
