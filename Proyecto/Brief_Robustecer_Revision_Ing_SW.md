# Brief técnico: robustecer "Revisión Ing SW" — para consulta a IAs externas

**Qué es este documento.** Contexto técnico completo de ArchiCheck (stack, arquitectura, componentes, modelo de datos) y, en detalle, el estado actual del proceso de revisión de calidad de software ("Revisión Ing SW"). El objetivo es pasar este documento a distintas IAs (ChatGPT, Gemini, Copilot, Perplexity, Claude) pidiendo ayuda para diseñar una metodología de testing más robusta — regresión, falsos positivos/falsos negativos, y cualquier otra técnica relevante que el usuario no conozca todavía. Ver la pregunta concreta en la sección 7.

**Fecha**: 2026-09-20. **Repo**: `archicheck` (público, GitHub `TuQRApp/archicheck`) + `archicheck-worker` (privado).

---

## 1. Qué es ArchiCheck

Herramienta de pre-validación normativa de planos de arquitectura para el mercado chileno: un arquitecto sube su proyecto y recibe, antes de presentarlo a la DOM (Dirección de Obras Municipales), un levantamiento geométrico verificable y una evaluación contra normativa chilena (OGUC, LGUC, Ley 19.300, DDU, PRC comunal). Metodología base: pipeline de 4 etapas de Pablo Pizarro (2024).

**Decisión de producto clave (2026-09-20)**: ArchiCheck es **un solo producto**, no dos líneas separadas. PDF (plano vectorial 2D, hoy ~95% del mercado chileno) y BIM/IFC (estudios/constructoras grandes) son **dos canales de ingesta alternativos** del mismo producto. Solo la extracción geométrica diverge por formato de entrada — el motor de reglas normativas, el esquema de salida y el informe final tienen que ser una sola cosa compartida, nunca dos implementaciones que puedan desalinearse.

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

### 2.3 Normativa — dos mecanismos coexistiendo
| Mecanismo | Dónde vive | Para qué |
|---|---|---|
| JSON estático embebido | `normativa/nacional/*.json` + `normativa/nunoa/`, `normativa/santiago/` | Contexto que viaja en el prompt del portal |
| RAG en Supabase (pgvector) | tabla `normativa_chunks`, 1.928 chunks (OGUC 770, LGUC 244, Ley 19.300 128, DDU ~185, PRC Providencia 281) | Recuperación semántica desde el Worker (threshold 0.45, match_count 25) |

**Schema real** (`normativa/supabase_schema.sql`):
```sql
create table normativa_chunks (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,      -- 'OGUC' | 'LGUC' | 'LEY19300' | 'DDU'
  codigo text not null,      -- 'OGUC-2.1.24' | 'DDU-351-s1' | 'LGUC-116'
  titulo text,
  texto text not null,
  metadata jsonb default '{}',
  embedding vector(1536),
  updated_at timestamptz default now()
);
-- función match_normativa(query_embedding, match_count, fuentes[]) → búsqueda por similaridad coseno
-- RLS: lectura pública (anon key), escritura solo service key
```

### 2.4 Notebook de Colab (canal PDF)
`Fase 2/Desarrollos/Test/ArchiCheck_Base {fecha}.ipynb` — plantilla de 7 celdas, el usuario solo edita la Celda 3. Corre en CPU (Grounding DINO + SAM 2 eliminados por recall ~0% en planos CAD — entrenados en fotografías, no símbolos de línea). La "Celda 4" es el motor de fusión geométrica (`cuerpo_cerrado.py` es su espejo local testeable, ver §4).

### 2.5 Gate de revisión gráfica — verificación humana obligatoria
Entre Colab y el análisis normativo hay un paso **no saltable**: el arquitecto valida/corrige la geometría detectada sobre un canvas, página a página. Es estructural, no transitorio: si un elemento no se detecta, su verificación normativa nunca corre — el gate convierte "invisible para el modelo" en "igual verificado". Principio general del producto (§3.9 del diseño funcional): *la automatización propone, el humano dispone*.

