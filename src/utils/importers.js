import * as XLSX from 'xlsx';

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}

function parseCsvText(text) {
  // Simple CSV parser that handles quoted fields
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const headers = [];
  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  };

  const first = parseLine(lines[0]);
  first.forEach((h) => headers.push(normalizeHeader(h)));

  for (let r = 1; r < lines.length; r += 1) {
    const row = {};
    const parts = parseLine(lines[r]);
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c] || `col${c}`] = parts[c] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

export async function parseFile(file) {
  const name = (file && file.name) || '';
  const lower = name.toLowerCase();

  if (lower.endsWith('.csv') || file?.type === 'text/csv') {
    const text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') {
          reject(new Error('FileReader is not available in this environment.'));
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => resolve(String(ev.target?.result || ''));
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      });

    return parseCsvText(text);
  }

  // Try XLS/XLSX
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const data = typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') {
          reject(new Error('FileReader is not available in this environment.'));
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  }

  throw new Error('Unsupported file type. Use CSV or XLS/XLSX.');
}

export default parseFile;
