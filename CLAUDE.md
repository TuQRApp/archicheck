# Instrucciones del proyecto Archicheck

- No usar el Proyecto "Archicheck" de Claude en la nube (la herramienta de Projects/claude.ai) para guardar documentación, análisis o decisiones de este proyecto. Toda esa documentación vive en este repositorio local.
- El roadmap general del proyecto es `Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md`. No mezclar análisis exploratorios nuevos ahí — van como documentos aparte dentro de `Proyecto/`.
- El diseño funcional vigente está en `Proyecto/Diseno_Funcional_ArchiCheck.md`.
- Cuando se genere un análisis, hallazgo o decisión relevante para el proyecto, se guarda como archivo Markdown dentro de `Proyecto/` (o la carpeta que corresponda del repo) y se comitea con git — no se escribe en el Proyecto de Claude en la nube.

## Setup del repo (una vez por clon)

```
git config core.hooksPath .githooks
```

Activa el `pre-commit` que corre las revisiones del motor CAD (chequeo de hardcodeo normativo + los 24 casos de regresión + los golden tests contra los 3 proyectos reales) cuando un commit toca `Fase 2/Herramientas_CubiCasa5k/`. **Es config local de git: no viaja con el clon**, así que hay que correrlo a mano una vez. Sin esto, el hook está en el repo pero no se ejecuta — que era exactamente el estado del proyecto hasta el 2026-09-21 (ver ACH-OPS-001 en `Proyecto/Auditoria_Fase1_Hallazgos.md`: el gate existía solo en una máquina y no había CI).

Si el hook no encuentra Python, se puede fijar uno con `export ARCHICHECK_PYTHON=/ruta/a/python`.