### 2.6 Pipeline BIM/IFC (canal alternativo, `Fase 2/BIM/`)
- **`generar_plano_pdf.py`**: triangula geometría 3D de cada elemento IFC (`ifcopenshell.geom`, coordenadas de mundo), proyecta a XY con `shapely`, dibuja plano en planta por nivel (matplotlib → PDF). Incluye lógica no trivial: reconstrucción de arco de apertura de puerta con fuente distinguible ("declarado" vs. "geometría", nunca mezcladas visualmente), filtrado de vanos no reales (`filtrar_vanos_reales`), fallback de escalera sin `IfcStairFlight` hijo.
- **`analizar_todos.py`**: extrae muros/puertas/ventanas/recintos de los IFC de ejemplo, aplica reglas de `reglas_normativas.py` (ancho de puerta, FireRating de muro, ventilación natural vía `IfcRelSpaceBoundary`, área/ancho mínimo por recinto, círculo de giro accesible calculado geométricamente).
- **`piloto_ids_oguc.py`**: mismas 2 primeras reglas pero declarativas, vía IfcTester (IDS de buildingSMART).
- **`generar_json_colab.py`**: adapta los datos reales del IFC al JSON exacto que espera el portal ("Resultados Colab"), con proyección real a coordenadas de píxel.

### 2.7 Principio "una sola fuente de reglas"
`Fase 2/reglas_normativas.py` es la única fuente de `OGUC_REGLAS` (con `LGUC_REGLAS`/`PRC_REGLAS` declarados vacíos, listos para cuando haya evidencia real). Estructura: `{tipo_recinto: (area_min_m2, ancho_min_m, ref)}` para reglas de recinto; tuplas/dicts de forma distinta para reglas de elemento (`puerta_ancho_libre`, `muro_fire_rating`, `circulo_giro_accesible_m`). Cada valor lleva su cita + historial de verificación real contra el texto de la norma; donde no hay fuente confirmada se marca literalmente `'SIN VERIFICAR'` en vez de omitirse o inventarse (ej.: los 6 valores de área mínima por tipo de recinto —dormitorio, sala, living, comedor, cocina, baño— **no tienen fuente OGUC confirmada** y están marcados así explícitamente, tras descartar activamente DS49 como fuente alternativa).

Única excepción real a "una sola fuente": `_celda4_actual.py` (espejo local de la celda de Colab) mantiene los valores en línea porque Colab no tiene acceso al filesystem del repo (sin `git clone` ni `drive.mount`, verificado) — no puede hacer `import`.

**Auto-consistencia programática**: `reglas_normativas.py` incluye 3 `assert` que corren al importar el módulo y fallan fuerte si la forma de una tupla cambia (ej. si `puerta_ancho_libre` dejara de tener `[1]` como el ancho numérico) — protege contra un hallazgo real de DeepSeek: dos consumidores BIM leen esos valores **por posición**, no por nombre de campo.

---

## 3. Divergencia real de cobertura entre canales (auditoría 2026-09-20)

Se comparó qué chequeos OGUC corren de punta a punta en cada canal — **no coincidían**:

| Chequeo | CAD (PDF) | BIM (IFC) |
|---|---|---|
| Área/ancho mínimo por recinto | ✅ | ✅ (agregado 2026-09-20) |
| Pendiente/ancho de rampa | ✅ (fórmula 2D aproximada) | ❌ hoy solo se cuentan, no se evalúan |
| Círculo de giro accesible | ✅ (lee anotación/símbolo dibujado, vía Claude Vision) | ✅ (calcula geométricamente si el círculo cabe de verdad — más riguroso, no un port 1:1) |
| Cruce con cuadro de superficies declarado | ✅ | ❌ |
| FireRating de muro declarado | ❌ | ✅ |
| Ventilación natural (ventana↔recinto real) | ❌ | ✅ |
| Ancho de escalera vía IDS | ❌ | piloto existe, no integrado al analizador principal |

