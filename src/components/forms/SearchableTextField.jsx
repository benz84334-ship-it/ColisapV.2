import { useEffect, useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';

export default function SearchableTextField({
  label,
  value,
  options = [],
  placeholder = 'Search',
  emptyMessage = 'No match found.',
  className = '',
  onChange,
}) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? options.filter((option) => option.toLowerCase().includes(normalizedQuery))
      : options;
    return filtered.slice(0, 40);
  }, [options, query]);

  const selectValue = (nextValue) => {
    onChange(nextValue);
    setQuery(nextValue);
    setOpen(false);
  };

  return (
    <label className={`relative block ${className}`}>
      {label ? <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span> : null}
      <div className="relative">
        <input
          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          placeholder={placeholder}
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              selectValue(matches[0]);
            }
          }}
        />
        <button
          aria-label={label ? `Search ${label.toLowerCase()}` : 'Search'}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-900 dark:hover:text-teal-200"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <FiSearch />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-[4.55rem] z-20 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {matches.length ? (
            matches.map((option) => (
              <button
                key={option}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-500/10 dark:hover:text-teal-100"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectValue(option)}
              >
                {option}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">{emptyMessage}</p>
          )}
        </div>
      ) : null}
    </label>
  );
}
