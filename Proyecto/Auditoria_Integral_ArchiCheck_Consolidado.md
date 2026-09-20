# Auditoría Integral de ArchiCheck — metodología consolidada de 5 IAs

**Qué es este documento.** Consolidación de las 5 respuestas a `Prompt_Auditoria_Completa_ArchiCheck.md` (Claude, Perplexity, Gemini, ChatGPT, Copilot — cada una en su propia sesión, sin ver esta conversación ni las respuestas de las otras). Nada de lo que sigue está ejecutado — es la síntesis para que el usuario revise, ajuste y de su OK antes de lanzar la primera corrida real.

**Nota sobre las fuentes, por transparencia.** Claude, Perplexity, Gemini y ChatGPT respondieron con profundidad comparable: cada hallazgo está anclado a una línea de código, un archivo o un dato concreto del prompt (el CORS abierto del Worker, `App.jsx` de 4.636 líneas, las tuplas heterogéneas de `reglas_normativas.py`, etc.). **Copilot, en su 3ª versión** (las 2 primeras respondieron a un prompt condensado que no era el real, ver historial de esta sesión), sí quedó grounded en los hechos reales pero se mantuvo en un nivel más esquelético — un runbook de 18 fases con "Componentes obligatorios" y "Resultado obligatorio" por fase, sin bajar a propuestas de código concretas como las otras 4. Se usa igual acá, principalmente como aporte a la **estructura de fases** (§10), no como fuente de recomendaciones técnicas específicas.

---

## 1. La pregunta que unifica todo — formulada mejor por Copilot

De las 5 respuestas, la que mejor condensa el objetivo real de esta auditoría es la pregunta rectora de Copilot v3:

> **¿Puede ArchiCheck crecer, mantenerse y producir resultados normativos confiables sin depender de conocimiento implícito, componentes frágiles o configuraciones imposibles de verificar?**

Las otras 4 llegan al mismo lugar por caminos distintos (Perplexity: "una auditoría de ingeniería no reemplaza validación jurídica, pero SÍ audita la trazabilidad de esos datos como software"; ChatGPT: separar tajantemente "lo que el documento afirma" de "lo que esta corrida verificó de forma independiente"). **Consenso 5/5**: esta auditoría existe para reducir dependencia de conocimiento tácito (de una persona o de una sesión de IA), no solo para cazar bugs.

---

## 2. Fase 0 — Verificación de accesos: ya ejecutada parcialmente, con resultado real

Las 5 coincidieron en que la Fase 0 es obligatoria y se repite en cada corrida (esto ya estaba pedido en el prompt, así que no es sorpresa que converjan — el valor real está en el detalle de checklist que cada una agregó). Estado real, ya confirmado durante la preparación del prompt (no hace falta re-verificarlo):

| Acceso | Estado | Fuente |
|---|---|---|
| Repo `archicheck` (local + GitHub API) | ✅ Verificado | Sesión de preparación del prompt |
| Repo `archicheck-worker` (local + GitHub API) | ✅ Verificado, código completo en Anexo A | Sesión de preparación del prompt |
| Branch protection, colaboradores (ambos repos) | ✅ Verificado vía `gh api` — sin protección, 1 solo colaborador | Sesión de preparación del prompt |
| Credenciales Supabase | ✅ Disponibles (`.env.supabase.local`) | Sesión de preparación del prompt |
| Credenciales OpenAI/DeepSeek | ✅ Disponibles | Sesión de preparación del prompt |
| Dashboard Cloudflare (secrets cargados en prod, logs/analytics) | 🔴 SIN VERIFICAR | Consenso 5/5 |
| Dashboard Vercel (env vars, dominios, logs de build) | 🔴 SIN VERIFICAR | Consenso 5/5 |
| Dashboards de billing/uso de Anthropic/OpenAI/DeepSeek | 🔴 SIN VERIFICAR | Claude, Perplexity, ChatGPT |
| Notebook Colab real (no la plantilla) — permisos de edición | 🔴 SIN VERIFICAR | Claude |
| Observabilidad/monitoreo (Sentry, analytics, etc.) | 🔴 SIN VERIFICAR — probablemente no existe | Claude, Perplexity, ChatGPT, Gemini |