Ninguno de los 2 canales es "el atrasado" — cada uno adelantó una porción distinta de la misma cobertura que ambos deberían tener. Plan de cierre confirmado (prioridad BIM): 1) área/ancho recinto (hecho), 2) círculo de giro (hecho), 3) pendiente+ancho rampa, 4) integrar IDS de escalera al analizador principal.

---

## 4. "Revisión Ing SW" — estado actual completo

Nombre formal (usuario, 2026-09-20) del paquete de revisión que corre antes de aceptar un cambio en zonas delicadas del proyecto. **4 capas**, de más barata/automática a más cara/manual:

### Paso 0 — Hardcodeo normativo (mecánico, ~1 seg, siempre)
`Fase 2/verificar_hardcodeo_normativo.py`. Grep dirigido con 2 heurísticas concretas (no análisis semántico):
- **Chequeo A**: número que coincide con un valor real de `OGUC_REGLAS`, en una línea que además tiene un operador de comparación (`>=`, `<=`, `==`, etc. con espacios a cada lado, para no confundir con format-specs de f-string) Y una palabra de "pinta normativa" (ancho/área/min/max/pendiente/fire/rating) cerca.
- **Chequeo B**: 3+ claves de `OGUC_REGLAS` citadas como string literal en la misma línea (patrón exacto de una lista de tipos de recinto reconstruida a mano en vez de importada).
- Archivos exentos con motivo documentado (`reglas_normativas.py` mismo, `_celda4_actual.py` por límite real de Colab, `catalogo_tipologias.py` por ser prosa narrativa).
- **Autoevaluado**: reintrodujo a propósito el bug real del día para confirmar que lo atrapa, antes de confiar en la herramienta. Encontró 3 falsos positivos en su primera corrida (todos explicados/corregidos: un f-string con alineación, párrafos narrativos). Falsos negativos conocidos y aceptados: un valor calculado en vez de literal (`8 * 0.1`), o un valor nuevo que nunca se centralizó en absoluto en ningún lado.

### Paso 1 — Rápida (~3 seg, siempre)
- **Regresión de 24 casos fijos** — `Fase 2/Herramientas_CubiCasa5k/test_cuerpo_cerrado.py`, corre aparte de pytest.
- **Property-based testing con `hypothesis`** — `test_cuerpo_cerrado_properties.py`: invariantes que deben cumplirse para cualquier geometría de entrada, no solo los casos ya vistos.

### Paso 2 — Golden-file (~5-7 min, condicional)
`test_cuerpo_cerrado_golden.py`: pipeline real completo (Celdas 2/4/5/6, sin Vision) contra **3 proyectos reales de prueba** (PdV, Beauchef, Campo Lindo), comparado contra baselines conocidos. Solo corre si cambia un archivo "riesgoso" (`cuerpo_cerrado.py` o `catalogo_tipologias.py`, el motor de fusión en sí) o se fuerza con `--golden`. Existe específicamente porque los pasos 0/1 no alcanzan para atrapar un **efecto no-local**: la investigación real del 5-6 de septiembre encontró 4 intentos de fix que parecían correctos en aislamiento y rompían Beauchef en producción.

**Orquestador**: `Fase 2/Herramientas_CubiCasa5k/correr_revisiones.py`, corre como pre-commit hook (`.githooks/pre-commit`, activado con `git config core.hooksPath .githooks`) y también a mano. Flags: `--solo-rapido` (nunca corre golden), `--golden` (fuerza golden), `--archivos-cambiados` (lo usa el hook para decidir si hace falta golden). Este script **nunca** llama a DeepSeek/Codex por su cuenta.

