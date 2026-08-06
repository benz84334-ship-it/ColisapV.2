import { useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/forms/FormField.jsx';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';

function nextContributionId(transactions = []) {
  const max = transactions.reduce((highest, transaction) => {
    const value = Number(String(transaction.id || '').match(/(\d+)$/)?.[1]);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);
  return `CON-${String(max + 1).padStart(5, '0')}`;
}

export default function Contributions() {
  const data = useData() || {};
  const { createContribution } = data;
  const { success, error: toastError } = useToast();
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(todayIso());
  const [recordedBy, setRecordedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const members = Array.isArray(data.members) ? data.members : [];

  const selectedMember = useMemo(
    () => members.find((member) => member.id === memberId || member.memberId === memberId) || null,
    [memberId, members],
  );

  const searchableMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members.slice(0, 50);
    return members.filter((member) => {
      const haystack = `${member.fullName || ''} ${member.memberId || ''} ${member.cifNumber || ''} ${member.barangay || ''}`.toLowerCase();
      return haystack.includes(query);
    }).slice(0, 50);
  }, [memberSearch, members]);

  const handleSaveContribution = async (event) => {
    event.preventDefault();
    if (!selectedMember) {
      toastError('Please choose a member first.');
      return;
    }

    const contributionAmount = Number(amount);
    if (!Number.isFinite(contributionAmount) || contributionAmount <= 0) {
      toastError('Enter a valid contribution amount.');
      return;
    }

    setSaving(true);
    try {
      const nextContribution = await createContribution?.({
        id: nextContributionId(data.shareCapitalTransactions || []),
        memberId: selectedMember.id,
        amount: contributionAmount,
        contributionDate: contributionDate || todayIso(),
        recordedBy: recordedBy || 'Staff',
        transactionType: 'Deposit',
      }, recordedBy || 'Staff');

      if (!nextContribution) {
        throw new Error('Unable to save contribution.');
      }

      success(`Recorded ${formatCurrency(contributionAmount)} for ${selectedMember.fullName || 'member'}.`);
      setAmount('');
      setRecordedBy('');
    } catch (saveError) {
      console.error(saveError);
      toastError(saveError.message || 'Unable to save contribution.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        description="Staff contribution entry and share capital tracking."
        title="Contributions"
      />
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <form className="grid gap-4 lg:grid-cols-4 lg:items-end" autoComplete="off" onSubmit={handleSaveContribution}>
          <div className="space-y-1 lg:col-span-2">
            <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Member</span>
            <div className="relative">
              <button
                className="min-h-10 w-full rounded-2xl border border-teal-500 bg-white px-4 py-2 pr-12 text-left text-[15px] text-slate-700 shadow-sm transition hover:border-teal-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-teal-500 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                type="button"
                onClick={() => {
                  setMemberSearch(memberSearch || selectedMember?.fullName || '');
                  setMemberSearchOpen(true);
                }}
              >
                <span className="block truncate leading-5">
                  {selectedMember?.fullName
                    ? `${selectedMember.fullName}${selectedMember.cifNumber ? ` (${selectedMember.cifNumber})` : ''}`
                    : 'Search member'}
                </span>
              </button>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 dark:text-slate-300">
                <FiSearch />
              </span>
            </div>
          </div>

          <FormField
            label="Amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="Enter contribution amount"
          />

          <FormField
            label="Contribution Date"
            type="date"
            autoComplete="off"
            value={contributionDate}
            onChange={(event) => setContributionDate(event.target.value)}
          />

          <FormField
            label="Recorded By"
            autoComplete="off"
            value={recordedBy}
            onChange={(event) => setRecordedBy(event.target.value)}
            placeholder="Staff name"
          />

          <div className="lg:col-span-4 flex justify-start">
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Contribution'}
            </Button>
          </div>
        </form>

        <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-wider text-slate-400">Selected Member</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">
              {selectedMember?.fullName || 'No member selected'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-wider text-slate-400">Current Share Capital</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">
              {selectedMember ? formatCurrency(Number(selectedMember.shareCapital || 0)) : 'PHP 0.00'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-wider text-slate-400">Last Contribution Date</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">
              {selectedMember?.lastShareCapitalDepositDate ? formatDate(selectedMember.lastShareCapitalDepositDate) : 'None yet'}
            </p>
          </div>
        </div>
      </section>

      <Modal
        open={memberSearchOpen}
        title="Search Member"
        description="Search by member name, CIFK number, or barangay, then pick the member for this contribution."
        maxWidth="max-w-2xl"
        onClose={() => setMemberSearchOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setMemberSearchOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <FormField
            autoComplete="off"
            label="Search"
            placeholder="Type member name or CIFK number"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            {searchableMembers.length ? searchableMembers.map((member) => (
              <button
                key={member.id}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-teal-50 dark:border-slate-800 dark:hover:bg-teal-500/10 ${
                  member.id === memberId ? 'bg-teal-50 dark:bg-teal-500/10' : 'bg-white dark:bg-slate-950'
                }`}
                type="button"
                onClick={() => {
                  setMemberId(member.id);
                  setMemberSearch(member.fullName || '');
                  setMemberSearchOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-950 dark:text-white">{member.fullName}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {member.cifNumber || member.memberId || 'No CIFK'} {member.barangay ? `• ${member.barangay}` : ''}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {formatCurrency(Number(member.shareCapital || 0))}
                </span>
              </button>
            )) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No member found.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