**Aporte específico de Perplexity, el más operativo de los 5**: propone una carpeta `auditoria/corridas/YYYY-MM-DD__alcance__sha-corto/` con `manifiesto.md`, `accesos.md`, `hallazgos.yml`, `excepciones.md` por corrida — convierte la Fase 0 en un artefacto versionado, no solo una tabla que se llena y se pierde. Vale la pena adoptarlo literal (ver §10).

---

## 3. El hallazgo con más consenso de toda la consolidación: el Worker es P0

**Consenso 4/5 (Claude, Gemini, ChatGPT, Perplexity — Copilot no bajó a este nivel de detalle) en que esto es la prioridad #1, no negociable, antes de cualquier otra cosa de esta lista:**

El código real del Worker confirma, simultáneamente:
- `Access-Control-Allow-Origin: "*"` en **todas** las respuestas, incluidos errores.
- Sin autenticación, sin rate limiting, sin validación de schema del body.
- El modelo se elige por `body.modelo` sin lista cerrada de valores permitidos.

**Consecuencia textual de ChatGPT, la más directa**: *"si la URL del Worker es conocida, un tercero puede consumir las APIs de Anthropic/OpenAI usando la infraestructura y las credenciales del proyecto"* — no es un riesgo de exposición de datos, es un riesgo económico/de disponibilidad directo (agotamiento de cuota).

**Fix consolidado, ya no hay que diseñarlo — las 4 fuentes proponen esencialmente lo mismo:**
1. Restringir `Access-Control-Allow-Origin` al dominio real de Vercel, no `*`.
2. Rate limiting nativo de Cloudflare (Claude confirma que existe en planes básicos).
3. Validación de schema del body antes de invocar cualquier proveedor upstream (`modelo` con lista cerrada, tamaño máximo de payload).
4. Opcional pero recomendado por Claude y ChatGPT: un header secreto compartido frontend↔Worker — no autenticación de usuario, solo cerrar la puerta a quien no pasa por el frontend real.
5. Errores del proveedor upstream no deben exponerse crudos al cliente (Claude y ChatGPT lo señalan igual: hoy `err.message` de Anthropic/OpenAI viaja directo a la respuesta).

**Hallazgos adicionales solo del Worker, no repetidos en otras fuentes pero verificados contra el código real:**
- Claude: duplicación de headers CORS en 3 lugares (bajo riesgo, fácil de arreglar).
- Claude: el `catch` del fallback de RAG traga el error completo (`console.error` y sigue) — el análisis continúa *sin normativa* sin que el frontend se entere de que degradó. Esto no es solo calidad de código: es un riesgo funcional real para un producto de pre-validación normativa.
- ChatGPT: falta test de contrato para el normalizador de streaming GPT-4o→formato-Claude — si OpenAI cambia su formato de streaming, se rompe en silencio.
- Gemini: propone centralizar el modelo hardcodeado (`claude-sonnet-4-6`) en una config, no en el body de la llamada.

**Estado: 🟢 PENDIENTE, P0.** No es una propuesta a diseñar — es un fix concreto y acotado, listo para implementar.

---

## 4. Arquitectura — `App.jsx`: plan de modularización, convergente en 3 de 5 fuentes

Claude, ChatGPT y Copilot (implícito en Fase 3 de su runbook) coinciden en la misma idea estructural, con Claude dando el plan más ejecutable:

**Orden de extracción propuesto (de menor a mayor riesgo, empezando por funciones puras sin estado de React):**
1. `src/lib/jsonRepair.js` ← `repairJSON`, `repairAndParse`
2. `src/lib/geometry.js` ← `centroideDeSegmentos`, `ejecutarCorte`, `ejecutarFusion`, cálculo de áreas
3. `src/lib/resultMerge.js` ← `mergeResults`, `mergeObs`, `compararTablas`
4. `src/lib/promptBuilders.js` ← `buildPromptCapa1`, `buildPromptCapa2`
5. `src/components/CanvasOverlay.jsx` ← `CanvasOverlay`, `dibujarOverlayEnCanvas` (toca DOM/canvas, más riesgo — ir después de las puras)
6. `src/lib/exportUtils.js` ← exportación PNG/dataset

