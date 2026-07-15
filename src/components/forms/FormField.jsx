export default function FormField({
  label,
  error,
  as = 'input',
  options = [],
  className = '',
  inputClassName = '',
  ...props
}) {
  const shared =
    'min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  return (
    <label className={`block ${className}`}>
      {label ? <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span> : null}
      {as === 'select' ? (
        <select className={`${shared} ${inputClassName}`} {...props}>
          {options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
        </select>
      ) : as === 'textarea' ? (
        <textarea className={`${shared} min-h-24 resize-y ${inputClassName}`} {...props} />
      ) : (
        <input className={`${shared} ${inputClassName}`} {...props} />
      )}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-300">{error}</span> : null}
    </label>
  );
}
