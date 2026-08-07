import { FiDownload, FiFile, FiPrinter } from 'react-icons/fi';
import { exportToCSV, exportToExcel, printCurrentView } from '../../utils/exporters.js';
import parseFile from '../../utils/importers.js';

const buttonClass = 'inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800';

export default function ExportActions({ rows = [], columns = [], filename = 'export', onImport = null }) {
  const handleImportSelection = async (event, type) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Import ${file.name} into the current view?`)
      : true;

    if (!confirmed) {
      event.target.value = '';
      return;
    }

    try {
      const rowsParsed = await parseFile(file);
      if (onImport) onImport(rowsParsed, file);
      else if (type === 'csv') console.log('Imported CSV rows', rowsParsed);
      else console.log('Imported Excel rows', rowsParsed);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to import ${type === 'csv' ? 'CSV' : 'Excel'}`, err);
    }

    event.target.value = '';
  };

  return (
    <div className="flex flex-wrap gap-2 no-print">
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        ref={(el) => { ExportActions.csvRef = el; }}
        onChange={(e) => handleImportSelection(e, 'csv')}
      />
      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        ref={(el) => { ExportActions.excelRef = el; }}
        onChange={(e) => handleImportSelection(e, 'excel')}
      />
      <button type="button" className={buttonClass} onClick={() => (ExportActions.csvRef && ExportActions.csvRef.click())}>
        <FiDownload />
        Import CSV
      </button>
      <button type="button" className={buttonClass} onClick={() => (ExportActions.excelRef && ExportActions.excelRef.click())}>
        <FiFile />
        Import Excel
      </button>
      <button type="button" className={buttonClass} onClick={printCurrentView}>
        <FiPrinter />
        Print
      </button>
    </div>
  );
}
