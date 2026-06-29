# ArchiCheck — Roadmap MVP técnico

**Objetivo**: análisis normativo con precisión validable por arquitectos reales.
**Criterio de éxito**: un arquitecto revisa el output y dice "esto es lo mismo que haría yo en una revisión previa a DOM".
**Última actualización**: 2026-06-24

---

## Estado actual (Fase 1 — en producción)

- Claude Sonnet 4.6 + GPT-4o en paralelo, merge automático de resultados
- OGUC/LGUC/Ley 19.300/DDU 279-320-390-415 embebidos como JSON estático
- PRCs: Ñuñoa, Santiago, Providencia (3 de 347 comunas)
- Pipeline geométrico: Google Colab + OpenCV (manual, externo)
- Export PDF via print nativo del browser
- Deploy: Vercel + Cloudflare Worker

---

## Etapa 1 — Normativa completa

**Cuello de botella más urgente.** El sistema embebe solo artículos clave del OGUC y 4 circulares DDU — raíz de la mayoría de errores de análisis.

| Tarea | Qué resuelve |
|---|---|
| OGUC completo como RAG (pgvector) | El LLM deja de citar artículos inexistentes o mezclar números; recupera texto exacto |
| DDU: agregar ~15–20 circulares más usadas en DOM | Estacionamientos, estructuras, instalaciones — hoy no existen |
| 2 PRCs adicionales → total 5 | Las Condes + Vitacura o Maipú (según proyectos de prueba) |
| Revisión de completitud del expediente (DDU 390) | Detectar documentos faltantes según tipo de proyecto — hoy no existe |

**Resultado esperado**: el sistema cita normativa real y deja de inventar artículos.

**Estado**: ⬜ Pendiente

---

## Etapa 2 — Motor de reglas determinista

Hoy el LLM juzga todo, incluyendo reglas que son puro cálculo. Un dormitorio ≥ 8 m² no es opinión — es aritmética.

| Tarea | Qué resuelve |
|---|---|
| Motor de reglas cuantitativas separado del LLM (JS o Python) | Circulaciones ≥ 1.2 m, superficies mínimas por recinto, ratio ventana/recinto — resultado determinista |
| El LLM solo analiza lo que requiere interpretación visual o contextual | Reduce falsos positivos y negativos en incumplimientos medibles |
| Integrar salida del motor al mismo informe | Arquitecto ve un informe unificado |

**Resultado esperado**: incumplimientos cuantitativos 100% confiables; el LLM se reserva para geometría ambigua y análisis contextual.

**Estado**: ⬜ Pendiente

---

## Etapa 3 — Calidad de la extracción geométrica

Colab sigue siendo manual — está bien por ahora. El foco es mejorar qué extrae y cómo llega al LLM.

| Tarea | Qué resuelve |
|---|---|
| Grounding DINO + SAM 2 en Colab (reemplaza OpenCV básico) | Detección semántica: puertas, ventanas, escaleras, muros — OpenCV solo detecta contornos |
| Mejorar schema JSON Colab → web | Agregar: tipo de recinto, nivel, relación con otros elementos |
| Validación cruzada: medición Colab vs. declaración en plano | Si el plano dice "dormitorio 12 m²" y Colab mide 7.8 m², flaggearlo como discrepancia explícita |
| **Herramienta de crop + escala gráfica integrada en la web** | Cuando se integre Colab al flujo web (paso a paso), incluir un editor visual donde el usuario dibuja recortes sobre el plano y asigna escala por sección. La escala es obligatoria página a página para todas las plantas; las páginas de cortes o elevaciones pueden omitirla. Reemplaza el flujo actual de fracciones numéricas en el notebook. |

**Resultado esperado**: geometría con anchura real de pasillos, dimensiones de vanos, área de recintos — no estimaciones visuales del LLM.

**Estado**: ⬜ Pendiente

---

## Etapa 3b — U-Net + MLSTRUCT-FP *(paralelo a Etapa 3)*

Techo de precisión geométrica del sistema. Cuando esté entrenado, reemplaza Grounding DINO como fuente principal de segmentación.

| Componente | Detalle |
|---|---|
| Dataset | MLSTRUCT-FP (ppizarror/GitHub) — 954 planos chilenos, 165 proyectos, único dataset multi-unidad de Chile |
| Arquitectura | U-Net (PyTorch) — segmentación pixel a pixel de recintos, muros, puertas, ventanas |
| Entrenamiento | RunPod o Vast.ai — costo único ~$50–150 USD, ~8–12 horas en GPU A100 |
| Target calidad | IoU ≥ 0.90 recintos · IoU ≥ 0.85 elementos (puertas/ventanas) |
| Output | Máscara de segmentación → polígonos → áreas y anchos reales en m² con escala declarada |
| Integración | JSON de salida reemplaza (o complementa) el output de Colab en el prompt del LLM |

**Por qué es MVP**: sin U-Net, el sistema alcanza ~75–80% de precisión geométrica. Entrenado en planos chilenos lleva eso al 90%+.

**El entrenamiento se puede lanzar desde hoy** — no bloquea nada del resto del roadmap.

**Estado**: ⬜ Pendiente

---

## Etapa 4 — Loop de validación con arquitectos

No es una feature de producto — es el mecanismo para saber si las etapas anteriores funcionaron.

| Tarea | Qué resuelve |
|---|---|
| Campo "¿Correcto?" por observación en el informe | El arquitecto marca observaciones correctas, falsas alarmas y faltantes |
| Registrar feedback en base de datos simple | Construir dataset de precisión real |
| Dashboard interno: recall, precisión, falsos positivos por etapa | Saber exactamente dónde falla el sistema |

**Resultado esperado**: métrica concreta de precisión por etapa (E1–N4). Si Vectorización tiene 60% de recall, sabemos dónde actuar.

**Estado**: ⬜ Pendiente

---

## Fuera del MVP (deliberadamente)

- Automatizar Colab → microservicio backend
- Auth, billing, storage de proyectos
- Más de 5 PRCs en esta etapa
- API pública, DWG/IFC
- U-Net en producción automática (primero entrenar y validar)

---

## Secuencia

```
Etapa 1 (RAG + normativa)      →  Etapa 2 (motor determinista)
                                            ↓
Etapa 3 (Grounding DINO/SAM 2) →  Etapa 3b (U-Net, lanzar entrenamiento ya)
                                            ↓
                                Etapa 4 (validación con arquitectos)
                                            ↓
                                Iterar Etapas 1–3 según feedback
```

Etapas 1 y 3 son paralelas (software vs. Colab/Python).
Etapa 3b corre en paralelo desde el inicio — el entrenamiento tarda semanas.
Etapa 4 arranca cuando Etapas 1 y 2 estén listas.
