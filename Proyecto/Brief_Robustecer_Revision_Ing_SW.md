# Brief técnico: robustecer "Revisión Ing SW" — para consulta a IAs externas (v2)

**Qué es este documento.** Contexto técnico completo de ArchiCheck (stack, arquitectura, componentes, modelo de datos) y, en detalle, el estado actual del proceso de revisión de calidad de software ("Revisión Ing SW"). Se pasa a distintas IAs (ChatGPT, Gemini, Copilot, Perplexity, Claude) pidiendo ayuda para **diseñar la próxima versión** de esta metodología — no una introducción genérica a testing, sino una propuesta concreta que reconozca lo que ya existe. Ver el prompt exacto en la sección 8.

**v2 (2026-09-21)**: los 4 puntos de cobertura BIM pendientes en v1 ya se cerraron, y en el camino apareció una categoría de hallazgo nueva — bugs de **datos/citación normativa**, no de código — que motivó extender "Revisión Ing SW" y descubrió fallas reales en su propia infraestructura (sección 6). v1 sigue siendo válida en arquitectura general (secciones 1-2, 4).

**Repo**: `archicheck` (público, GitHub `TuQRApp/archicheck`) + `archicheck-worker` (privado).

**Instrucción para quien responda (IMPORTANTE, leer antes de proponer)**: cualquier definición nueva de "Revisión Ing SW" que propongas debe marcar explícitamente, punto por punto, uno de estos 3 estados — nunca presentar una propuesta como si fuera un diseño cerrado:
- **SIN VERIFICAR** — una afirmación/propuesta hecha sin poder confirmarla contra datos reales de este proyecto (vos no tenés acceso a él — mismo principio que ya aplica el proyecto a DeepSeek/Codex, ver §4).
- **SIN DEFINIR** — reconocés que es relevante pero no tenés una propuesta concreta.
- **PENDIENTE** — proponés algo concreto, implementable, pero es una recomendación a implementar, no una descripción de lo que ya existe.

---

## 1. Qué es ArchiCheck

Herramienta de pre-validación normativa de planos de arquitectura para el mercado chileno: un arquitecto sube su proyecto y recibe, antes de presentarlo a la DOM (Dirección de Obras Municipales), un levantamiento geométrico verificable y una evaluación contra normativa chilena (OGUC, LGUC, Ley 19.300, DDU, PRC comunal). Metodología base: pipeline de 4 etapas de Pablo Pizarro (2024).

**Decisión de producto clave**: ArchiCheck es **un solo producto**, no dos líneas separadas. PDF (plano vectorial 2D, hoy ~95% del mercado chileno) y BIM/IFC (estudios/constructoras grandes) son **dos canales de ingesta alternativos** del mismo producto. Solo la extracción geométrica diverge por formato de entrada — el motor de reglas normativas, el esquema de salida y el informe final tienen que ser una sola cosa compartida, nunca dos implementaciones que puedan desalinearse.

---

## 2. Arquitectura y stack

```
   PDF vectorial del proyecto                    IFC (BIM) del proyecto
            │                                            │
            ▼                                            ▼
   ┌──────────────────────┐                    ┌──────────────────────┐
   │  Notebook de Colab    │                    │  Fase 2/BIM/*.py      │
   │  (PyMuPDF + OpenCV)   │  extracción        │  (ifcopenshell +      │  extracción
   │  + Claude Vision      │  determinística    │  ifctester/IDS)       │  determinística
   │  para capa semántica  │  + semántica        │  geometría 3D real    │  desde entidades
   └──────────┬────────────┘                    └──────────┬────────────┘  ya tipadas
              │ archicheck_geometrico_{...}.json                       │
              │ + PNG por página                          │ JSON de análisis
              ▼                                            │ + PDF de plano
   ┌──────────────────────┐         ┌──────────────────────┐
   │  Portal React (SPA)   │────────▶│ Cloudflare Worker    │
   │  Vercel               │  SSE    │ (proxy a Claude/GPT) │
   │  gate de revisión     │◀────────│ + RAG normativo      │
   │  gráfica del          │         └──────────┬───────────┘
   │  arquitecto (§2.5)    │                    │
   └──────────────────────┘                    ▼
                                     ┌──────────────────────┐
                                     │ Supabase (pgvector)   │
                                     │ normativa_chunks      │
                                     │ + taxonomía 7 dims    │
                                     └──────────────────────┘

              Fase 2/reglas_normativas.py — FUENTE ÚNICA de umbrales/citas OGUC,
              importada tanto por el pipeline CAD (vía _celda4_actual.py) como por
              el pipeline BIM (analizar_todos.py, piloto_ids_oguc.py)
```

