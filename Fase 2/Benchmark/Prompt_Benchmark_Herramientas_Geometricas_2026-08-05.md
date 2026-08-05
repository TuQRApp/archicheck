# Prompt para consultar a otras IAs — herramientas complementarias de extracción geométrica de planos

Contexto: preparado a pedido del usuario el 2026-08-05, para pegar tal cual en otra IA (ChatGPT, Gemini, Perplexity, etc.) y obtener recomendaciones de herramientas/APIs complementarias a lo que ArchiCheck ya construyó, dado que Floor Plan API (floorplanapi.com) quedó bloqueada por no poder completar el registro/obtener API key. El desafío principal declarado por el usuario: que el análisis geométrico sea exacto para casi cualquier tipo de plano, no solo el caso de prueba actual.

---

## PROMPT (copiar desde aquí)

Estoy construyendo **ArchiCheck**, una herramienta que analiza planos arquitectónicos en PDF (2D, no BIM/DWG) para pre-validar el cumplimiento de normativa de construcción chilena (OGUC, LGUC, DDU, PRC comunales) antes de presentar un proyecto a la Dirección de Obras Municipales. El público objetivo son estudios de arquitectura chilenos, en su mayoría pequeños, que hoy trabajan en PDF, no en Revit/ArchiCAD.

### Qué ya construimos (para que no me recomiendes reinventar esto)

El pipeline actual corre en Python/Colab y tiene dos capas:

1. **Extracción geométrica determinística** (PyMuPDF + OpenCV): parseo directo de los objetos vectoriales del PDF (`get_drawings()` — líneas, curvas Bézier, rectángulos, quads), agrupamiento por conectividad (Union-Find) para reconstruir muros como cadenas de segmentos, ajuste de círculo (método de Kasa) para detectar arcos de puerta, clasificación de puertas también desde curvas Bézier reales del PDF, exclusión de achurado/ejes/cotas por color y geometría, y segmentación de recintos vía `adaptiveThreshold` + `connectedComponentsWithStats`.
2. **Interpretación semántica**: Claude Vision + GPT-4o en paralelo, para nombrar recintos, leer cuadros de superficie, contar puertas/ventanas/escaleras, y cruzar eso contra la medición geométrica independiente.
3. **Motor de reglas normativas**: cada regla (ancho mínimo de pasillo, superficie mínima, círculo de giro accesible, pendiente de rampa, etc.) está anclada a texto verificado de la OGUC/LGUC/DDU/PRC, no inventada ni parafraseada por un LLM sin ancla.
4. **Interfaz de validación gráfica del arquitecto**: el arquitecto revisa y corrige la geometría detectada antes de correr el análisis normativo completo — el sistema no se auto-engaña con datos sin validar.

### El problema real que quiero resolver

El pipeline geométrico funciona razonablemente sobre UN plano de prueba, calibrado a mano durante semanas (filtros de ángulo, color, umbrales de barrido angular, tolerancias de conectividad, etc.). Cada vez que aparece un plano nuevo con una convención de dibujo distinta (otra oficina, otro software CAD, otra forma de marcar puertas/achurado), varios de esos filtros dejan de servir. Ejemplo concreto reciente: llevamos 5 rondas de diagnóstico intentando entender por qué 7 puertas reales de un plano no generan NINGÚN dato — descartamos que sean imágenes incrustadas, Form XObjects, anotaciones PDF, imágenes inline y fuentes Type3, una por una, con evidencia real en cada paso.

**El desafío central, tal como lo definió el responsable del producto**: que el análisis geométrico (muros, puertas, ventanas, recintos con área) sea preciso para *casi cualquier tipo de plano de arquitectura chileno/latinoamericano en PDF*, no solo el caso calibrado a mano — es decir, generalización de la extracción geométrica, no solo precisión puntual.

### Lo que ya evaluamos (no lo repitas, dime qué falta)

