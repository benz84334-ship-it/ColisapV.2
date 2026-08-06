import { useEffect, useMemo, useState } from 'react';
import { FiCreditCard, FiDollarSign, FiFileText, FiPlus } from 'react-icons/fi';
import DataTable from '../../components/tables/DataTable.jsx';
import StatCard from '../../components/cards/StatCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import SearchableTextField from '../../components/forms/SearchableTextField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PAYMENT_TYPES } from '../../utils/constants.js';
import { getCollectionTotal, getLoanBalance, getLoanOutstandingBalance, getLoanPenaltyDue } from '../../utils/analytics.js';
import { formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { buildErrorMap, required } from '../../utils/validation.js';

const blankPayment = {
  loanId: '',
  amount: 0,
  penalty: 0,
  paymentType: 'Regular',
  paymentDate: todayIso(),
  method: 'Cash',
  collectedBy: '',
  remarks: '',
};

export default function Payments() {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(blankPayment);
  const [errors, setErrors] = useState({});
  const [receipt, setReceipt] = useState(null);
  const penaltyRate = Number(data.settings?.penaltyRate || 0);

  const loanOptions = [
    { value: '', label: 'Select active loan' },
    ...data.loans
      .filter((loan) => loan.status !== 'Completed' || getLoanPenaltyDue(loan, data.payments, form.paymentDate, penaltyRate) > 0)
      .map((loan) => ({ value: loan.id, label: `${loan.loanNumber} - ${loan.memberName} (${formatCurrency(getLoanOutstandingBalance(loan, data.payments, form.paymentDate, penaltyRate))})` })),
  ];
  const selectedLoan = data.loans.find((loan) => loan.id === form.loanId);
  const remainingBalance = selectedLoan ? getLoanBalance(selectedLoan) : 0;
  const penaltyDue = selectedLoan ? getLoanPenaltyDue(selectedLoan, data.payments, form.paymentDate, penaltyRate) : 0;
  const totalPayment = Number(form.amount || 0) + Number(form.penalty || 0);
  const collectorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            currentUser?.username,
            currentUser?.fullName,
            ...data.users.flatMap((user) => [user.username, user.fullName]),
            ...data.payments.map((payment) => payment.collectedBy),
            ...data.collections.map((collection) => collection.collector),
          ]
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [currentUser?.fullName, currentUser?.username, data.collections, data.payments, data.users],
  );

  useEffect(() => {
    if (!selectedLoan) return;
    setForm((current) => (Number(current.penalty || 0) === penaltyDue ? current : { ...current, penalty: penaltyDue }));
  }, [form.loanId, form.paymentDate, penaltyDue, selectedLoan]);

  const columns = useMemo(
    () => [
      {
        key: 'receiptNumber',
        label: 'Receipt',
        render: (row) => (
          <div className="min-w-44">
            <p className="font-bold text-slate-950 dark:text-white">{row.receiptNumber}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.loanNumber}</p>
          </div>
        ),
      },
      { key: 'memberName', label: 'Member' },
      { key: 'paymentType', label: 'Type' },
      { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount), sortKey: (row) => Number(row.amount) },
      { key: 'penalty', label: 'Penalty', render: (row) => formatCurrency(row.penalty), sortKey: (row) => Number(row.penalty) },
      { key: 'paymentDate', label: 'Date', render: (row) => formatDate(row.paymentDate) },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [],
  );

  const validate = () => {
    const amount = Number(form.amount || 0);
    const penalty = Number(form.penalty || 0);
    const nextErrors = buildErrorMap([
      { field: 'loanId', valid: required(form.loanId), message: 'Select a loan.' },
      { field: 'amount', valid: amount > 0 || penalty > 0, message: 'Payment or penalty must be positive.' },
      { field: 'amount', valid: amount <= remainingBalance, message: 'Amount cannot exceed the remaining balance.' },
      { field: 'penalty', valid: penalty >= 0, message: 'Penalty cannot be negative.' },
      { field: 'paymentDate', valid: required(form.paymentDate), message: 'Payment date is required.' },
    ]);
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const submitPayment = (event) => {
    event.preventDefault();
    if (!validate()) {
      showToast('Please correct the highlighted payment fields.', 'error');
      return;
    }
    const posted = data.recordPayment(
      {
        ...form,
        collectedBy: form.collectedBy || currentUser.username,
        amount: Number(form.amount),
        penalty: Number(form.penalty),
      },
      currentUser.username,
    );
    if (posted) {
      const principalAfter = Math.max(remainingBalance - Number(form.amount), 0);
      const penaltyAfter = Math.max(penaltyDue - Number(form.penalty), 0);
      setReceipt({ ...posted, balanceAfter: principalAfter + penaltyAfter });
      setForm(blankPayment);
      showToast('Payment recorded and receipt generated.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Payment Module</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Accept regular, partial, advance, and penalty payments with receipt generation.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard accent="green" icon={FiDollarSign} title="Total Payments" value={formatCurrency(getCollectionTotal(data.payments))} />
        <StatCard accent="blue" icon={FiCreditCard} title="Payment Count" value={data.payments.length} />
        <StatCard accent="orange" icon={FiFileText} title="Pending Collections" value={data.collections.filter((item) => item.status !== 'Paid').length} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Accept Payment</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Overdue penalty is computed from the loan principal for every started overdue month.</p>
        </div>
        <form className="grid gap-4 lg:grid-cols-4" onSubmit={submitPayment}>
          <FormField as="select" className="lg:col-span-2" error={errors.loanId} label="Loan Account" options={loanOptions} value={form.loanId} onChange={(event) => setForm((current) => ({ ...current, loanId: event.target.value }))} />
          <FormField error={errors.paymentDate} label="Payment Date" type="date" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} />
          <FormField as="select" label="Payment Type" options={PAYMENT_TYPES} value={form.paymentType} onChange={(event) => setForm((current) => ({ ...current, paymentType: event.target.value }))} />
          <FormField error={errors.amount} label="Amount" min="1" step="100" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} />
          <FormField error={errors.penalty} label="Automatic Penalty" min="0" step="25" type="number" value={form.penalty} onChange={(event) => setForm((current) => ({ ...current, penalty: Number(event.target.value) }))} />
          <FormField as="select" label="Method" options={['Cash', 'GCash', 'Bank Transfer']} value={form.method} onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))} />
          <SearchableTextField
            emptyMessage="No collector found."
            label="Collector"
            options={collectorOptions}
            placeholder="Search collector name"
            value={form.collectedBy}
            onChange={(collector) => setForm((current) => ({ ...current, collectedBy: collector }))}
          />
          <FormField as="textarea" className="lg:col-span-3" label="Remarks" value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Summary</p>
            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Remaining: {formatCurrency(remainingBalance)}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Penalty Due: {formatCurrency(penaltyDue)}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Receipt Total: {formatCurrency(totalPayment)}</p>
            <Button className="mt-4 w-full" icon={FiPlus} type="submit">
              Record Payment
            </Button>
          </div>
        </form>
      </section>

      <DataTable
        columns={columns}
        data={data.payments}
        description="Receipt history with searchable members, loans, collectors, and payment methods."
        filters={[
          { key: 'paymentType', label: 'Type', options: PAYMENT_TYPES },
          { key: 'method', label: 'Method', options: ['Cash', 'GCash', 'Bank Transfer'] },
          { key: 'status', label: 'Status', options: ['Completed', 'Pending', 'Reversed'] },
        ]}
        searchFields={['receiptNumber', 'loanNumber', 'memberName', 'paymentType', 'method', 'collectedBy']}
        title="Payment History"
      />

      <Modal
        open={Boolean(receipt)}
        title="Receipt Generated"
        description="Receipt details are ready for review."
        maxWidth="max-w-lg"
        onClose={() => setReceipt(null)}
        footer={<Button onClick={() => setReceipt(null)}>Close</Button>}
      >
        {receipt ? (
          <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-normal text-slate-500">Barbaza MPC</p>
              <h3 className="text-xl font-black text-slate-950 dark:text-white">Official Receipt</h3>
              <p className="text-sm text-slate-500">{receipt.receiptNumber}</p>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              {[
                ['Member', receipt.memberName],
                ['Loan Number', receipt.loanNumber],
                ['Payment Date', formatDate(receipt.paymentDate)],
                ['Payment Type', receipt.paymentType],
                ['Amount', formatCurrency(receipt.amount)],
                ['Penalty', formatCurrency(receipt.penalty)],
                ['Total Received', formatCurrency(receipt.amount + receipt.penalty)],
                ['Remaining Balance', formatCurrency(receipt.balanceAfter)],
                ['Collected By', receipt.collectedBy],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                  <span className="font-semibold text-slate-500">{label}</span>
                  <span className="text-right font-bold text-slate-950 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
