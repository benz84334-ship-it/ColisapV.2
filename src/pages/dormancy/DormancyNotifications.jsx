import { useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { getMembersApproachingStatusChange } from '../../utils/memberStatus.js';
import { formatDate } from '../../utils/formatters.js';
import { ROLES } from '../../utils/constants.js';

export default function DormancyNotifications() {
  const data = useData();
  const { currentUser } = useAuth();

  const membersApproachingStatusChange = getMembersApproachingStatusChange(data.members || [], data.loans || [], data.systemDate);
  const rows = useMemo(() => (
    membersApproachingStatusChange
      .filter((alert) => alert.projectedStatus !== 'Active')
      .map((alert) => ({
      id: alert.member.id,
      member: alert.member.fullName,
      cifk: alert.member.memberId,
      contactNumber: alert.member.contactNumber || 'None',
      dormantDate: alert.statusChangeDate,
      daysBeforeDormancy: alert.daysUntilStatusChange,
      projectedStatus: alert.projectedStatus,
      }))
  ), [membersApproachingStatusChange]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Dormancy Notifications"
        description="All warning members approaching dormancy."
        actions={(
          <Button variant="secondary" disabled={!currentUser || ![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)}>
            {currentUser?.role || 'Viewer'}
          </Button>
        )}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">CIFK</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Dormant Date</th>
                <th className="px-4 py-3">Days Before</th>
                <th className="px-4 py-3">Projected Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.length > 0 ? rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-bold text-slate-950 dark:text-white">{row.member}</td>
                  <td className="px-4 py-3">{row.cifk}</td>
                  <td className="px-4 py-3">{row.contactNumber}</td>
                  <td className="px-4 py-3">{formatDate(row.dormantDate)}</td>
                  <td className="px-4 py-3">{row.daysBeforeDormancy}</td>
                  <td className="px-4 py-3">{row.projectedStatus}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan="6">No dormancy notifications found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
