# ArchiCheck — Respaldo de conversaciones

---

## Sesión 2026-05-07

### Problema: el PDF del informe siempre salía en blanco (3 KB)

Después de varios intentos fallidos en sesiones anteriores, al inicio de esta sesión el PDF seguía saliendo en blanco con un peso de ~3 KB. Se probaron múltiples enfoques sin éxito: mover el elemento al viewport con `position:fixed`, clonar el nodo, copiar el innerHTML a un div nuevo. Todos producían el mismo resultado. La conclusión fue que `html2canvas` —la librería que usaba el sistema para capturar el HTML como imagen antes de generar el PDF— no era capaz de renderizar correctamente el contenido en este entorno, probablemente por una combinación de CSS Grid, el ciclo de reconciliación de React y limitaciones propias de la librería.

La decisión fue abandonar `html2canvas` por completo y cambiar el enfoque: en vez de capturar el HTML como imagen, abrir una nueva pestaña del browser con el contenido del informe y disparar el diálogo de impresión del sistema operativo automáticamente. El usuario ve el diálogo de impresión, selecciona "Guardar como PDF" (que en Chrome y Edge viene seleccionado por defecto), y el PDF se genera usando el renderer nativo del browser. El resultado es un PDF perfecto con todo el contenido de las Capas 1 y 2. El usuario confirmó que funcionó.

### Problema: error "Unterminated string in JSON" al analizar

Al intentar subir un archivo con muchas páginas y capturas de escala, el análisis fallaba con el mensaje "Error al analizar: Unterminated string in JSON at position 87". El problema era que el stream de respuesta de la IA llega en fragmentos TCP, y a veces un fragmento cortaba a la mitad una línea del protocolo SSE. El sistema intentaba parsear ese fragmento incompleto y fallaba. El manejo de errores anterior no capturaba correctamente ese caso específico en Chrome. Se corrigió el comportamiento y el análisis debería pasar sin ese error.

### Conversación: ¿conviene usar Claude y GPT-4o juntos?

El usuario planteó la idea de usar ambos modelos de forma complementaria, no como una elección del usuario sino como potenciación del análisis. La pregunta concreta fue si era mejor hacerlo en secuencial o en paralelo.

La recomendación fue **paralelo**, por tres razones:
1. El tiempo de espera es el mismo que hoy (el del modelo más lento), no se duplica.
2. Cada modelo analiza el plano de forma independiente, sin influencia del otro — eso es validación cruzada real.
3. Si un modelo falla, el otro cubre.

La secuencia habría significado el doble de tiempo de espera (~40-60 segundos actuales → 80-120 segundos), y el segundo modelo estaría sesgado por el primero.

El usuario estuvo de acuerdo con paralelo.

Sobre la presentación al usuario: el usuario decidió que **no se muestre qué modelos se usan ni cuál validó qué**. El resultado que ve el arquitecto es un análisis consolidado, sin referencias a Claude ni a GPT-4o. El selector de modelo que existía en la interfaz fue eliminado.

La lógica de consolidación acordada:
- Las observaciones que ambos modelos detectan independientemente se fusionan (si describen lo mismo, queda una sola, la más detallada).
- Las tablas de datos toman la versión más completa de las dos.
- El puntaje global es el promedio de ambos.
- El estado global (APROBADO / OBSERVADO / RECHAZADO) toma el peor de los dos.
- Los documentos faltantes, alertas y pasos siguientes se unen eliminando duplicados.

El usuario confirmó al final de la sesión que GPT-4o estaba listo y desplegado en producción.

### Estado al cierre de sesión
- PDF exportable funcionando.
- Análisis dual-modelo (Claude + GPT-4o en paralelo) funcionando en producción.
- El selector de modelo desapareció de la interfaz.
- Sitio en producción: https://archicheck-xi.vercel.app/

---

## Sesión 2026-05-08 / 2026-05-09

### Aporte real de las escalas por sección al análisis

Las capturas de secciones con escala individual (feature de la web app) van solo al modelo visual (Claude/GPT-4o como imágenes), no a Colab. Su aporte es de razonamiento, no de medición: ayudan al LLM a calibrar estimaciones visuales ("a esta escala este corredor es ~1.1 m"). Con el JSON de Colab integrado al prompt, ese aporte desaparece porque las dimensiones exactas ya están como dato duro. Conclusión: con Colab activo, subir el PDF completo + JSON es suficiente — las capturas por sección no agregan valor.

