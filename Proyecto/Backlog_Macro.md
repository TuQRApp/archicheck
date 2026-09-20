# Backlog de temas macro

Lista de temas grandes que el usuario quiere ejecutar con calma, anotados el 2026-09-20 para no perderlos. No son tareas en curso — cada uno se activa cuando el usuario decida partir con él.

---

## 1. Revisión Ing SW al proyecto completo

**Estado**: ya hay un brief completo listo para consultar IAs externas → [Brief_Robustecer_Revision_Ing_SW.md](Brief_Robustecer_Revision_Ing_SW.md) (2026-09-20). Documenta las 4 capas actuales (hardcodeo, regresión rápida, golden-file, LLM Paso 3), los incidentes reales que las motivaron, y 7 preguntas concretas para robustecerlas (falsos positivos/negativos, extender golden-file a BIM, ampliar el checklist de 10 puntos, CI real, calibración N=1, property-based testing más allá de geometría).

**Siguiente paso**: pasar ese brief a las IAs externas (ChatGPT, Gemini, Copilot, Perplexity) y consolidar las respuestas.

## 2. Revisar pendientes acumulados en todo el proyecto

Barrido general de lo que ha ido quedando abierto en distintos documentos, para decidir qué corresponde retomar ahora dado el nivel de avance actual. Puntos ya conocidos que este barrido debería considerar (no exhaustivo — hay que recorrer el repo completo):

- [Plan_Pendiente_Linea_Rectangulo.md](Plan_Pendiente_Linea_Rectangulo.md)
- Gaps explícitos del §6 de [Brief_Robustecer_Revision_Ing_SW.md](Brief_Robustecer_Revision_Ing_SW.md) (sin métricas de falsos +/-, golden-file solo cubre CAD, sin CI real, heurísticas calibradas con N=1, etc.)
- Auditoría de integridad normativa (memoria `project_archicheck_normativa_auditoria_integridad`): 3 JSON de DDU fabricados/sin fuente (279, 320, 390), Providencia 86% sin procesar, Ñuñoa/Santiago sin PDF fuente
- Cobertura BIM vs CAD (memoria `project_archicheck_bim_pdf_paralelo_y_cobertura_oguc`): puntos 3-4 de la tabla de divergencia (§3 del brief) — confirmar qué quedó cerrado tras el commit de rampas/salidas de emergencia y qué sigue abierto
- Pendientes sueltos dentro de [Roadmap_Revision_Dossier_ArchiCheck.md](Roadmap_Revision_Dossier_ArchiCheck.md) y [Diseno_Funcional_ArchiCheck.md](Diseno_Funcional_ArchiCheck.md)

## 3. Entornos dev/test/producción + trabajo con branches

Hoy no hay separación formal de entornos: Vercel hace auto-deploy de `main` a producción (`archicheck-xi.vercel.app`), y no hay CI en GitHub Actions (confirmado en el gap #5 del brief de Ing SW). Definir: estrategia de branches (feature branches, `develop` vs `main`, o trunk-based con feature flags), cómo se prueba antes de que algo llegue a producción, y si el Worker (`archicheck-worker`, repo privado) necesita su propio esquema de entornos (staging de Supabase, keys separadas).

## 4. Completar normativa: LGUC, OGUC, DDU, PRC

Estado actual (RAG en Supabase, tabla `normativa_chunks`): OGUC 770 chunks, LGUC 244, Ley 19.300 128, DDU ~185, PRC solo Providencia (281, con 86% del documento sin procesar según la auditoría de integridad). Ñuñoa y Santiago tienen JSON estático embebido pero sin PDF fuente verificado. Objetivo: completar cobertura real (no fabricada) de las 4 fuentes normativas, cerrando los gaps que la auditoría de integridad ya dejó documentados.

## 5. Validar bugs históricos que hayan quedado corregidos

Revisión de que las correcciones ya aplicadas siguen siendo correctas y tienen cobertura de regresión real, no solo el fix puntual. Casos conocidos a revisar primero:
- Bug AREAUNIT ≠ LENGTHUNIT (ancho de puerta) — memoria `feedback_archicheck_bim_unidades_area_vs_longitud`: ¿tiene test de regresión específico? (el brief de Ing SW, tabla §5, marca que no)
- Inferencia de puertas sin dato por footprint — memoria `project_archicheck_bim_puertas_sin_dato_geometria`: calibrada con N=1, pendiente de revalidar por archivo
- Heurística `bisagra_por_geometria` (`UMBRAL_ASIMETRIA_BISAGRA_M = 0.02 m`) — también N=1, mencionada como pregunta abierta en el brief de Ing SW (§7.5)

---

**Nota de proceso**: según las instrucciones del proyecto, esta documentación vive en el repo local (`Proyecto/`), no en el Proyecto de Claude en la nube.
