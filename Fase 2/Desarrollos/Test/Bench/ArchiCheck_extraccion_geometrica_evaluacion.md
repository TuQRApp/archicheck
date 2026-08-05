# Extracción geométrica de planos — evaluación técnica para ArchiCheck

Fecha: 2026-08-05. Alcance: exclusivamente la capa de extracción geométrica (muros, puertas, ventanas, recintos con área) desde PDF 2D. No cubre normativa (ya resuelto por su motor de reglas).

Metodología: 3 líneas de investigación independientes (papers/repos 2024-2026 con código y pesos; APIs/SaaS comerciales con acceso verificable; datasets/generalización específicos de Latinoamérica), cruzando cada hallazgo contra fuente primaria (repo real, docs de API, paper) en vez de aceptar snippets de búsqueda o texto de marketing al valor nominal.

---

## 1. Herramientas y APIs con vía de acceso real

### 1.1 Comerciales / SaaS

| Producto | Acceso real | Precio | Qué detecta | Dominio correcto (PDF/CAD vs. foto) | Evidencia de precisión |
|---|---|---|---|---|---|
| **Kamai** (kamai.io) | Self-serve: `app.kamai.io` para probar, `admin.kamai.io` para API key. No confirmado que la key funcione sin pagar — pero es el único con portal de key visible sin pasar por ventas. | No publicado; probablemente cotización. | Muros, áreas, ventanas, puertas, artefactos, tuberías/ductos, dimensiones de recintos, volúmenes de hormigón. | **Correcto** — dice explícitamente aceptar "PDF drawings, scanned sheets, or vector documents". | Ninguna publicada. Clientes citados: gobierno/defensa israelí. Traten cualquier cifra de exactitud como no verificada hasta probarlo. |
| **FloorScan.ai** (ya evaluado por Uds. como candidato de referencia) | Herramienta web sí es self-serve (trial gratis 30 días). **API listada como "coming soon"**; incluso en el plan Business (€199/user/mes) el acceso a API es "on request", no self-serve. | Free (10 export/mes) · Pro €79/mes (150) · Business €199/mes (ilimitado) | Puertas, ventanas, muros de carga, superficies, exporta a DXF/Excel. | Correcto (PDF nativo, no foto). | "+90% accuracy" en su sitio — **afirmación de marketing sin metodología publicada**, no es un benchmark. |
| **CubiCasa** (API "Conversion" e "Integrate") | Confirmado: **dominio equivocado**. Conversion API solo acepta escaneos del SDK móvil CubiCasa (LIDAR/foto) empaquetados — no hay ruta de entrada PDF/CAD. Integrate API sí tiene alta de key self-serve (sandbox con tarjeta de prueba), pero para el mismo pipeline foto→plano. | Por cotización, cobro por escaneo. | Foto de espacio existente → plano 2D/3D. No aplica a planos de arquitectura en PDF. | **Incorrecto** — es "foto de casa real → plano", no "PDF de arquitecto → geometría". | N/A — no es el problema que están resolviendo. |
| **Markovate** ("AI Plan Review" / "AI Blueprint Reader") | No hay producto self-serve: solo "contact us" / demo. Una página cita POC a medida de US$35.000–50.000. | Custom, alto. | No aplica — es un estudio de desarrollo a medida, no una API. | N/A | N/A |
| **Bild AI** (YC W25) | Solo plataforma web, sin API ni precio público; acceso cliente por cliente. | No publicado. | **Solo División 8** (puertas, marcos, herrajes, resistencia al fuego) — no muros/ventanas/recintos completos. | Correcto en dominio (PDF de arquitectura) pero **alcance insuficiente** para lo que necesitan. | Ninguna publicada. |
| **Bricsys BricsCAD BIM (BIMIFY)** | No aplica a su caso: clasifica sólidos 3D que ya existen en un dibujo, no detecta muros/puertas desde un PDF/imagen de fondo. Sin API para uso batch. | — | — | **Incorrecto** para PDF plano. | — |
| **floorplanapi.com** | Sigue sin confirmación independiente: no hay colección Postman, SDK en GitHub, ni reseña de terceros que confirme una key funcional. La documentación describe `pip install floorplan-api` y keys `fp_live_...`, pero no hay evidencia externa de que el backend realmente las emita. | Desconocido | — | — | — |
| **Autodesk Forma** | Sin función de detección de muros/puertas desde PDF de fondo — su IA es de masterplan/volumetría, no digitalización de dibujos. | — | — | — | — |