### 2.1 Frontend — portal React (canal PDF, producción)
- **React 19 + Vite 8**, SPA de un solo archivo grande: `src/App.jsx` (~279 KB).
- **Deploy**: Vercel, auto-deploy desde `main` → `https://archicheck-xi.vercel.app/`. Dev local: `npm run dev` → `localhost:5174`.
- Dependencias clave: `pdfjs-dist` (PDF→imágenes, máx. 15 páginas), `html2pdf.js` + `docx` (exportación de informe).
- **Sin backend propio ni base de datos de proyectos** — todo el estado vive en el navegador (deliberado, evita costo de infraestructura en fase de validación).

### 2.2 Cloudflare Worker
- `archicheck-worker/worker.js` + `reglas_aprendidas.js`. Repo **privado** separado (`TuQRApp/archicheck-worker`).
- Proxy SSE: oculta API keys, reenvía a Anthropic y OpenAI en paralelo (Claude + GPT-4o corren sobre el mismo insumo), resuelve el RAG normativo contra Supabase antes de armar el prompt.
- `reglas_aprendidas.js` inyecta siempre reglas derivadas de ground truth validado por arquitectos, server-side.

### 2.3 Normativa — dos mecanismos coexistiendo, más una taxonomía nueva
| Mecanismo | Dónde vive | Para qué |
|---|---|---|
| JSON estático embebido | `normativa/nacional/*.json` + `normativa/nunoa/`, `normativa/santiago/` | Contexto que viaja en el prompt del portal |
| RAG en Supabase (pgvector) | tabla `normativa_chunks`, **1.608 chunks verificados en vivo** (OGUC 770, LGUC 244, Ley 19.300 128, DDU 185, PRC Providencia 281) | Recuperación semántica desde el Worker (threshold 0.45, match_count 25) |

**Schema real, extendido 2026-09-21**:
```sql
create table normativa_chunks (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,      -- 'OGUC' | 'LGUC' | 'LEY19300' | 'DDU' | 'PRC-PRV'
  codigo text not null,      -- 'OGUC-2.1.24' | 'DDU-351-s1' | 'LGUC-116'
  titulo text,
  texto text not null,
  metadata jsonb default '{}',  -- ahora sí se usa: 7 dimensiones (ver abajo)
  embedding vector(1536),
  updated_at timestamptz default now()
);
-- match_normativa(query_embedding, match_count, fuentes[], + 6 params opcionales nuevos:
--   p_tipo_edificacion, p_tipo_norma, p_ambito, p_comuna, p_canal, p_solo_vigentes=true)
-- articulos_por_etapa(p_etapa, p_solo_vigentes) -- nueva, recupera por código OBS-N sin similaridad semántica
-- índice GIN sobre metadata
```
**Taxonomía (7 dimensiones, en `metadata jsonb`)**: `tipo_edificacion`, `tipo_norma` (vocabulario controlado de 19 valores: ventilación/accesibilidad/evacuación/etc.), `ambito`+`comuna`+`zona`, `etapa_pipeline` (códigos OBS-G/E/V/M/N/INC/DF reales del producto), `vigencia`+`vigencia_fecha`, `canal` (CAD/BIM/ambos), `jerarquia` (`piso_nacional_no_derogable` / `marco_nacional_ajustable_por_prc` / `exclusivo_comunal`). Clasificación en 2 niveles: `articulos` (precisa, ~46 artículos ya leídos a fondo, marcada `"verificado"`) + `capitulos_fallback` (heurística por prefijo, marcada `"heuristica_no_verificada"` — nunca mezclada sin distinguir).

