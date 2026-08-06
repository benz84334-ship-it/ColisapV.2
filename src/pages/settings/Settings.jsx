import { useState } from 'react';
import { FiTrash2 } from 'react-icons/fi';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Users from '../users/Users.jsx';

export default function Settings() {
  const { clearLocalData } = useData();
  const { showToast } = useToast();
  const [resetOpen, setResetOpen] = useState(false);

  const handleResetLocalData = () => {
    clearLocalData();
    setResetOpen(false);
    showToast('Local data cleared. The page will reload now.', 'success');
    window.setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Manage Barbaza MPC user accounts, branch assignments, roles, and account access."
      />

      <Users embedded />

      <div className="rounded-3xl border border-rose-200 bg-rose-50/70 p-6 dark:border-rose-900 dark:bg-rose-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-rose-600 dark:text-rose-300">
              Supabase Data
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-950 dark:text-white">
              Reset remote data
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              This clears the app&apos;s current in-memory view and reloads from Supabase on the next refresh.
            </p>
          </div>
          <Button icon={FiTrash2} variant="danger" onClick={() => setResetOpen(true)}>
            Reset Data View
          </Button>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Reset view"
        message="This will clear the current loaded data from memory and reload the app."
        open={resetOpen}
        title="Reset data view?"
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetLocalData}
      />
    </div>
  );
}
