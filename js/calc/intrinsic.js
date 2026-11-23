// Valoración intrínseca de una empresa a partir del modelo: DCF, múltiplos, DDM y escenarios.
// Cada supuesto lleva su origen: 'real' (dato del proveedor), 'analistas' (estimación), 'supuesto' (regla de la app o del usuario).
import { isNum, mean, median, lastAvg, cagrN } from './finance.js?v=38c5f79f';
import { dcf, sensitivity, ddm, impliedByPE, impliedByEV, marginOfSafety, upside, scenarios, suggestGrowth, ratioAvg } from './valuation.js?v=38c5f79f';

export function dcfDefaults(m) {
  const fcfs = m.years.map((y) => y.fcf);
  // FCF a la empresa para descontar al WACC: FCF − pagos en acciones (son un coste real que diluye) + intereses
  // pagados después de impuestos (el flujo operativo ya los restó; la deuda se descuenta luego con la deuda neta).
  // Ajuste por intereses solo con normas de EE. UU. (US-GAAP obliga a incluirlos en el flujo operativo); con NIIF
  // muchas empresas los llevan a financiación y sumarlos inflaría el flujo. Los intereses cobrados por la caja se
  // restan, porque la caja ya se suma aparte al restar la deuda neta.
  const usGaap = /^(US|USA|United States)$/i.test(m.profile.country || '') || (!m.profile.country && m.repCur === 'USD');
  const unlev = (y) => { if (!isNum(y.fcf)) return null; const t = isNum(y.taxRate) ? y.taxRate : 0.21; let v = y.fcf - (isNum(y.sbc) ? y.sbc : 0); if (usGaap) v += ((y.interestExpense || 0) - (y.interestIncome || 0)) * (1 - t); return v; };
  const fcfTTM = unlev(m.T);
  const fcf3 = lastAvg(m.years.map(unlev), 3);
  const g = suggestGrowth({ fcfCagr5: m.growth.fcf5, revCagr5: m.growth.rev5, analystRevGrowth: m.growth.analystRev, rev1: m.growth.rev1, rev10: m.growth.rev10 });
  const w = m.market.wacc;
  return {
    fcfBase: { value: m.X(fcfTTM), origin: `${m.ttmIsReal && !(m.ttmFilled || []).includes('fcf') ? 'real · FCF de los últimos 12 meses' : 'real · FCF del último ejercicio' + (m.ttmIsReal ? ' (tu fuente no da el de 12 meses)' : '')} − pagos en acciones${usGaap ? ' + intereses netos × (1 − impuesto)' : ''}`, alt: m.X(fcf3) },
    growth: { value: g.value ?? 0.05, origin: g.value != null ? 'supuesto · mediana de ' + g.parts.map(([k]) => k).join(', ') : 'supuesto · 5 % por falta de datos', parts: g.parts, capped: g.capped },
    years: { value: 10, origin: 'supuesto' },
    terminalGrowth: { value: 0.025, origin: 'supuesto · inflación/PIB nominal a largo plazo' },
    rf: { value: m.market.rf10, origin: (m.market.rfAssumed ? 'supuesto · 4,5 % (sin dato del bono a 10 años)' : `real · bono EE. UU. 10a (${m.market.rfDate})`) + (m.repCur && m.repCur !== 'USD' ? ` · ojo: los flujos están en ${m.repCur}; lo correcto es el bono a 10 años de esa moneda (cámbialo si lo conoces)` : '') },
    beta: { value: m.market.beta, origin: m.market.betaAssumed ? 'supuesto · beta 1 (sin dato)' : `calculado · beta ajustada de Blume (0,67 × ${(m.market.betaRaw || 0).toFixed(2).replace('.', ',')} ${m.market.betaCalc ? 'calculada frente al S&P 500' : 'del proveedor'} + 0,33)` },
    erp: { value: m.market.erp, origin: m.market.erpAssumed ? 'supuesto · 4,5 % (prima típica de mercado desarrollado)' : `real · prima de riesgo ${m.market.erpCountry} (Damodaran vía FMP)` },
    costDebt: { value: m.market.costDebt, origin: m.market.costDebt != null ? 'real · intereses / deuda, media 3a' : 'falta: el WACC usa el coste del capital propio para la deuda (prudente); escribe aquí una estimación si la conoces' },
    wacc: { value: w ? w.wacc : null, origin: w ? 'calculado · CAPM' : 'falta: introduce el WACC a mano' },
    netDebt: { value: m.netDebt, origin: 'real · deuda − caja' },
    shares: { value: m.shares, origin: 'real · acciones en circulación' },
  };
}

