// Metodología: fuentes, arquitectura, fórmulas, reglas de alerta y limitaciones conocidas.
import { card } from '../ui/dom.js?v=7feadaa0';
import { RATIOS } from '../calc/ratios.js?v=7feadaa0';

const APIS = [
  ['Financial Modeling Prep', 'Principal', 'Estados (anual/trimestral/TTM), ratios históricos, estimaciones, DCF, dividendos, insiders, screener, índices', '250 peticiones/día; sobre todo EE. UU.', 'Sí', 'https://site.financialmodelingprep.com/developer/docs'],
  ['Finnhub', 'Activo', 'Cotización, perfil, ratios actuales, competidores, recomendaciones, resultados, noticias, calendario', '60/minuto sin tope diario; EE. UU.', 'Sí', 'https://finnhub.io/docs/api'],
  ['Twelve Data', 'Activo', 'Histórico de precios (hasta 5.000 sesiones), cotización, tipos de cambio', '800/día y 8/minuto; EE. UU. y divisas', 'Sí', 'https://twelvedata.com/docs'],
  ['ROIC.AI', 'Activo (mundial)', 'Perfil, precios y estados anuales de empresas de todo el mundo', '5/minuto; 2 años de estados', 'Sí / Worker', 'https://www.roic.ai/api/v2/docs/getting-started'],
  ['SEC EDGAR', 'Activo (oficial)', 'Estados anuales XBRL de todas las empresas registradas en la SEC (también extranjeras con 20-F) y lista de documentos', 'Gratis, sin clave; exige User-Agent; sin CORS', 'Vía Worker', 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces'],
  ['filings.xbrl.org (ESEF)', 'Activo (oficial)', 'Cuentas anuales IFRS de cotizadas europeas (informes ESEF)', 'Gratis, sin clave; repositorio no exhaustivo', 'Directo o Worker', 'https://filings.xbrl.org/docs/api'],
  ['Alpha Vantage', 'Respaldo', 'Perfil, estados, cotización, dividendos, resultados, noticias', '25 peticiones/día', 'Sí', 'https://www.alphavantage.co/documentation/'],
  ['EODHD', 'Evaluado, no integrado', 'Fundamentales globales', 'Gratis: 20 peticiones/día y cada consulta de fundamentales cuesta 10', 'Sí', 'https://eodhd.com/financial-apis/'],
  ['Polygon / Massive, Nasdaq Data Link', 'Evaluados, no integrados', 'Cotizaciones de EE. UU. y conjuntos de datos', 'Fundamentales en planes de pago', 'Sí', 'https://polygon.io/docs'],
];

export function render(view) {
  view.innerHTML = `<h1 style="font-size:22px;margin-bottom:14px">Metodología y fuentes</h1>
  <div class="stack-y">
  ${card('Principios', `<ul style="margin:0;padding-left:18px;line-height:1.7">
    <li><b>No se inventan cifras.</b> Si un proveedor no da un dato, se muestra «—» o «sin dato» con la razón (plan de pago, límite, no existe). No se interpolan años ni se presentan datos anuales como trimestrales.</li>
    <li><b>Procedencia visible.</b> Cada bloque indica proveedor, endpoint y fecha de descarga. Los supuestos se etiquetan como <span class="org real">Dato real</span>, <span class="org est">Estimación</span> (analistas) o <span class="org sup">Supuesto</span> (regla de la app o del usuario).</li>
    <li><b>Cálculos propios y auditables.</b> Márgenes, ROIC, deuda neta, coberturas, CAGR, DCF, múltiplos y scoring se calculan en <code>js/calc/</code> a partir de los estados, con pruebas automáticas en <code>tests/</code>.</li>
    <li><b>Divisas.</b> Si los estados se presentan en una moneda distinta de la de cotización (p. ej. ADR), se convierten al tipo de cambio actual para ratios y valoración, y se avisa.</li></ul>`)}
  ${card('Arquitectura', `<p style="margin-top:0">Aplicación web estática (GitHub Pages) con módulos ES nativos, sin paso de compilación:</p>
    <ul style="margin:0;padding-left:18px;line-height:1.7"><li><code>providers/</code>: siete proveedores intercambiables con una interfaz común. Para cada dato hay un orden de preferencia; las fuentes sin tope diario se usan primero para cotizaciones, precios y búsqueda, y las que han gastado el 70 % de su cuota pasan al final. Si una fuente responde «plan de pago» para una empresa, no se le vuelve a preguntar por ella en 3 días.</li>
    <li><code>providers/http.js</code>: caché en IndexedDB con caducidad por tipo de dato, deduplicación de peticiones simultáneas, contador diario por proveedor y errores normalizados.</li>
    <li><code>calc/</code>: modelo normalizado de empresa, ratios, valoración, alertas, scoring, informe y simulaciones (funciones puras).</li>
    <li><code>views/</code>: interfaz por módulos. <code>store.js</code>: base de datos local (favoritos, listas, historial, análisis, supuestos).</li>
    <li><code>worker/</code>: backend opcional (Cloudflare Worker) que guarda las claves como secretos, añade caché y da acceso a SEC EDGAR.</li></ul>`)}
  ${card('Proveedores evaluados', `<div class="tablewrap"><table><thead><tr><th class="l">Proveedor</th><th class="l">Uso</th><th class="l">Datos</th><th class="l">Plan gratuito</th><th>Navegador</th></tr></thead><tbody>${APIS.map(([n, u, d, f, c, l]) => `<tr><td class="l"><a href="${l}" target="_blank" rel="noopener">${n}</a></td><td class="l">${u}</td><td class="l">${d}</td><td class="l">${f}</td><td>${c}</td></tr>`).join('')}</tbody></table></div><p class="note">Límites según la documentación pública de cada proveedor; pueden cambiar. Comprueba sus condiciones actuales antes de contratar.</p>`)}
  ${card('Ratios: fórmulas', `<div class="tablewrap"><table class="dense"><tbody>${RATIOS.map((r) => `<tr><td class="l"><b>${r.label}</b></td><td class="l"><span class="formula">${r.formula}</span></td></tr>`).join('')}</tbody></table></div>`)}
  ${card('Valoración intrínseca', `<ul style="margin:0;padding-left:18px;line-height:1.7">
    <li><b>WACC</b> = E/(E+D)·ke + D/(E+D)·kd·(1−t). <b>ke</b> = rf + β·prima (CAPM). rf: bono de EE. UU. a 10 años; prima: prima de riesgo total del país (tabla de Damodaran vía FMP); kd: intereses/deuda, media 3 años; pesos a valor de mercado.</li>
    <li><b>DCF</b>: FCF base (TTM o media 3 años) crece al ritmo elegido los años 1-5; con horizonte de 10 años, los años 6-10 convergen linealmente al crecimiento terminal. Valor terminal de Gordon: FCF<sub>n</sub>·(1+g)/(WACC−g). Valor por acción = (VP flujos + VP terminal − deuda neta) / acciones.</li>
    <li><b>Crecimiento sugerido</b>: mediana de CAGR 5a del FCF, CAGR 5a de ventas y crecimiento de ventas previsto por analistas, acotada entre −10 % y 30 %.</li>
    <li><b>Múltiplos</b>: PER medio 5 y 10 años × BPA TTM; EV/EBITDA y EV/FCF medios 5 años; PER y EV/EBITDA medianos de competidores.</li>
    <li><b>DDM</b>: Gordon con crecimiento = min(CAGR 5a del dividendo; ke − 1 p.p.; 8 %). Solo se considera fiable con 5+ años de historial y payout &lt; 100 %.</li>
    <li><b>Valor central</b>: mediana de los métodos propios (DCF base con doble peso). Objetivos de analistas y el DCF de FMP se muestran como referencia externa y no entran en el cálculo.</li>
    <li><b>Margen de seguridad</b> = (valor − precio) / valor. <b>Potencial</b> = valor / precio − 1.</li></ul>`)}
  ${card('Limitaciones conocidas', `<ul style="margin:0;padding-left:18px;line-height:1.7">
    <li>Bancos, aseguradoras y REIT: el DCF de FCF y varias métricas (deuda, margen bruto) no son apropiados; interpreta su scoring con cautela.</li>
    <li>Vencimientos de deuda año a año, crecimiento orgánico exacto y concentración de clientes solo están en las notas de los informes anuales; la app usa aproximaciones (corto/largo plazo, adquisiciones y fondo de comercio, segmentos) y enlaza los documentos.</li>
    <li>Las ventajas competitivas cualitativas (efectos de red, costes de cambio, patentes) no se pueden medir con datos financieros: la app ofrece indicadores cuantitativos y una evaluación guiada del usuario.</li>
    <li>La clasificación de noticias (tema, hecho/previsión/opinión) es automática por palabras clave del titular.</li>
    <li>Sin backend, las claves están en tu navegador: cualquiera con acceso a tu dispositivo podría verlas. Usa el Worker para el modo seguro.</li>
    <li>Las alertas de valoración se comprueban al abrir la app; no hay notificaciones con la app cerrada.</li></ul>`)}
  </div>`;
}
