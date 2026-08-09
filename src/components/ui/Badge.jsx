import { STATUS_STYLES } from '../../utils/constants.js';

export default function Badge({ children, tone }) {
  const value = tone || children;
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${STATUS_STYLES[value] || 'border-slate-200 bg-slate-100 text-slate-700'}`}
    >
      {children}
    </span>
  );
}
