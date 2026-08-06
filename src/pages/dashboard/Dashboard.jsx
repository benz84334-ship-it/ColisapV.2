import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiAlertTriangle, FiFileText, FiUserCheck, FiUserMinus, FiUsers } from 'react-icons/fi';
import StatCard from '../../components/cards/StatCard.jsx';
import ChartCard from '../../components/charts/ChartCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import ExportActions from '../../components/ui/ExportActions.jsx';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { buildDashboardData, getBranchScopedData } from '../../utils/analytics.js';
import { formatCurrency, formatDate, formatDateTime, todayIso } from '../../utils/formatters.js';
import { getMembersApproachingStatusChange } from '../../utils/memberStatus.js';
import { MEMBER_BENEFIT_CATEGORIES, ROLES, normalizeBenefitCategory } from '../../utils/constants.js';

function isSameIsoDate(value, isoDate) {
  if (!value || !isoDate) return false;
  return String(value).slice(0, 10) === String(isoDate).slice(0, 10);
}

function getLatestSmsDebugEntry(entries = [], memberId) {
  return entries
    .filter((entry) => entry?.memberId === memberId)
    .slice()
    .sort((left, right) => new Date(right.createdAt || right.updatedAt || 0) - new Date(left.createdAt || left.updatedAt || 0))[0];
}

