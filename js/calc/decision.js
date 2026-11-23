// Decisión en cuatro ejes independientes: calidad del negocio, valoración, potencial de rentabilidad y riesgo de
// pérdida permanente. No se mezclan en una sola nota: una empresa excelente puede estar cara y una barata puede
// estar deteriorándose. Todas las reglas y umbrales están aquí, a la vista, y la interfaz los explica.
import { isNum, maxDrawdown } from './finance.js?v=38c5f79f';

const FIN = /financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i;
const cat = (sc, k) => (sc.cats.find((c) => c.key === k) || {}).score;
const avg = (v) => { const x = v.filter(isNum); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };

/** Margen de seguridad exigido: más cuanto menos fiable es la valoración y peor el negocio. */
export const REQUIRED_MOS = { alta: 0.2, media: 0.3, baja: 0.4, 'muy baja': 0.5 };

export function decide(m, sc, val, alerts) {
  const c = val.composite || {}, rel = val.reliability || {}, price = m.price;
  const fin = FIN.test(`${(m.profile && m.profile.sector) || ''} ${(m.profile && m.profile.industry) || ''}`); // bancos, seguros, REIT, eléctricas
  // 1. Calidad del negocio (calidad contable, rentabilidad, ventajas competitivas, caja)
  const qs = avg([cat(sc, 'calidad'), cat(sc, 'rentabilidad'), cat(sc, 'moat'), cat(sc, 'caja')]);
  const quality = { score: isNum(qs) ? Math.round(qs) : null, label: !isNum(qs) ? 'sin datos' : qs >= 75 ? 'Excelente' : qs >= 60 ? 'Buena' : qs >= 45 ? 'Mediocre' : 'Débil' };

  // 2. Valoración y precio máximo de compra
  const valuable = !fin && isNum(c.value) && isNum(price) && price > 0 && rel.level !== 'no valorable'; // en financieras el DCF de caja libre no sirve: ni precio de compra ni potencial
  let req = REQUIRED_MOS[rel.level] ?? null; const reqWhy = [];
  if (isNum(req)) { reqWhy.push(`${Math.round(req * 100)} % por fiabilidad ${rel.level}`); if (isNum(qs) && qs < 60) { req += 0.1; reqWhy.push('+10 puntos por negocio de calidad no probada'); } if (c.contrasted === false) { req += 0.1; reqWhy.push('+10 puntos porque solo hay múltiplos, sin DCF ni dividendos'); } }
  const maxBuy = valuable && isNum(req) && c.value > 0 ? c.value * (1 - req) : null;
  const mos = valuable ? c.mos : null;
  const valuation = {
    value: valuable ? c.value : null, price, maxBuy, required: req, requiredWhy: reqWhy, mos,
    label: fin ? 'No aplicable al sector' : !valuable ? 'No valorable' : c.value === 0 ? 'Valor del capital 0' : isNum(maxBuy) && price <= maxBuy ? 'Barata' : mos >= 0 ? 'Razonable (sin margen suficiente)' : mos >= -0.25 ? 'Cara' : 'Muy cara',
    reason: fin ? 'banco, aseguradora, inmobiliaria o eléctrica: valóralo con ROE, valor contable y dividendo' : valuable ? '' : (rel.reasons || [c.reason]).filter(Boolean).slice(0, 2).join('; '),
  };

  // 3. Potencial de rentabilidad anual: si el precio converge al valor de cada escenario en 5 años, más dividendo
  const dyRaw = isNum(m.dpsTTM) && price > 0 ? m.dpsTTM / price : 0;
  const dy = dyRaw > 0 && dyRaw < 0.25 ? dyRaw : 0; // un dividendo > 25 % del precio es un pago extraordinario o un error: no se suma
  const scen = val.dcf && val.dcf.scen ? val.dcf.scen : [];
  const sv = (id) => { const s = scen.find((x) => x.id === id); return s && s.result && !s.result.error && isNum(s.result.perShare) ? Math.max(0, s.result.perShare) : null; };
  // Base = el mismo valor central de la valoración. Pesimista/optimista: ese valor movido lo que se mueve el DCF entre
  // sus escenarios; sin DCF, el rango (cuartiles) de los métodos de valoración.
  const dB = sv('base'); let src, pts;
  if (isNum(dB) && dB > 0 && isNum(sv('pesimista')) && isNum(sv('optimista')) && isNum(c.value)) { src = 'valor central movido según los escenarios pesimista y optimista del DCF'; pts = { pesimista: c.value * (sv('pesimista') / dB), base: c.value, optimista: c.value * (sv('optimista') / dB) }; }
  else { src = 'rango de los métodos de valoración (cuartiles)'; pts = { pesimista: c.low, base: c.value, optimista: c.high }; }
  const ann = (v) => (isNum(v) && price > 0 ? (v <= 0 ? -1 : (v / price) ** (1 / 5) - 1 + dy) : null);
  const potential = valuable ? { source: src, years: 5, dy, pesimista: ann(pts.pesimista), base: ann(pts.base), optimista: ann(pts.optimista), values: pts } : null;

  // 4. Riesgo de pérdida permanente de capital
  const R = []; let r = 0;
  const z = m.scores && m.scores.altmanZScore;
  if (!fin && isNum(z)) { if (z < 1.8) { r += 2; R.push(`Altman Z ${z.toFixed(1).replace('.', ',')}: zona de riesgo de insolvencia`); } else if (z < 3) { r += 1; R.push(`Altman Z ${z.toFixed(1).replace('.', ',')}: zona gris`); } }
  const high = (alerts || []).filter((a) => a.sev === 'alta');
  if (high.length) { r += Math.min(4, high.length * 2); R.push(`${high.length} alerta${high.length > 1 ? 's' : ''} grave${high.length > 1 ? 's' : ''}: ${high.slice(0, 2).map((a) => a.title.toLowerCase()).join('; ')}`); }
  const down = valuable && isNum(pts.pesimista) && price > 0 ? pts.pesimista / price - 1 : null;
  if (isNum(down)) { if (down < -0.5) { r += 2; R.push(`en el escenario pesimista el valor queda un ${Math.round(-down * 100)} % por debajo del precio`); } else if (down < -0.25) { r += 1; R.push(`en el escenario pesimista el valor queda un ${Math.round(-down * 100)} % por debajo del precio`); } }
  const sol = cat(sc, 'solidez'); if (isNum(sol) && sol < 45) { r += 1; R.push(`solidez financiera baja (${sol}/100)`); }
  const fcfL = (m.T && m.T.fcf) ?? (m.last && m.last.fcf); if (isNum(fcfL) && fcfL < 0) { r += 1; R.push('quema caja (FCF negativo)'); }
  if (isNum(m.growth.shares5) && m.growth.shares5 > 0.03) { r += 1; R.push(`dilución del ${(m.growth.shares5 * 100).toFixed(1).replace('.', ',')} % anual`); }
  const closes = (m.priceData || m.prices || []).slice(-1260).map((p) => p.close).filter(isNum);
  const dd = closes.length > 200 ? maxDrawdown(closes) : null;
  if (isNum(dd) && dd < -0.6) { r += 1; R.push(`ha llegado a caer un ${Math.round(-dd * 100)} % en 5 años`); }
  if (fin) R.push('sector financiero, inmobiliario o eléctrico: Altman, el FCF y el DCF no se aplican, así que el riesgo no se puede medir bien con estos datos');
  const risk = { points: r, label: fin ? (r >= 4 ? 'Alto' : 'No medible') : r <= 1 ? 'Bajo' : r <= 3 ? 'Moderado' : r <= 5 ? 'Alto' : 'Muy alto', reasons: R, pessimisticDown: down, maxDrawdown5: dd };

  // Conclusión: combinación de los cuatro ejes (no es una recomendación)
  const name = m.profile.companyName || m.symbol;
  const goodQ = isNum(qs) && qs >= 60;
  let verdict, action;
  const n2 = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (fin) { verdict = 'Sector que esta evaluación no sabe medir'; action = 'Banco, aseguradora, inmobiliaria o eléctrica: calidad, valor y riesgo de esta tarjeta se basan en caja libre y DCF, que no sirven aquí. Analízala con ROE, solvencia regulatoria, valor contable y dividendo.'; }
  else if (!valuable) { verdict = goodQ ? 'Negocio de calidad sin valoración fiable' : 'Sin valoración fiable'; action = 'No se puede fijar un precio máximo de compra con estos datos. Solo seguimiento, o valora tú los supuestos en la pestaña Valoración.'; }
  else if (c.value === 0) { verdict = 'La deuda supera al valor estimado del negocio'; action = 'El valor estimado del capital es 0: descartar mientras la deuda pese más que lo que vale la empresa, aunque el negocio sea bueno.'; }
  else if (risk.label === 'Muy alto') { verdict = 'Riesgo de pérdida permanente muy alto'; action = 'Descartar salvo que un análisis propio profundo desmonte los riesgos detectados.'; }
  else if (goodQ && isNum(maxBuy) && price <= maxBuy) { verdict = quality.label === 'Excelente' ? 'Empresa excelente con margen de seguridad suficiente' : 'Buena empresa con margen de seguridad suficiente'; action = `El precio está por debajo del máximo de compra (${n2(maxBuy)} ${m.tradeCur}). Candidata a estudio de compra: revisa antes los riesgos cualitativos y las noticias.`; }
  else if (goodQ) { verdict = `Empresa ${quality.label.toLowerCase()}, ${valuation.label.toLowerCase()}`; action = isNum(maxBuy) ? `Para seguimiento. No ofrece el margen exigido al precio actual: esperar a ${n2(maxBuy)} ${m.tradeCur} o menos (un ${Math.round((1 - maxBuy / price) * 100)} % por debajo), o revisar los supuestos.` : 'Para seguimiento.'; }
  else if (isNum(maxBuy) && price <= maxBuy) { verdict = 'Barata, pero el negocio no demuestra calidad'; action = 'Posible trampa de valor: lo barato puede seguir abaratándose si el negocio se deteriora. Exige una razón concreta para pensar que mejorará.'; }
  else { verdict = 'Negocio mediocre a un precio que no compensa'; action = 'Descartar: ni la calidad ni el precio justifican la inversión.'; }
  if (risk.label === 'Alto' && !/Descartar/.test(action)) action += ' Ojo: riesgo de pérdida alto.';
  return { name, quality, valuation, potential, risk, verdict, action, reliability: rel.level || null };
}