- **Floor Plan API** (floorplanapi.com) — API REST que devuelve muros/puertas/ventanas/recintos con área desde una imagen. Quedó **bloqueada**: requiere registro propio (`floorplanapi.com/register`) para obtener API key, y no lo pudimos completar/obtener acceso funcional. Sigue siendo el candidato de referencia si alguien puede confirmarnos cómo conseguir acceso real, o si hay una alternativa equivalente sin esa fricción.
- **CubiCasa5K** (modelo abierto, checkpoint pre-entrenado) — probado contra nuestro ground truth: 100% precisión en ventanas pero recall bajo (29-36%), precisión muy baja en puertas (19-36%, mayoría falsos positivos correlacionados con achurado de "se construye"). Entrenado en planos residenciales finlandeses, brecha de dominio real.
- **Grounding DINO + SAM 2** (zero-shot) — 0% recall efectivo contra nuestro ground truth. Entrenado en fotografías, no reconoce símbolos de línea CAD. Confirmado con múltiples corridas, no es un problema de threshold.
- **U-Net + MLSTRUCT-FP** (Pablo Pizarro, dataset de 954 planos chilenos reales) — solo segmenta muros (no puertas/ventanas/recintos), el propio autor reporta IoU promedio 0.77 (moda 0.90) y describe su resultado como "prueba de concepto" con artefactos pendientes. Hay checkpoint pre-entrenado disponible, todavía no lo corrimos.
- **CubiCasa 2.0** (producto comercial, distinto del dataset abierto) — catalogado como "opción líder, API amigable para desarrolladores", no evaluado en profundidad todavía.
- **Togal.AI** — evaluado, descartado por precio (~US$299/usuario/mes) y mercado objetivo (contratistas grandes de EE.UU., no estudios chilenos chicos).
- **Markovate** (soporte DWG/DXF/escaneado) y **Bild AI** (profundidad en puertas/Div. 8) — catalogados, no evaluados en profundidad.
- **Mastt** y **Kreo Caddie** — tienen patrón de chat/Q&A en lenguaje natural sobre el plano, relevante como referencia de UX, no como fuente de datos geométricos.
- **MuraNet** (literatura, reporta IoU 0.8 en CubiCasa5K) — sin repo público con pesos descargables, no se pudo probar.
- **Faster-RCNN + ResNet** — candidato de literatura, no implementado.
- Revisamos también el registro de conectores MCP de Claude buscando "floor plan/architecture/blueprint/CAD" — no existe ningún conector MCP para esto.

### Lo que necesito que me respondas

1. **Herramientas o APIs concretas** (no listas genéricas de "usa OpenCV o YOLO") que extraigan geometría de planos arquitectónicos 2D (muros, puertas, ventanas, recintos con área) desde PDF o imagen rasterizada, que:
   - Tengan una vía de acceso real y verificable (API con registro que efectivamente funcione, o modelo open-source con pesos descargables) — no me interesan productos sin forma clara de probarlos.
   - Idealmente generalicen bien entre distintas convenciones de dibujo/oficinas/software CAD, no solo un dominio de entrenamiento estrecho (evita repetir el problema que ya tenemos con CubiCasa5K/DINO).
   - Si es posible, con evidencia de que funcionan razonablemente sobre planos latinoamericanos/chilenos o al menos hispanohablantes/con convenciones distintas a EE.UU./Europa — o dime explícitamente si no la hay.

2. **Papers o repos recientes (2024-2026)** de extracción/vectorización de planos con código y pesos públicos que no hayamos identificado todavía (ya conocemos MLSTRUCT-FP/Pizarro, CubiCasa5K, MuraNet, Faster-RCNN genérico — dime qué hay más allá de esto, especialmente si aborda el problema de generalización entre convenciones de dibujo, no solo precisión en un dataset fijo).

3. **Para cada herramienta que recomiendes**, decime explícitamente:
   - Cómo se accede en la práctica (API con key real, self-host, requiere GPU, etc.) y qué fricción de acceso tiene (para no repetir el bloqueo de Floor Plan API).
   - Precio o modelo de negocio si es conocido.
   - Cifras de precisión/recall/IoU **solo si están publicadas con fuente verificable** (paper, benchmark público, documentación técnica) — si es un claim de marketing sin evidencia, dímelo explícitamente como tal, no lo presentes con el mismo peso que un benchmark real. Ya nos pasó que un competidor (Revi) citó una fórmula normativa que resultó ser real pero mal calculada, y otro dato que resultó fabricado — priorizo evidencia verificable sobre afirmaciones de venta.
   - Si complementa o compite con lo que ya construimos (extracción vectorial determinística propia + CubiCasa5K + pendiente de correr MLSTRUCT-FP/U-Net).

4. **Una recomendación priorizada**: si tuvieras que elegir 2-3 opciones para probar primero dado que ya evaluamos las de arriba, ¿cuáles serían y por qué, específicamente pensando en el objetivo de generalización entre distintos tipos/convenciones de plano, no solo precisión en un caso?

No necesito que me expliques compliance/normativa (eso lo tenemos resuelto con nuestro propio motor de reglas) — el foco de esta consulta es exclusivamente la capa de extracción geométrica.