### 2.4 Notebook de Colab (canal PDF)
`Fase 2/Desarrollos/Test/ArchiCheck_Base {fecha}.ipynb` — plantilla de 7 celdas, el usuario solo edita la Celda 3. Corre en CPU (Grounding DINO + SAM 2 eliminados por recall ~0% en planos CAD). La "Celda 4" es el motor de fusión geométrica (`cuerpo_cerrado.py` es su espejo local testeable, ver §4).

### 2.5 Gate de revisión gráfica — verificación humana obligatoria
Entre Colab y el análisis normativo hay un paso **no saltable**: el arquitecto valida/corrige la geometría detectada sobre un canvas, página a página. *La automatización propone, el humano dispone.*

### 2.6 Pipeline BIM/IFC (canal alternativo, `Fase 2/BIM/`)
- **`generar_plano_pdf.py`**: triangula geometría 3D de cada elemento IFC, proyecta a XY con `shapely`, dibuja plano en planta por nivel (matplotlib → PDF).
- **`analizar_todos.py`**: extrae muros/puertas/ventanas/recintos, aplica **todas** las reglas de `reglas_normativas.py` — a la fecha: ancho de puerta, FireRating de muro, ventilación natural, área/ancho mínimo por recinto, círculo de giro accesible, pendiente+ancho de rampa, ancho de escalera. **Cobertura BIM de los 4 chequeos dimensionales OGUC ya cerrada** (ver §3).
- **`piloto_ids_oguc.py`**: subconjunto declarativo vía IfcTester (IDS de buildingSMART) — cobertura menor que `analizar_todos.py`, divergencia documentada a propósito (ver §7).
- **`generar_json_colab.py`**: adapta los datos reales del IFC al JSON que espera el portal.

### 2.7 Principio "una sola fuente de reglas" — estado real 2026-09-21
`Fase 2/reglas_normativas.py` (`OGUC_REGLAS`) tiene hoy, **corregidos tras auditoría completa artículo-por-artículo** (no solo el subconjunto original): `puerta_ancho_libre` = **0.90 m** (Art. 4.1.7 N°4 — corregido de un 0.80 m mal citado, que en realidad era el caso específico de baño accesible), `pasillo` = **1.10 m** (Art. 4.2.18 — corregido de un 1.20 m que estaba marcado `SIN VERIFICAR` y en realidad era más estricto que lo real), `escalera` = 1.10 m (Art. 4.2.10, tabla por carga de ocupación, no implementada aún), `rampa` = 1.50 m (Art. 4.1.7 N°2), `circulo_giro_accesible_m` = 1.50 m (DDU 351), `ventilacion_iluminacion_pct` = 10% (**`SIN VERIFICAR` — no existe artículo OGUC que respalde ese %**, el real Art. 4.1.2 es solo cualitativo), 6 valores de área mínima por tipo de recinto **todos `SIN VERIFICAR`** (sin base OGUC confirmada, DS49 descartado activamente como fuente alternativa).

`LGUC_REGLAS` y `PRC_REGLAS` siguen `{}` — **verificado exhaustivamente** que LGUC (245 secciones) y DDU 447 (Ley 20.958) son ley marco/administrativa (multas, cesiones, subdivisión), no tienen contenido dimensional/geométrico que migrar. No es un gap pendiente, es una conclusión verificada.

Única excepción real a "una sola fuente": `_celda4_actual.py` (espejo local de la celda de Colab) mantiene los valores en línea porque Colab no puede hacer `import` (sin `git clone`/`drive.mount`).

**Auto-consistencia programática**: 3 `assert` en `reglas_normativas.py` que fallan fuerte al importar si la forma de una tupla cambia (protege contra lectura posicional `[1]` en vez de por nombre, hallazgo real de DeepSeek).

---

## 3. Cobertura BIM vs CAD — CERRADA 2026-09-21 (era el gap central de v1 de este documento)

