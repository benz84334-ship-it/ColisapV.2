function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printCurrentView() {
  window.print();
}

export function createBackupPayload(data) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Colisap Monitoring System for Barbaza MPC',
      version: 1,
      data,
    },
    null,
    2,
  );
}

function valueForExport(row, accessor) {
  if (typeof accessor === 'function') return accessor(row);
  return row?.[accessor];
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportToCSV(rows = [], columns = [], filename = 'export.csv') {
  const header = columns.map((col) => (col.label || col.key)).join(',');
  const body = rows.map((row) => columns.map((col) => {
    const key = col.exportKey || col.accessor || col.key;
    const value = valueForExport(row, key);
    return escapeCsv(value);
  }).join(',')).join('\n');
  const csv = header + '\n' + body;
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

export function exportToExcel(rows = [], columns = [], filename = 'export.xls') {
  // Many spreadsheets will open CSV saved with .xls extension. Use CSV content for compatibility.
  const header = columns.map((col) => (col.label || col.key)).join(',');
  const body = rows.map((row) => columns.map((col) => {
    const key = col.exportKey || col.accessor || col.key;
    const value = valueForExport(row, key);
    return escapeCsv(value);
  }).join(',')).join('\n');
  const csv = header + '\n' + body;
  downloadBlob(csv, filename, 'application/vnd.ms-excel');
}