### Notebook de Colab — aclaraciones clave

- El notebook (`ArchiCheck_MVP_Capa1.ipynb`) es genérico. No tiene nada hardcodeado de ningún proyecto.
- Solo hay que editar la **Celda 3** (`PAGINAS_Y_ESCALAS`) para cada proyecto nuevo.
- El notebook se sube a Colab desde el PC cada vez que se usa — no se modifica, siempre es el mismo archivo base.
- Ruta en PC: `C:\Users\nicolas.estragues\Documents\Claude\Docs archicheck\Doc prueba\ArchiCheck_MVP_Capa1.ipynb`
- Se creó además `ArchiCheck_TEMPLATE.ipynb` en la misma carpeta: versión en blanco con `PAGINAS_Y_ESCALAS = []` y validación que avisa si está vacía antes de procesar.

### Error "Expecting value: line 1 column 1 (char 0)" en Celda 4

El error se producía porque en Colab había cargado una versión antigua del notebook (con prints distintos: "Imagen para Claude: ...", "Enviando al worker..."). Esa versión intentaba hacer `json.loads(resp.text)` directo y fallaba cuando el worker respondía en formato SSE. La versión actual del notebook lee el SSE correctamente con `resp.iter_lines()`. Solución: subir el notebook actual desde el PC en vez de reusar la sesión antigua de Colab.

### Colab solo como fuente de geometría

Confirmado: el notebook se usa exclusivamente para proveer mediciones geométricas reales (áreas en m², anchos en metros) a la web app. No se usa como análisis normativo independiente. Por tanto, agregar Claude Crítico al notebook no agrega valor — el análisis normativo lo hacen Claude + GPT-4o en la web con el JSON de geometría ya integrado al prompt.

### Visión actualizada del sistema — qué hace, qué no hace, qué se necesita

#### Lo que hace hoy (producción)
- Subir PDF → análisis en <2 min → informe PDF exportable
- Claude Sonnet 4.6 + GPT-4o en paralelo con merge automático de resultados
- OGUC + LGUC + DDU 279/320/390/415 embebidos como JSON
- PRC de Ñuñoa y Santiago aplicados dinámicamente
- Pipeline de 8 etapas (E1–E4 Capa 1, N1–N4 Capa 2) — metodología Pizarro
- Observaciones con acción por etapa: aceptar / comentar / modificar / descartar
- Geometría real vía Colab (OpenCV + Claude Vision) → JSON → web, proceso manual

#### Lo que no hace
- DWG/DXF (solo PDF/imagen)
- Solo 2 PRCs de 347 comunas
- Solo artículos clave del OGUC, no todos
- Solo 4 circulares DDU de ~100+ existentes
- Pipeline geométrico integrado (Colab es externo y manual)
- U-Net Pizarro / Grounding DINO / SAM 2 / RoomFormer / vectorización real
- Almacenamiento de proyectos, versionado ni comparación
- Revisión de completitud del expediente DOM
- Ley 19.300 cuantitativa

#### Roadmap hacia sistema world-class para Chile

**Fase 2 — Precisión geométrica integrada (3–6 meses)**
1. Integrar pipeline OpenCV al backend (eliminar Colab manual) — Python serverless en AWS Lambda, Modal o Fly.io
2. Reemplazar OpenCV básico por Grounding DINO + SAM 2 para detección semántica de elementos
3. OGUC completo indexado como RAG (pgvector / Pinecone / Weaviate)
4. DDU completa (~80–100 circulares relevantes) indexada en el mismo RAG
5. Revisión de completitud del expediente según DDU 390 por tipo de proyecto

**Fase 3 — Cobertura completa (6–12 meses)**
6. U-Net fine-tuned con MLSTRUCT-FP (dataset Pizarro — único dataset de planos chilenos multi-unidad del mundo, 954 planos, 165 proyectos, GitHub ppizarror). Entrenamiento: ~$50–150 USD en RunPod/Vast.ai
7. Vectorización real con DeepLSD o LETR (polígonos medibles desde segmentación de muros)
8. Motor de reglas cuantitativas determinista separado del LLM (para reglas tipo "dormitorio ≥ 8 m²")
9. PRC de 347 comunas — priorizar las 20 con mayor volumen (Providencia, Las Condes, Vitacura, La Florida, Maipú, Puente Alto, Ñuñoa, Santiago)
10. Almacenamiento y versionado de proyectos (PostgreSQL + S3)