| Chequeo | CAD (PDF) | BIM (IFC) |
|---|---|---|
| Área/ancho mínimo por recinto | ✅ | ✅ |
| Pendiente/ancho de rampa | ✅ (fórmula 2D aproximada) | ✅ (**más riguroso** — geometría 3D real, no fórmula) |
| Círculo de giro accesible | ✅ (lee anotación/símbolo dibujado) | ✅ (**más riguroso** — calcula si el círculo cabe de verdad) |
| Ancho de escalera | ✅ | ✅ (geometría 3D real) |
| Cruce con cuadro de superficies declarado | ✅ | ❌ (no priorizado, fuera de los 4 puntos) |
| FireRating de muro declarado | ❌ | ✅ |
| Ventilación natural (ventana↔recinto real) | ❌ | ✅ |

**Hallazgo crítico durante la implementación de rampa (punto 3)**: 2 archivos IFC reales (Esplanades, FOJAB Landsarkivet) tienen su `IfcSite` en coordenadas absolutas de agrimensura (~6.175.287 m) — un caso conocido de colapso de precisión de punto flotante en kernels tipo OpenCascade. Confirmado empíricamente: **todo** `IfcSpace` de esos 2 archivos devolvía footprints físicamente imposibles (2-6mm de lado) sin ningún error. Al revisar los 8 archivos ya "validados" antes por el mismo patrón, se encontró que **ya estaba latente ahí también** (un living-room de HouseZ con footprint de 4.5mm, invisible solo porque esa regla no tiene ancho mínimo que lo dispare). Fix real: guardia de plausibilidad (`_MEDIDA_MIN_PLAUSIBLE_M=0.05`) + guardia de rectilineidad (`fill_ratio` del footprint vs. su rectángulo envolvente, verificado empíricamente: recto=1.0, rampa en L=0.51, rampa en U=0.73, umbral 0.85 marcado explícitamente como estimación de ingeniería, no cita normativa). **Ninguno de los archivos de ejemplo hoy valida el chequeo de rampa con un número plausible de punta a punta** — la lógica se verificó por otras 2 vías (contra puntos de control ya citados en CAD, y contra un polígono sintético) en vez de contra un archivo real.

Plan de 4 puntos (Diseño Funcional §3.15) **100% cerrado**. Cada punto pasó por al menos una ronda de Revisión Ing SW Paso 3 (DeepSeek+Codex) — total agregado: 19 hallazgos reales entre los 4 puntos, todos evaluados individualmente (algunos corregidos, algunos documentados como riesgo latente no forzado sin evidencia de impacto real).

---

## 4. "Revisión Ing SW" — estado actual completo (sin cambios de mecanismo desde v1, con una extensión real de alcance)

**4 capas**, de más barata/automática a más cara/manual:

### Paso 0 — Hardcodeo normativo (mecánico, ~1 seg, siempre)
`Fase 2/verificar_hardcodeo_normativo.py`. **Extendido 2026-09-21**: antes solo escaneaba `.py`; ahora recorre también `normativa/` (`.mjs`/`.sql`/`.json`) — el motivo fue encontrar duplicación real entre `reglas_verificacion.json` y `nacional/schema.sql` (12 reglas copiadas, desincronizadas). Corrió limpio tras la extensión.
- **Chequeo A**: número que coincide con un valor real de `OGUC_REGLAS`, cerca de un operador de comparación y una palabra de "pinta normativa".
- **Chequeo B**: 3+ claves de `OGUC_REGLAS` citadas literal en la misma línea.
- **Límite honesto, documentado en su propio docstring y confirmado real 2026-09-21**: no compara contenido ENTRE 2 archivos — el propio docstring afirmaba lo contrario y se corrigió tras encontrarlo en una revisión Paso 3 (ver §6, hallazgo 9).

### Paso 1 — Rápida (~3 seg, siempre)
Regresión de 24 casos fijos (`test_cuerpo_cerrado.py`) + property-based testing con `hypothesis` (`test_cuerpo_cerrado_properties.py`).

### Paso 2 — Golden-file (~5-7 min, condicional)
Pipeline real completo contra **3 proyectos reales** (PdV, Beauchef, Campo Lindo), comparado contra baselines. Solo corre si cambia `cuerpo_cerrado.py`/`catalogo_tipologias.py` o se fuerza con `--golden`. Motivado por el incidente de Beauchef (5-6 sept): 4 fixes que parecían correctos en aislamiento rompieron producción (efecto no-local).

