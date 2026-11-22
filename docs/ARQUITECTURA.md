# Arquitectura

```
index.html            Shell (barra superior, navegación, contenedor de vistas)
css/app.css           Tema oscuro/claro, móvil y escritorio, hoja de impresión (PDF)
js/
  app.js              Enrutador por hash, buscador con autocompletado, tema, contador de uso
  config.js           Claves (solo navegador), proxy, límites y TTL de caché
  store.js            Base de datos local: listas, historial, análisis, supuestos, moat, alertas, ponderaciones
  export.js           CSV, Excel (SheetJS) y PDF (impresión)
  providers/
    http.js           Caché IndexedDB con TTL, deduplicación, contador diario, errores normalizados
    fmp.js            Financial Modeling Prep (API stable) → modelo canónico
    alphavantage.js   Alpha Vantage → modelo canónico (normalizadores)
    index.js          Servicio de datos: prueba proveedores por prioridad; gather() nunca lanza
  calc/               Funciones puras (probadas en tests/)
    finance.js        CAGR, TTM, medias, desviación, máxima caída, derivados por año (ROIC, coberturas…)
    model.js          Modelo normalizado de empresa: divisas, TTM, WACC, crecimiento, dividendos
    ratios.js         Catálogo de 24 ratios: fórmula, histórico, interpretación, alerta
    valuation.js      WACC, DCF 2 etapas, sensibilidad, DDM, múltiplos, escenarios
    intrinsic.js      Supuestos con origen, DCF de la empresa, múltiplos, DDM y valor central
    alerts.js         17 reglas de anomalías
    scoring.js        9 categorías, umbrales documentados, ponderaciones
    report.js         13 preguntas y conclusión
    simulate.js       Rentabilidad histórica con DRIP y proyección
  ui/                 dom.js (formato es-ES, tablas, procedencia), charts.js (Chart.js + Lightweight Charts)
  views/              Panel, seguimiento, screener, comparador, calendario, metodología, ajustes
    company.js        Carga (≈25 peticiones en paralelo), cálculo y navegación por módulos
    tabs/             Un módulo por pestaña de la ficha
worker/               Backend opcional (Cloudflare Worker): claves como secretos, caché, CORS, SEC EDGAR
tests/                node --test; incluye fixture real de Apple
```

## Modelo canónico

Los estados financieros usan los nombres de campo de FMP (`revenue`, `netIncome`, `totalDebt`, `freeCashFlow`…). Cualquier proveedor nuevo implementa los mismos métodos (`profile`, `income`, `balance`, `cashflow`, `quote`, `pricesDaily`…) y normaliza a esos campos. Añadir un proveedor = un archivo en `providers/` y una línea en `providers/index.js`.

Cada respuesta viaja como `{ data, source, endpoint, fetchedAt, cached, provider }`; las vistas muestran esa procedencia.

## Errores

`ApiError.code`: `no_key`, `bad_key`, `premium`, `rate_limit`, `network`, `not_found`, `bad_response`. Las vistas muestran el motivo concreto y, si existe caché antigua, la sirven marcada.

## Divisas y ejercicios

- Moneda de los estados (`reportedCurrency`) ≠ moneda de cotización → se pide el par FX y se convierten importes antes de compararlos con precio/capitalización.
- Los años se identifican por `fiscalYear` del proveedor; TTM procede del endpoint TTM o de la suma de 4 trimestres consecutivos. Nunca se interpola.