export function runDcf(m, inp) {
  const base = { fcf0: inp.fcf0, growth: inp.growth, years: inp.years, terminalGrowth: inp.terminalGrowth, discount: inp.wacc, netDebt: inp.netDebt, shares: inp.shares };
  if (!isNum(base.fcf0) || base.fcf0 <= 0) return { error: 'El FCF base es negativo o no existe: un DCF no es fiable para esta empresa ahora mismo.' };
  if (!isNum(base.discount)) return { error: 'Falta el WACC: introdúcelo manualmente.' };
  const r = dcf(base); if (!r || r.error) return r || { error: 'Datos insuficientes' };
  const ws = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => +(base.discount + d).toFixed(4));
  const gs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => +(base.terminalGrowth + d).toFixed(4));
  return { ...r, base, sens: { ws, gs, grid: sensitivity(base, ws, gs) }, scen: scenarios(base), mos: marginOfSafety(r.perShare, m.price), up: upside(r.perShare, m.price) };
}

/**
 * Múltiplos. Los históricos propios solo cuentan para el valor central si la empresa sigue creciendo
 * a un ritmo parecido al de cuando cotizaba a esos múltiplos: si el crecimiento actual es inferior al 60 %
 * del de entonces, se muestran pero se excluyen (aplicar un múltiplo de etapa de alto crecimiento a una
 * empresa madura infla el valor).
 */
export function multiples(m, peersAll) {
  const peers = peersAll ? peersAll.filter((p) => !p.self) : null;
  const pe5 = ratioAvg(m.ratiosHist, 'priceToEarningsRatio', 5), pe10 = ratioAvg(m.ratiosHist, 'priceToEarningsRatio', 10);
  const eve5 = ratioAvg(m.kmHist, 'evToEBITDA', 5), evf5 = ratioAvg(m.kmHist, 'evToFreeCashFlow', 5);
  const epsT = m.X(m.T.eps), ebitdaT = m.X(m.T.ebitda), fcfT = m.X(m.T.fcf);
  const peerPE = peers ? median(peers.map((p) => p.pe).filter((v) => isNum(v) && v > 0 && v < 200)) : null;
  const peerEVE = peers ? median(peers.map((p) => p.evEbitda).filter((v) => isNum(v) && v > 0 && v < 200)) : null;
  // crecimiento de entonces (años en que se formaron los múltiplos) frente al actual
  const rev = m.years.map((y) => y.revenue);
  const gThen = rev.length >= 8 ? cagrN(rev.slice(0, -2), 5) : m.growth.rev5;
  const gNow = [m.growth.rev1, m.growth.rev3, m.growth.analystRev].filter(isNum);
  const gN = gNow.length ? median(gNow) : null;
  const slowed = isNum(gThen) && isNum(gN) && gThen > 0.05 && gN < gThen * 0.6;
  const why = slowed ? `excluido del valor central: cuando cotizaba a ese múltiplo crecía un ${(gThen * 100).toFixed(1).replace('.', ',')} % anual y ahora un ${(gN * 100).toFixed(1).replace('.', ',')} %` : '';
  // Tope: un múltiplo histórico no puede superar 1,5 veces la mediana actual de competidores ni un máximo absoluto
  // (PER 35×, EV/EBITDA 25×, EV/FCF 35×). Evita valorar a una empresa ya gigante con múltiplos de su etapa temprana.
  const CAP = { pe: 35, eve: 25, evf: 35 };
  const capOf = (kind) => Math.min(CAP[kind], kind === 'pe' && isNum(peerPE) ? peerPE * 1.5 : kind === 'eve' && isNum(peerEVE) ? peerEVE * 1.5 : Infinity);
  const H = (method, kind, multiple, calc) => {
    const cap = capOf(kind), capped = isNum(multiple) && multiple > cap;
    const mu = capped ? cap : multiple;
    return { method, multiple: mu, rawMultiple: multiple, value: calc(mu), origin: 'real · histórico propio', exclude: slowed, note: why || (capped ? `múltiplo histórico ${multiple.toFixed(1).replace('.', ',')}× topado a ${cap.toFixed(1).replace('.', ',')}×` : '') };
  };
  const rows = [
    H('PER medio 5 años', 'pe', pe5, (x) => impliedByPE(epsT, x)),
    H('PER medio 10 años', 'pe', pe10, (x) => impliedByPE(epsT, x)),
    H('EV/EBITDA medio 5 años', 'eve', eve5, (x) => impliedByEV(ebitdaT, x, m.netDebt, m.shares)),
    H('EV/FCF medio 5 años', 'evf', evf5, (x) => impliedByEV(fcfT, x, m.netDebt, m.shares)),
    { method: 'PER mediano de competidores', multiple: peerPE, value: impliedByPE(epsT, peerPE), origin: 'real · competidores (TTM)', note: peers ? '' : 'competidores aún no cargados' },
    { method: 'EV/EBITDA mediano de competidores', multiple: peerEVE, value: impliedByEV(ebitdaT, peerEVE, m.netDebt, m.shares), origin: 'real · competidores (TTM)', note: peers ? '' : 'competidores aún no cargados' },
  ];
  return rows.map((r) => ({ ...r, up: upside(r.value, m.price) }));
}

