# Investment Intelligence Pro

Plataforma web de análisis fundamental, financiero y de valoración intrínseca de empresas cotizadas, con datos reales.

**App:** https://carlosgomezs.github.io/investment-intelligence-pro/

> Herramienta de análisis. No es asesoramiento financiero ni una recomendación de compra o venta.

## Qué hace

| Módulo | Contenido |
|---|---|
| Buscador global | Nombre, ticker o ISIN; sugerencias desde 2 letras con logotipo, bolsa, país y cotización; navegación con teclado (`/` para enfocar); historial |
| Ficha de empresa | Capitalización, EV, acciones, divisa, rango 52 semanas, variación 1D a 10A, próxima publicación de resultados y enlaces a SEC EDGAR / CNMV / ESMA |
| Cotización | Gráfico interactivo de 1D a máximo, lineal/log/rentabilidad %, comparación con índices, volumen, dividendos y splits, volatilidad y máxima caída |
| Estados financieros | Resultados, balance y flujos: anual, trimestral y TTM móvil (sin interpolar), variación interanual, gráficos de cualquier partida, CSV y Excel |
| Ratios | 24 ratios con valor actual, histórico, medias 5/10 años, mediana de competidores, interpretación, alertas y lectura conjunta |
| Crecimiento y calidad | CAGR 1/3/5/10 de ventas, beneficio, BPA, FCF; márgenes; ROIC; productividad del capital; orgánico vs. adquisiciones; deuda; dilución |
| Deuda y solvencia | Estructura, corto/largo plazo, coste medio, coberturas, apalancamiento, liquidez, riesgo de refinanciación y puntuación razonada |
| Valoración | DCF editable (5/10 años, WACC por CAPM, valor terminal), sensibilidad WACC × g, escenarios, múltiplos históricos y de competidores, DDM, margen de seguridad |
| Dividendos | Historial completo, DPA anual, rentabilidad histórica, CAGR, payout sobre beneficio y FCF, continuidad, recortes, próximas fechas |
| Competidores | Detección automática + lista editable, tabla comparativa, gráficos y mejor empresa por pilar |
| Ventajas competitivas | Indicadores cuantitativos de moat, segmentación, amenazas y evaluación cualitativa guiada (entra en el scoring) |
| Noticias y eventos | Noticias clasificadas (tema y hecho/previsión/opinión), notas de prensa, documentos SEC, resultados trimestrales con sorpresa |
| Analistas e insiders | Estimaciones, precios objetivo, recomendaciones y revisiones, operaciones de directivos, participación institucional |
| Alertas y riesgos | 17 reglas de detección de anomalías cuantificadas + alertas de valoración personales |
| Scoring | 0-100 en 9 categorías con fórmulas y umbrales visibles, datos faltantes listados y ponderaciones configurables |
| Informe final | 13 preguntas respondidas con datos, conclusión en 5 categorías, argumentos a favor y en contra, exportación a PDF |
| Simulador | Rentabilidad histórica con y sin reinversión de dividendos vs. S&P 500; proyección a 5-10 años por escenarios |
| Extras | Screener en dos fases con filtros de calidad/valoración y presets, comparador de empresas y sectorial, calendario de resultados y dividendos, seguimiento con listas, historial de análisis, copia de seguridad |

## Puesta en marcha

1. Consigue una clave gratuita de **[Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs/pricing)** (principal) y, opcionalmente, de **[Alpha Vantage](https://www.alphavantage.co/support/#api-key)** (respaldo).
2. Abre la app → **Ajustes** → pega las claves → **Probar conexión**.

Las claves se guardan solo en tu navegador (`localStorage`). Nunca se suben al repositorio.

### Qué cubre cada plan

| Proveedor | Gratis | Requiere plan de pago |
|---|---|---|
| FMP | 250 peticiones/día; empresas de EE. UU.; estados anuales, ratios, perfil, cotización, estimaciones, dividendos | Trimestrales, TTM, intradía, noticias, institucionales y cobertura internacional completa (según plan) |
| Alpha Vantage | 25 peticiones/día; perfil, estados, cotización diaria, dividendos, resultados, noticias | Más peticiones e históricos completos |

Cuando un dato no está en tu plan, la app lo dice y no lo estima. Un análisis completo consume unas 25 peticiones (se guardan en caché 24 h).

## Modo seguro (backend)

Una web estática no puede esconder claves. Para guardarlas en un servidor, despliega el proxy incluido:

```bash
cd worker
npx wrangler login
npx wrangler secret put FMP_KEY
npx wrangler secret put AV_KEY     # opcional
npx wrangler deploy
```

Pon la URL resultante en **Ajustes → URL del backend proxy**. El Worker solo acepta peticiones de tu dominio de GitHub Pages, cachea las respuestas, limita peticiones por IP y da acceso a SEC EDGAR.

## Desarrollo

Sin dependencias ni compilación: módulos ES nativos.

```bash
python3 -m http.server 8000     # http://localhost:8000
npm test                        # pruebas de cálculo (Node 20+)
```

Estructura y modelo de datos: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Fórmulas y limitaciones: pestaña **Metodología** de la app.

## Despliegue

GitHub Pages desde la rama `main`, carpeta raíz. Cada `git push` publica la nueva versión.
