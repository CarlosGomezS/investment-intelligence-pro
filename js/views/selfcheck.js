// Autocomprobación con datos REALES: analiza empresas de referencia con tus fuentes y verifica que las cifras de la
// app cuadran con las del proveedor y entre sí. Sirve para detectar errores con casos difíciles (splits, doble clase,
// ADR, patrimonio negativo, bancos, Europa, Londres) sin depender de revisiones del código.
import { analyzeOne } from './methods.js?v=984486c8';
import { esc, card, num, pct, toast } from '../ui/dom.js?v=984486c8';
import { isNum } from '../calc/finance.js?v=984486c8';
import { exportCSV } from '../export.js?v=984486c8';

// Cada una representa un caso difícil (por qué está en la lista)
const REF = [
  ['NVDA', 'splits 4:1 (2021) y 10:1 (2024)'], ['AAPL', 'patrimonio casi nulo por recompras'], ['GOOGL', 'dos clases de acciones'],
  ['BKNG', 'patrimonio negativo y split en 2026'], ['TSM', 'ADR con cuentas en otra moneda'], ['JPM', 'banco'],
  ['KO', 'dividendo de más de 20 años'], ['INTC', 'beneficios irregulares'], ['ITX.MC', 'española con cierre en enero'], ['BP.L', 'Londres, cotiza en peniques'],
];
let rows = [], running = false;

function checks(S) {
  const m = S.m, out = [];
  const add = (t, ok, v) => out.push({ t, ok, v });
  // 1. Capitalización: la de la app frente a la del proveedor
  const mcP = m.mcProv; // la del proveedor ya normalizada (peniques/libras) por el modelo
  add('Capitalización cuadra con el proveedor (±15 %)', isNum(mcP) && isNum(m.marketCap) ? Math.abs(m.marketCap / mcP - 1) < 0.15 : null, isNum(mcP) ? `${num(m.marketCap / 1e9, 1)} vs ${num(mcP / 1e9, 1)} mil M` : 'el proveedor no la da');
  // 2. PER: el de la app frente al del proveedor
  const peP = m.rTTM && m.rTTM.priceToEarningsRatioTTM, peA = m.pe;
  // Solo se compara con datos del mismo periodo (TTM); con el PER del último ejercicio cerrado no sería comparable
  // Con 12 meses en ambos lados: ±25 %. Sin ellos (PER del último ejercicio frente al TTM del proveedor) solo se
  // marca fallo si difieren más del doble: eso ya no es el paso del tiempo, sino split, divisa o ADR mal tratados
  const okPe = isNum(peP) && peP > 0 && isNum(peA) && peA > 0;
  if (m.ttmIsReal) add('PER cuadra con el proveedor (±25 %)', okPe ? Math.abs(peA / peP - 1) < 0.25 : null, `${num(peA, 1)}× vs ${num(peP, 1)}×`);
  else add('PER del último ejercicio sin desviación grosera (< 2× el del proveedor)', okPe ? Math.max(peA / peP, peP / peA) < 2 : null, `sin cuenta de 12 meses: ${num(peA, 1)}× (ejercicio) vs ${num(peP, 1)}× (proveedor, TTM)`);
  // 3. BPA sin saltos imposibles entre años (split mal ajustado)
  // Un split mal ajustado hace que el BPA salte MUCHO más (o menos) que el beneficio; un crecimiento real (NVDA) no
  const Y = m.years.filter((y) => isNum(y.eps) && y.eps > 0 && isNum(y.netIncome) && y.netIncome > 0);
  const bad = Y.some((y, i) => i && Math.abs(Math.log((y.eps / Y[i - 1].eps) / (y.netIncome / Y[i - 1].netIncome))) > Math.log(2.5));
  add('BPA coherente con el beneficio año a año (sin splits mal ajustados)', Y.length >= 3 ? !bad : null, Y.map((y) => num(y.eps, 2)).slice(-6).join(' → '));
  // 4. Acciones sin saltos no explicados
  const sh = m.years.map((y) => y.shares).filter(isNum);
  const jump = sh.some((v, i) => i && (v / sh[i - 1] > 1.5 || v / sh[i - 1] < 0.67));
  add('Acciones sin saltos bruscos (±50 %)', sh.length >= 3 ? !jump : null, sh.slice(-6).map((v) => num(v / 1e6, 0) + ' M').join(' → '));
  // 5. Deuda neta conocida
  add('Deuda neta disponible', isNum(m.netDebt), isNum(m.netDebt) ? num(m.netDebt / 1e9, 1) + ' mil M' : 'falta');
  // 6. Valor intrínseco razonable respecto al precio (entre 1/5 y 5 veces)
  const iv = S.val.composite.value;
  add('Valor intrínseco en rango razonable (0,2×–5× el precio)', isNum(iv) && iv > 0 && isNum(m.price) ? iv / m.price > 0.2 && iv / m.price < 5 : null, isNum(iv) ? `${num(iv)} vs precio ${num(m.price)}` : 'sin valoración');
  return out;
}

