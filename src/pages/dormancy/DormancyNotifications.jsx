import { useEffect, useMemo, useState } from 'react';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { getMembersApproachingStatusChange } from '../../utils/memberStatus.js';
import { formatDate } from '../../utils/formatters.js';
import { ROLES } from '../../utils/constants.js';
import { sendSms } from '../../services/smsService.js';

const FILTERS = ['All', 'Queued', 'Sent', 'Failed', 'Not yet sent'];

function toneFor(status) {
  if (status === 'sent' || status === 'success') return 'success';
  if (status === 'saved_locally' || status === 'queued' || status === 'queued_local') return 'info';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'warning';
  if (status === 'sending' || status === 'pending') return 'info';
  return 'info';
}

function pickLatestLog(logs = []) {
  if (!logs.length) return null;
  return [...logs].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0] || null;
}

function pickSmsStatus(latest) {
  if (!latest) return 'Not yet sent';
  if (latest.status === 'sent' || latest.status === 'success') return 'Sent';
  if (latest.status === 'saved_locally') return 'Locally Saved';
  if (latest.status === 'queued' || latest.status === 'queued_local') return 'Queued';
  if (latest.status === 'failed') return 'Failed';
  if (latest.status === 'skipped') return 'Not yet sent';
  if (latest.status === 'sending' || latest.status === 'pending') return 'Queued';
  return 'Not yet sent';
}

