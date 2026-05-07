# ArchiCheck — Backup de sesiones

---

## Sesión 2026-05-07

### PDF Export — reemplazar html2canvas por window.print()
- `html2pdf.js` + `html2canvas` producía consistentemente un PDF de ~3 KB en blanco, sin importar el enfoque (mover elemento al viewport, cloneNode, innerHTML wrapper).
- **Causa raíz**: html2canvas no capturaba el contenido correctamente en este entorno (posiblemente por CSS Grid, reconciliación de React o limitaciones del renderer).
- **Fix**: `exportPDF()` ahora abre una nueva pestaña con el HTML del informe como blob URL y llama `window.print()` automáticamente. El browser usa su propio renderer — PDF perfecto, sin dependencias de canvas.
- Commit: `aeb8b6a`

### SSE stream buffering — fix "Unterminated string in JSON"
- Error: `"Error al analizar: Unterminated string in JSON at position 87"` al analizar PDFs con muchos archivos/capturas.
- **Causa raíz**: chunks TCP podían cortar una línea SSE `data: {...}` a la mitad. El código procesaba el chunk directamente con `split("\n")` y al intentar `JSON.parse` del fragmento fallaba. El `catch` anterior solo ignoraba errores que empezaran con `"JSON"` — pero Chrome dice `"Unterminated string..."` → se relanzaba como error fatal.
- **Fix**: buffer `sseBuffer` acumula chunks y solo procesa líneas completas (`lines.pop()` guarda el fragmento final). El catch ahora usa `instanceof SyntaxError`.
- Commit: `00c4198`

### Análisis paralelo Claude + GPT-4o con merge automático
- **Motivación**: usar ambos modelos complementariamente sin que el usuario elija ni sepa cuál usa.
- **Decisión técnica**: paralelo (no secuencial) — mismo tiempo de espera, análisis independientes, verdadera validación cruzada.
- **Implementación**:
  - `readModelStream(resp)`: función de módulo que lee un stream SSE y devuelve el raw acumulado.
  - `mergeResults(r1, r2)`: fusiona dos JSONs — observaciones por similitud semántica (≥3 palabras clave comunes = duplicado), tablas toma la más larga, puntaje promediado, estado el peor de los dos, arrays (documentos/alertas/pasos) unión deduplicada.
  - `analizar()`: lanza dos `fetch()` en `Promise.all`, lee ambos con `Promise.allSettled` (si uno falla, usa el otro), llama `mergeResults`.
  - Selector de modelo eliminado de la UI.
- Commit: `efd20ec`

### Estado al cierre
- Worker Cloudflare con GPT-4o desplegado y `OPENAI_API_KEY` configurada (confirmado por usuario).
- Frontend en producción: `https://archicheck-xi.vercel.app/`
- Repo: `https://github.com/TuQRApp/archicheck.git` · rama `main`
