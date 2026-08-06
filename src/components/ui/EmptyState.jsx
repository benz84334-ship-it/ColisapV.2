import { FiInbox } from 'react-icons/fi';

export default function EmptyState({ title = 'No records found', message = 'Try changing your search or filters.' }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <FiInbox className="mb-3 text-3xl text-slate-400" />
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}
