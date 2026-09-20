# "Revisión Ing SW" v3 — propuesta consolidada de 5 IAs

**Qué es este documento.** Consolidación de las respuestas de ChatGPT, Gemini, Copilot, Perplexity y Claude.ai al [Brief_Robustecer_Revision_Ing_SW.md](Brief_Robustecer_Revision_Ing_SW.md) (v2, 2026-09-21), cada una consultada por separado con el mismo contexto. Ninguna de las 5 tiene acceso al código real — cada punto de este documento está marcado según [[feedback_archicheck_revision_ing_sw_listar_pendientes]]: **SIN VERIFICAR** (afirmación sin poder confirmar contra el repo), **SIN DEFINIR** (relevante, sin propuesta concreta) o **PENDIENTE** (propuesta concreta, no implementada todavía).

**Estado de este documento**: es una síntesis para que el usuario revise y de su OK antes de implementar nada — nada de lo que sigue está ejecutado todavía.

**Fuentes completas**: cada IA respondió en su propia conversación web (no guardadas como archivo aparte por ahora — si hace falta el texto completo de alguna, se puede volver a esa sesión). Este documento sintetiza, no reemplaza, el detalle de cada una.

---

## 1. El hallazgo más importante: las 5 coincidieron en un reencuadre, no en agregar más tests

Ninguna de las 5 IAs propuso simplemente "agregar más suites de test". Las 5, de forma independiente, llegaron a una idea muy parecida: **los incidentes reales descritos (circulares DDU falsas, 86% de un PRC sin procesar, umbral de puerta mal citado en producción, cita de ventilación falsa visible al usuario, 3 fixes que no se propagaron, vigencia hardcodeada) no son bugs de código en el sentido clásico — son fallas de un tipo que "Revisión Ing SW" hoy no tiene una capa dedicada a atrapar.**

La formulación más nítida fue la de ChatGPT — 4 clases de riesgo, cada una con su propia pregunta:

| Clase | Pregunta | Cubierta hoy por |
|---|---|---|
| Implementación | ¿el código hace lo que debe? | Paso 0-2 (bien cubierta) |
| Comportamiento | ¿detecta correctamente PASS/FAIL/incertidumbre? | Parcial — no hay un 3er estado explícito |
| **Datos** | ¿la información que alimenta las reglas es auténtica, completa y vigente? | **No cubierta antes de la auditoría de §5 del brief** |
| **Distribución** | ¿todos los consumidores de un valor usan la misma verdad? | **No cubierta — pasó 3 veces real** |

Copilot llegó a la misma conclusión con otras palabras ("el fallo no estaba en el software sino en el conocimiento normativo"), Gemini y Perplexity la codificaron como una "capa nueva" separada de las 4 existentes.

**Estado: PENDIENTE (consenso 5/5)** — esto debería ser el principio organizador de la v3, no un ítem más de una lista.

---

## 2. Recomendaciones con consenso fuerte (4 o 5 de 5 fuentes, independientes)

Estas son las que más confianza merecen — no porque "5 IAs lo dijeron" sea evidencia en sí, sino porque llegaron ahí por caminos de razonamiento distintos partiendo del mismo material.

### 2.1 Tercer estado explícito: PASS / FAIL / UNKNOWN (nunca "dato ausente = PASS")
**Consenso: 5/5.** Ya existe como principio informal ("dato ausente ≠ no cumple", checklist punto 5), pero ninguna capa lo fuerza como un tipo de dato explícito. Propuesta común: cada evaluación de regla devuelve uno de 3 estados canónicos, nunca un booleano; "UNKNOWN" nunca se cuenta como cumplimiento en ninguna agregación ni filtro (ataca directamente el bug real del `coalesce(vigencia, 'vigente')`).
**Estado: PENDIENTE** — diseño claro, sin decidir todavía nombres de campo ni cómo migrar el código existente que hoy probablemente devuelve booleanos o `None` de forma implícita.

