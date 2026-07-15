import { useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import SearchableTextField from '../../components/forms/SearchableTextField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { COLLECTION_STATUSES, ROLES } from '../../utils/constants.js';
import { getLoanBalance, getLoanPenaltyDue } from '../../utils/analytics.js';
import { formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { buildErrorMap, isPositiveAmount, required, uniqueBy } from '../../utils/validation.js';

const collectors = ['Maria Santos', 'Joel Alvarez', 'Rhea Flores', 'Victor Ramos'];

const blankCollection = {
  collectionId: '',
  loanId: '',
  collector: '',
  amountDue: 0,
  amountPaid: 0,
  balance: 0,
  penalty: 0,
  collectionDate: todayIso(),
  status: 'Pending',
};

export default function Collections() {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = currentUser?.role === ROLES.ADMIN;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankCollection);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const penaltyRate = Number(data.settings?.penaltyRate || 0);

  const loanOptions = [{ value: '', label: 'Select loan' }, ...data.loans.map((loan) => ({ value: loan.id, label: `${loan.loanNumber} - ${loan.memberName}` }))];
  const collectionRows = useMemo(() => {
    const loansById = new Map(data.loans.map((loan) => [loan.id, loan]));
    return data.collections.map((collection) => {
      const loan = loansById.get(collection.loanId);
      if (!loan) return collection;

      const balance = getLoanBalance(loan);
      const penalty = getLoanPenaltyDue(loan, data.payments, todayIso(), penaltyRate);
      return {
        ...collection,
        amountDue: loan.totalPayable,
        amountPaid: loan.paidAmount,
        balance,
        penalty,
        status: balance <= 0 && penalty <= 0 ? 'Paid' : loan.status === 'Overdue' || penalty > 0 ? 'Overdue' : Number(loan.paidAmount || 0) > 0 ? 'Partial' : 'Pending',
      };
    });
  }, [data.collections, data.loans, data.payments, penaltyRate]);
  const collectorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...collectors,
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

  const columns = useMemo(
    () => [
      {
        key: 'collectionId',
        label: 'Collection',
        render: (row) => (
          <div className="min-w-44">
            <p className="font-bold text-slate-950 dark:text-white">{row.collectionId}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.loanNumber}</p>
          </div>
        ),
      },
      { key: 'memberName', label: 'Member' },
      { key: 'collector', label: 'Collector' },
      { key: 'amountDue', label: 'Amount Due', render: (row) => formatCurrency(row.amountDue), sortKey: (row) => Number(row.amountDue) },
      { key: 'amountPaid', label: 'Paid', render: (row) => formatCurrency(row.amountPaid), sortKey: (row) => Number(row.amountPaid) },
      { key: 'balance', label: 'Balance', render: (row) => formatCurrency(row.balance), sortKey: (row) => Number(row.balance) },
      { key: 'penalty', label: 'Penalty Due', render: (row) => formatCurrency(row.penalty), sortKey: (row) => Number(row.penalty) },
      { key: 'collectionDate', label: 'Date', render: (row) => formatDate(row.collectionDate) },
      { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [],
  );

  const openForm = (collection = null) => {
    setEditing(collection);
    setForm(collection || { ...blankCollection, collectionDate: todayIso() });
    setErrors({});
    setModalOpen(true);
  };

  const handleLoanChange = (loanId) => {
    const loan = data.loans.find((item) => item.id === loanId);
    setForm((current) => {
      const balance = loan ? getLoanBalance(loan) : 0;
      const penalty = loan ? getLoanPenaltyDue(loan, data.payments, current.collectionDate, penaltyRate) : 0;
      return {
        ...current,
        loanId,
        amountDue: loan?.totalPayable || 0,
        amountPaid: loan?.paidAmount || 0,
        balance,
        penalty,
        status: balance <= 0 && penalty <= 0 ? 'Paid' : loan?.status === 'Overdue' || penalty > 0 ? 'Overdue' : Number(loan?.paidAmount || 0) > 0 ? 'Partial' : 'Pending',
      };
    });
  };

  const validate = () => {
    const nextErrors = buildErrorMap([
      { field: 'collectionId', valid: required(form.collectionId), message: 'Collection ID is required.' },
      { field: 'collectionId', valid: uniqueBy(data.collections, 'collectionId', form.collectionId, editing?.id), message: 'Collection ID already exists.' },
      { field: 'loanId', valid: required(form.loanId), message: 'Select a loan.' },
      { field: 'amountDue', valid: isPositiveAmount(form.amountDue), message: 'Amount due must be positive.' },
      { field: 'collectionDate', valid: required(form.collectionDate), message: 'Collection date is required.' },
    ]);
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const saveCollection = () => {
    if (!validate()) {
      showToast('Please correct the highlighted collection fields.', 'error');
      return;
    }
    const loan = data.loans.find((item) => item.id === form.loanId);
    const payload = {
      ...form,
      collector: form.collector || currentUser.username,
      loanNumber: loan?.loanNumber || form.loanNumber,
      memberId: loan?.memberId || form.memberId,
      memberName: loan?.memberName || form.memberName,
      amountDue: Number(form.amountDue),
      amountPaid: Number(form.amountPaid),
      penalty: loan ? getLoanPenaltyDue(loan, data.payments, form.collectionDate, penaltyRate) : Number(form.penalty),
      balance: loan ? getLoanBalance(loan) : Math.max(Number(form.amountDue) - Number(form.amountPaid), 0),
    };
    if (editing) {
      data.updateCollection(editing.id, payload, currentUser.username);
      showToast('Collection updated.');
    } else {
      data.createCollection(payload, currentUser.username);
      showToast('Collection created.');
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    data.deleteCollection(deleteTarget.id, currentUser.username);
    setDeleteTarget(null);
    showToast('Collection deleted.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Collection Management</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Monitor collection schedules, collectors, balances, penalties, and payment status.</p>
      </div>

      <DataTable
        addAction={
          isAdmin ? (
            <Button icon={FiPlus} onClick={() => openForm()}>
              Add Collection
            </Button>
          ) : null
        }
        actions={(row) => (
          <div className="flex justify-end gap-2">
            <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openForm(row)}>
              Update
            </Button>
            {isAdmin ? (
              <Button className="px-3" icon={FiTrash2} variant="danger" onClick={() => setDeleteTarget(row)}>
                Delete
              </Button>
            ) : null}
          </div>
        )}
        columns={columns}
        data={collectionRows}
        description="Managers can update collection monitoring; deletion remains admin-only."
        filters={[
          { key: 'status', label: 'Status', options: COLLECTION_STATUSES },
          { key: 'collector', label: 'Collector', options: collectorOptions },
        ]}
        searchFields={['collectionId', 'loanNumber', 'memberName', 'collector', 'status']}
        title="Collections"
      />

      <Modal
        open={modalOpen}
        title={editing ? 'Update Collection' : 'Add Collection'}
        description="Balances are recalculated when the record is saved."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCollection}>{editing ? 'Save Changes' : 'Add Collection'}</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField error={errors.collectionId} label="Collection ID" value={form.collectionId} onChange={(event) => setForm((current) => ({ ...current, collectionId: event.target.value }))} />
          <FormField as="select" error={errors.loanId} label="Loan" options={loanOptions} value={form.loanId} onChange={(event) => handleLoanChange(event.target.value)} />
          <SearchableTextField
            emptyMessage="No collector found."
            label="Collector"
            options={collectorOptions}
            placeholder="Search collector name"
            value={form.collector}
            onChange={(collector) => setForm((current) => ({ ...current, collector }))}
          />
          <FormField label="Collection Date" type="date" value={form.collectionDate} onChange={(event) => setForm((current) => {
            const collectionDate = event.target.value;
            const loan = data.loans.find((item) => item.id === current.loanId);
            return { ...current, collectionDate, penalty: loan ? getLoanPenaltyDue(loan, data.payments, collectionDate, penaltyRate) : current.penalty };
          })} />
          <FormField error={errors.amountDue} label="Amount Due" min="0" step="100" type="number" value={form.amountDue} onChange={(event) => setForm((current) => ({ ...current, amountDue: Number(event.target.value) }))} />
          <FormField label="Amount Paid" min="0" step="100" type="number" value={form.amountPaid} onChange={(event) => setForm((current) => ({ ...current, amountPaid: Number(event.target.value) }))} />
          <FormField label="Automatic Penalty" min="0" readOnly step="25" type="number" value={form.penalty} inputClassName="bg-slate-50 font-semibold dark:bg-slate-900" />
          <FormField as="select" label="Status" options={COLLECTION_STATUSES} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete collection?"
        message={`This will remove ${deleteTarget?.collectionId || 'this collection'} from monitoring records.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
