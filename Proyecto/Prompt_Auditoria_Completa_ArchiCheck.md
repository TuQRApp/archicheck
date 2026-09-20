# Prompt: Auditoría de Ingeniería de Software completa — ArchiCheck

**Qué es este documento.** El prompt que se va a mandar a 5 IAs (ChatGPT, Gemini, Copilot, Perplexity, Claude.ai), cada una por separado, sin ver esta conversación. **Todavía no se ejecutó — esto es para que el usuario lo revise y apruebe antes de mandarlo.**

**Qué reemplaza.** No es una versión de `Brief_Robustecer_Revision_Ing_SW.md` (ese brief se centraba en los hallazgos de la semana pasada — normativa mal citada, vigencia hardcodeada, etc. — como el eje de la revisión). Este documento es distinto a propósito: el eje es la **arquitectura real del proyecto completo**, no los bugs recientes. Esos bugs pueden mencionarse como ejemplo puntual, nunca como la base.

**Alcance de esta corrida**: **completo** — la primera vez que se corre esta auditoría ampliada, se audita todo. A partir de acá, cada vez que se vuelva a correr, el proceso debe preguntar qué alcance y desde cuándo (ver sección 8).

---

## 1. Qué es ArchiCheck

Herramienta de pre-validación normativa de planos de arquitectura para el mercado chileno: un arquitecto sube su proyecto (PDF vectorial o modelo BIM/IFC) y recibe, antes de presentarlo a la DOM (Dirección de Obras Municipales), un levantamiento geométrico verificable y una evaluación contra normativa chilena (OGUC, LGUC, Ley 19.300, DDU, PRC comunal). Es **un solo producto** con dos canales de ingesta alternativos (PDF 2D y BIM/IFC) que comparten motor de reglas, esquema de salida e informe final — solo la extracción geométrica diverge por formato de entrada.

Metodología base de extracción: pipeline de 4 etapas de Pablo Pizarro (2024).

---

## 2. Arquitectura completa y componentes reales

### 2.1 Frontend — portal React (canal PDF, producción)
- **React 19 + Vite 8**. Deploy: Vercel, auto-deploy desde `main` → `archicheck-xi.vercel.app`.
- **Estructura real verificada** (no de memoria — inspeccionado el código ahora): `src/App.jsx` tiene **4.636 líneas**, con decenas de funciones standalone mezclando responsabilidades muy distintas en un solo archivo: reparación/parseo de JSON (`repairJSON`, `repairAndParse`), merge de resultados de 2 modelos de IA (`mergeResults`, `mergeObs`, `compararTablas`), geometría (`centroideDeSegmentos`, `ejecutarCorte`, `ejecutarFusion`, cálculo de áreas), construcción de prompts para 2 capas de análisis (`buildPromptCapa1`, `buildPromptCapa2`), renderizado de canvas/overlay (`CanvasOverlay`, `dibujarOverlayEnCanvas`), exportación de PNG/dataset. Solo 2 componentes están extraídos a archivos propios: `src/components/CropModal.jsx` y `SelectorComuna.jsx`.
- **Hallazgo estructural, no de comportamiento**: existe `src/App.jsx.txt` (550 líneas) junto al archivo real — un duplicado o backup suelto, sin verificar si es intencional o un resto olvidado.
- **`src/normativa/`**: `estacionamientos.js`, `verificador.js`, y **`verificador.test.js`** — hay un archivo de test real (usa `vitest`, cubre reglas de COS/altura por zona con casos de límite exacto) pero **`vitest` no figura en las `devDependencies` de `package.json`** — sin verificar todavía si está instalado por otra vía o si estos tests corren en algún lado hoy.
- **Sin backend propio ni base de datos de proyectos** — todo el estado de una sesión vive en el navegador.
- **Sin `vercel.json`** en el repo — la configuración de deploy depende enteramente de lo que Vercel autodetecta o de configuración manual en su dashboard, no versionada.

