export default function FormField({
  label,
  error,
  as = 'input',
  options = [],
  className = '',
  inputClassName = '',
  ...props
}) {
  const isContactField = typeof label === 'string' && /contact number|contact no\.?|contact/i.test(label);
  const inputProps =
    as === 'input' && isContactField
      ? {
          inputMode: 'numeric',
          maxLength: 11,
          pattern: '[0-9]*',
          onChange: (event) => {
            const nextValue = event.target.value.replace(/\D/g, '').slice(0, 11);
            if (typeof props.onChange === 'function') {
              props.onChange({ target: { value: nextValue } });
            }
          },
        }
      : {};
  const isDateField = as === 'input' && props.type === 'date';
  const shared =
    `min-h-11 w-full box-border rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950 ${isDateField ? 'h-12 appearance-auto pr-11 text-[15px] leading-6 [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100' : ''}`;

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
        <input className={`${shared} ${inputClassName}`} {...props} {...inputProps} />
      )}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-300">{error}</span> : null}
    </label>
  );
}