**Regla de seguridad del refactor, aportada por Perplexity — la más rigurosa de las 3**: antes de extraer, crear pruebas de caracterización de entradas/salidas del comportamiento actual. Extraer una responsabilidad por cambio, con API explícita y tests propios, **sin modificar el resultado observable**. No es una reescritura — es mover código verificando que nada cambia.

**Consenso 5/5 explícito, vale la pena subrayarlo porque contradice el instinto obvio**: **ninguna de las 5 recomienda empezar por acá.** Gemini y ChatGPT lo dicen textualmente — primero cerrar la seguridad del Worker (§3) y la línea base de testing/CI (§8), recién después modularizar, de forma incremental. `App.jsx` es P1, no P0.

`src/App.jsx.txt` (550 líneas, duplicado suelto): las 5 lo marcan como hallazgo de higiene — decidir si se borra o se documenta por qué existe, sin dejarlo ambiguo.

---

## 5. Estructura de datos — 3 focos concretos, consenso 3-4/5 en cada uno

### 5.1 `reglas_normativas.py`: tuplas heterogéneas → tipos nombrados
**Consenso: Claude, ChatGPT, Perplexity.** El riesgo real (no hipotético): tuplas de forma distinta para reglas de recinto vs. elemento son fuente clásica de bugs de indexación silenciosos en Python (acceder `regla[2]` esperando un campo y obtener otro, sin error). Ya hay evidencia de que esto casi pasó — los 3 `assert` de auto-consistencia existen justamente porque se encontró ese riesgo antes.

Propuesta convergente: migrar a `@dataclass`/`NamedTuple` con dos tipos explícitos (`ReglaRecinto`, `ReglaElemento`), o el modelo más completo de Perplexity: un tipo único con campos `id, categoria, aplica_a, condicion, operador, umbral, unidad, excepciones, fuente, vigencia, canal, evidencia_requerida, estado`. Un acceso al campo equivocado falla en desarrollo (con `mypy`, ya evaluado antes y pendiente de decidir), no produce un número normativo incorrecto en producción.

### 5.2 Supabase — validar, no asumir
**Consenso 5/5** en que lo documentado es plausible pero no está confirmado contra la base viva. Perplexity y ChatGPT aportan el detalle más accionable: las 7 dimensiones de `metadata jsonb` necesitan un schema canónico con valores enumerados — hoy nada impide que `"Providencia"` y `"providencia"` convivan y rompan un filtro en silencio. Ambos proponen lo mismo: definir el schema, agregar un test/constraint que rechace metadata inválida.

**Hallazgo real ya confirmado, no hipotético (Claude, citando el propio código del Worker)**: el comentario en `worker.js` sobre el fallback PRC-PRV documenta que el índice IVFFlat "puede desviar la búsqueda lejos de las zonas PRC" — es evidencia de un límite ya alcanzado con 1.608 chunks. Propuesta: evaluar HNSW en vez de IVFFlat antes de escalar a más comunas, o generalizar el patrón de fallback-por-fuente que ya existe para PRC.

**Benchmark de calidad del RAG — consenso Perplexity + ChatGPT + Claude**: el umbral `similarity > 0.45` hoy es una decisión sin medir. Construir un corpus curado de consultas reales (norma general, comuna/zona, consulta ambigua, consulta sin cobertura) con resultado esperado, y medir `recall@k`/`precision@k` antes de seguir ajustando el umbral a ojo.

### 5.3 `indexar_normativa.mjs` — bomba de tiempo ya identificada, no un hallazgo nuevo
**Consenso 5/5**, y las 5 coinciden en que esto se corrige ya, independiente del resto de la auditoría: el script apunta a un esquema de fuente distinto (644/234 filas) al que realmente pobló la base viva (770/244). Perplexity da el fix más completo: modo `--dry-run` obligatorio, comparar conteo esperado contra un snapshot versionado, **abortar** si no coincide — no dejar que "recargar" pise datos de producción en silencio.

---

## 6. Seguridad, más allá del Worker