export default function DormancyNotifications() {
  const data = useData();
  const { currentUser } = useAuth();
  const [filter, setFilter] = useState('All');
  const [backendLogs, setBackendLogs] = useState([]);
  const [backendError] = useState('SMS delivery is not available in the Supabase-only build.');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [manualMessageTouched, setManualMessageTouched] = useState(false);
  const [manualState, setManualState] = useState({ status: 'idle', message: '' });

  const membersApproachingStatusChange = getMembersApproachingStatusChange(data.members || [], data.loans || [], data.systemDate);
  const manualMemberOptions = useMemo(
    () => membersApproachingStatusChange.map((alert) => alert.member),
    [membersApproachingStatusChange],
  );
  const selectedMember = useMemo(
    () => manualMemberOptions.find((member) => member.id === selectedMemberId) || manualMemberOptions[0] || null,
    [manualMemberOptions, selectedMemberId],
  );

  useEffect(() => {
    if (!selectedMemberId && manualMemberOptions[0]?.id) {
      setSelectedMemberId(manualMemberOptions[0].id);
    }
  }, [manualMemberOptions, selectedMemberId]);

  useEffect(() => {
    if (!selectedMember) return;
    if (!manualMessageTouched || !manualMessage.trim()) {
      setManualMessage(`Hello ${selectedMember.fullName}, this is a reminder from Barbaza MPC.`);
      setManualMessageTouched(false);
    }
  }, [manualMessage, manualMessageTouched, selectedMember]);

  useEffect(() => {
    setBackendLogs(data.smsDebugLogs || []);
  }, [data.smsDebugLogs]);

  const logsByMemberId = useMemo(() => {
    return backendLogs.reduce((map, entry) => {
      const key = entry.member_id || entry.memberId || entry.member_name || entry.memberName;
      if (!key) return map;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
      return map;
    }, {});
  }, [backendLogs]);

  const rows = useMemo(() => {
    return membersApproachingStatusChange.map((alert) => {
      const memberId = alert.member.id;
      const logs = logsByMemberId[memberId] || logsByMemberId[alert.member.fullName] || [];
      const latest = pickLatestLog(logs);
      const smsStatus = latest?.status ? pickSmsStatus(latest) : 'Not yet sent';

      return {
        id: memberId,
        member: alert.member.fullName,
        cifk: alert.member.memberId,
        contactNumber: alert.member.contactNumber || 'None',
        dormantDate: alert.statusChangeDate,
        daysBeforeDormancy: alert.daysUntilStatusChange,
        smsStatus,
        dateSent: latest?.created_at || latest?.sent_at ? formatDate(latest.sent_at || latest.created_at) : '—',
        messageId: latest?.message_id || latest?.messageId || '—',
        errorMessage: latest?.error_message || latest?.error || '—',
        statusTone: toneFor(latest?.status),
      };
    });
  }, [logsByMemberId, membersApproachingStatusChange]);

  const filteredRows = rows.filter((row) => {
    if (filter === 'All') return true;
    if (filter === 'Not yet sent') return row.smsStatus === 'Not yet sent';
    if (filter === 'Queued') return row.smsStatus === 'Queued' || row.smsStatus === 'Locally Saved';
    return row.smsStatus === filter;
  });

  const handleManualSend = async () => {
    if (!selectedMember) {
      setManualState({ status: 'error', message: 'Select a member first.' });
      return;
    }
    const message = manualMessage.trim();
    if (!message) {
      setManualState({ status: 'error', message: 'Please type a message first.' });
      return;
    }

    try {
      setManualState({ status: 'sending', message: 'Sending manual SMS...' });
      await sendSms(selectedMember.contactNumber, message, {
        memberId: selectedMember.id,
        memberName: selectedMember.fullName,
      });
    } catch (error) {
      const messageText = String(error?.message || '').trim();
      const friendlyMessage = messageText || 'SMS sending is not available in this build.';
      setManualState({ status: 'error', message: friendlyMessage });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Dormancy Notifications"
        description="Supabase-only dormancy monitoring view."
        actions={(
          <Button variant="secondary" disabled={!currentUser || ![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)}>
            {currentUser?.role || 'Viewer'}
          </Button>
        )}
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        {backendError}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-base font-bold text-slate-950 dark:text-white">Manual SMS Composer</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pick a dormant member, type your own message, then send it manually.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Member
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none ring-0 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              value={selectedMemberId}
              onChange={(event) => {
                setSelectedMemberId(event.target.value);
                setManualMessageTouched(false);
              }}
            >
              {manualMemberOptions.length > 0 ? (
                manualMemberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName} - {member.contactNumber || 'No contact'}
                  </option>
                ))
              ) : (
                <option value="">No dormant members available</option>
              )}
            </select>
          </label>

          <label className="md:col-span-2 flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Message
            <textarea
              className="min-h-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none ring-0 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Type your custom SMS message here..."
              value={manualMessage}
              onChange={(event) => {
                setManualMessage(event.target.value);
                setManualMessageTouched(true);
              }}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Sending to: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedMember?.fullName || 'No member selected'}</span>
          {' '}<span className="ml-2">{selectedMember?.contactNumber || 'No contact number'}</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleManualSend} disabled={!selectedMember || !manualMessage.trim() || manualState.status === 'sending'}>
            {manualState.status === 'sending' ? 'Sending...' : 'Send Manual SMS'}
          </Button>
          {manualState.message ? (
            <p className={`rounded-full px-3 py-1 text-xs font-medium ${
              manualState.status === 'error'
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
            }`}>
              {manualState.message}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item}
            variant={filter === item ? 'primary' : 'secondary'}
            onClick={() => setFilter(item)}
          >
            {item}
          </Button>
        ))}
      </div>

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
                <th className="px-4 py-3">SMS Status</th>
                <th className="px-4 py-3">Date Sent</th>
                <th className="px-4 py-3">Message ID</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRows.length > 0 ? filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-bold text-slate-950 dark:text-white">{row.member}</td>
                  <td className="px-4 py-3">{row.cifk}</td>
                  <td className="px-4 py-3">{row.contactNumber}</td>
                  <td className="px-4 py-3">{formatDate(row.dormantDate)}</td>
                  <td className="px-4 py-3">{row.daysBeforeDormancy}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.statusTone}>{row.smsStatus}</Badge>
                  </td>
                  <td className="px-4 py-3">{row.dateSent}</td>
                  <td className="px-4 py-3">{row.messageId}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.errorMessage}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan="9">No dormancy notifications found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