**Conclusión de esta sección**: de todo lo comercial evaluado (por Uds. y en esta investigación), **Kamai es el único candidato nuevo que vale la pena probar en la práctica** — es el único que declara explícitamente ingesta de PDF/CAD (no foto) y extracción de muros+puertas+ventanas+recintos, con un portal de acceso que aparenta ser self-serve. Todo lo demás es, o bien el problema equivocado (CubiCasa, Bricsys), o acceso bloqueado por ventas (Markovate, Bild AI, FloorScan API), o sigue sin poder verificarse (floorplanapi.com — mismo bloqueo que ya tenían).

### 1.2 Modelos open-source con pesos descargables (no solo papers)

| Modelo | Repo / pesos | Qué detecta | Entrenado en | Generalización | Fricción de acceso |
|---|---|---|---|---|---|
| **SymPointV2** (ICLR 2024 → seguimiento 2024) | [github.com/nicehuster/SymPointV2](https://github.com/nicehuster/SymPointV2) — pesos en Google Drive, link con formato normal (no verificado descarga real) | Símbolos CAD (incl. puertas/ventanas) vía Panoptic Quality | Solo FloorPlanCAD (CAD vectorial) | No evaluada fuera de FloorPlanCAD — mismo riesgo de sesgo de dominio que ya tienen con CubiCasa5K | Requiere GPU, pipeline PyTorch propio |
| **Raster2Seq** (SIGGRAPH 2026) | [github.com/Cornell-VAILab/Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq) — checkpoints confirmados en Google Drive para Structured3D, CubiCasa5K y Raster2Graph | Polígonos de recintos + puertas/ventanas (**sin muro explícito**) | 3 datasets distintos, con checkpoints separados | **Es el único repo encontrado que mide y reporta explícitamente la caída de desempeño entre dominios** (entrena en A, evalúa en B, más un zero-shot en WAFFLE, un dataset heterogéneo real). Los propios autores señalan que puertas/ventanas son el punto débil bajo distribution shift — el mismo síntoma que ya vieron con CubiCasa5K. | GPU, pipeline propio |
| **MitUNet** (2025) | [github.com/aliasstudio/mitunet](https://github.com/aliasstudio/mitunet) + dataset en Zenodo | Solo muros | Pre-entrenado en CubiCasa5K, *fine-tuneado* en 500 planos regionales rusos/CIS con convenciones de dibujo distintas | Es el **único hallazgo que demuestra una receta de adaptación exitosa** (no solo mide la caída, sino que la corrige): pre-entrenar en CubiCasa5K y afinar con un dataset regional pequeño. Reporta mIoU 88,5%, precisión 95%, recall 93% en el dominio regional después del ajuste. | GPU, reentrenamiento propio |
| **ArchCAD-400K + DPSS** (mar. 2025) | [github.com/ArchiAI-LAB/ArchCAD](https://github.com/ArchiAI-LAB/ArchCAD) · dataset en HuggingFace (solo 40K de 413K muestras publicadas) · pesos de terceros no oficiales, sin verificar procedencia | Puertas, ventanas, mobiliario, columnas, vigas — **27 categorías de símbolos CAD, sin muros ni polígonos de recinto** | 5.538 dibujos CAD reales, mayoría chinos, 86% no residencial | Dataset 26× más grande que FloorPlanCAD, pero de origen probablemente chino — sin evidencia de convenciones latinoamericanas | Necesita primitivas vectoriales (no raster) — compatible en principio con su parser PyMuPDF existente si logran alimentar los mismos formatos |
| **SAM prompteado (sin fine-tuning) para segmentación de recintos** | Paper "Segmenting Anything in Architecture" (ICIAP 2025) | Solo polígonos de recinto (no muros/puertas) | Evaluado en dataset propio + R3D público | Reporta que SAM *sin reentrenar*, solo con prompts, generaliza razonablemente a estilos de plano no vistos para el problema específico de segmentar recintos — **distinto de lo que ya probaron** (Grounding DINO+SAM2 para detectar objetos puerta/ventana vía cajas, entrenado en fotos). Vale la pena probar SAM prompteado solo para el paso de segmentación de recintos, no como reemplazo de su Grounding DINO+SAM2 para símbolos. | GPU liviana, SAM corre razonablemente en CPU/GPU chica |

**Conclusión de esta sección**: ningún modelo resuelve la generalización "de fábrica". Pero dos hallazgos son accionables de inmediato: (a) Raster2Seq les da un segundo punto de datos, con pesos ya descargables, sobre dónde se rompe exactamente un detector moderno de recintos+puertas/ventanas bajo cambio de dominio; (b) MitUNet no es una herramienta que vayan a usar tal cual, pero es **evidencia publicada de que la receta "pre-entrenar en CubiCasa5K + fine-tune con un dataset regional chico" funciona** — y ustedes ya tienen ese dataset regional (los 954 planos de MLSTRUCT-FP) sin usar.

---

## 2. Papers/repos 2024-2026 que no tenían identificados

- **ArchCAD-400K / DPSS** — [arXiv:2503.22346](https://arxiv.org/abs/2503.22346) (mar. 2025). Dataset+baseline más grande a la fecha para symbol-spotting en CAD vectorial. Ver tabla arriba.
- **Raster2Seq** — [arXiv:2602.09016](https://arxiv.org/abs/2602.09016) (SIGGRAPH 2026). El más relevante para su pregunta de generalización — ver tabla arriba.
- **SymPoint** ([arXiv:2401.10556](https://arxiv.org/abs/2401.10556), ICLR 2024) → **SymPointV2** ([arXiv:2407.01928](https://arxiv.org/abs/2407.01928), jul. 2024). Mejora Panoptic Quality de 83,3%→90,1% en FloorPlanCAD (tabla propia del paper, sin verificación externa).
- **MitUNet** — [arXiv:2512.02413](https://arxiv.org/html/2512.02413v3) (dic. 2025). Ver tabla arriba — la receta de transferencia es el hallazgo más útil de toda esta búsqueda.
- **DoorDet** — [arXiv:2508.07714](https://arxiv.org/abs/2508.07714) (ago. 2025). Dataset de detección de puertas más nuevo, etiquetado semi-automático con detector de objetos + LLM. Origen geográfico no confirmado, pero la metodología de etiquetado asistido por LLM podría acelerar la anotación de sus propios planos chilenos si necesitan construir ground truth adicional.
- **CADSpotting** — [arXiv:2412.07377](https://arxiv.org/abs/2412.07377) (dic. 2024). Propone un dataset más grande (LS-CAD) y afirma mejor generalización vía muestreo denso de puntos, pero **no se encontró repo público** — solo paper, no ejecutable hoy.
- **"Segmenting Anything in Architecture"** (ICIAP 2025) — ver tabla arriba, único hallazgo sobre SAM aplicado (no afinado) a planos.
- **Pizarro & Hitschfeld, "Automatic floor plan analysis and recognition"**, *Automation in Construction* 140 (2022), [DOI](https://doi.org/10.1016/j.autcon.2022.104348) — no es nuevo, pero es la revisión de literatura que motivó MLSTRUCT-FP y describe explícitamente el problema de generalización que ustedes tienen ("la falta de una notación estándar... hace urgente" resolver esto). Confirma que su diagnóstico del problema es correcto, no una limitación de su propio pipeline.
- **Confirmado: no existe una v2 de MLSTRUCT-FP ni una extensión a puertas/ventanas/recintos** por parte de Pizarro — su repo (`MLStructFP_benchmarks`) está archivado, y su trabajo 2026 se mueve a diseño generativo de layouts, no a detección.
- **MSD (Modified Swiss Dwellings)**, ECCV 2024, [project page](https://caspervanengelenburg.github.io/msd-eccv24-page/) — dataset europeo complejo donde los propios autores documentan que las redes especializadas existentes "no parecen suficientemente robustas". Útil como caso documentado de fallo cross-dominio, no como fuente de datos chilenos.
- **CVC-FP** (Centre de Visió per Computador, Barcelona/UAB), [DAG page](https://dag.cvc.uab.es/dataset/cvc-fp-database-for-structural-floor-plan-analysis/) — pequeño (122 planos), pero con 4 subconjuntos de "origen y estilo" distintos, anotados con recintos/muros/puertas/ventanas. No confirmado que sean planos de origen español (podría ser CAD europeo genérico), pero por lo menos está en un contexto hispanohablante — útil como set de validación cruzada barato, no como fuente principal.
- **ResPlan** — [arXiv:2508.14006](https://arxiv.org/abs/2508.14006) (ago. 2025), dataset nuevo de 17.000 planos en grafo vectorial; origen/estilo sin confirmar, pendiente de revisión.
- **Búsqueda específica de datasets latinoamericanos (México, Argentina, Colombia, Brasil): resultado negativo.** No existe, hasta donde se pudo confirmar, ningún dataset público de planos anotados de esos países. Un paper brasileño (Rodrigues & Duarte, 2022) trata generación con GANs, no detección.
- **Hallazgo estructural más importante de esta línea de investigación**: no existe ningún paper que mida generalización cross-dataset de forma sistemática para extracción de elementos (entrenar en un dataset, evaluar en otro, publicar la brecha) — ni siquiera entre datasets ya conocidos como CubiCasa5K, MLSTRUCT-FP o CVC-FP. Es un vacío real de la literatura, no algo que se les esté escapando.

---

## 3. Notas sobre evidencia vs. marketing

Siguiendo su pedido explícito: toda cifra en este documento que no tenga un paper, tabla de benchmark o documentación técnica citada al lado debe tratarse como **no verificada**. Marcadas explícitamente como tales en este documento: el "+90% accuracy" de FloorScan.ai, y cualquier cifra de Kamai (no publicó ninguna). Las únicas cifras con fuente verificable (tabla de paper, aunque sin replicación independiente por un tercero) son las de SymPointV2, Raster2Seq y MitUNet, señaladas arriba con su origen.

---

## 4. Recomendación priorizada (2-3 para probar primero)

Dado que el objetivo es generalización — no precisión puntual — y ya evaluaron a fondo las opciones obvias:

**1) Probar Kamai (kamai.io) esta semana, con bajo costo de intentarlo.** Es el único producto comercial nuevo que apunta al problema correcto (PDF/CAD, no foto) con alcance completo (muros+puertas+ventanas+recintos) y un camino de acceso que no está bloqueado por ventas de entrada. El riesgo es que termine igual de opaco que floorplanapi.com una vez que intenten usarlo en serio — pero se confirma o descarta en una tarde, no en semanas.

**2) Adoptar la receta de MitUNet como método, no como herramienta**: usar los pesos públicos de CubiCasa5K (via el código de entrenamiento `floortrans`, que también es público) como punto de partida, y hacer fine-tuning con los 954 planos chilenos de MLSTRUCT-FP que ya tienen identificados y sin usar. Esto ataca directamente el problema de generalización que definieron como núcleo — es la única evidencia publicada de que "pre-entrenar en dataset grande no-chileno + afinar con dataset chico chileno" realmente cierra la brecha de dominio (88,5% mIoU post-ajuste en su caso ruso/CIS). Ventaja adicional: su propia interfaz de validación gráfica (donde el arquitecto corrige la geometría detectada) puede convertirse en la fuente de datos de fine-tuning continuo — cada corrección humana pasa a ser una etiqueta de entrenamiento, en vez de ser solo una capa de QA de un solo uso.

**3) Correr el checkpoint de Raster2Seq entrenado en CubiCasa5K contra sus planos chilenos, como segundo baseline de diagnóstico.** Es el único repo con pesos descargables que mide explícitamente la degradación cross-dominio y ya identifica puertas/ventanas como el punto débil — correrlo les da un segundo dato (además de su propio test de CubiCasa5K) sobre si el problema es el dataset de entrenamiento (Finlandia vs. Chile) o algo más estructural del enfoque (CNN/heatmap vs. su propio parseo vectorial determinístico). Esfuerzo bajo: los pesos ya están descargables, no requiere reentrenar nada para este paso.

**Mención aparte**: usar CVC-FP (España, 122 planos, 4 estilos distintos) como set de validación cruzada barato — correr cualquier modelo candidato contra CVC-FP además de contra su propio ground truth chileno les da una tercera señal de si un modelo generaliza por convención de dibujo en general, o solo por casualidad geográfica.

No encontramos ninguna herramienta o paper que resuelva la generalización lista para usar — ni comercial ni académica. Eso coincide con lo que la propia literatura (Pizarro & Hitschfeld 2022, y la ausencia confirmada de un benchmark cross-dataset) documenta: es un problema abierto real del campo, no algo que su equipo esté pasando por alto. La estrategia más defendible con la evidencia disponible sigue siendo la que ya tienen — extracción determinística propia + validación humana — pero alimentada con fine-tuning progresivo sobre datos chilenos reales, siguiendo el patrón que MitUNet demuestra que funciona.

---

## Fuentes citadas

- [ArchCAD-400K (arXiv:2503.22346)](https://arxiv.org/abs/2503.22346) · [repo](https://github.com/ArchiAI-LAB/ArchCAD) · [dataset HF](https://huggingface.co/datasets/jackluoluo/ArchCAD)
- [Raster2Seq (arXiv:2602.09016)](https://arxiv.org/abs/2602.09016) · [repo](https://github.com/Cornell-VAILab/Raster2Seq)
- [SymPoint (arXiv:2401.10556)](https://arxiv.org/abs/2401.10556) · [repo](https://github.com/nicehuster/SymPoint)
- [SymPointV2 (arXiv:2407.01928)](https://arxiv.org/abs/2407.01928) · [repo](https://github.com/nicehuster/SymPointV2)
- [MitUNet (arXiv:2512.02413)](https://arxiv.org/html/2512.02413v3) · [repo](https://github.com/aliasstudio/mitunet)
- [DoorDet (arXiv:2508.07714)](https://arxiv.org/abs/2508.07714)
- [CADSpotting (arXiv:2412.07377)](https://arxiv.org/abs/2412.07377)
- [ResPlan (arXiv:2508.14006)](https://arxiv.org/abs/2508.14006)
- ["Segmenting Anything in Architecture" (ICIAP 2025)](https://link.springer.com/chapter/10.1007/978-3-032-10185-3_33)
- [Pizarro & Hitschfeld, Automation in Construction 140 (2022)](https://doi.org/10.1016/j.autcon.2022.104348)
- [MLStructFP_benchmarks repo (archivado)](https://github.com/MLSTRUCT/MLStructFP_benchmarks) · [perfil GitHub Pizarro](https://github.com/ppizarror)
- [MSD — Modified Swiss Dwellings (ECCV 2024)](https://caspervanengelenburg.github.io/msd-eccv24-page/)
- [CVC-FP dataset (DAG, UAB)](https://dag.cvc.uab.es/dataset/cvc-fp-database-for-structural-floor-plan-analysis/)
- [Kamai](https://kamai.io/) · [blog: PDF takeoff API](https://kamai.io/blog/how-construction-pdf-takeoff-api-works)
- [FloorScan.ai pricing](https://floorscan.ai/en/pricing)
- [CubiCasa Conversion API docs](https://conversion.docs.cubi.casa/get-started-1344798m0) · [Integrate API docs](https://integrate.docs.cubi.casa/get-started-1362307m0)
- [Markovate — AI Plan Review](https://markovate.com/ai-plan-review/) · [AI Blueprint Reader](https://markovate.com/ai-blueprint-reader/)
- [Bild AI (YC W25 launch, Hacker News)](https://news.ycombinator.com/item?id=43196474)