export function dividendModel(m, ke) {
  const d = m.dpsSeries;
  if (!d.length || !(m.dpsTTM > 0)) return { applicable: false, reason: 'La empresa no paga dividendo.' };
  const vals = d.map((x) => x.dps);
  const g5 = cagrN(vals, 5);
  const payout = isNum(m.T.dividendsPaid) && isNum(m.T.netIncome) && m.T.netIncome > 0 ? m.T.dividendsPaid / m.T.netIncome : null;
  const growth = isNum(g5) ? Math.min(g5, (ke || 0.08) - 0.01, 0.08) : 0.02;
  const res = ddm({ dps: m.dpsTTM, growth, ke });
  const applicable = vals.length >= 5 && isNum(payout) && payout >= 0.4 && payout < 1;
  return { applicable, reason: applicable ? '' : isNum(payout) && payout < 0.4 ? `Reparte solo el ${Math.round(payout * 100)} % del beneficio en dividendos (el resto va a recompras o reinversión): el DDM infravaloraría la empresa y no cuenta para el valor central.` : 'Historial de dividendo corto o payout > 100 %: el DDM no es fiable.', g5, growth, payout, ke, ...res, up: res && res.value ? upside(res.value, m.price) : null };
}

/** Valor intrínseco central: mediana de los métodos disponibles (DCF base pesa doble).
 * Variantes del mismo método (PER a 5 y a 10 años) no cuentan como contraste: hacen falta al menos dos FAMILIAS
 * distintas (flujos de caja, dividendos, múltiplos históricos propios, múltiplos de competidores).
 * «contrastada» = hay a la vez un método absoluto (DCF o DDM) y uno relativo (múltiplos). */
export const FAMILY_LABEL = { dcf: 'DCF', ddm: 'dividendos (DDM)', hist: 'múltiplos históricos propios', peers: 'múltiplos de competidores' };
const famOf = (method) => (/competidores/.test(method) ? 'peers' : 'hist');
export function composite(m, dcfRes, mult, ddmRes) {
  // Cada familia se reduce primero a su mediana: cuatro múltiplos propios no pueden anular al DCF (4 contra 2).
  const byFam = {}; const all = []; let methods = 0;
  const add = (f, v) => { (byFam[f] = byFam[f] || []).push(v); all.push(v); methods++; };
  // DCF: si la deuda supera al valor de la empresa, el capital vale 0 (no se descarta: cuenta como 0)
  if (dcfRes && isNum(dcfRes.perShare)) add('dcf', Math.max(0, dcfRes.perShare));
  for (const r of mult) {
    if (r.exclude || !isNum(r.value)) continue;
    if (r.value > 0) add(famOf(r.method), r.value); else if (/EV\//.test(r.method)) add(famOf(r.method), 0); // EV menos deuda neta negativo = 0
  }
  if (ddmRes && ddmRes.applicable && isNum(ddmRes.value)) add('ddm', ddmRes.value);
  const families = Object.keys(byFam);
  if (families.length < 2) return { value: null, n: methods, families, reason: methods ? `valoración insuficientemente contrastada: solo hay ${methods === 1 ? 'un método' : `${methods} variantes`} de una misma familia (${families.map((f) => FAMILY_LABEL[f]).join(', ')}); hacen falta al menos dos familias distintas` : 'Hace falta al menos dos familias de valoración distintas (DCF, dividendos, múltiplos propios o de competidores)' };
  // Una cifra por familia; el DCF pesa doble. Con 2 familias, media ponderada (con una mediana de [DCF, DCF, otra]
  // el DCF anularía del todo a la otra); con 3 o 4, mediana ponderada. El rango sale de las cifras por familia, así el
  // valor central siempre queda dentro y la fiabilidad ve la discrepancia entre familias.
  const fam = families.map((f) => ({ f, v: median(byFam[f]), w: f === 'dcf' ? 2 : 1 }));
  let v;
  if (fam.length === 2) v = (fam[0].v * fam[0].w + fam[1].v * fam[1].w) / (fam[0].w + fam[1].w);
  else { const vals = []; for (const x of fam) for (let k = 0; k < x.w; k++) vals.push(x.v); v = median(vals); }
  const fv = fam.map((x) => x.v).sort((a, b) => a - b);
  let low = fv[0], high = fv[fv.length - 1];
  if (fv.length >= 4) { low = fv[1]; high = fv[fv.length - 2]; }
  low = Math.min(low, v); high = Math.max(high, v);
  const contrasted = (byFam.dcf || byFam.ddm) && (byFam.hist || byFam.peers) ? true : false;
  return { value: v, low, high, n: methods, families, byFamily: Object.fromEntries(families.map((f) => [f, median(byFam[f])])), contrasted, mos: marginOfSafety(v, m.price), up: upside(v, m.price) };
}
export { mean };
