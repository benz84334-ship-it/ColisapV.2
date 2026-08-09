const variants = {
  primary: 'border border-teal-700 bg-teal-700 text-white shadow-sm hover:bg-teal-800 focus:ring-teal-500',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus:ring-teal-500',
  danger: 'border border-rose-200 bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus:ring-rose-500',
  success: 'border border-emerald-200 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus:ring-emerald-500',
  warning: 'border border-amber-200 bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400 focus:ring-amber-400',
  ghost: 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100 focus:ring-teal-500',
};

export default function Button({ children, className = '', icon: Icon, variant = 'primary', type = 'button', ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {Icon ? <Icon className="shrink-0" /> : null}
      {children}
    </button>
  );
}
