import { useEffect, useMemo, useState } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiSearch, FiDownload, FiFile, FiPrinter } from 'react-icons/fi';
import { exportToCSV, exportToExcel, printCurrentView } from '../../utils/exporters.js';
import { normalizeText } from '../../utils/formatters.js';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';

function valueFor(row, accessor) {
  if (typeof accessor === 'function') return accessor(row);
  return row[accessor];
}

function searchableValue(row, fields, columns) {
  if (fields?.length) {
    return fields.map((field) => valueFor(row, field)).join(' ');
  }
  return columns.map((column) => valueFor(row, column.searchKey || column.key)).join(' ');
}

export default function DataTable({
  title,
  description,
  data = [],
  columns = [],
  actions,
  filters = [],
  searchFields = [],
  searchPlaceholder = 'Search records',
  addAction,
  pageSize = 10,
  hideHeader = false,
  hideHeaderText = false,
}) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState({ key: columns[0]?.key, direction: 'asc' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query, filterValues]);

  const filtered = useMemo(() => {
    const search = normalizeText(query);
    return data.filter((row) => {
      const matchesSearch = !search || normalizeText(searchableValue(row, searchFields, columns)).includes(search);
      const matchesFilters = filters.every((filter) => {
        const active = filterValues[filter.key];
        if (!active || active === 'All') return true;
        return String(valueFor(row, filter.accessor || filter.key)) === String(active);
      });
      return matchesSearch && matchesFilters;
    });
  }, [columns, data, filterValues, filters, query, searchFields]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const column = columns.find((item) => item.key === sort.key);
    const sortedRows = [...filtered].sort((a, b) => {
      const aValue = valueFor(a, column?.sortKey || column?.key || sort.key);
      const bValue = valueFor(b, column?.sortKey || column?.key || sort.key);
      const result = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, { numeric: true });
      return sort.direction === 'asc' ? result : -result;
    });
    return sortedRows;
  }, [columns, filtered, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (column) => {
    if (column.sortable === false) return;
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {!hideHeader ? (
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
          {!hideHeaderText ? (
            <div>
              {title ? <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2> : null}
              {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
            </div>
          ) : <div />}
          <div className="flex flex-wrap items-center gap-2 no-print">
            {addAction}
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" onClick={() => exportToCSV(sorted, columns, `${title || 'export'}.csv`)}>
              <FiDownload />
              CSV
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" onClick={() => exportToExcel(sorted, columns, `${title || 'export'}.xls`)}>
              <FiFile />
              Excel
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" onClick={() => printCurrentView()}>
              <FiPrinter />
              Print
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 p-5 no-print lg:grid-cols-[minmax(18rem,1fr)_auto]">
        <label className="relative block">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <select
              key={filter.key}
              aria-label={filter.label}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={filterValues[filter.key] || 'All'}
              onChange={(event) => setFilterValues((current) => ({ ...current, [filter.key]: event.target.value }))}
            >
              <option value="All">{filter.label}: All</option>
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>

      <div className="table-scroll overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-5 py-3 font-bold ${column.className || ''}`}>
                  <button
                    className="inline-flex items-center gap-1 rounded text-left hover:text-slate-900 disabled:cursor-default disabled:hover:text-inherit dark:hover:text-white"
                    disabled={column.sortable === false}
                    type="button"
                    onClick={() => handleSort(column)}
                  >
                    {column.label}
                    {sort.key === column.key ? sort.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown /> : null}
                  </button>
                </th>
              ))}
              {actions ? <th className="whitespace-nowrap px-5 py-3 text-right font-bold">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="screen-table-body divide-y divide-slate-100 dark:divide-slate-800">
            {paginated.map((row) => (
              <tr key={row.id} className="align-middle transition hover:bg-slate-50 dark:hover:bg-slate-900/70">
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-4 text-slate-700 dark:text-slate-200 ${column.cellClassName || ''}`}>
                    {column.render ? column.render(row) : valueFor(row, column.key)}
                  </td>
                ))}
                {actions ? <td className="px-5 py-4 text-right">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
          <tbody className="print-table-body hidden divide-y divide-slate-200">
            {sorted.map((row) => (
              <tr key={`print-${row.id}`} className="align-middle">
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-3 text-slate-700 ${column.cellClassName || ''}`}>
                    {column.render ? column.render(row) : valueFor(row, column.key)}
                  </td>
                ))}
                {actions ? <td className="px-5 py-3 text-right">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!paginated.length ? (
        <div className="p-5">
          <EmptyState />
        </div>
      ) : null}

      <div className="table-pagination flex flex-col gap-3 border-t border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {paginated.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
        </span>
        <div className="flex items-center gap-2 no-print">
          <Button icon={FiChevronLeft} variant="secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Prev
          </Button>
          <span className="rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {currentPage} / {pages}
          </span>
          <Button
            icon={FiChevronRight}
            variant="secondary"
            disabled={currentPage === pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