**Orquestador**: `correr_revisiones.py`, pre-commit hook opt-in (`git config core.hooksPath .githooks`). Nunca llama a DeepSeek/Codex por su cuenta.

### Paso 3 — DeepSeek + Codex, LLM, optativo, checklist fijo de 10 puntos
Siempre se pregunta antes de correrlo (costo de API real). Envía contexto rico (qué cambió, qué ya se resolvió antes) + el checklist completo:
1. Corrección lógica/bugs (casos límite, `None`).
2. Hardcodeo (más allá del Paso 0 — valores nuevos nunca centralizados).
3. Efectos no-locales.
4. Consistencia con patrones ya establecidos.
5. "Dato ausente" vs. "no cumple".
6. Nunca fallar en silencio.
7. Evidencia real detrás de cada umbral/supuesto nuevo.
8. Rendimiento con datos reales grandes.
9. Robustez ante variación real de datos de entrada.
10. Trazabilidad.

**Regla de uso (§3.13, incidente real)**: DeepSeek alucinó una convención de dibujo chilena falsa (ventanas de 2 líneas) con la misma confianza que una afirmación correcta. Alcance permitido = código real. Fuera de alcance = cualquier afirmación de dominio sin evidencia. Presentación obligatoria: cada fuente completa y separada, nunca una síntesis ya fusionada.

**Descartado**: un 3er LLM genérico (misma limitación, la triplica). **Pendiente de decidir**: `mypy` como parte del Paso 0/1.

---

## 5. Categoría de hallazgo nueva: integridad de DATOS normativos, no solo de código (2026-09-20/21)

Hasta ahora, las 4 capas de "Revisión Ing SW" (§4) verifican **código** — que la lógica sea correcta, que no haya hardcodeo, que no rompa nada. Ninguna capa verificaba si el **contenido** de un JSON de normativa (`normativa/**/*.json`) correspondía a un documento real. Al auditar esto por primera vez (a pedido del usuario, antes de conectar más normativa al análisis), aparecieron hallazgos serios:

1. **3 archivos DDU con contenido fabricado o directamente falso, ya en el repo**: `circ279_accesibilidad.json` y `circ320_adosamiento.json` no corresponden a ninguna de las 552 circulares reales de la compilación oficial (`ddu_libro.json`, 488 páginas, verificado exhaustivamente). `circ390_expedientes.json` es peor — afirma que la DDU 390 trata de "presentación de expedientes"; la DDU 390 real (confirmada en la fuente oficial) es sobre subdivisión de predios por utilidad pública, tema y fecha completamente distintos.
2. **Providencia: 86% del PDF nunca se procesó** — 4 de 5 tomos (114 MB de 117 MB) del PRC nunca se extrajeron a JSON, incluyendo las tablas reales de zonificación/uso de suelo.
3. **Ñuñoa y Santiago: sin PDF fuente en el repo, contenido con señales de reconstrucción sin verificar** — números que suenan específicos (coeficientes de constructibilidad por sub-zona) sin carpeta `Fuentes/` ni script de extracción que los respalde.
4. **Un umbral YA en producción estaba mal citado**: `puerta_ancho_libre` = 0.80 m citaba "Art. 4.1.7 N°6" — al leer el texto íntegro (no un resumen), se confirmó que 0.80 m es el caso de puerta de baño accesible; el caso general que el código aplicaba a TODA puerta es 0.90 m (N°4). Impacto real medido: en un archivo de prueba, las puertas "OK" pasaron de 64/64 a 53/64; en otro, de 10/14 a 2/14 — un cambio de comportamiento significativo en un chequeo que llevaba tiempo en producción, "verificado" solo de nombre.
5. **La cita de ventilación natural (10%) era completamente falsa** — citaba Art. 4.2.5-4.2.6 (que en realidad son pasillo y altura de vía de evacuación). El artículo real (4.1.2) es cualitativo, sin porcentaje — no existe número OGUC que reemplace el 10%. Peor: el JSON que ve el arquitecto en el informe final mostraba literalmente *"mínimo OGUC 10%"* — una cita falsa **visible al usuario final**, no solo un comentario interno.
6. **El fix de la puerta (0.80→0.90) no se propagó a un 3er consumidor**: `generar_json_colab.py` seguía con el valor y la cita viejos semanas después de corregirse en `reglas_normativas.py` y `analizar_todos.py` — encontrado recién en una revisión Paso 3 posterior, no por ningún mecanismo automático.
7. **12 reglas más en `reglas_verificacion.json`** (checklist humano, no consumidas por código) — de 12, solo 2 estaban correctas desde el inicio; 8 tenían cita falsa o imprecisa (una, `vias_evacuacion`, citaba artículos que en realidad son sobre tipos de resistencia al fuego).

