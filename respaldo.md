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