- **RLS de Supabase más allá de `normativa_chunks`** (Claude, Perplexity): confirmar si existen otras tablas sin el mismo cuidado de RLS que la tabla ya auditada — esto es ejecutable ya, con las credenciales disponibles, no requiere acceso nuevo.
- **Cadena de suministro** (Perplexity, ChatGPT, Copilot): sin CI, tampoco hay `npm audit` ni escaneo de dependencias en ningún repo — SBOM básico como línea base.
- **Privacidad de planos** (Perplexity, la más completa en este punto): los PDF/IFC/imágenes de proyectos de arquitectos viajan hoy a Anthropic y OpenAI como parte del análisis — falta confirmar políticas de retención específicas del tipo de cuenta usada (individual vs. empresarial suelen diferir). Responsabilidad de quien administra esas cuentas, no verificable desde el código.
- **Amenazas específicas de IA** (Perplexity, único que lo plantea): probar defensivamente prompt injection embebida en planos/OCR — contenido no confiable que intente cambiar reglas o contaminar el RAG. Definir explícitamente qué validaciones deterministas impiden que un modelo convierta contenido no confiable en decisión normativa final.

---

## 7. Testing/QA generalizado — absorbiendo "Revisión Ing SW"

Las 5 coinciden en la premisa (ya establecida en el prompt): esta auditoría **reemplaza** a Revisión Ing SW, absorbiendo el Paso 1 (mecánico) y Paso 2 (LLM) generalizados a todo el proyecto, reusando `Revision_Ing_SW_v3_Consolidado.md` en vez de re-derivarlo.

**Diseño más concreto, de Claude:**
- Golden-file: reemplazar rutas hardcodeadas por `fixtures/<canal>/` auto-descubierto (`fixtures/cad/`, `fixtures/bim/`) — agregar un proyecto de referencia nuevo es copiar una carpeta, no tocar código.
- Extender el grep de hardcodeo normativo (hoy limitado a `normativa/`) para que también corra sobre `App.jsx`/sus módulos y sobre `worker.js` — el `"claude-sonnet-4-6"` hardcodeado es exactamente el patrón que ese mecanismo ya sabe detectar en otro dominio.
- Paso 2 genérico: un único `revisar_componente.mjs --path <ruta o diff>` en vez de implementaciones paralelas por canal (hoy solo existe para BIM).

**Aporte único de Perplexity, el más riguroso**: estados canónicos `PASS / FAIL / UNKNOWN / NOT_APPLICABLE` — `UNKNOWN` nunca cuenta como éxito. Cada guardia debe demostrar que **falla** cuando corresponde (mutation testing selectivo sobre reglas normativas, validación de payload y seguridad), no solo que no crashea.

**Matriz de pruebas por dominio (Perplexity)** — la más completa de las 5, cubre geometría PDF, BIM/IFC, reglas, RAG, Worker, frontend e ingesta, cada uno con su propia columna de unitarias/property-fuzz/fixtures/contrato/integración. Vale la pena adoptarla como plantilla de cobertura objetivo.

---

## 8. Aprendizaje compuesto — consenso 5/5, ya validado en la ronda anterior

Las 5 proponen esencialmente la misma idea (que ya estaba en el prompt, inspirada en `compound-engineering-plugin`, ver conversación previa): un artefacto versionado en el repo, no la memoria de una IA. Diseño más completo, combinando Claude + Perplexity + Gemini:

```
conocimiento/
  README.md
  lecciones/
    ACH-YYYY-NNN-slug.md
  incidentes/
    ACH-YYYY-NNN-slug.md
  decisiones/
    ADR-YYYY-NNN-slug.md
  indices/
    lecciones-index.yml
```

Cada entrada: componente, fecha, síntoma, causa (confirmada o hipótesis, separadas), fuente/evidencia, impacto, fix, prueba preventiva, consumidores afectados, estado, fecha de revisión — mismo estándar de citación que el proyecto ya exige para umbrales normativos. **Regla de gobernanza aportada por Perplexity**: el Paso 1 detecta cuándo un cambio P0/P1 requiere actualizar conocimiento; el Paso 2 consume las lecciones pertinentes (no todas indiscriminadamente); nunca se escribe automáticamente sin revisión humana.

---

## 9. Procesos de desarrollo — qué es proporcional para 1 desarrollador + IA

Consenso muy fuerte en no sobre-construir:

- **CI mínimo** (5/5): un workflow de GitHub Actions que corra lo que hoy es opt-in local (hardcodeo + 24 casos + `hypothesis` + `vitest` una vez arreglado) en cada push a `main`. No un pipeline elaborado.
- **Branch protection en ambos repos** (Claude, Perplexity, ChatGPT): incluso siendo el único colaborador, protege contra un push accidental o un merge automatizado por una IA sin que corran los checks.
- **Staging vía Vercel Preview deployments** (Claude, ChatGPT, Copilot): no montar infraestructura nueva — Vercel ya genera esto por branch/PR, falta adoptarlo de forma disciplinada (branch → PR → preview → merge). Para el Worker, evaluar `wrangler --env staging` en vez de probar contra el que sirve producción.
- **Explícitamente rechazado por las 5**: entornos containerizados, `develop`/`staging`/`qa`/`release` como estructura permanente, feature flags, microservicios — sobre-ingeniería para el tamaño actual.

---

## 10. Plan de fases de ejecución — consolidado de las 5 propuestas

Fusionando el orden de Claude (4 fases), Perplexity (8 fases, la más detallada), Gemini (5 fases) y la estructura de 18 fases de Copilot como checklist de cobertura:

**Fase 1 — Contención P0 (días, no semanas)**
1. Cerrar CORS abierto + rate limiting + validación de body del Worker (§3).
2. Guard en `indexar_normativa.mjs` contra el mismatch de esquema (§5.3).
3. Confirmar en Supabase, con credenciales ya disponibles, si hay otras tablas sin el RLS de `normativa_chunks` (§6).
4. Resolver `App.jsx.txt` (§4) y arreglar `vitest` en `devDependencies` (era ya sabido, no requiere auditoría adicional).

**Fase 2 — Línea base de calidad (1-2 semanas)**
5. Workflow mínimo de GitHub Actions (Paso 1 mecánico + `vitest`) (§9).
6. Branch protection en ambos repos (§9).
7. Contrato versionado request/response/stream/error entre frontend↔Worker, con suite de contrato ejecutable (Perplexity, §3).

**Fase 3 — Datos y contratos (2-3 semanas)**
8. Schema canónico para las 7 dimensiones de `metadata jsonb` (§5.2).
9. Benchmark RAG con `recall@k`/`precision@k` (§5.2).
10. Migrar `OGUC_REGLAS` a tipos nombrados (§5.1).

**Fase 4 — Estructural, incremental**
11. Modularización de `App.jsx` empezando por funciones puras, con tests de caracterización previos (§4).
12. Generalización del Paso 1/2 de Revisión Ing SW a fixtures auto-descubiertas + script único de revisión (§7).

**Fase 5 — Inversión a mediano plazo**
13. Artefacto de aprendizaje compuesto (`conocimiento/`) (§8).
14. Evaluar HNSW vs. IVFFlat si el volumen de normativa crece (§5.2).
15. Observabilidad mínima (`request_id`, proveedor/modelo, tokens/costo, latencia) — aportado por Perplexity, sin repetir en otras fuentes pero razonable dado que hoy no existe nada de esto.

---

## 11. Componentes que ninguna auditoría previa había nombrado — inventario adicional

Consolidando los hallazgos de alcance de las 5 (pedido explícito §6 del prompt original):

- Monitoreo/analítica/error-tracking (Sentry o equivalente) — no identificado, probablemente no existe.
- `npm audit`/SBOM en ambos repos — no hay ninguno hoy.
- Permisos de edición del notebook Colab real (no la plantilla).
- Nivel de scope de las API keys de Anthropic/OpenAI (¿restringidas o de administrador de organización?) — relevante justo porque el Worker no tiene su propia autenticación (§3).
- `compatibility_date` de `wrangler.toml` (`2025-01-01`) — riesgo de deprecación de plataforma análogo al de deprecación de modelos de IA.
- Backup/retención/RPO-RTO de Supabase (Perplexity).

---

## 12. Protocolo permanente para corridas futuras

Confirmado por las 5, sin variación: cada corrida futura de esta auditoría debe preguntar primero **qué alcance** (completo o componentes específicos) y **desde cuándo** (todo el historial o desde la última corrida registrada). Esta primera corrida fue de alcance completo por decisión explícita del usuario — no se repite por defecto.

---

## 13. Próximo paso

Este documento es la síntesis — falta que el usuario lo revise, ajuste la priorización de §10 si corresponde, y confirme con qué fase se arranca. Nada de lo anterior está implementado todavía.