### 2.2 Golden-file para BIM, usando los ~10 IFC reales como fixtures permanentes
**Consenso: 5/5.** Ninguna propuso generar cientos de archivos sintéticos — las 5 dijeron explícitamente usar los IFC que el proyecto ya tiene (incluyendo los 2 con colapso de precisión de coordenadas, que ya son "casos adversariales" de verdad, no hipotéticos). ChatGPT propuso el formato más concreto: cada IFC con un `.expected.json` paralelo, comparado por campos normalizados (`rule_id`, `status`, evidencia), no por diff de JSON completo — para que un cambio cosmético no rompa el golden.
**Estado: PENDIENTE** — falta decidir el formato exacto del `.expected.json` y quién define los valores esperados la primera vez (¿el arquitecto valida a mano una vez, o se congela el resultado actual como baseline?).

### 2.3 Verificar que una guardia REALMENTE dispara, no solo que el código no crashea
**Consenso: 5/5, y varias la marcaron P0.** Ataca directamente el bug de `vigencia` hardcodeada — un test que solo confirma "no hay excepción" no habría atrapado eso. Propuesta común: cada guardia crítica necesita un test de 2 estados como mínimo (input que SÍ debe disparar la guardia + input que NO debe) con una aserción sobre el resultado observable (`result.guard_triggered == "..."`), no solo la ausencia de crash.
**Estado: PENDIENTE** — el patrón es claro, falta aplicarlo guardia por guardia (empezar por `vigencia`, `coalesce`, las guardias de plausibilidad/rectilineidad de rampa).

### 2.4 Mecanismo de propagación de fixes a todos los consumidores
**Consenso: 5/5, varias P0.** El patrón "corregido en la fuente, 1-3 consumidores quedaron con el valor viejo" ya pasó 3 veces reales distintas (puerta, pasillo, vigencia). Dos ideas concretas convergentes:
- Un **manifiesto de consumidores** por regla (qué archivos consumen `puerta_ancho_libre`, por ejemplo) — cuando cambia la regla, el sistema sabe qué re-verificar.
- Un **grep del valor viejo en todo el repo** como paso obligatorio antes de cerrar cualquier fix de umbral (más simple que un manifiesto formal, mismo efecto práctico).
**Estado: PENDIENTE** — ambas variantes son razonables; el grep es más barato de implementar ya, el manifiesto escala mejor si el número de reglas/consumidores crece.

### 2.5 Integridad de datos normativos como capa continua, no auditoría puntual
**Consenso: 5/5.** Todas coincidieron en que la auditoría de §5 del brief (que encontró las circulares DDU falsas, el PRC sin procesar, etc.) no puede quedar como un evento de una sola vez — necesita convertirse en un chequeo que corra en cada cambio de `normativa/`. Elementos concretos mencionados: % de páginas/artículos extraídos vs. el documento fuente real, que cada cita tenga artículo+texto fuente verificable (no solo un número), vigencia con un 4to estado explícito (`DESCONOCIDA` ≠ `VIGENTE`).
**Estado: PENDIENTE** — coincide con la regla de cobertura 100% que ya existe (§3.17 Diseño Funcional); esto la convertiría de proceso manual a chequeo automatizado.

### 2.6 Ampliar el checklist de 10 puntos del Paso 3
**Consenso: 4/5** (ChatGPT, Gemini, Copilot, Perplexity — Claude.ai no llegó a este punto por falta de contexto). Categorías nuevas propuestas, con solapamiento alto entre fuentes:
- **Seguridad/aislamiento** — especialmente relevante porque hay IA en el pipeline (prompt injection vía contenido de IFC/PDF, no solo inyección de código clásica).
- **Drift de dependencias** — `ifcopenshell`, `shapely`, SDKs de Anthropic/OpenAI, ¿algún upgrade puede cambiar un resultado geométrico o normativo en silencio?
- **Determinismo** — mismo input, ¿mismo resultado? Relevante distinguir el motor determinístico (debe ser 100% repetible) de las partes con LLM (Claude Vision/GPT-4o, donde cierta variación es esperable pero debe estar acotada).
**Estado: PENDIENTE** — checklist ampliado de 10 a ~13 puntos, agrupando en vez de simplemente añadiendo.

