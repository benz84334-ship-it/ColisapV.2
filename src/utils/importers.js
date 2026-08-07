import * as XLSX from 'xlsx';

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
  first.forEach((h) => headers.push(String(h || '').trim()));

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

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const name = (file && file.name) || '';
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv') || file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = String(ev.target.result || '');
          const rows = parseCsvText(text);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file, 'utf-8');
      return;
    }

    // Try XLS/XLSX
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = ev.target.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
      return;
    }

    reject(new Error('Unsupported file type. Use CSV or XLS/XLSX.'));
  });
}

export default parseFile;