### Paso 3 (llamado "Paso 2" en el diseño funcional) — DeepSeek + Codex, LLM, optativo
Fuera del orquestador **a propósito** — tiene costo de API real, siempre se pregunta antes de correrlo. Dos implementaciones reales en el repo, mismo mecanismo:
- `Fase 2/revisar_ing_sw_paso2.mjs` — versión general/reusable, checklist fijo completo cada vez.
- `Fase 2/BIM/revisar_con_codex.mjs` / `revisar_con_deepseek.mjs` — versión con contexto específico del piloto BIM.

**Mecánica real** (código, no descripción): arma un `system_prompt`/contexto con (a) qué hace cada script relevante, (b) qué cambió HOY específicamente con el detalle técnico exacto, (c) qué ya se encontró y corrigió en una ronda anterior (para no volver a marcarlo), y (d) el **checklist fijo de 10 puntos** de abajo — manda el código completo de los archivos relevantes como texto plano. Llama a `api.openai.com/v1/responses` (modelo `gpt-5.3-codex`) y `api.deepseek.com/chat/completions` (`deepseek-chat`) en paralelo, guarda cada respuesta cruda como JSON en `_codex_reviews/`/`_deepseek_reviews/` (BIM) o `Fase 2/_consultas_ing_sw_paso2/` (general), timestamped, nunca sobrescribe.

**Checklist fijo (10 puntos, siempre completo, nunca una selección ad-hoc)**:
1. Corrección lógica/bugs — casos límite, `None`/valores faltantes en cada rama nueva.
2. Hardcodeo — más allá de lo que cubre el Paso 0 (recurrencia de un valor ya existente): valores mágicos nuevos nunca centralizados, nombres de campo/Pset asumidos sin verificar, valores *casi* iguales al real (ej. `0.799` en vez de `0.8`).
3. Efectos no-locales — ¿puede alterar comportamiento en otra parte del pipeline de forma no obvia?
4. Consistencia con patrones ya establecidos — ¿duplica lógica que ya vive en otro archivo?
5. "Dato ausente" vs. "no cumple" — ¿todo `None`/campo faltante se trata como incertidumbre, nunca como incumplimiento?
6. Nunca fallar en silencio — ¿excepción tragada, `except: pass`, default sin aviso?
7. Evidencia real detrás de cada umbral/supuesto nuevo — ¿cita y fuente verificada, o estimación sin marcar?
8. Rendimiento con datos reales grandes — ¿algo O(n²)/O(n³) que cuelgue con un archivo real grande? (ya pasó con LTU redesign: 2623 muros; con Beauchef; con recintos de PdV).
9. Robustez ante variación real de datos de entrada — ¿asume idioma/nombre de Pset/convención que ya sabemos que varía entre archivos reales (`GSA BIM Area`, `Fläche`, `IfcWall` vs `IfcWallStandardCase`, etc.)?
10. Trazabilidad — ¿documenta el *por qué*, no solo el *qué*?

### Regla de uso de LLMs externos (§3.13, con incidente real que la motivó)
Al pedir segunda opinión sobre reconstrucción de ventanas, **DeepSeek afirmó** "en Chile es común dibujar ventanas con solo 2 líneas" — contradice directamente una convención ya confirmada por el arquitecto (`Convenciones_CAD.md`: 2 líneas sin línea central es la firma de **puerta**, no de ventana). Señal adicional: DeepSeek y Codex se contradijeron entre sí sobre `ancho_min_m` (uno pidió subirlo, el otro bajarlo), sin evidencia real detrás de ninguno.

**Regla resultante**: alcance permitido = revisión de código real (bugs, hardcoding, riesgos de un algoritmo). Fuera de alcance / no confiar sin verificar = cualquier afirmación sobre convenciones de dibujo, normativa chilena, "cómo se hace en la práctica" — ninguno de los dos tiene acceso a los planos reales del proyecto. Presentación obligatoria: las 2 respuestas completas por separado + la conclusión propia de Claude como tercera pieza aparte, **nunca una síntesis ya fusionada**.