**Fase 4 — Escala y diferenciación**
- Soporte DWG/DXF e IFC (BIM)
- Búsqueda de planos similares (CLIP embeddings + FAISS)
- Mejora continua con datos propios acumulados
- API para integración con AutoCAD, Revit y plataformas DOM

#### Infraestructura y costos
- Costo por plano procesado: ~$0.07–0.17 USD (inferencia ~$0.01 + LLM ~$0.05–0.15 + almacenamiento ~$0.01)
- Infraestructura inicial: ~$50–80 USD/mes (CPU, sin GPU)
- Infraestructura con volumen: ~$500–600 USD/mes (GPU para U-Net)

#### El diferencial world-class
Combinación única que no existe en ningún lugar del mundo:
1. Pipeline geométrico chileno (MLSTRUCT-FP — único dataset de planos chilenos multi-unidad)
2. Verificación normativa chilena completa (OGUC + LGUC + DDU + 347 PRC comunales)
3. Flujo de revisión profesional con loop observación-acción-corrección
4. Costo accesible ($0.07–0.17 USD por plano)

Mercado: ~35.000 arquitectos habilitados en Chile + técnicos y constructores. Modelo de negocio: pago por análisis o suscripción mensual.

---

## Sesión 2026-05-10

### Fix: PDF del informe incluía imágenes anotadas de Colab (vista anotada)

El informe PDF exportado incluía las imágenes OpenCV del análisis Colab (`colabPngs`) dentro del componente `PrintReport`, lo que no correspondía al formato del informe de referencia. Se eliminó el bloque JSX que renderizaba esas imágenes en el informe. Las `colabPngs` siguen enviándose a Claude para análisis — solo se quitaron del PDF generado.

### Fix: PRC Providencia no se aplicaba al analizar

El sistema no verificaba contra el PRC de Providencia aunque el usuario lo seleccionara. Había dos bugs:

1. **`PRC_COMUNAS` no tenía entrada para Providencia** — se agregaron los imports de `providencia_normas` y `providencia_meta` y la entrada en el objeto.

2. **`prcTexto` builder roto** — iteraba las claves `_fuente` y `_nota` (metadatos del JSON) como si fueran zonas, y usaba `coef_ocupacion_suelo` cuando Providencia usa `coef_ocupacion_suelo_1p`. Se corrigió con:
   - `.filter(([id, z]) => !id.startsWith("_") && typeof z === "object" && z !== null)` para excluir metadatos
   - `const cos = z.coef_ocupacion_suelo ?? z.coef_ocupacion_suelo_1p` para manejar ambas variantes
   - Se agregaron además `altura_maxima_pisos` y `agrupamiento` al texto de cada zona

### Documento maestro consolidado (ArchiCheck_Documento_Maestro.docx)

Se generó un Word consolidado de toda la visión del proyecto en `Proyecto/ArchiCheck_Documento_Maestro.docx` usando un script Node.js (`generar_archicheck_master.cjs`) con la librería `docx` (npm, en `C:\Users\nicolas.estragues\Documents\Claude\node_modules\docx\dist\index.cjs`). El documento fusiona:
- Roadmap Claude Web (10 pasos, 4 fases)
- Arquitectura ChatGPT (8 capas: OpenCV → U-Net → DINO → SAM 2 → reconstrucción geométrica → Claude Vision → motor normativo → output)
- Funcionalidades tipo Revi (revisión de expediente en 6 etapas)
- Wishlist funcional, definiciones, modelo operativo, timelines, contexto normativo

Errores encontrados y resueltos en el proceso:
- `.mjs` + `require()` incompatibles → copiar script a `.cjs`
- `Packer.toBufferSync` no existe → usar `Packer.toBuffer().then(...)`
- Ruta incorrecta del módulo → `require("docx")` resuelve desde el directorio padre

### Preguntas sobre escalas y capturas — respuestas