### 2.2 Cloudflare Worker
- Código en un **repo separado y privado** (`archicheck-worker`, clonado localmente en esta sesión — **código completo incluido en el Anexo A**, 295 líneas `worker.js` + 40 líneas `reglas_aprendidas.js`, no queda como punto ciego en esta auditoría).
- **Verificado directo del código, no de documentación**: es un `fetch` handler único (sin router, sin framework) que recibe POST, decide Claude vs GPT-4o por un campo `modelo` del body, arma el system prompt (reglas aprendidas siempre + RAG normativo opcional si viene `ragQuery`), y hace streaming de la respuesta (SSE nativo para Claude, normalizado a formato Claude-like para GPT-4o). `reglas_aprendidas.js` es un array hardcodeado de 2 reglas (con fecha/origen/texto) inyectado siempre en el system prompt de ambos modelos.
- **Modelo Claude hardcodeado como string literal**: `"claude-sonnet-4-6"` en el body de la llamada a Anthropic — sin capa de configuración/versión centralizada.
- **CORS abierto**: `Access-Control-Allow-Origin: "*"` en todas las respuestas (incluida la de error) — cualquier origen puede llamar al Worker si conoce la URL.
- **Sin autenticación, sin rate limiting, sin validación de body** más allá de que sea POST y JSON parseable — cualquiera con la URL puede consumir las API keys del proyecto (protegidas solo por no ser públicas, no por control de acceso).
- Secrets esperados según `wrangler.toml`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (vía `wrangler secret put`, confirmado — no hay `.env` ni secrets en texto plano en el repo del Worker). `DEEPSEEK_API_KEY` no es usada por el Worker (los scripts que consultan DeepSeek corren aparte, en local).
- Manejo de errores: cada rama devuelve JSON con `error` y status 500 si falta una API key o si la llamada upstream falla — no hay reintentos, no hay logging estructurado más allá de un `console.error` puntual en el fallback de RAG.

### 2.3 Supabase (pgvector)
- Tabla `normativa_chunks`: 1.608 chunks reales verificados en vivo (OGUC 770, LGUC 244, Ley 19.300 128, DDU 185, PRC Providencia 281). Columnas: `id, fuente, codigo, titulo, texto, metadata jsonb, embedding vector(1536), updated_at`.
- Función `match_normativa()` (búsqueda por similaridad coseno, firma retrocompatible de 3 args + 6 filtros opcionales nuevos) y `articulos_por_etapa()`.
- Taxonomía de 7 dimensiones en `metadata jsonb` (tipo_edificacion, tipo_norma, ámbito/comuna/zona, etapa_pipeline, vigencia, canal, jerarquía normativa) — implementada y backfileada en las 1.608 filas.
- RLS: lectura pública (anon key), escritura solo con service key.
- Acceso real: URL del proyecto + 2 tipos de credenciales (API keys para REST/RPC, connection string de Postgres para DDL) — la conexión "Direct" de este proyecto es IPv6-only y falla desde algunos entornos; hay que usar el Session Pooler.
- **Sin verificar en esta auditoría**: políticas RLS completas más allá de la tabla `normativa_chunks` (¿hay otras tablas?), estrategia de backup/retención, límites de cuota del plan actual.

### 2.4 GitHub / control de versiones
- Repo `archicheck` (público, `TuQRApp/archicheck`) + `archicheck-worker` (privado, separado, también clonado localmente).
- **Verificado ahora, en ambos repos, vía API de GitHub (`gh`, cuenta `TuQRApp`, scope `repo`)**: ninguno tiene carpeta `.github/` — **cero CI/CD en GitHub Actions en ningún repo**. `archicheck` tiene 2 branches (`main`, `test-bugbot-codigo-muerto`); `archicheck-worker` tiene solo `main`. **`main` no tiene branch protection en ninguno de los 2 repos** (confirmado vía API, 404 = sin protección). **Un solo colaborador en `archicheck`: `TuQRApp`** (confirmado vía API) — es de verdad un proyecto de un solo desarrollador, no hay acceso de escritura de terceros que auditar.
- Único mecanismo de gate automatizado: `.githooks/pre-commit` (solo en `archicheck`), **local y opt-in** (`git config core.hooksPath .githooks`) — no bloquea nada si no está activado en la máquina de quien comitea, y nada en `archicheck-worker` tiene equivalente.
- **Sin verificar**: si "Bugbot" (nombrado en la rama `test-bugbot-codigo-muerto`) es una integración real activa o un experimento descartado.

### 2.5 Notebook de Colab (canal PDF, extracción)
- Plantilla de 7 celdas, el usuario solo edita la Celda 3. Corre en CPU. La Celda 4 es el motor de fusión geométrica determinística (`cuerpo_cerrado.py` es su espejo local testeable).
- **Limitación de infraestructura conocida**: Colab no tiene acceso al filesystem del repo (sin `git clone` ni `drive.mount`) — no puede hacer `import` de módulos del repo, por lo que valores compartidos (como umbrales normativos) se mantienen ahí como copia manual sincronizada a mano.

