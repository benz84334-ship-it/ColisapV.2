const variants = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 focus:ring-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-slate-950',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
  warning: 'bg-amber-500 text-slate-950 hover:bg-amber-400 focus:ring-amber-400',
  ghost: 'text-slate-600 hover:bg-slate-100 focus:ring-teal-500 dark:text-slate-200 dark:hover:bg-slate-800',
};

export default function Button({ children, className = '', icon: Icon, variant = 'primary', type = 'button', ...props }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-950 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {Icon ? <Icon className="shrink-0" /> : null}
      {children}
    </button>
  );
}