**¿El sistema puede leer escalas de forma confiable?**
No. Por diseño, la escala siempre se declara manualmente. El estudio Pizarro muestra R²=0.9972 entre factor de escala y calidad del análisis — un error de escala propaga error a todas las mediciones. Claude Vision no puede leer de forma confiable escalas de barras o leyendas en planos arquitectónicos.

**¿Puede leer más de una escala por hoja?**
No hay auto-detección. El sistema tiene tres niveles de declaración: (a) escala única por archivo, (b) escala por página, (c) recortes con escala individual. La asignación siempre la hace el arquitecto.

**¿Las capturas JPG sirven?**
Sí — y el match que hace Claude es visual: recibe el plano completo + el recorte etiquetado con nombre, página, posición %, y escala. Claude correlaciona visualmente el recorte con el plano. No hay registro geométrico algorítmico, pero Claude hace la correlación.

**¿150 DPI es suficiente para el canvas del crop tool?**
No para el recorte que va a Claude. Solución adoptada: canvas de UI a escala 1.5 (liviano, para interacción) + re-render a escala 3.5 al confirmar el recorte (≈252 DPI efectivo, calidad real enviada a Claude).

**¿Resolución de screen captures en Windows/Mac?**
Screen capture de plano completo en monitor 1080p ≈ 96 DPI → cotas de texto ilegibles para Claude. Mac Retina mejor pero sigue dependiendo del zoom. Conclusión: no usar screenshots — exportar el PDF a ≥150 DPI (idealmente 300 DPI).

### Implementación: herramienta de recorte PDF integrada (CropModal)

Se reemplazó completamente el flujo de "subir captura (JPG/PNG)" por una herramienta de recorte integrada en la web app.

**Nuevo componente: `src/components/CropModal.jsx`**
- Carga el PDF usando `pdfjs-dist` (ya instalado)
- Renderiza la página a escala 1.5 en un `<canvas>` para el UI
- El arquitecto arrastra para seleccionar un área (overlay azul punteado)
- Al confirmar: preview del recorte + campo nombre + selector de escala
- Al guardar: re-renderiza la página a escala 3.5 y extrae el crop a esa resolución → base64 JPEG
- Botones de navegación: "← Anterior" y "Pasar a la siguiente página →" (sin cerrar el modal)
- Lista de recortes guardados en la sesión al pie del modal
- El worker de pdfjs se hereda de la config global en App.jsx

**Instrucción al arquitecto en el modal:**
"Debes poner el nombre más parecido posible a la sección que estás capturando"

**Cambios en App.jsx:**
- Import de `CropModal`
- Estado `cropModal` (`null | { fileIdx }`)
- Función `saveCrop(fileIdx, crop)` — agrega el crop al array `escalasPorPagina[pagina].capturas`
- Eliminadas: `addCaptura`, `handleScaleScreenshot`, `setCapturaEscala`
- Botón "Recortar secciones con escala distinta" (era "+ capturas de escala por página")
- En modo capturas: botón "✂ Abrir herramienta de recorte" + lista de crops guardados
- La escala general desaparece en modo capturas — la escala viene exclusivamente de los recortes (decisión A)

**Datos guardados por recorte:**
```js
{
  base64,          // JPEG a escala 3.5
  nombre,          // nombre puesto por el arquitecto
  escala,          // "1:50", "1:100", etc.
  pagina,          // número de página del PDF
  x_pct,           // posición horizontal en % de la página
  y_pct,           // posición vertical en % de la página
  w_pct,           // ancho del recorte en % de la página
  h_pct,           // alto del recorte en % de la página
}
```

**Tag en el prompt de Claude:**
```
[RECORTE: "archivo.pdf" — pág. 2 — sección "Planta primer piso" — posición x:12% y:35% tamaño 45%×30% — escala: 1:50]
```

**¿Sabe el sistema a qué parte del plano corresponde el recorte?**
Sí — Claude recibe (1) la imagen de la página completa y (2) la imagen del recorte con su tag de posición y nombre. Claude hace la correlación visual. No hay registro geométrico algorítmico entre ambas imágenes, pero la combinación imagen+metadatos es suficiente para que Claude ubique el recorte en el contexto del plano.

### Estado al cierre de sesión
- PRC Providencia corregido y funcionando
- Herramienta de recorte PDF desplegada en producción
- Commit: `2186d6f` — feat: PDF crop tool replacing manual capture upload
- Sitio en producción: https://archicheck-xi.vercel.app/