### Herramientas evaluadas y descartadas
Un 3er LLM (Gemini/GPT genérico) como revisor adicional: descartado — comparte la misma limitación de fondo (sin acceso a datos reales del proyecto), la triplica en vez de resolverla. **Pendiente de decidir**: `mypy` (chequeo de tipos estático) como parte del Paso 0/1 — apunta directo al patrón de bug más repetido del proyecto (una función que a veces devuelve `None` y un consumidor que no lo contempla), determinístico y gratis.

---

## 5. Incidentes reales que motivaron cada capa (evidencia empírica del gap actual)

| Incidente | Qué pasó | Qué capa lo hubiera/lo atrapó |
|---|---|---|
| Beauchef, 5-6 sept | 4 intentos de fix parecían correctos en aislamiento, rompían Beauchef en producción (efecto no-local) | Motivó el Paso 2 golden-file (no existía antes) |
| Hardcodeo duplicado, 2026-09-20 | Mismo día, 2 veces: umbral de puerta hardcodeado + lista de tipos de recinto duplicada a mano | Motivó crear el Paso 0 (no existía antes de este incidente) |
| DeepSeek alucina convención de ventanas | Afirmó una convención de dibujo chilena falsa, con la misma confianza aparente que una afirmación correcta | Motivó la regla §3.13 (código sí, dominio no) |
| Bug de posición en tuplas | 2 consumidores BIM leen `OGUC_REGLAS[...][1]` por posición, no por nombre — hallazgo real de DeepSeek en una consulta | Motivó los 3 `assert` de auto-consistencia en `reglas_normativas.py` |
| Puertas sin dato — inferencia por footprint | Calibrada contra **un solo caso** de verdad conocida (N=1) — ver memoria del proyecto | Sin capa que lo cubra hoy más allá de revisión manual |
| Bug AREAUNIT ≠ LENGTHUNIT | Bug real de unidades en ancho de puerta, corregido — ver memoria del proyecto | Sin test de regresión específico conocido para este caso |
| Rampa fabricada por competidor (Revi) | Un competidor usó una fórmula de rampa sin fuente real; ArchiCheck audita activamente contra esto, prefiere marcar `SIN VERIFICAR` a inventar | Disciplina de `reglas_normativas.py`, no una capa de testing en sí |

---

## 6. Lo que el proceso actual NO cubre (gaps explícitos)

1. **Sin métricas sistematizadas de falsos positivos/negativos.** El Paso 0 documenta sus propios falsos positivos/negativos conocidos en el docstring, pero no hay un registro histórico ni una tasa medida a lo largo del tiempo, para ninguna capa.
2. **El golden-file (Paso 2) solo cubre el canal CAD/PDF**, con 3 proyectos (PdV, Beauchef, Campo Lindo) — el canal BIM no tiene su propio golden-file (los 8 IFC de ejemplo se usan para validación manual puntual, no como suite de regresión automatizada).
3. **El Paso 3 (LLM) es manual y sin persistencia estructurada de resultados a través del tiempo** — cada corrida guarda un JSON crudo con timestamp (`_codex_reviews/`, `_deepseek_reviews/`, `_consultas_ing_sw_paso2/`), pero no hay un tracker de "qué se preguntó, qué se encontró, se corrigió o no, cuándo" consultable — hay que leer los JSON uno por uno.
4. **Varias heurísticas calibradas con N=1** (ej. `bisagra_por_geometria` en el pipeline BIM, umbral `UMBRAL_ASIMETRIA_BISAGRA_M = 0.02 m`) — sin conjunto de validación más amplio todavía.
5. **Sin CI real** — el pre-commit hook es local (`.githooks/pre-commit`, opt-in vía `git config core.hooksPath`), no corre en GitHub Actions ni en el deploy de Vercel. Nada bloquea un push directo si el hook no está activado en la máquina de quien comitea.
6. **El pipeline CAD (Celda 4, Colab) no puede importar `reglas_normativas.py`** — depende de disciplina manual (copiar el contenido exacto) para no desincronizarse, con el riesgo de derive silencioso que eso implica.
7. **`verificar_hardcodeo_normativo.py` es grep dirigido, no análisis semántico** — reconoce solo el patrón exacto ya visto una vez (por diseño, documentado explícitamente en su propio docstring).
8. **Sin regresión de rendimiento** — el punto 8 del checklist del Paso 3 pregunta por O(n²)/O(n³) como parte de una revisión de código puntual, pero no hay benchmark automatizado que lo mida en cada corrida.