export async function render(view) {
  view.innerHTML = `<h1 style="font-size:22px;margin-bottom:14px">Autocomprobación con datos reales</h1>
    ${card('', `<p class="note" style="margin-top:0">Analiza ${REF.length} empresas elegidas por ser casos difíciles y comprueba, con tus fuentes y datos de hoy, que la capitalización y el PER de la app coinciden con los del proveedor, que no hay saltos imposibles en BPA o acciones (splits mal ajustados), que hay deuda neta y que el valor intrínseco es razonable. Tarda unos minutos y gasta cuota (sobre todo de Finnhub, que no tiene tope diario).</p>
      <div class="row" style="gap:8px"><button class="btn pri" id="go">${running ? 'Comprobando…' : 'Comprobar'}</button><button class="btn" id="csv" ${rows.length ? '' : 'disabled'}>Descargar resultado (CSV)</button><span class="note" id="pg"></span></div>`)}
    <div id="res" style="margin-top:14px"></div>`;
  view.querySelector('#go').onclick = () => run(view);
  view.querySelector('#csv').onclick = () => exportCSV('autocomprobacion', [['Empresa', 'Caso', 'Comprobación', 'Resultado', 'Detalle', 'Fiabilidad'], ...rows.flatMap((r) => (r.error ? [[r.sym, r.why, 'carga', 'error', r.error, '']] : r.c.map((c) => [r.sym, r.why, c.t, c.ok === true ? 'OK' : c.ok === false ? 'FALLO' : 'sin dato', c.v, r.rel]))) ]);
  draw(view);
}

async function run(view) {
  if (running) return; running = true; rows = []; render(view);
  for (const [i, [sym, why]] of REF.entries()) {
    const pg = view.querySelector('#pg'); if (pg) pg.textContent = `${i + 1} de ${REF.length}: ${sym}…`;
    try { const S = await analyzeOne(sym, { ttm: true }); rows.push({ sym, why, name: S.m.profile.companyName, c: checks(S), rel: S.val.reliability ? `${S.val.reliability.level}${S.val.reliability.reasons.length ? ': ' + S.val.reliability.reasons.join('; ') : ''}` : '' }); }
    catch (e) { rows.push({ sym, why, error: (e && e.message) || 'sin datos' }); }
    if (document.body.contains(view)) draw(view);
  }
  running = false; if (document.body.contains(view)) { render(view); toast('Comprobación terminada'); }
}

function draw(view) {
  const box = view.querySelector('#res'); if (!box) return;
  if (!rows.length) { box.innerHTML = running ? '<div class="skel"><div></div></div>' : ''; return; }
  const fails = rows.reduce((a, r) => a + (r.c ? r.c.filter((c) => c.ok === false).length : 0), 0);
  box.innerHTML = `<p><b>${fails ? `${fails} comprobaciones con fallo` : 'Sin fallos'}</b> en ${rows.length} empresas. Si algo falla, descarga el CSV y envíamelo.</p>` + rows.map((r) => card(`${esc(r.sym)} · ${esc(r.name || '')} <span class="mute" style="font-weight:400">(${esc(r.why)})</span>`, r.error ? `<p class="note">No se pudo analizar: ${esc(r.error)}</p>` : r.c.map((c) => `<div style="display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;padding:5px 0;border-bottom:1px solid var(--line)">${c.ok === true ? '<span class="pos">✓</span>' : c.ok === false ? '<span class="neg">✕</span>' : '<span class="mute">?</span>'}<div><b>${esc(c.t)}</b><br><small class="mute">${esc(c.v)}</small></div></div>`).join('') + `<p class="note">Fiabilidad de la valoración: ${esc(r.rel)}</p>`)).join('<div style="height:10px"></div>');
}
