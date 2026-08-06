import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/forms/FormField.jsx';
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

  const members = Array.isArray(data.members) ? data.members : [];

  const selectedMember = useMemo(
    () => members.find((member) => member.id === memberId || member.memberId === memberId) || null,
    [memberId, members],
  );

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
          <FormField
            label="Member"
            as="select"
            autoComplete="off"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            options={members.map((member) => ({
              value: member.id,
              label: `${member.fullName}${member.cifNumber ? ` (${member.cifNumber})` : ''}`,
            }))}
          >
            <option value="">Select member</option>
          </FormField>

          <FormField
            label="Amount"
            type="number"
            min="0"
            step="0.01"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
    </div>
  );
}
