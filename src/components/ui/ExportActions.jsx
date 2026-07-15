import { FiDownload, FiFile, FiPrinter } from 'react-icons/fi';
import { exportToCSV, exportToExcel, printCurrentView } from '../../utils/exporters.js';

const buttonClass = 'inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export default function ExportActions({ rows = [], columns = [], filename = 'export' }) {
  return (
    <div className="flex flex-wrap gap-2 no-print">
      <button type="button" className={buttonClass} onClick={() => exportToCSV(rows, columns, `${filename}.csv`)}>
        <FiDownload />
        CSV
      </button>
      <button type="button" className={buttonClass} onClick={() => exportToExcel(rows, columns, `${filename}.xls`)}>
        <FiFile />
        Excel
      </button>
      <button type="button" className={buttonClass} onClick={printCurrentView}>
        <FiPrinter />
        Print
      </button>
    </div>
  );
}