export default function Dashboard() {
  const data = useData();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === ROLES.ADMIN;
  const isManager = currentUser?.role === ROLES.MANAGER;
  const scopedData = isAdmin ? data : getBranchScopedData(data, currentUser?.branch);
  const dashboard = buildDashboardData(scopedData, isAdmin ? undefined : currentUser?.branch);
  const activities = scopedData.activityLogs.slice(0, 6);
  const smsDebugLogs = data.smsDebugLogs || [];
  const [accountListModal, setAccountListModal] = useState(null);
  const visibleWidgets = {
    stats: true,
    statusChange: true,
    activities: true,
  };
  const activeMembers = scopedData.members.filter((member) => member.status === 'Active').length;
  const inactiveMembers = scopedData.members.filter((member) => member.status === 'Inactive').length;
  const dormantMembers = scopedData.members.filter((member) => member.status === 'Dormant').length;
  const fortyKMembers = scopedData.members.filter((member) => normalizeBenefitCategory(member.benefitCategory) === MEMBER_BENEFIT_CATEGORIES[0]);
  const sixtyKMembers = scopedData.members.filter((member) => normalizeBenefitCategory(member.benefitCategory) === MEMBER_BENEFIT_CATEGORIES[1]);
  const dashboardExportColumns = [
    { key: 'memberId', label: 'CIFK Number' },
    { key: 'fullName', label: 'Member' },
    { key: 'barangay', label: 'Barangay / Municipality' },
    { key: 'membershipDate', label: 'Membership Date' },
    { key: 'status', label: 'Status' },
  ];
  const memberStatusByMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month) => ({
    month,
    Active: month === 'Jul' ? activeMembers : 0,
    Inactive: month === 'Jul' ? inactiveMembers : 0,
    Dormant: month === 'Jul' ? dormantMembers : 0,
  }));
  const largestStatusTotal = Math.max(activeMembers, inactiveMembers, dormantMembers);
  const memberStatusAxisMax = Math.max(100, (Math.floor(largestStatusTotal / 100) + 1) * 100);
  const memberStatusTicks = Array.from({ length: memberStatusAxisMax / 20 + 1 }, (_, index) => index * 20);
  const membersApproachingStatusChange = getMembersApproachingStatusChange(scopedData.members, scopedData.loans);
  const memberAccountRows = (records, kind) => Object.values(records.reduce((groups, record) => {
    const member = scopedData.members.find((item) => item.id === record.memberId);
    const key = record.memberId || record.memberName;
    const balance = kind === 'overdue'
      ? Math.max(0, Number(record.totalPayable || 0) - Number(record.paidAmount || 0))
      : Number(record.balance || 0);
    const reference = kind === 'overdue' ? record.loanNumber : (record.collectionId || record.loanNumber);
    const dueDate = kind === 'overdue' ? record.dueDate : record.collectionDate;
    if (!groups[key]) groups[key] = {
      id: key,
      member: member?.fullName || record.memberName,
      memberId: member?.memberId || '—',
      contact: member?.contactNumber || '—',
      barangay: member?.barangay || '—',
      references: [],
      dueDates: [],
      balance: 0,
      accountCount: 0,
      status: kind === 'overdue' ? 'Overdue' : 'Due Today',
    };
    groups[key].references.push(reference);
    groups[key].dueDates.push(dueDate);
    groups[key].balance += balance;
    groups[key].accountCount += 1;
    return groups;
  }, {})).map((row) => ({
    ...row,
    reference: row.references.join(', '),
    dueDate: [...new Set(row.dueDates)].sort()[0],
  }));
  const dueTodayAccounts = memberAccountRows(
    scopedData.collections.filter((collection) => collection.collectionDate === todayIso()),
    'due',
  );
  const overdueAccounts = scopedData.loans
    .filter((loan) => loan.status === 'Overdue')
    .map((loan) => {
      const member = scopedData.members.find((item) => item.id === loan.memberId);
      return {
        id: loan.id,
        member: member?.fullName || loan.memberName,
        memberId: member?.memberId || '—',
        contact: member?.contactNumber || '—',
        barangay: member?.barangay || '—',
        reference: loan.loanNumber,
        dueDate: loan.dueDate,
        balance: Math.max(0, Number(loan.totalPayable || 0) - Number(loan.paidAmount || 0)),
        accountCount: 1,
        status: 'Overdue',
      };
    });


  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Barbaza Multi-Purpose Cooperative"
        title="Colisap Monitoring"
        description="Summary of membership status, released packages, collections, and accounts requiring attention."
        actions={(
          <>
            <ExportActions rows={scopedData.members} columns={dashboardExportColumns} filename={`dashboard-${todayIso()}`} />
            {isAdmin || isManager ? (
              <Link to="/reports">
                <Button icon={FiFileText} variant="secondary">
                  Generate Report
                </Button>
              </Link>
            ) : null}
          </>
        )}
      />

      <div className={`rounded-3xl border px-5 py-4 shadow-sm ${isAdmin ? 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-500/10' : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-500/10'}`}>
        <p className={`text-sm font-black ${isAdmin ? 'text-violet-800 dark:text-violet-200' : 'text-blue-800 dark:text-blue-200'}`}>
          {isAdmin ? 'Administrator workspace — all branches and full system control' : `Manager workspace — ${currentUser?.branch || 'assigned branch'} reporting and monitoring`}
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {isAdmin ? 'You can manage member records, user accounts, settings, and organization-wide reports.' : 'You can review branch records and generate reports; user administration, settings, and destructive record actions are restricted.'}
        </p>
      </div>

      {visibleWidgets.stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard accent="teal" icon={FiUsers} title="Total Members" value={dashboard.stats.totalMembers} />
          <StatCard accent="violet" icon={FiUsers} title="40K Availments" value={fortyKMembers.length} />
          <StatCard accent="violet" icon={FiUsers} title="60K Availments" value={sixtyKMembers.length} />
          <StatCard accent="blue" icon={FiUserCheck} title="Active Members" value={activeMembers} />
          <StatCard accent="green" icon={FiUserMinus} title="Inactive Members" value={inactiveMembers} />
          <StatCard accent="red" icon={FiAlertTriangle} title="Dormant Members" value={dormantMembers} />
        </div>
      ) : null}

      <ChartCard title="Monthly Member Status">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={memberStatusByMonth}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis allowDecimals={false} domain={[0, memberStatusAxisMax]} ticks={memberStatusTicks} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Active" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Inactive" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Dormant" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-3">
        {visibleWidgets.statusChange ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 xl:col-span-2">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Status Change Notifications</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Showing {Math.min(6, membersApproachingStatusChange.length)} of {membersApproachingStatusChange.length} members in the warning window.
            </p>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {membersApproachingStatusChange.length > 0 ? (
                membersApproachingStatusChange.slice(0, 6).map((alert) => {
                  const debug = getLatestSmsDebugEntry(smsDebugLogs, alert.member.id);
                  const sentToday = debug?.createdAt ? isSameIsoDate(debug.createdAt, todayIso()) : false;
                  const hasHistory = Boolean(debug);
                  const isLiveSuccess = debug?.status === 'success';
                  const isLocalSave = debug?.status === 'saved_locally';
                  const isFailed = debug?.status === 'failed';
                  const isSkipped = debug?.status === 'skipped';
                  const statusTone = isLiveSuccess ? 'success' : isFailed ? 'danger' : isSkipped ? 'warning' : 'info';
                  const statusLabel = isLiveSuccess
                    ? sentToday ? 'SMS Sent Today' : 'SMS Sent Before'
                    : isLocalSave
                      ? sentToday ? 'Locally Saved Today' : 'Locally Saved Before'
                      : isFailed
                        ? 'SMS Failed'
                        : isSkipped
                          ? 'SMS Skipped'
                          : 'Pending';
                  return (
                    <div
                      key={alert.member.id}
                      className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white">{alert.member.fullName}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{alert.member.memberId}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <p className="font-black text-slate-950 dark:text-white">
                            {alert.daysUntilStatusChange} day{alert.daysUntilStatusChange !== 1 ? 's' : ''} until dormant
                          </p>
                          <Badge tone={alert.projectedStatus === 'Dormant' ? 'Overdue' : 'Pending'}>{alert.projectedStatus}</Badge>
                        </div>
                        {hasHistory ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {isLiveSuccess
                              ? `Sent ${debug.reminderDay} day reminder on ${formatDateTime(debug.createdAt)}`
                              : isLocalSave
                                ? `Saved locally on ${formatDateTime(debug.createdAt)}`
                                : isFailed
                                  ? debug.error
                                  : isSkipped
                                    ? debug.error
                                    : 'SMS history available'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No members approaching status change
                </div>
              )}
            </div>
          </section>
        ) : null}

        {visibleWidgets.activities ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Recent Activities</h2>
            <div className="mt-4 space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="border-l-2 border-teal-500 pl-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{activity.action}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activity.detail}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(activity.createdAt)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Modal
        maxWidth="max-w-5xl"
        open={Boolean(accountListModal)}
        title={accountListModal?.title || 'Account List'}
        description={accountListModal?.ungrouped
          ? `${accountListModal?.accountCount || 0} overdue account(s) shown individually.`
          : `${accountListModal?.accountCount || 0} account(s) grouped under ${accountListModal?.rows?.length || 0} member(s).`}
        onClose={() => setAccountListModal(null)}
        footer={<Button variant="secondary" onClick={() => setAccountListModal(null)}>Close</Button>}
      >
        {accountListModal?.rows?.length ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Member</th><th className="px-4 py-3">Contact / Address</th><th className="px-4 py-3">Accounts</th>
                  <th className="px-4 py-3">References</th><th className="px-4 py-3">Due date</th><th className="px-4 py-3">Total balance</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {accountListModal.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3"><span className="block font-bold text-slate-950 dark:text-white">{row.member}</span><span className="text-xs text-slate-500">{row.memberId}</span></td>
                    <td className="px-4 py-3"><span className="block">{row.contact}</span><span className="text-xs text-slate-500">{row.barangay}</span></td>
                    <td className="px-4 py-3 text-center font-bold">{row.accountCount}</td><td className="max-w-56 px-4 py-3 text-xs">{row.reference}</td>
                    <td className="px-4 py-3">{formatDate(row.dueDate)}</td><td className="px-4 py-3 font-bold">{formatCurrency(row.balance)}</td>
                    <td className="px-4 py-3"><Badge>{row.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-8 text-center text-sm text-slate-500">No accounts found.</p>}
      </Modal>


    </div>
  );
}