**Regla nueva formalizada como consecuencia** (`Diseño Funcional §3.17`, memoria `feedback_archicheck_normativa_cobertura_100pct`): toda fuente normativa agregada debe llegar a (1) extracción 100% verbatim, (2) verificación artículo-por-artículo con alcance literal (no solo lo arquitectónico), cada artículo clasificado "(a) regla real aprovechable" o "(b) verificado, no aplica" — nunca "sin revisar" — (3) conexión real a `reglas_normativas.py`, consumida por el pipeline. Con archivo de seguimiento obligatorio por corpus (`Fase 2/cobertura_<corpus>.csv`), porque es trabajo de varias sesiones.

---

## 6. Meta-hallazgo: "Revisión Ing SW" aplicada a su propia extensión encontró bugs en su propia infraestructura

Al construir la taxonomía de 7 dimensiones (§2.3) y correr Paso 3 sobre ese trabajo, aparecieron fallas **en el propio sistema de revisión/filtrado**, no en la lógica normativa:

1. **`vigencia: 'vigente'` estaba hardcodeada en el clasificador**, sin ninguna rama que la sobrescribiera — las 1.608 filas backfileadas (incluyendo ~185 DDU y ~281 PRC cuya vigencia real "debe revisarse caso a caso", según el propio comentario del código) quedaron TODAS marcadas `'vigente'`. Efecto real: el parámetro `p_solo_vigentes=true` de `match_normativa()` — que existe explícitamente para poder filtrar por esto — **no filtraba nada**, una función de seguridad presente en el código pero inerte en producción.
2. **El mismo bug de fondo, versión SQL**: el filtro usaba `coalesce(metadata->>'vigencia', 'vigente') = 'vigente'` — un dato *ausente* se trataba como si *cumpliera*, la misma confusión "dato ausente vs. no cumple" que el checklist del Paso 3 (punto 5) ya pregunta explícitamente para código Python, pero que no se había pensado para SQL/DDL.
3. **Un caso de fallback silencioso real**: un sufijo de comuna no mapeado (ej. un PRC nuevo) caía en silencio a `comuna: null` sin ningún aviso — el chunk existiría en la base pero nunca aparecería en ninguna consulta filtrada por comuna. Corregido a `console.warn` + marca explícita.
4. **El propio Paso 0 sobreprometía en su docstring** lo que en realidad hace (afirmaba detectar duplicación entre 2 archivos; el mecanismo real solo detecta duplicación dentro de un mismo archivo) — encontrado por la propia consulta Paso 3, no por nadie leyendo el docstring contra el código.
5. Un bug de caché (`cargarTaxonomia()` ignoraba el parámetro de ruta en llamadas repetidas) y un `try/catch` mal ubicado (`clasificar()` fuera del bloque, podía abortar un lote completo por un solo error sin identificar cuál fila falló) — ambos encontrados independientemente por DeepSeek Y Codex (misma señal, alta confianza).

