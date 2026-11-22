// Pistas por símbolo (nombre, ISIN, país) que aprenden los proveedores al cargar el perfil.
// Las usan los proveedores que buscan por nombre o ISIN (SEC con sufijos de bolsa, ESEF, ROIC.AI).
const H = new Map();
export function setHint(sym, info) { if (!sym || !info) return; const cur = H.get(sym) || {}; H.set(sym, { ...cur, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v)) }); }
export const hint = (sym) => H.get(sym) || null;
