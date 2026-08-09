import { useMemo, useState } from 'react';
import { FiEdit2, FiGitBranch, FiPlus, FiRefreshCw, FiTrash2, FiUsers } from 'react-icons/fi';
import DataTable from '../../components/tables/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import FormField from '../../components/forms/FormField.jsx';
import SearchableTextField from '../../components/forms/SearchableTextField.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { BRANCH_OPTIONS, ROLES, USER_ROLE_OPTIONS } from '../../utils/constants.js';
import { formatDateTime } from '../../utils/formatters.js';
import { buildErrorMap, required, uniqueBy } from '../../utils/validation.js';

const blankUser = {
  username: '',
  password: '',
  fullName: '',
  role: ROLES.STAFF,
  status: 'Active',
  branch: BRANCH_OPTIONS[0],
  email: '',
  contactNumber: '',
};

export default function Users({ embedded = false }) {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankUser);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('users');

  const columns = useMemo(
    () => [
      {
        key: 'username',
        label: 'User',
        render: (row) => (
          <div className="min-w-48">
            <p className="font-bold text-slate-950 dark:text-white">{row.fullName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">@{row.username}</p>
          </div>
        ),
      },
      { key: 'role', label: 'Role' },
      { key: 'branch', label: 'Branch' },
      { key: 'email', label: 'Email' },
      ...(embedded ? [] : [{ key: 'contactNumber', label: 'Contact' }]),
      { key: 'lastLogin', label: 'Last Login', render: (row) => (row.lastLogin ? formatDateTime(row.lastLogin) : 'Never') },
      { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ],
    [embedded],
  );

  const branchRows = useMemo(() => {
    const branchNames = [...new Set([...BRANCH_OPTIONS, ...data.users.map((user) => user.branch).filter(Boolean)])];
    return branchNames.map((branch) => {
      const branchUsers = data.users.filter((user) => user.branch === branch);
      const admins = branchUsers.filter((user) => user.role === ROLES.ADMIN);
      const managers = branchUsers.filter((user) => user.role === ROLES.MANAGER);
      const staff = branchUsers.filter((user) => user.role === ROLES.STAFF);
      return {
        id: branch, branch, admins, managers, staff,
        adminNames: admins.map((user) => user.fullName).join(', '),
        managerNames: managers.map((user) => user.fullName).join(', '),
        staffNames: staff.map((user) => user.fullName).join(', '),
        status: admins.some((user) => user.status === 'Active') || managers.some((user) => user.status === 'Active') ? 'Active' : 'Unassigned',
      };
    });
  }, [data.users]);

  const branchColumns = useMemo(() => [
    { key: 'branch', label: 'Branch', render: (row) => <p className="min-w-48 font-bold text-slate-950 dark:text-white">{row.branch}</p> },
    {
      key: 'adminNames',
      label: 'Admin',
      render: (row) => row.admins.length ? (
        <div className="min-w-48 space-y-1">
          {row.admins.map((user) => <p key={user.id}>{user.fullName}</p>)}
        </div>
      ) : <span className="text-slate-400">Not assigned</span>,
    },
    {
      key: 'managerNames',
      label: 'Manager',
      render: (row) => row.managers.length ? (
        <div className="min-w-48 space-y-1">
          {row.managers.map((user) => <p key={user.id}>{user.fullName}</p>)}
        </div>
      ) : <span className="text-slate-400">Not assigned</span>,
    },
    {
      key: 'staffNames',
      label: 'Staff',
      render: (row) => row.staff.length ? (
        <div className="min-w-48 space-y-1">
          {row.staff.map((user) => <p key={user.id}>{user.fullName}</p>)}
        </div>
      ) : <span className="text-slate-400">Not assigned</span>,
    },
    { key: 'status', label: 'Status', render: (row) => row.status === 'Active' ? <Badge>Active</Badge> : <span className="text-slate-400">Unassigned</span> },
  ], []);

  const openForm = (user = null) => {
    setEditing(user);
    setForm(user || blankUser);
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const nextErrors = buildErrorMap([
      { field: 'username', valid: required(form.username), message: 'Username is required.' },
      { field: 'username', valid: uniqueBy(data.users, 'username', form.username, editing?.id), message: 'Username already exists.' },
      { field: 'fullName', valid: required(form.fullName), message: 'Full name is required.' },
      { field: 'password', valid: editing || required(form.password), message: 'Password is required.' },
      { field: 'email', valid: editing || required(form.email), message: 'Email is required to create a user.' },
    ]);
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const saveUser = async () => {
    if (!validate()) {
      showToast('Please correct the highlighted user fields.', 'error');
      return;
    }
    try {
      if (editing) {
        await data.updateUser(editing.id, form, currentUser.username);
        showToast('User updated.');
      } else {
        await data.createUser(form, currentUser.username);
        showToast('User created.');
      }
      setModalOpen(false);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to create user.', 'error');
    }
  };

  const resetPassword = (user) => {
    data.updateUser(user.id, { password: 'reset1234' }, currentUser.username)
      .then(() => showToast(`${user.username} password reset to reset1234.`, 'info'))
      .catch((error) => {
        console.error(error);
        showToast(error.message || 'Unable to reset password.', 'error');
      });
  };

  const confirmDelete = () => {
    if (deleteTarget.id === currentUser.id) {
      showToast('You cannot delete your own signed-in account.', 'error');
      setDeleteTarget(null);
      return;
    }
    Promise.resolve(data.deleteUser(deleteTarget.id, currentUser.username))
      .then(() => {
        setDeleteTarget(null);
        showToast('User deleted.');
      })
      .catch((error) => {
        console.error(error);
        showToast(error.message || 'Unable to delete user.', 'error');
      });
  };

  return (
    <div className="space-y-6">
      {embedded ? null : (
        <PageHeader
          eyebrow="Administration"
          title="User Management"
          description="Create users, assign Admin, Manager, or Staff roles, activate accounts, deactivate accounts, and reset passwords."
        />
      )}

      <div className="flex w-fit gap-1 rounded-2xl border border-[#E2E8F0] bg-white p-1 shadow-sm" role="tablist" aria-label="User management views">
        <button aria-selected={activeTab === 'users'} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'users' ? 'bg-[#0F766E] text-white shadow-sm' : 'text-slate-600 hover:bg-[#F8FAFC] hover:text-slate-900'}`} role="tab" type="button" onClick={() => setActiveTab('users')}>
          <FiUsers /> Users
        </button>
        <button aria-selected={activeTab === 'branches'} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'branches' ? 'bg-[#0F766E] text-white shadow-sm' : 'text-slate-600 hover:bg-[#F8FAFC] hover:text-slate-900'}`} role="tab" type="button" onClick={() => setActiveTab('branches')}>
          <FiGitBranch /> Branches
        </button>
      </div>

      {activeTab === 'users' ? <DataTable
        addAction={
          <Button icon={FiPlus} onClick={() => openForm()}>
            Create User
          </Button>
        }
        actions={(row) => (
          <div className="flex justify-end gap-2">
            <Button className="px-3" icon={FiEdit2} variant="secondary" onClick={() => openForm(row)}>
              Edit
            </Button>
            {embedded ? null : (
              <Button className="px-3" icon={FiRefreshCw} variant="secondary" onClick={() => resetPassword(row)}>
                Reset
              </Button>
            )}
            <Button className="px-3" icon={FiTrash2} variant="danger" onClick={() => setDeleteTarget(row)}>
              Delete
            </Button>
          </div>
        )}
        columns={columns}
        data={data.users}
        filters={[
          { key: 'role', label: 'Role', options: USER_ROLE_OPTIONS },
          { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
        ]}
        searchFields={['username', 'fullName', 'role', 'branch', 'email', 'status']}
        title="Users"
      /> : <div className="space-y-4">
        <DataTable
          columns={branchColumns}
          data={branchRows}
          description="Barbaza MPC branches and their assigned users."
          filters={[{ key: 'status', label: 'Status', options: ['Active', 'Unassigned'] }]}
          searchFields={['branch', 'adminNames', 'managerNames', 'status']}
          title="Branches"
        />
      </div>}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit User' : 'Create User'}
        description="Create a workspace account stored directly in Supabase."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveUser}>{editing ? 'Save Changes' : 'Create User'}</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField error={errors.username} label="Username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
          <FormField error={errors.password} label={editing ? 'Password' : 'Password'} type="text" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
          <FormField error={errors.fullName} label="Full Name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
          <SearchableTextField
            emptyMessage="No branch found."
            label="Branch"
            options={BRANCH_OPTIONS}
            placeholder="Search or select a branch"
            value={form.branch}
            onChange={(branch) => setForm((current) => ({ ...current, branch }))}
          />
          <FormField label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          <FormField as="select" label="Role" options={USER_ROLE_OPTIONS} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user?"
        message={`This will remove ${deleteTarget?.username || 'this user'} from the workspace records.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
