import { STATUS_STYLES } from '../../utils/constants.js';

export default function Badge({ children, tone }) {
  const value = tone || children;
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[value] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
    >
      {children}
    </span>
  );
}