---

## 7. La pregunta para las IAs (el brief real)

Con todo el contexto de arriba, **ArchiCheck ya tiene una metodología de revisión de 4 capas en producción** (grep mecánico de hardcodeo → regresión fija + property-based testing → golden-file condicional contra proyectos reales → revisión de código por 2 LLMs con checklist fijo de 10 puntos). No es una metodología ingenua, tiene evidencia real detrás de cada capa (ver sección 5) y principios explícitos bien pensados (nunca fallar en silencio, dato ausente ≠ incumplimiento, LLMs solo para código nunca para hechos de dominio, una sola fuente de reglas).

**Lo que se pide**: ayudar a diseñar la siguiente vuelta de esta metodología, considerando en particular:

1. **Falsos positivos y falsos negativos como concepto de primera clase** — ¿cómo medirlos y trackearlos sistemáticamente para un motor de reglas normativas (no un clasificador ML tradicional, sino reglas determinísticas sobre geometría extraída con incertidumbre)? ¿Qué correspondería a una matriz de confusión acá — por regla individual (ej. `puerta_ancho_libre`), por tipo de incumplimiento, por canal (CAD vs BIM)?
2. **Test de regresión más allá del golden-file actual** — el golden-file de 3 proyectos cubre el canal CAD. ¿Cómo extender esto al canal BIM (que ya tiene ~8+ datasets IFC reales de prueba, de distintas tipologías y software de origen)? ¿Vale la pena un dataset "adversarial" curado a propósito (con los edge cases ya conocidos: puertas sin dimensión, IfcSpace ausente, nombres en otro idioma, unidades no-métricas)?
3. **Qué le falta al checklist de 10 puntos del Paso 3** — ¿hay categorías de riesgo de software que el checklist actual no cubre? (ej.: seguridad, concurrencia, migración de esquema, drift de dependencias de terceros como `ifcopenshell`/`shapely`/`matplotlib`).
4. **CI real vs. hook local** — vale la pena migrar el Paso 0/1 a GitHub Actions? ¿Qué se gana/pierde dado que el repo es de un solo desarrollador con ayuda de IA, no un equipo?
5. **Calibración N=1** — para heurísticas como `bisagra_por_geometria`, ¿qué metodología estadística mínima razonable existe para pasar de "funciona en el único caso que probamos" a "confiamos en el rango de aplicabilidad", sin necesitar un dataset gigante?
6. **Property-based testing más allá de geometría** — ya se usa `hypothesis` para invariantes geométricos del pipeline CAD. ¿Qué otras propiedades del sistema (motor de reglas normativas, RAG, extracción IFC) se prestan a este enfoque?
7. **Cualquier técnica de testing de software relevante que el usuario no haya mencionado** — mutation testing, fuzzing dirigido a parsers de IFC/PDF, snapshot testing del informe final, contract testing entre Worker/Supabase/frontend, etc. — evaluar si aplica a este contexto específico (proyecto de un desarrollador + IA, dominio normativo con reglas parcialmente inciertas, dos pipelines de extracción con implementaciones deliberadamente distintas pero salida unificada).

**Formato de respuesta esperado**: propuesta concreta y accionable, priorizada, que reconozca lo que ya existe (no reinventar el Paso 0-3 actual) y proponga qué agregar o cambiar — no una introducción genérica a testing de software.
