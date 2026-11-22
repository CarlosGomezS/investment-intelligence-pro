// Gráficos: Chart.js para series fundamentales y TradingView Lightweight Charts para cotizaciones.
import { big, num, pct } from './dom.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const PALETTE = () => [css('--c1'), css('--c2'), css('--c3'), css('--c4'), css('--c5'), css('--c6')];
const charts = new Map();

const FMT = { big: (v) => big(v), pct: (v) => pct(v), x: (v) => num(v, 1) + '×', n: (v) => num(v, 2) };

/**
 * Gráfico de barras/líneas sobre un <canvas id>. datasets: [{label, data, type:'bar'|'line', axis:'y'|'y2', color}]
 */
export function fundamentals(id, labels, datasets, { fmt = 'big', fmt2 = 'pct', stacked = false } = {}) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  if (charts.has(id)) charts.get(id).destroy();
  const pal = PALETTE(), grid = css('--line'), ink = css('--mute');
  const hasY2 = datasets.some((d) => d.axis === 'y2');
  const ch = new window.Chart(el, {
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        type: d.type || 'bar', label: d.label, data: d.data, yAxisID: d.axis || 'y',
        backgroundColor: d.type === 'line' ? 'transparent' : (d.color || pal[i % pal.length]) + (d.dim ? '66' : ''),
        borderColor: d.color || pal[i % pal.length], borderWidth: d.type === 'line' ? 2 : 0, pointRadius: d.type === 'line' ? 2.5 : 0,
        borderRadius: 3, spanGaps: false, order: d.type === 'line' ? 0 : 1, borderDash: d.dash || [],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: ink, boxWidth: 10, boxHeight: 10, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw == null ? 'sin dato' : FMT[c.dataset.yAxisID === 'y2' ? fmt2 : fmt](c.raw)}` } },
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: ink, maxRotation: 0, autoSkip: true, font: { size: 11 } } },
        y: { stacked, grid: { color: grid }, ticks: { color: ink, font: { size: 11 }, callback: (v) => FMT[fmt](v) } },
        ...(hasY2 ? { y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: ink, font: { size: 11 }, callback: (v) => FMT[fmt2](v) } } } : {}),
      },
    },
  });
  charts.set(id, ch);
}

let lw = null;
/**
 * Gráfico de cotización. series: [{name, color, data:[{time:'YYYY-MM-DD'|unix, value}]}]
 * volume: [{time, value, up}], markers: [{time, text, kind:'div'|'split'}]
 */
export function priceChart(container, { series, volume, markers, log = false, percent = false }) {
  if (!window.LightweightCharts || !container) return;
  if (lw) { lw.remove(); lw = null; }
  const ink = css('--mute'), grid = css('--line');
  lw = window.LightweightCharts.createChart(container, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: ink, fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: grid } },
    rightPriceScale: { mode: percent ? 2 : log ? 1 : 0, borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true },
    crosshair: { mode: 0 },
    localization: { locale: 'es-ES', priceFormatter: (p) => (percent ? num(p, 1) + ' %' : num(p, 2)) },
  });
  series.forEach((s, i) => {
    const ls = lw.addLineSeries({ color: s.color, lineWidth: i === 0 ? 2 : 1.5, priceLineVisible: i === 0, lastValueVisible: true, title: s.name });
    ls.setData(s.data);
    if (i === 0 && markers && markers.length) ls.setMarkers(markers.map((m) => ({ time: m.time, position: m.kind === 'split' ? 'aboveBar' : 'belowBar', color: m.kind === 'split' ? css('--warn') : css('--c2'), shape: m.kind === 'split' ? 'arrowDown' : 'circle', text: m.text })));
  });
  if (volume && volume.length) {
    const v = lw.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    lw.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    v.setData(volume.map((x) => ({ time: x.time, value: x.value, color: x.up ? css('--pos') + '55' : css('--neg') + '55' })));
  }
  lw.timeScale().fitContent();
  return lw;
}
export function destroyAll() { for (const c of charts.values()) c.destroy(); charts.clear(); if (lw) { lw.remove(); lw = null; } }