**Por qué importa para el rediseño**: esto es evidencia directa de que el checklist de 10 puntos SÍ funciona (atrapó 9 hallazgos reales en una sola pasada sobre este trabajo), pero también expone un patrón que ninguna de las 4 capas actuales cubre explícitamente: **"un fix corregido en la fuente no garantiza que todos los consumidores se actualizaron"** — pasó 3 veces en total en este proyecto (puerta 0.80→0.90 en `generar_json_colab.py`, pasillo con el mismo problema en `_celda4_actual.py` — el comentario ya citaba el valor nuevo pero la tupla seguía con el viejo, y la vigencia hardcodeada de este mismo punto). No es un caso aislado, es un patrón recurrente sin capa dedicada.

---

## 7. Incidentes reales que motivaron cada capa (evidencia empírica del gap actual)

| Incidente | Qué pasó | Qué capa lo motivó/lo atrapó |
|---|---|---|
| Beauchef, 5-6 sept | 4 fixes parecían correctos aislados, rompieron producción (efecto no-local) | Motivó el Paso 2 golden-file |
| Hardcodeo duplicado (código), 20-sep | Mismo día, 2 veces: umbral de puerta + lista de tipos de recinto | Motivó crear el Paso 0 |
| Hardcodeo duplicado (normativa), 20/21-sep | `reglas_verificacion.json` vs `schema.sql`, 12 reglas dos veces | Motivó extender el Paso 0 a `normativa/` |
| DeepSeek alucina convención de ventanas | Afirmación de dominio falsa, misma confianza que una correcta | Motivó la regla §4 (código sí, dominio no) |
| Bug de posición en tuplas | Lectura por índice `[1]` en vez de por nombre | Motivó 3 `assert` de auto-consistencia |
| Cita falsa de puerta (0.80 vs 0.90) | Umbral en producción, "verificado" solo de nombre | Motivó la regla de cobertura 100% (§5) |
| Fix no propagado (puerta, 3 veces distintas) | Corregido en la fuente, 1-2 consumidores no se actualizaron | **Sin capa que lo cubra hoy** (ver §8) |
| `vigencia` hardcodeada | Filtro de seguridad presente en código, inerte en producción | **Sin capa que lo cubra hoy** — encontrado solo por Paso 3 puntual |
| Colapso de precisión flotante (coords absolutas) | Footprints de milímetros, silencioso, ya latente en 8/10 archivos | Motivó guardias de plausibilidad+rectilineidad, no una capa general |
| Puertas sin dato — inferencia footprint | Calibrada con N=1 | Sin capa que lo cubra más allá de revisión manual |
| Rampa fabricada por competidor (Revi) | Referencia externa de mercado, sin fuente real | Disciplina de `reglas_normativas.py`, no una capa de testing |

---

## 8. Lo que el proceso actual NO cubre (gaps explícitos, actualizado)

1. **Sin métricas sistematizadas de falsos positivos/negativos**, para ninguna de las 4 capas ni para la nueva categoría de integridad de datos.
2. **El golden-file (Paso 2) solo cubre el canal CAD/PDF** — BIM no tiene su propia suite de regresión automatizada (los ~10 IFC de prueba, incluyendo ahora edge cases reales como coordenadas absolutas/colapso de precisión, se usan para validación manual puntual).
3. **El Paso 3 (LLM) es manual, sin tracking estructurado** — JSON crudo por corrida, sin índice consultable de qué se preguntó/encontró/corrigió.
4. **Heurísticas calibradas con N=1** (`bisagra_por_geometria`, umbral de rectilineidad `0.85` marcado explícitamente como estimación).
5. **Sin CI real** — hook local opt-in, nada bloquea un push si no está activado.
6. **Celda 4 (Colab) no puede importar `reglas_normativas.py`** — disciplina manual, ya con un caso real de desincronización detectado (pasillo).
7. **`verificar_hardcodeo_normativo.py` no compara contenido entre archivos** — solo dentro de uno (limitación ahora documentada correctamente, ver §6.4).
8. **Sin regresión de rendimiento automatizada.**
9. **NUEVO — sin mecanismo que garantice que un fix se propaga a TODOS los consumidores de un valor duplicado.** Pasó 3 veces real (§6, §7). El Paso 0 detecta hardcodeo *nuevo*, no un valor *viejo* que quedó sin actualizar en un archivo que el grep no relacionó con el cambio.
10. **NUEVO — sin verificación sistemática de integridad de datos normativos** más allá de la auditoría manual puntual de §5. La regla de cobertura 100% (§5) es un proceso, no una capa automatizada que corra en cada cambio.
11. **NUEVO — un filtro/guardia puede existir en el código y estar inerte en producción sin que nada lo note** (`vigencia` hardcodeada, `coalesce` enmascarando dato ausente) — ninguna capa actual prueba que una guardia *realmente dispare* cuando debería, solo que el código no crashee.
12. **`indexar_normativa.mjs` es una trampa viva sin test que la cubra**: apunta a un esquema de fuente obsoleto (644/234 artículos) distinto al que realmente pobló la base (770/244) — si alguien lo corre para "actualizar" normativa sin corregirlo antes, **regresionaría la base de producción**, perdiendo cobertura real ya existente. Nadie lo ha corregido todavía porque nadie lo ha necesitado volver a correr.