### 2.6 Pipeline BIM/IFC (`Fase 2/BIM/`, canal alternativo)
- Scripts Python vía `ifcopenshell` (extracción geométrica real desde entidades IFC) + `ifctester`/IDS (buildingSMART) para un subconjunto declarativo de reglas.
- Componentes: `generar_plano_pdf.py` (triangulación 3D → plano en planta), `analizar_todos.py` (extracción + aplicación de reglas), `piloto_ids_oguc.py` (piloto declarativo, cobertura menor a propósito), `generar_json_colab.py` (adapta salida al formato del portal).
- Este canal es más nuevo que el canal PDF y tiene su propia infraestructura de test (`Fase 2/Herramientas_CubiCasa5k/test_cuerpo_cerrado*.py`, `correr_revisiones.py` como orquestador).

### 2.7 Normativa — ingesta y procesamiento (`normativa/`)
- **31 scripts `.mjs`**, mayoría con prefijo `_` (diagnóstico/uso puntual: `_extraer_*`, `_idx_*`, `_debug_*`, `_test_*`) — más scripts de producción real (`indexar_normativa.mjs`, `clasificar_normativa.mjs`, `backfill_metadata.mjs`, `extraer_ddu.mjs`).
- No es un pipeline ETL formalizado con orquestación — es un conjunto de scripts independientes corridos manualmente. **Riesgo real conocido**: `indexar_normativa.mjs` apunta a un esquema de fuente distinto al que realmente pobló la base viva (770/244 filas reales vs. las 644/234 que ese script produciría) — si alguien lo corre para "recargar" sin corregir la ruta primero, regresionaría datos reales de producción. No corregido todavía.
- `Fase 2/reglas_normativas.py` es la fuente única de umbrales OGUC que consumen los pipelines CAD y BIM — con 3 `assert` de auto-consistencia.

### 2.8 Integraciones de modelos de IA
- Claude y GPT-4o corren en paralelo desde el Worker para el análisis normativo de producción.
- DeepSeek y Codex (GPT-5.3-codex) se usan para revisión de código puntual (`revisar_ing_sw_paso2.mjs` y variantes) — nunca para hechos de dominio, por una regla explícita del proyecto tras un incidente real de alucinación.
- **Sin verificar**: manejo de costos/límites de uso de las 4 APIs, si hay algún fallback si un proveedor está caído, versionado de modelos (¿qué pasa cuando OpenAI/Anthropic deprecan un modelo usado?).

---

## 3. Qué falta según el propio roadmap del proyecto (para informar el alcance de la auditoría, no como hallazgo nuevo)

Extraído de `Proyecto/Backlog_Macro.md` y `Proyecto/Diseno_Funcional_ArchiCheck.md` — gaps ya reconocidos por el propio equipo, no encontrados ahora:

- **Sin entornos dev/test/producción separados** — todo corre contra `main` → producción directo, sin staging.
- **Interfaz de carga BIM incompleta**: hoy un archivo BIM entra al análisis sin contexto declarado (tipo de edificación, comuna, obra nueva vs. ampliación) — diseño ya definido, no implementado.
- **Cobertura normativa incompleta**: LGUC/DDU/PRC más allá de OGUC y Providencia siguen con huecos reales (ver §2.3).
- **Motor de reglas determinista (P4 del roadmap) y loop de validación (P5)**: mencionados en el roadmap como fases futuras, sin confirmar estado real de avance en esta auditoría.
- **MVP de dossier completo** (más allá del análisis de un plano individual): explícitamente pospuesto hasta cerrar la Fase 2 (planos al 100%).

---

## 4. Esta auditoría REEMPLAZA a "Revisión Ing SW" — no coexiste con ella como una pieza más

"Revisión Ing SW" (`Proyecto/Diseno_Funcional_ArchiCheck.md` §3.16) es el proceso de revisión que existe hoy, con 2 pasos:

- **Paso 1 (mecánico, siempre, orquestado por `correr_revisiones.py`)**: grep dirigido de hardcodeo normativo (`verificar_hardcodeo_normativo.py`) + regresión de 24 casos fijos + property-based testing con `hypothesis` (siempre) + golden-file condicional contra 3 proyectos reales de CAD — PdV, Beauchef, Campo Lindo (solo si cambia el motor de fusión geométrica).
- **Paso 2 (DeepSeek + Codex, LLM, optativo, siempre se pregunta antes por costo real de API)**: checklist fijo de 10 puntos (corrección lógica, hardcodeo nuevo, efectos no-locales, consistencia, dato ausente vs. no cumple, nunca fallar en silencio, evidencia de umbrales, performance, robustez a variación de datos reales, trazabilidad).

**El problema real, que motiva este reemplazo**: tal como está implementado hoy, el Paso 1 está **hardcodeado a proyectos y componentes específicos** — el golden-file solo corre contra 3 proyectos CAD puntuales, y existe una implementación aparte (`revisar_con_codex.mjs`/`revisar_con_deepseek.mjs` del piloto BIM) en vez de un mecanismo genérico. Esta nueva auditoría tiene que **absorber e incluir el Paso 1 y el Paso 2 como metodología general, aplicable a cualquier parte del proyecto** (frontend, Worker, cualquiera de los 2 pipelines de extracción, normativa) — no una implementación atada a un proyecto o a BIM en particular.

**Ya hay trabajo previo real sobre esto, que hay que reusar, no re-derivar de cero**: `Proyecto/Brief_Robustecer_Revision_Ing_SW.md` (contexto completo del Paso 1/Paso 2 actuales) y, sobre todo, `Proyecto/Revision_Ing_SW_v3_Consolidado.md` — la consolidación de 5 IAs consultadas hace poco sobre cómo robustecer específicamente este mecanismo, con una lista priorizada P0/P1/P2 ya bastante madura (estado canónico PASS/FAIL/UNKNOWN, golden-file generalizado con fixtures reales, tests que demuestren que una guardia dispara de verdad, propagación de fixes a todos los consumidores, integridad de datos como capa continua, CI real, mutation testing, property-based ampliado, contract testing). **Quien responda este prompt debe leer ese documento como insumo de partida para esta sección — no proponer desde cero lo que ya está bastante resuelto ahí — y en cambio enfocarse en cómo ese diseño encaja dentro de la auditoría completa de punta a cabo que se pide acá, y cómo generalizarlo más allá del motor de reglas normativas (que fue su foco original) al resto del proyecto (frontend, Worker, integraciones).**

---

## 5. Estado real de accesos — punto de partida para la Fase 0 de la auditoría (ver §7)

La auditoría a diseñar tiene que incluir, como primer paso siempre, una verificación de qué accesos existen y cuáles faltan — no asumirlos. Estado real conocido hoy, para que quien responda parta de esto (y para que la metodología que proponga sepa qué tipo de verificación de accesos tiene sentido pedir en cada corrida futura):

**Con acceso confirmado en esta sesión:**
- Repo `archicheck` local completo (git, historial, todos los archivos del working tree).
- **Repo `archicheck-worker` también clonado localmente** (`C:\dev\Claude\archicheck-worker`, carpeta hermana de `archicheck`) — código completo en el Anexo A. `gh` CLI autenticado como `TuQRApp` con scope `repo`, así que también hay acceso de API a ambos repos de GitHub (historial, branches, issues, etc.), no solo al working tree local.
- Credenciales de Supabase (`.env.supabase.local`: URL, service key, connection string del Session Pooler) — usadas realmente en trabajo reciente.
- Credenciales de OpenAI/DeepSeek (`.env.openai.local`, `.env.deepseek.local`) para los Pasos 2/LLM.

**Sin confirmar / probablemente falta:**
- Acceso al dashboard de Cloudflare (deploy real, si los secrets `wrangler secret put` que exige `wrangler.toml` están efectivamente cargados en producción, logs/analytics del Worker corriendo).
- Acceso al dashboard de Vercel (variables de entorno configuradas ahí, dominios, logs de build/deploy, configuración que no está versionada porque no hay `vercel.json`).
- Cualquier servicio de monitoreo/analítica/logging externo, si existe (no identificado todavía — ver §6).

**Ya resuelto durante la preparación de este prompt** (no hacía falta esperar a la Fase 0 para esto): acceso a ambos repos de GitHub, tanto local como vía API (`gh`, cuenta `TuQRApp`, scope `repo`) — confirmado branch protection, colaboradores y ausencia de `.github/` en ambos (ver §2.4). Código del Worker disponible completo (Anexo A).

