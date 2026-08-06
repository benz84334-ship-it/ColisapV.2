const variants = {
  primary: 'border border-teal-600/20 bg-teal-600 text-white shadow-sm shadow-teal-950/10 hover:bg-teal-700 focus:ring-teal-500 dark:border-teal-400/20 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-slate-950',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-950/5 hover:border-slate-300 hover:bg-slate-50 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800',
  danger: 'border border-rose-600/20 bg-rose-600 text-white shadow-sm shadow-rose-950/10 hover:bg-rose-700 focus:ring-rose-500',
  success: 'border border-emerald-600/20 bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 hover:bg-emerald-700 focus:ring-emerald-500',
  warning: 'border border-amber-500/20 bg-amber-500 text-slate-950 shadow-sm shadow-amber-950/10 hover:bg-amber-400 focus:ring-amber-400',
  ghost: 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100 focus:ring-teal-500 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800',
};

export default function Button({ children, className = '', icon: Icon, variant = 'primary', type = 'button', ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-950 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {Icon ? <Icon className="shrink-0" /> : null}
      {children}
    </button>
  );
}
