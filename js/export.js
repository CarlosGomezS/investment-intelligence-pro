// Exportación: CSV, Excel (SheetJS) y PDF (diálogo de impresión con hoja de estilos específica).
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function tableToRows(tableEl) {
  return [...tableEl.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim()));
}

export function toCSV(rows) {
  return rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\n');
}

export function exportCSV(name, rows) { download(`${name}.csv`, new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' })); }

/** sheets: {NombreHoja: rows[][]} */
export function exportXLSX(name, sheets) {
  if (!window.XLSX) { alert('La librería de Excel no ha cargado; prueba con CSV.'); return; }
  const wb = window.XLSX.utils.book_new();
  for (const [sn, rows] of Object.entries(sheets)) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), sn.slice(0, 31));
  window.XLSX.writeFile(wb, `${name}.xlsx`);
}

/** Convierte filas de objetos a matriz con cabecera. */
export function objectsToRows(objs, fields) {
  const f = fields || [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return [f, ...objs.map((o) => f.map((k) => (o[k] ?? '')))];
}

export function printReport() { window.print(); }