### 2.7 CI real para Paso 0-2, Paso 3 se mantiene manual
**Consenso: 5/5, sin disidencia.** Ninguna de las 5 sugirió automatizar el Paso 3 (todas entendieron y respetaron la razón: costo real de API + necesidad de revisión humana de cada respuesta). Todas coincidieron en que Paso 0-2 debería vivir en GitHub Actions en vez de depender de un hook local opt-in.
**Estado: PENDIENTE** — bajo riesgo, alto consenso, probablemente el ítem más fácil de implementar primero.

### 2.8 Mutation testing
**Consenso: 3/5 (ChatGPT y Copilot lo marcaron P0/prioridad alta explícita; Perplexity lo mencionó sin priorizar; Gemini y Claude no llegaron a este punto).** El argumento más convincente (ChatGPT): mutar `>=` por `>`, o `0.80` por `0.81`, y confirmar que ALGÚN test muere — si sobrevive, es evidencia directa de un hueco de cobertura, no una suposición. Coincide con el propio bug histórico del proyecto (un `0.80` vs `0.799` casi indistinguible ya fue un caso real mencionado en el checklist punto 2).
**Estado: PENDIENTE** — herramienta concreta sin decidir (`mutmut` es la opción estándar para Python, ninguna IA la nombró específicamente pero es la más usada).

### 2.9 Property-based testing más allá de geometría
**Consenso: 5/5.** Ya se usa `hypothesis` para invariantes geométricos (Paso 1). Propuestas de extensión, con alto solapamiento: monotonicidad (`ancho=0.79 falla` ⇒ `ancho=0.90 no puede fallar por el mismo motivo`), invariancia a orden/naming de elementos, y la propiedad más repetida entre fuentes: **generar aleatoriamente campos ausentes y verificar que NUNCA se conviertan en PASS silencioso** — esta última ataca el mismo patrón que 2.1 pero desde el ángulo de testing en vez de diseño de tipos.
**Estado: PENDIENTE**

### 2.10 Contract testing entre componentes
**Consenso: 3/5 (ChatGPT, Perplexity, Copilot explícitos; Gemini lo mencionó como prueba de integración sin usar el término).** Dado que el sistema son "3 piezas que no comparten runtime" (frontend, Worker, Supabase) más 2 pipelines de extracción con salida unificada, un contrato mínimo (`{rule_id, status: PASS|FAIL|UNKNOWN, evidence}`) evitaría que un cambio en un consumidor rompa otro silenciosamente — el mismo problema de 2.4 pero a nivel de esquema de datos, no de valores normativos.
**Estado: PENDIENTE**

---

## 3. Puntos donde las fuentes divergieron (menor consenso, requieren decisión del usuario)

- **Calibración de heurísticas N=1**: ChatGPT y Copilot proponen un dataset *sintético pequeño pero diseñado a propósito* alrededor del umbral (ej. `fill_ratio` en 0.99, 0.95, 0.90, 0.86, 0.85, 0.84, 0.80 + formas L/U/ruido) para medir sensibilidad, no para "demostrar que 0.85 es correcto". Ninguna propuso lo que se había considerado en la sesión anterior (usar los casos donde SÍ hay dato declarado como ground truth retroactivo) — esa idea queda como alternativa complementaria, no reemplazada.
- **Fuzzing**: consenso más débil (3/5 lo mencionan, todas con prioridad baja/P2, todas coinciden en "acotado" — un job nocturno/semanal sobre parsers de IFC/PDF, no fuzzing continuo pesado).
- **Snapshot testing**: mencionado por 3/5, todas con la misma advertencia — selectivo (estructura de evidencia, resultado normalizado de una regla), nunca snapshot del output completo de IA.
- **Perplexity fue la única que trajo una referencia normativa externa** (ISO/IEC/IEEE 29119) y el marco de "oráculos" (determinista / experto / metamórfico) — un lente útil pero no repetido por las otras 4, vale la pena revisarlo en su respuesta completa si se quiere profundizar ahí.
- **Claude.ai fue la única que, en vez de proponer, devolvió preguntas** ("¿existe hoy algún test automatizado?", "¿cuál es el mayor incidente de calidad que ha tenido ArchiCheck?") — completamente razonable dado que recibió menos contexto que las otras 4 en esta corrida particular, pero las preguntas en sí son buenas: revelan qué le falta al brief para ser autocontenido la próxima vez.

