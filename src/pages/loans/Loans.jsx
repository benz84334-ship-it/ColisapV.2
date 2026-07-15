import { useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { COLLECTION_SCHEDULES, LOAN_STATUSES, ROLES } from '../../utils/constants.js';
import { getContractAmount, getContractPeriodLabel, getLoanMonthlyPenalty, getLoanOutstandingBalance, getLoanTermMonths, getLoanTotalPayable } from '../../utils/analytics.js';
import { addDays, formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { buildErrorMap, dateIsAfter, isPositiveAmount, required, uniqueBy } from '../../utils/validation.js';

const blankLoan = {
  loanNumber: '',
  memberId: '',
  principalAmount: 10000,
  interest: 5,
  loanType: 'Regular Loan',
  releaseDate: todayIso(),
  dueDate: addDays(todayIso(), 180),
  collectionSchedule: 'Monthly',
  contractPeriod: 'Monthly',
  contractMonths: 6,
  penalty: 0,
  remarks: '',
  status: 'Pending',
};

function dueDateFromTerm(releaseDate, contractMonths) {
  return addDays(releaseDate || todayIso(), Math.max(1, Number(contractMonths) || 1) * 30);
}

export default function Loans() {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = currentUser?.role === ROLES.ADMIN;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankLoan);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loanTypes = data.settings?.loanTypes?.length ? data.settings.loanTypes : ['Regular Loan'];
  const penaltyRate = Number(data.settings?.penaltyRate || 0);
  const memberOptions = [
    { value: '', label: 'Select member' },
    ...data.members.map((member) => ({ value: member.id, label: `${member.fullName} (${member.memberId})` })),
  ];

  const columns = useMemo(
    () => [
      {
        key: 'loanNumber',
        label: 'Loan',
        render: (row) => (
          <div className="min-w-48">
            <p className="font-bold text-slate-950 dark:text-white">{row.loanNumber}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.loanType}</p>
          </div>
        ),
      },
      { key: 'memberName', label: 'Member' },
      { key: 'principalAmount', label: 'Principal', render: (row) => formatCurrency(row.principalAmount), sortKey: (row) => Number(row.principalAmount) },
      { key: 'interest', label: 'Interest', render: (row) => `${row.interest}%` },
      { key: 'penalty', label: 'Penalty / Month', render: (row) => formatCurrency(getLoanMonthlyPenalty(row, penaltyRate)), sortKey: (row) => getLoanMonthlyPenalty(row, penaltyRate) },
      { key: 'collectionSchedule', label: 'Schedule' },
      {
        key: 'contractAmount',
        label: 'Monthly',
        render: (row) => (
          <div className="min-w-36">
            <p className="font-bold text-slate-950 dark:text-white">{formatCurrency(getContractAmount(row))}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Monthly</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{getLoanTermMonths(row)} months to pay</p>
          </div>
        ),
        sortKey: (row) => getContractAmount(row),
        exportValue: (row) => getContractAmount(row),
      },
      { key: 'releaseDate', label: 'Released', render: (row) => formatDate(row.releaseDate) },
      { key: 'dueDate', label: 'Due Date', render: (row) => formatDate(row.dueDate) },
      { key: 'balance', label: 'Balance', render: (row) => formatCurrency(getLoanOutstandingBalance(row, data.payments, todayIso(), penaltyRate)), sortKey: (row) => getLoanOutstandingBalance(row, data.payments, todayIso(), penaltyRate) },
      { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [data.payments, penaltyRate],
  );

  const openForm = (loan = null) => {
    const nextLoan = loan || { ...blankLoan, loanType: loanTypes[0], releaseDate: todayIso(), dueDate: addDays(todayIso(), 180) };
    setEditing(loan);
    setForm({ ...nextLoan, contractPeriod: 'Monthly', contractMonths: nextLoan.contractMonths || getLoanTermMonths(nextLoan) });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const nextErrors = buildErrorMap([
      { field: 'loanNumber', valid: required(form.loanNumber), message: 'Loan number is required.' },
      { field: 'loanNumber', valid: uniqueBy(data.loans, 'loanNumber', form.loanNumber, editing?.id), message: 'Loan number already exists.' },
      { field: 'memberId', valid: required(form.memberId), message: 'Select a member.' },
      { field: 'principalAmount', valid: isPositiveAmount(form.principalAmount), message: 'Principal must be greater than zero.' },
      { field: 'interest', valid: Number(form.interest) >= 0, message: 'Interest cannot be negative.' },
      { field: 'contractMonths', valid: Number(form.contractMonths) > 0, message: 'Contract months must be greater than zero.' },
      { field: 'dueDate', valid: dateIsAfter(form.releaseDate, form.dueDate), message: 'Due date must be after release date.' },
    ]);
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const saveLoan = () => {
    if (!validate()) {
      showToast('Please correct the highlighted loan fields.', 'error');
      return;
    }
    if (editing) {
      data.updateLoan(editing.id, { ...form, penalty: projectedMonthlyPenalty, contractPeriod: 'Monthly', contractMonths: Number(form.contractMonths || 1) }, currentUser.username);
      showToast('Loan updated.');
    } else {
      data.createLoan({ ...form, penalty: projectedMonthlyPenalty, contractPeriod: 'Monthly', contractMonths: Number(form.contractMonths || 1) }, currentUser.username);
      showToast('Loan created.');
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    data.deleteLoan(deleteTarget.id, currentUser.username);
    setDeleteTarget(null);
    showToast('Loan deleted.');
  };

  const projectedTotalPayable = getLoanTotalPayable({ ...form, totalPayable: 0 });
  const projectedLoan = {
    ...form,
    totalPayable: projectedTotalPayable,
  };
  const projectedMonthlyPenalty = getLoanMonthlyPenalty(form, penaltyRate);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Loan Management</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Create and monitor Colisap loans with schedules, balances, penalties, and status tracking.</p>
      </div>

      <DataTable
        addAction={
          isAdmin ? (
            <Button icon={FiPlus} onClick={() => openForm()}>
              Create Loan
            </Button>
          ) : null
        }
        actions={(row) =>
          isAdmin ? (
            <div className="flex justify-end gap-2">
              <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openForm(row)}>
                Edit
              </Button>
              <Button className="px-3" icon={FiTrash2} variant="danger" onClick={() => setDeleteTarget(row)}>
                Delete
              </Button>
            </div>
          ) : (
            <Badge>View Only</Badge>
          )
        }
        columns={columns}
        data={data.loans}
        description="Search by loan number, member, loan type, and status."
        filters={[
          { key: 'status', label: 'Status', options: LOAN_STATUSES },
          { key: 'loanType', label: 'Loan Type', options: loanTypes },
          { key: 'collectionSchedule', label: 'Schedule', options: COLLECTION_SCHEDULES },
        ]}
        searchFields={['loanNumber', 'memberName', 'loanType', 'status']}
        title="Loans"
      />

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Loan' : 'Create Loan'}
        description="Loan totals are computed from principal and interest."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLoan}>{editing ? 'Save Changes' : 'Create Loan'}</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField error={errors.loanNumber} label="Loan Number" value={form.loanNumber} onChange={(event) => setForm((current) => ({ ...current, loanNumber: event.target.value }))} />
          <FormField as="select" error={errors.memberId} label="Member" options={memberOptions} value={form.memberId} onChange={(event) => setForm((current) => ({ ...current, memberId: event.target.value }))} />
          <FormField error={errors.principalAmount} label="Principal Amount" min="1" step="500" type="number" value={form.principalAmount} onChange={(event) => setForm((current) => ({ ...current, principalAmount: Number(event.target.value) }))} />
          <FormField error={errors.interest} label="Interest Rate (%)" min="0" step="0.25" type="number" value={form.interest} onChange={(event) => setForm((current) => ({ ...current, interest: Number(event.target.value) }))} />
          <FormField as="select" label="Loan Type" options={loanTypes} value={form.loanType} onChange={(event) => setForm((current) => ({ ...current, loanType: event.target.value }))} />
          <FormField as="select" label="Collection Schedule" options={COLLECTION_SCHEDULES} value={form.collectionSchedule} onChange={(event) => setForm((current) => ({ ...current, collectionSchedule: event.target.value }))} />
          <FormField error={errors.contractMonths} label="Contract Months" min="1" step="1" type="number" value={form.contractMonths || 1} onChange={(event) => setForm((current) => {
            const contractMonths = Math.max(1, Number(event.target.value) || 1);
            return { ...current, contractMonths, dueDate: dueDateFromTerm(current.releaseDate, contractMonths) };
          })} />
          <FormField label="Release Date" type="date" value={form.releaseDate} onChange={(event) => setForm((current) => {
            const releaseDate = event.target.value;
            return { ...current, releaseDate, dueDate: dueDateFromTerm(releaseDate, current.contractMonths) };
          })} />
          <FormField error={errors.dueDate} label="Due Date" type="date" value={form.dueDate} onChange={(event) => setForm((current) => {
            const dueDate = event.target.value;
            return { ...current, dueDate, contractMonths: getLoanTermMonths({ releaseDate: current.releaseDate, dueDate }) };
          })} />
          <FormField label="Penalty Rate (%)" min="0" readOnly step="0.25" type="number" value={penaltyRate} inputClassName="bg-slate-50 font-semibold dark:bg-slate-900" />
          <FormField label="Automatic Penalty / Month" min="0" readOnly step="25" type="number" value={projectedMonthlyPenalty} inputClassName="bg-slate-50 font-semibold dark:bg-slate-900" />
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Projected Payable</p>
            <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {formatCurrency(projectedTotalPayable)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">{getContractPeriodLabel(projectedLoan)}</p>
            <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{formatCurrency(getContractAmount(projectedLoan))}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{getLoanTermMonths(projectedLoan)} months to pay</p>
          </div>
          <FormField as="textarea" className="md:col-span-2" label="Remarks" value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete loan?"
        message={`This will remove ${deleteTarget?.loanNumber || 'this loan'} and linked collection records.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
