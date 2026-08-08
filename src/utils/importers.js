import * as XLSX from 'xlsx';

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}

function normalizeHeaderKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniquifyHeaders(headers = []) {
  const counts = new Map();
  return headers.map((header, index) => {
    const base = normalizeHeader(header) || `col${index + 1}`;
    const key = normalizeHeaderKey(base);
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    return count === 0 ? base : `${base}__${count + 1}`;
  });
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
  const uniqueHeaders = uniquifyHeaders(headers);

  for (let r = 1; r < lines.length; r += 1) {
    const row = { __rowNumber: r + 1, __sourceRow: r + 1 };
    const parts = parseLine(lines[r]);
    for (let c = 0; c < uniqueHeaders.length; c += 1) {
      row[uniqueHeaders[c]] = parts[c] ?? '';
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

    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    if (!matrix.length) return [];

    const headers = uniquifyHeaders(matrix[0].map(normalizeHeader));
    const rows = [];

    for (let r = 1; r < matrix.length; r += 1) {
      const cells = matrix[r] || [];
      const hasValue = cells.some((value) => String(value ?? '').trim() !== '');
      if (!hasValue) continue;

      const row = { __rowNumber: r + 1, __sourceRow: r + 1 };
      for (let c = 0; c < headers.length; c += 1) {
        row[headers[c]] = cells[c] ?? '';
      }
      rows.push(row);
    }

    return rows;
  }

  throw new Error('Unsupported file type. Use CSV or XLS/XLSX.');
}

export default parseFile;