---

## 4. Lo que ChatGPT explícitamente NO agregaría todavía (vale la pena registrar, no solo lo que sí)

Señal de buen juicio, no de flojera — ChatGPT fue la única fuente que dedicó una sección a esto explícitamente:

- Sistema estadístico sofisticado de calidad.
- Cientos de IFC sintéticos.
- ML para detectar regresiones.
- Cobertura de código como KPI principal.
- Fuzzing continuo pesado.
- Framework complejo de mutation testing (vs. uno acotado).
- Automatización total del Paso 3.

Razonamiento citado: los incidentes reales no fueron de falta de volumen de tests, sino de una cadena específica (dato incorrecto → dato ausente tratado como válido → guardia inerte → consumidor desactualizado → resultado incorrecto → usuario final) — la inversión debería seguir esa cadena, no agrandar lo que ya funciona.

---

## 5. Priorización consolidada (P0/P1/P2)

Fusionando las 3 priorizaciones explícitas (ChatGPT, Copilot, y la lectura implícita de Perplexity vía sus "Gates"):

**P0 — primero, más consenso y mayor conexión directa con incidentes ya ocurridos:**
1. Estado canónico PASS/FAIL/UNKNOWN, prohibiendo `dato_ausente → PASS` (§2.1)
2. Golden-file BIM con los IFC reales como fixtures permanentes (§2.2)
3. Guard tests que demuestren activación, no solo ausencia de crash (§2.3)
4. Mecanismo de propagación de fixes a consumidores (§2.4)
5. Integridad de datos normativos como capa continua (§2.5)
6. CI real para Paso 0-2 (§2.7)

**P1 — segunda etapa, alto valor pero menos urgente:**
7. Mutation testing acotado sobre el motor de reglas (§2.8)
8. Property-based testing ampliado (§2.9)
9. Contract testing entre componentes (§2.10)
10. Checklist de Paso 3 ampliado a ~13 puntos (§2.6)
11. Tracking histórico estructurado del Paso 3 (asociar cada consulta a commit SHA + versión de checklist + modelo + resultado — mencionado por ChatGPT y Gemini)

**P2 — después:**
12. Fuzzing acotado (parsers IFC/PDF, job periódico)
13. Dataset sintético pequeño para calibración de heurísticas N=1
14. Snapshot testing selectivo

---

## 6. Lo que este documento deja SIN VERIFICAR / SIN DEFINIR explícitamente

Por transparencia, siguiendo la misma regla que se le pidió a las 5 IAs:

**SIN VERIFICAR** (afirmaciones de las fuentes externas sin confirmar contra el repo real):
- Que el estado actual de las funciones de evaluación de reglas realmente use booleanos/`None` implícitos en vez de un 3er estado — es la lectura más probable dado lo que sabemos, pero no se releyó el código para esta consolidación.
- Cualquier estimación de esfuerzo/tiempo de implementación de cada ítem — ninguna de las 5 IAs las dio con precisión verificable, y esta consolidación tampoco las inventa.

**SIN DEFINIR** (reconocido como relevante por consenso, sin propuesta concreta todavía):
- Nombre exacto de campos/módulos nuevos (`rule_id`, `status`, esquema de `.expected.json`, etc.) — cada fuente propuso una convención ligeramente distinta, hay que elegir una antes de implementar.
- Herramienta concreta de mutation testing para este stack (Python + JS/mjs mixto).
- Quién/cómo se valida a mano la primera versión de cada golden-file BIM (¿el usuario revisa cada IFC una vez, o se congela el resultado actual del pipeline como baseline sin revisión adicional?).

**PENDIENTE** (todo lo de las secciones 2-3 — diseño recomendado, nada implementado).

---

## 7. Próximo paso

Este documento es para que el usuario lo revise y decida: (a) confirmar el orden P0/P1/P2 de la sección 5, o ajustarlo; (b) resolver los puntos SIN DEFINIR de la sección 6 que bloquean empezar a implementar; (c) dar el OK para ejecutar el primer ítem (o el conjunto P0) en esta sesión.