---

## 9. El prompt para las IAs externas

Con todo el contexto de arriba (secciones 1-8), **ArchiCheck ya tiene una metodología de revisión de 4 capas en producción** más una disciplina de integridad de datos normativos recién formalizada. No es ingenua — tiene evidencia empírica real detrás de cada pieza. Se pide diseñar la **próxima versión concreta**, no una introducción genérica a testing, considerando en particular:

1. **Falsos positivos/negativos como concepto de primera clase** — cómo medirlos y trackearlos para un motor de reglas determinísticas sobre geometría extraída con incertidumbre (no un clasificador ML). ¿Matriz de confusión por regla individual? ¿Por canal (CAD/BIM)?
2. **Extender el golden-file al canal BIM** — ya hay ~10 IFC reales de prueba, incluyendo edge cases genuinos (coordenadas absolutas, sin `IfcSpace`, unidades no-métricas, nombres en 4+ idiomas). ¿Vale la pena un dataset "adversarial" curado a propósito?
3. **Propagación de fixes a todos los consumidores** (§6, §7, §8.9) — pasó 3 veces real. ¿Qué mecanismo (no necesariamente LLM) detectaría esto de forma determinística? ¿Un grep del valor viejo en todo el repo como parte del propio fix, antes de darlo por cerrado?
4. **Verificación de que una guardia/filtro realmente dispara** (§6.1-2, §8.11) — ¿test que fuerce el caso "dato ausente" contra cada filtro nuevo y confirme que SÍ excluye, no solo que no crashea?
5. **Integridad de datos normativos como capa continua**, no auditoría puntual (§5, §8.10) — ¿cómo automatizar (aunque sea parcialmente) la verificación de que una cita normativa corresponde al texto real, más allá de la revisión humana artículo por artículo?
6. **Qué le falta al checklist de 10 puntos del Paso 3** — ¿categorías no cubiertas? (seguridad, drift de dependencias de `ifcopenshell`/`shapely`, determinismo del pipeline con IA — Claude Vision/GPT-4o en el canal CAD).
7. **CI real vs. hook local** — ¿vale la pena migrar Paso 0-2 a GitHub Actions, dado que es un proyecto de un desarrollador con ayuda de IA, no un equipo? (Paso 3 debe seguir manual por costo de API, eso no se pregunta).
8. **Calibración N=1** — metodología mínima razonable sin necesitar un dataset gigante (ej.: usar los casos donde SÍ hay dato declarado como ground truth retroactivo para heurísticas de último recurso).
9. **Property-based testing más allá de geometría** — ¿qué invariantes del motor de reglas, RAG o extracción IFC se prestan a esto?
10. **Cualquier técnica relevante no mencionada** — mutation testing, fuzzing de parsers IFC/PDF, snapshot testing del informe final, contract testing entre Worker/Supabase/frontend, etc. — evaluar aplicabilidad real a este contexto específico.

**Formato de respuesta esperado**: propuesta concreta, priorizada, accionable — que reconozca lo que ya existe (no reinventar el Paso 0-4) y proponga qué agregar/cambiar. **Cada punto de la propuesta marcado explícitamente como verificado/SIN VERIFICAR/SIN DEFINIR/PENDIENTE** (ver instrucción al inicio del documento).
