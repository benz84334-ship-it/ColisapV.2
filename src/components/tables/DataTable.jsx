import { useEffect, useMemo, useState } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiSearch } from 'react-icons/fi';
import parseFile from '../../utils/importers.js';
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
  onImport = null,
  pageSize = 10,
  hideHeader = false,
  hideHeaderText = false,
  hideTools = false,
  initialSortKey,
  initialSortDirection = 'asc',
}) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState(() => (
    initialSortKey === undefined
      ? { key: columns[0]?.key, direction: initialSortDirection }
      : { key: initialSortKey, direction: initialSortDirection }
  ));
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSort(
      initialSortKey === undefined
        ? { key: columns[0]?.key, direction: initialSortDirection }
        : { key: initialSortKey, direction: initialSortDirection },
    );
  }, [columns, initialSortDirection, initialSortKey]);

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
    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {!hideHeader ? (
        <div className="flex flex-col gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] p-6 xl:flex-row xl:items-center xl:justify-between">
          {!hideHeaderText ? (
            <div>
              {title ? <h2 className="text-lg font-bold text-slate-900">{title}</h2> : null}
              {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
            </div>
          ) : <div />}
          <div className="flex flex-wrap items-center gap-2 no-print">
            {addAction}
          </div>
        </div>
      ) : null}

      {hideTools ? null : (
        <div className="grid gap-4 border-b border-[#E2E8F0] bg-white p-6 no-print lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)]">
          <label className="relative block">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-500/10"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
            {filters.map((filter) => (
              <select
                key={filter.key}
                aria-label={filter.label}
                className="h-11 w-full min-w-0 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-500/10"
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
      )}

      <div className="table-scroll overflow-x-auto">
        <table className="min-w-full divide-y divide-[#E2E8F0] text-left text-sm">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-6 py-4 font-semibold text-slate-500 ${column.className || ''}`}>
                  <button
                    className="inline-flex items-center gap-1 rounded-lg text-left hover:text-slate-900 disabled:cursor-default disabled:hover:text-inherit"
                    disabled={column.sortable === false}
                    type="button"
                    onClick={() => handleSort(column)}
                  >
                    {column.label}
                    {column.sortable === false ? null : sort.key === column.key ? sort.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown /> : null}
                  </button>
                </th>
              ))}
              {actions ? <th className="whitespace-nowrap px-6 py-4 text-center font-semibold text-slate-500">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="screen-table-body divide-y divide-[#E2E8F0]">
            {paginated.map((row) => (
              <tr key={row.id} className="align-middle transition hover:bg-[#F8FAFC]">
                {columns.map((column) => (
                  <td key={column.key} className={`px-6 py-5 text-slate-700 ${column.cellClassName || ''}`}>
                    {column.render ? column.render(row) : valueFor(row, column.key)}
                  </td>
                ))}
                {actions ? <td className="px-6 py-5 text-center">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
          <tbody className="print-table-body hidden divide-y divide-[#E2E8F0]">
            {sorted.map((row) => (
              <tr key={`print-${row.id}`} className="align-middle">
                {columns.map((column) => (
                  <td key={column.key} className={`px-6 py-4 text-slate-700 ${column.cellClassName || ''}`}>
                    {column.render ? column.render(row) : valueFor(row, column.key)}
                  </td>
                ))}
                {actions ? <td className="px-6 py-4 text-center">{actions(row)}</td> : null}
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

      <div className="table-pagination flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] p-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {paginated.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
        </span>
        <div className="flex items-center gap-2 no-print">
          <Button icon={FiChevronLeft} variant="secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Prev
          </Button>
          <span className="rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm">
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
