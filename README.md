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

La app combina **siete fuentes gratuitas** y reparte las consultas entre ellas para que no te quedes sin poder buscar. Con una sola clave ya funciona; cuantas más añadas, más empresas cubres.

| Fuente | Clave gratis | Límite | Cobertura | Para qué la usa la app |
|---|---|---|---|---|
| [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs/pricing) | Sí | 250/día | EE. UU. | Estados, ratios históricos, estimaciones, DCF, insiders, screener |
| [Finnhub](https://finnhub.io/register) | Sí | 60/min, sin tope diario | EE. UU. | Cotización, perfil, ratios actuales, competidores, recomendaciones, noticias, calendario |
| [Twelve Data](https://twelvedata.com/register) | Sí | 800/día | EE. UU. y divisas | Histórico de precios, cotización, tipos de cambio |
| [ROIC.AI](https://www.roic.ai/api) | Sí | 5/min | Mundial (2 años) | Perfil, precios y estados de empresas de fuera de EE. UU. |
| SEC EDGAR | No hace falta | Sin tope diario | Registradas en la SEC (incl. ASML, TSMC, Santander…) | Estados anuales oficiales completos, documentos |
| filings.xbrl.org (ESEF) | No hace falta | Sin tope diario | Cotizadas europeas | Cuentas anuales oficiales IFRS |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | Sí | 25/día | Varias | Último respaldo |

1. Consigue las claves que quieras (todas gratis, sin tarjeta).
2. Abre la app → **Ajustes** → pégalas → **Probar todas**.

Las claves que escribas en Ajustes se guardan solo en tu navegador. Además, la publicación automática (GitHub Actions) puede leerlas de los secretos del repositorio:

- **Modo seguro (recomendado):** si añades los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, la Action publica el Worker con tus claves como secretos del Worker y la web solo lleva la dirección del Worker. Las claves no aparecen en la web.
- **Modo sencillo:** sin Cloudflare, las claves de los secretos se escriben en `js/env.js` y **quedan visibles para cualquiera que mire el código de la web publicada** (pueden gastarte la cuota). Nunca se guardan en el repositorio.

### Cómo evita quedarse sin cuota

- Cotizaciones, precios y búsqueda van primero a las fuentes sin tope diario (Finnhub, Twelve Data, SEC).
- FMP se reserva para lo que solo da FMP.
- Una fuente que ha gastado el 70 % de su cuota diaria pasa al final de la cola.
- Si una fuente responde «plan de pago» para una empresa, no se le vuelve a preguntar por ella durante 3 días.
- Todo se guarda en caché (24 h fundamentales, 6 h precios, minutos las cotizaciones). Al agotar una cuota se sirve la caché.
- Las fuentes con límite por minuto (ROIC.AI, Twelve Data) se espacian solas para no recibir errores.

## Backend gratuito (Cloudflare Worker) — recomendado

Activa SEC EDGAR y ESEF (que no admiten llamadas directas desde el navegador), guarda las claves en el servidor y cachea las respuestas para todos tus dispositivos.

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up).
2. En un ordenador con Node instalado:

```bash
git clone https://github.com/CarlosGomezS/investment-intelligence-pro
cd investment-intelligence-pro/worker
# edita wrangler.toml: pon tu email en SEC_USER_AGENT
npx wrangler login
npx wrangler secret put FMP_KEY        # pega cada clave que tengas
npx wrangler secret put FINNHUB_KEY
npx wrangler secret put TD_KEY
npx wrangler secret put ROIC_KEY
npx wrangler secret put AV_KEY
npx wrangler deploy
```

3. Copia la URL que te da (`https://iip-proxy.<tu-usuario>.workers.dev`) en **Ajustes → Backend proxy**.

El plan gratuito de Workers da 100.000 peticiones al día, de sobra para uso personal.

## Desarrollo

Sin dependencias ni compilación: módulos ES nativos.

```bash
python3 -m http.server 8000     # http://localhost:8000
npm test                        # pruebas de cálculo (Node 20+)
```

Estructura y modelo de datos: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Fórmulas y limitaciones: pestaña **Metodología** de la app.

## Despliegue

GitHub Pages desde la rama `main`, carpeta raíz. Cada `git push` publica la nueva versión.

## Métodos de inversión (`#/metodos`)

Desplegable con cinco métodos aplicados con sus reglas publicadas: Buffett (foso con cocodrilos: rentabilidad del capital sostenida, poca deuda, beneficios y caja constantes, sin dilución y margen de seguridad ≥ 25 %), Graham (los 7 criterios del inversor defensivo, número de Graham y venta al +50 % o a los 2 años), Greenblatt (fórmula mágica: EBIT/EV y EBIT/(capital circulante + activo fijo), excluye financieras y eléctricas, rotación anual), Lynch (PEGY = PER / (crecimiento del BPA + dividendo)) y Piotroski (F-Score ≥ 8 en el 20 % más barato por P/VC). Ordena el universo elegido por nota y muestra las 10 primeras con entrada y objetivo según el método. El «cocodrilo» técnico (Alligator de Bill Williams: SMMA 13/8, 8/5, 5/3 del precio mediano y fractales) da el estado de la tendencia, la entrada por rotura de fractal y el stop técnico. Si un método no fija stop u objetivo, la app lo dice en vez de inventarlo.