**Se pide explícitamente que la metodología a diseñar incluya una Fase 0 de verificación de accesos** (ver §7, ítem 0) que se corra al inicio de cada auditoría futura, no solo esta vez — porque el set de accesos disponibles puede cambiar (credenciales rotadas, nuevos colaboradores, etc.).

---

## 6. Otros componentes — pedido explícito de completar el inventario

Puede haber piezas del sistema que no quedaron cubiertas arriba. **Se pide explícitamente a quien responda que señale si identifica, a partir de lo descrito, algún componente, integración o dependencia adicional que debería auditarse** y que no esté mencionado (ej. gestión de secretos, analítica/monitoreo, algún servicio de terceros implícito en las dependencias del `package.json`, etc.) — marcarlo como hallazgo de alcance, no asumir que la lista de arriba es exhaustiva.

---

## 7. El pedido concreto

Con todo el contexto de arriba, se pide diseñar una **metodología de auditoría de ingeniería de software completa**, de punta a cabo, para ArchiCheck — no una lista de bugs a corregir, sino una metodología repetible, que además **reemplaza a "Revisión Ing SW"** (ver §4: debe absorber sus 2 pasos, generalizados a todo el proyecto). Debe cubrir, como mínimo:

0. **Verificación de accesos** (ver §5): como primer paso de cualquier corrida, confirmar qué repos/plataformas/credenciales están disponibles y reportar explícitamente qué falta antes de seguir — nunca asumir acceso ni asumir que "no se pudo verificar" equivale a "está bien".
1. **Arquitectura general**: ¿el diseño actual (monorepo frontend + Worker separado + Supabase + 2 pipelines de extracción independientes) es coherente? ¿Qué riesgos estructurales tiene la decisión de mantener el Worker en un repo separado y privado? ¿Qué riesgos tiene un `App.jsx` de 4.636 líneas sin separación de responsabilidades? Con el código del Worker adjunto (Anexo A), auditarlo con el mismo nivel de detalle que el resto, no como punto ciego.
2. **Estructura de datos — validar, no solo describir**: esquema de Supabase (`normativa_chunks` + taxonomía de 7 dimensiones), esquema del JSON de análisis/informe, el modelo de `reglas_normativas.py` (`OGUC_REGLAS`, tuplas de distinta forma para reglas de recinto vs. de elemento). Para cada uno: ¿es internamente consistente? ¿Escala a más normas/comunas/tipos de edificación sin rediseño? **Proponer cambios concretos donde la respuesta sea no** — no basta con señalar el problema.
3. **Calidad de código, revisión completa**: incluye leer `App.jsx` con el detalle necesario para evaluar su estructura real (no solo el inventario de funciones que se dio en §2.1), y el código del Worker adjunto — deuda técnica estructural, duplicación, separación de responsabilidades, cobertura de test real (incluyendo el hallazgo de `vitest` sin declarar como dependencia).
4. **Integraciones, verificación completa**: Cloudflare Worker (con código real disponible), Vercel, Supabase, GitHub, las 4 APIs de IA (Anthropic/OpenAI/DeepSeek) — auditar cada una a fondo con lo disponible, y señalar exactamente qué acceso adicional (de los listados como faltantes en §5) haría falta para completar lo que no se pueda verificar con lo que hay.
5. **Procesos de desarrollo**: ausencia de CI/CD real, ausencia de entornos separados, estrategia de branching — ¿qué es razonable para un proyecto de un desarrollador con ayuda de IA en esta etapa, sin sobre-construir infraestructura de equipo grande?
6. **Seguridad**: manejo de secrets/API keys (con el código real del Worker, confirmar de verdad cómo se gestionan, no solo lo que dice la documentación), superficie de ataque del Worker como proxy público, RLS de Supabase, cualquier riesgo de exposición de datos de proyectos de arquitectos (aunque hoy no haya base de datos de proyectos persistente).
7. **Testing/QA / "Revisión Ing SW" generalizada** (ver §4): el diseño concreto de cómo el Paso 1 y el Paso 2 actuales se convierten en una metodología aplicable a todo el proyecto, integrando lo ya consolidado en `Revision_Ing_SW_v3_Consolidado.md` en vez de repetirlo. **Incluir además un mecanismo de "aprendizaje compuesto" portable**: hoy el conocimiento acumulado de cada revisión/hallazgo real vive casi todo en la memoria privada de Claude (entre sesiones) y disperso en el roadmap — invisible para otra IA consultada, para un cofounder, o para quien abra el repo sin esa memoria. Diseñar un artefacto real del repo (ej. una carpeta versionada con un archivo por hallazgo/lección real: qué pasó, por qué, qué se corrigió, con cita de fuente igual que ya exige `reglas_normativas.py` para citas normativas) que el propio Paso 1/Paso 2 generalizado consulte y alimente en cada corrida — para que un hallazgo de hoy no se vuelva a re-descubrir de cero en 3 meses, sin depender de que la memoria de una IA en particular siga disponible. (Inspirado en el patrón `/ce-compound` de [compound-engineering-plugin](https://github.com/everyinc/compound-engineering-plugin) — se adopta solo esta idea puntual, no el plugin completo: ese framework es para el loop diario de desarrollo de un equipo multi-plataforma, no para esta auditoría ni para el proceso ya afinado de ArchiCheck.)
8. **Priorización**: dado todo lo anterior, qué se auditaría primero, y por qué — considerando que esto se va a ejecutar en fases, no todo a la vez.

**Formato de respuesta esperado**: una metodología estructurada y accionable — no una introducción genérica de qué es una auditoría de software. Priorizada. Cada punto marcado explícitamente como uno de estos 3 estados, igual que se le pide a esta misma respuesta que audite el proyecto:
- **SIN VERIFICAR** — afirmación hecha sin poder confirmarla contra el código/datos reales del proyecto.
- **SIN DEFINIR** — reconocido como relevante, sin propuesta concreta todavía.
- **PENDIENTE** — propuesta concreta, implementable, pendiente de ejecutar.

---

## 8. Mecanismo permanente: alcance configurable en cada corrida futura

A partir de esta versión, cada vez que se vuelva a correr esta auditoría ampliada de "Revisión Ing SW", el proceso debe **preguntar primero** al usuario: (a) qué alcance quiere esta vez (completo, o solo ciertos componentes/áreas), y (b) desde cuándo (todo el historial, o solo cambios desde la última corrida). Esta primera corrida es alcance completo por decisión explícita del usuario — no repetir automáticamente ese alcance en corridas futuras sin preguntar.

---

## Anexo A — Código real del Worker (`archicheck-worker`)

Repo completo (`TuQRApp/archicheck-worker`, privado), 3 archivos relevantes + `wrangler.toml`.

### `wrangler.toml`
```toml
name = "archicheck-worker"
main = "worker.js"
compatibility_date = "2025-01-01"

# El frontend se despliega en Vercel — el Worker solo maneja API requests
# assets apunta a public/ (carpeta vacía) para no subir node_modules de archicheck
assets = { directory = "./public" }

# Secrets (agregar via: wrangler secret put NOMBRE)
# ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY
```

### `package.json`
```json
{
  "dependencies": {
    "wrangler": "^4.85.0"
  }
}
```

### `reglas_aprendidas.js` (40 líneas, completo)
```javascript
// Reglas aprendidas de casos reales validados por arquitectos (ground truth manual).
// Se inyectan siempre como parte del system prompt, tanto para el análisis
// geométrico/semántico del notebook (Celda 4) como para el análisis normativo
// del dossier en la web — ambos pasan por este mismo worker.
//
// Cómo agregar una regla nueva: cada vez que un ground truth revele un patrón
// de error o una convención específica de este tipo de proyectos, agregar una
// entrada acá. No reemplaza el ground truth (que sigue siendo la fuente para
// medir recall/precisión) — esto es lo que se le devuelve al modelo para que
// no repita el mismo error la próxima vez.

export const REGLAS_APRENDIDAS = [
  {
    fecha: "2026-07-22",
    origen: "Ground truth Plaza Pedro de Valdivia (Nivel 1)",
    regla:
      "Una línea segmentada/discontinua en el plano puede representar una viga estructural, no un muro. No asumas automáticamente que toda línea discontinua es un muro o límite de recinto — verifica el contexto (rótulos cercanos, tipo de trazo) antes de clasificarla.",
  },
  {
    fecha: "2026-07-22",
    origen: "Ground truth Plaza Pedro de Valdivia (Nivel 1 y Nivel 2)",
    regla:
      "En proyectos de este tipo (locales comerciales/oficinas pequeñas), 'salida de emergencia' generalmente no tiene un símbolo gráfico propio y distinto en el plano — corresponde funcionalmente a las puertas que dan directo al exterior del edificio. Al identificar salidas de emergencia, buscá puertas exteriores en vez de un ícono específico. No asumas que un nivel sin puertas exteriores directas (ej. un piso alto accesible solo por escalera interna) tiene salidas de emergencia propias.",
  },
];

/**
 * Construye el bloque de reglas aprendidas para el system prompt. Vacío si no hay reglas.
 * `origen`/`fecha` son metadata de trazabilidad para quien mantiene este archivo (de qué
 * caso salió la regla) — no viajan al prompt: este bloque se inyecta en TODO análisis,
 * de cualquier comuna o proyecto, y el nombre de un caso de prueba puntual no le aporta
 * nada al modelo ni debería aparecer en el análisis de un proyecto ajeno.
 */
export function buildReglasAprendidasSystem() {
  if (!REGLAS_APRENDIDAS.length) return "";

  const bloque = REGLAS_APRENDIDAS.map((r) => `- ${r.regla}`).join("\n");

  return `INSTRUCCIÓN: Las siguientes son reglas aprendidas de casos reales validados por arquitectos. Aplicalas al interpretar el plano y al analizar el expediente:\n\n${bloque}`;
}
```

### `worker.js` (295 líneas, completo)
```javascript
import { buildReglasAprendidasSystem } from "./reglas_aprendidas.js";

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Metodo no permitido" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const CORS = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    };
    const CORS_JSON = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };

    try {
      const body  = await request.json();
      const modelo = body.modelo || "claude";

      // ── Reglas aprendidas: siempre, sin depender de ragQuery ───────────────
      // Estas reglas vienen de ground truth validado por arquitectos (ver
      // reglas_aprendidas.js) y deben llegar tanto al análisis geométrico/
      // semántico del notebook (Celda 4) como al análisis normativo del dossier —
      // ambos pasan por este mismo worker, ninguno envía ragQuery necesariamente.
      let normativaSystem = buildReglasAprendidasSystem();

      // ── RAG: recuperar normativa relevante ────────────────────────────────
      // RAG solo si el frontend envía ragQuery explícito.
      // No usar el mensaje del usuario como fallback: cuando el payload contiene imágenes
      // el "user content" es el buildPrompt instructivo (>4 KB), no una query semántica,
      // y el system RAG degrada el análisis estructurado.
      if (body.ragQuery && env.SUPABASE_URL && env.SUPABASE_KEY && env.OPENAI_API_KEY) {
        try {
          const chunks = await queryNormativa(body.ragQuery, env, 25);
          const normativaBlock = buildNormativaSystem(chunks);
          if (normativaBlock) {
            normativaSystem = normativaSystem
              ? `${normativaSystem}\n\n---\n\n${normativaBlock}`
              : normativaBlock;
          }
        } catch (ragErr) {
          console.error("RAG error:", ragErr.message);
        }
      }

      // ── GPT-4o ────────────────────────────────────────────────────────────
      if (modelo === "gpt4o") {
        if (!env.OPENAI_API_KEY) {
          return new Response(JSON.stringify({ error: "OPENAI_API_KEY no configurada" }), {
            status: 500, headers: CORS_JSON,
          });
        }

        const openaiMessages = [];
        if (normativaSystem) {
          openaiMessages.push({ role: "system", content: normativaSystem });
        }
        openaiMessages.push(
          ...(body.messages || []).map(msg => ({
            role: msg.role,
            content: Array.isArray(msg.content)
              ? msg.content.map(item => {
                  if (item.type === "image") {
                    return {
                      type: "image_url",
                      image_url: {
                        url: `data:${item.source.media_type};base64,${item.source.data}`,
                        detail: "high",
                      },
                    };
                  }
                  return { type: "text", text: item.text };
                })
              : msg.content,
          }))
        );

        const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: 32000,
            stream: true,
            messages: openaiMessages,
          }),
        });

        if (!openaiResp.ok) {
          const errText = await openaiResp.text();
          return new Response(JSON.stringify({ error: errText }), {
            status: 500, headers: CORS_JSON,
          });
        }

        const { readable, writable } = new TransformStream();
        const writer  = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        (async () => {
          const reader = openaiResp.body.getReader();
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === "data: [DONE]") continue;
                if (!trimmed.startsWith("data: ")) continue;
                try {
                  const evt  = JSON.parse(trimmed.slice(6));
                  const text = evt.choices?.[0]?.delta?.content;
                  if (text) {
                    const normalized = `data: ${JSON.stringify({
                      type: "content_block_delta",
                      delta: { type: "text_delta", text },
                    })}\n\n`;
                    await writer.write(encoder.encode(normalized));
                  }
                } catch (_) { /* chunk parcial */ }
              }
            }
          } finally {
            writer.close();
          }
        })();

        return new Response(readable, { headers: CORS });
      }

      // ── Claude (default) ──────────────────────────────────────────────────
      if (!env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), {
          status: 500, headers: CORS_JSON,
        });
      }

      const claudeBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 32000,
        stream: true,
        messages: body.messages,
      };
      if (normativaSystem) {
        claudeBody.system = normativaSystem;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(claudeBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(JSON.stringify({ error: errText }), {
          status: 500, headers: CORS_JSON,
        });
      }

      return new Response(response.body, { headers: CORS });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};

// ── RAG helpers ───────────────────────────────────────────────────────────────

/** Extrae texto del último mensaje del usuario para usar como query RAG */
function extractQueryText(messages) {
  if (!messages) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") return msg.content.substring(0, 2000);
    if (Array.isArray(msg.content)) {
      const textItem = msg.content.find(c => c.type === "text");
      if (textItem?.text) return textItem.text.substring(0, 2000);
    }
  }
  return "";
}

/** Genera embedding y consulta Supabase match_normativa */
async function queryNormativa(queryText, env, count = 25) {
  const supaHdr = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
  };

  // Embedding
  const embResp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: queryText }),
  });
  if (!embResp.ok) throw new Error(`OpenAI embedding ${embResp.status}`);
  const embedding = (await embResp.json()).data[0].embedding;

  // Búsqueda semántica principal
  const supaResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_normativa`, {
    method: "POST",
    headers: supaHdr,
    body: JSON.stringify({ query_embedding: embedding, match_count: count }),
  });
  if (!supaResp.ok) throw new Error(`Supabase ${supaResp.status}: ${await supaResp.text()}`);
  const chunks = await supaResp.json();

  // Fallback PRC-PRV: si el resultado principal no trajo zonas PRC, buscar directamente
  // (el índice IVFFlat puede desviar la búsqueda lejos de las zonas PRC)
  const hasPRC = Array.isArray(chunks) && chunks.some(c => c.fuente === "PRC-PRV");
  if (!hasPRC && env.SUPABASE_URL) {
    try {
      const prcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_normativa`, {
        method: "POST",
        headers: supaHdr,
        body: JSON.stringify({ query_embedding: embedding, match_count: 8, fuentes: ["PRC-PRV"] }),
      });
      if (prcResp.ok) {
        const prcChunks = await prcResp.json();
        if (Array.isArray(prcChunks) && prcChunks.length > 0) {
          return [...(Array.isArray(chunks) ? chunks : []), ...prcChunks];
        }
      }
    } catch (_) { /* PRC fallback no es crítico */ }
  }

  return chunks;
}

/** Construye el bloque de normativa para el system prompt */
function buildNormativaSystem(chunks) {
  if (!chunks || chunks.length === 0) return "";

  const articulos = chunks
    .filter(c => c.similarity > 0.45)
    .map(c => {
      // DDU: "DDU-172-s3" → citar como "[DDU 172]" (número de circular, no sección interna)
      let ref;
      if (c.fuente === "DDU") {
        const m = c.codigo?.match(/^DDU-(\d+)-/);
        ref = m ? `[DDU ${m[1]}]` : `[${c.codigo}]`;
      } else {
        ref = c.codigo ? `[${c.codigo}]` : "";
      }
      const tit = c.titulo ? ` ${c.titulo}` : "";
      return `${ref}${tit}\n${c.texto}`;
    })
    .join("\n\n---\n\n");

  if (!articulos) return "";

  return `INSTRUCCIÓN: La siguiente normativa oficial fue recuperada por ArchiCheck. \
Cuando respondas, cita preferentemente estos artículos usando sus códigos exactos entre corchetes. \
Para DDU usa espacio: [DDU 447] no [DDU-447]. No añadas disclaimers sobre acceso o vigencia.

NORMATIVA RECUPERADA:

${articulos}`;
}
```
