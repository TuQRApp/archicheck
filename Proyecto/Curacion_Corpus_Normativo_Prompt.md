# Curación del corpus normativo del prompt — propuesta para validar

**Contexto**: el bloque "NORMATIVA NACIONAL VIGENTE — OGUC/LGUC" que `src/App.jsx` inyecta en cada análisis ya no tiene texto fabricado (ver ACH-DATA-007 en [Auditoria_Fase1_Hallazgos.md](Auditoria_Fase1_Hallazgos.md)): el texto se deriva del PDF oficial y un test lo verifica. Lo que **sigue mal es la selección**: de los 51 artículos, **19 se incluyeron bajo una etiqueta que no corresponde a lo que el artículo realmente dice**.

Este documento es para que el usuario **valide**, no para que investigue. Cada fila trae el texto oficial verificado.

> **Hallazgo adicional, importante**: el prompt le ordena al modelo citar artículos que **no le entrega**. La instrucción 3c dice textualmente *"Cita siempre Art. 4.2.10, nunca 4.2.2"* para anchos de escalera — y el **4.2.10 no está en el bloque**. Lo mismo con el 4.5.5 (el único porcentaje real de ventilación). El modelo tiene la orden de citar, pero no el texto para leer.

---

## A. Relabelar — el artículo sirve, la etiqueta miente

En estos casos el artículo **es contenido útil y debe quedarse**; lo que estaba mal era el rótulo (y por lo tanto la creencia sobre qué cubría el bloque).

| Art. | Etiqueta actual (falsa) | Lo que realmente dice | Etiqueta propuesta |
|---|---|---|---|
| OGUC 2.6.1 | `rasantes_general` | "El agrupamiento de los edificios se determinará en los Planes Reguladores…" | `agrupamiento_edificios` |
| OGUC 4.1.1 | `accesibilidad_general` | Define **locales habitables** vs. no habitables (dormitorios, comedores…) | `definicion_locales_habitables` |
| OGUC 4.1.2 | `accesibilidad_edificios` | "Los locales habitables deberán tener, al menos, **una ventana**…" (cualitativo) | `ventilacion_iluminacion_cualitativa` |
| OGUC 4.1.3 | `accesibilidad_vias` | Baños, cocinas y locales sin ventana: ventilación por ducto | `ventilacion_banos_cocinas` |
| OGUC 4.2.2 | `escaleras_minimos` | **Cambio de destino**: informe de profesional competente | `cambio_destino` |
| OGUC 4.2.5 | `ventilacion` | **Ancho de vías de evacuación** según carga de ocupación | `ancho_vias_evacuacion` |
| OGUC 4.2.6 | `iluminacion` | **Altura libre mínima** de vías de evacuación: 2,10 m | `altura_libre_evacuacion` |
| OGUC 4.3.4 | `incendio_escaleras` | Tabla de **resistencia al fuego** por destino y n° de pisos | `incendio_tabla_resistencia` |
| OGUC 4.5.7 | `ventilacion_iluminacion_establecimientos` | **Patios** de locales escolares (ancho mín. 5,50 m) | `patios_locales_escolares` |
| OGUC 5.2.1 | `agua_potable` | La **DOM fiscaliza** toda construcción | `fiscalizacion_dom` |
| OGUC 5.3.1 | `alcantarillado` | **Clases de edificación** según materiales predominantes | `clases_edificacion_materiales` |
| OGUC 5.4.1 | `electricidad` | Tabla de **pesos unitarios** de materiales (kg/m³) | `pesos_unitarios_materiales` |
| OGUC 5.5.1 | `muros_cortafuego` | **Calidad de materiales** y elementos industriales | `calidad_materiales` |
| LGUC 57 | `cambios_destino` | **Uso del suelo urbano** según Planes Reguladores | `uso_suelo_urbano` |
| LGUC 58 | `cambios_destino_condiciones` | **Patentes municipales** concordantes con el uso de suelo | `patentes_municipales` |
| LGUC 60 | `proteccion_patrimonio` | Terrenos afectados por **riesgos** y sus normas | `terrenos_con_riesgo` |
| LGUC 118 | `recepciones` | **Plazo de 30 días** de la DOM para pronunciarse sobre permisos | `plazo_dom_permisos` |
| LGUC 1 / 2 | (sin etiqueta) | Objeto de la ley y niveles de acción de la planificación | `objeto_ley` / `niveles_planificacion` |

---

## B. Agregar — temas que el prompt exige verificar y hoy no tienen artículo

Estos son los artículos que **realmente** cubren los temas que se creía cubiertos. Ninguno está hoy en el bloque.

| Tema | Artículo correcto | Evidencia (texto oficial) | Por qué urge |
|---|---|---|---|
| Ancho de escaleras | **OGUC 4.2.10** | "La cantidad y ancho mínimo requerido para las escaleras que forman parte de una vía de evacuación, conforme a la carga de ocupación…" (trae la tabla 1,10→1,50 m) | **La instrucción 3c del prompt ordena citarlo y no se lo entrega** |
| Iluminación/ventilación con % | **OGUC 4.5.5** | Único artículo con tabla de % de vanos; solo recintos docentes y hogares estudiantiles, **y varía por región** | Es la base real del chequeo de la Etapa C |
| Muros cortafuego | **OGUC 4.3.14** | "Los muros cortafuego deberán prolongarse a lo menos 0,50 m más arriba de la cubierta…" | El 5.5.1 que estaba no habla de esto |
| Agua potable / alcantarillado | **OGUC 5.9.1** | "Las instalaciones domiciliarias de agua potable, alcantarillado de aguas servidas…" | Ni 5.2.1 ni 5.3.1 lo cubrían |
| Ventilación de locales comerciales | **OGUC 4.1.4** | "La ventilación de locales habitables de carácter industrial o comercial, como tiendas, oficinas…" | Cubre los destinos reales del producto |
| Recepción definitiva | **LGUC 144** y **145** | 144: "Terminada una obra… el propietario…"; 145: "Ninguna obra podrá ser habitada… antes de su recepción definitiva" | El 118 que estaba es el plazo de permisos, no la recepción |
| Protección patrimonial | **LGUC 89** | "En aquellos sectores protegidos bajo la categoría de **Zona Típica o Zona de Conservación Histórica**…" | El prompt pide verificar "Protección patrimonial (LGUC Art. 60)" y el 60 es sobre riesgos |

---

## C. Sacar

| Tema | Recomendación |
|---|---|
| `electricidad` | **No incluir.** Las instalaciones eléctricas las rige la SEC, no la OGUC. La búsqueda sobre los 770 artículos no arroja ninguno que regule la materia. Mantener un artículo bajo ese rótulo era la causa de que el bloque "pareciera" cubrir algo que nunca cubrió. |

---

## Cómo se decide

La búsqueda ordena candidatos por frecuencia del término en el texto oficial; **la elección final es normativa y le corresponde al usuario**. Lo que este documento garantiza es que cada fila está respaldada por el texto real del artículo, no por una suposición.

Una vez validado, el cambio se aplica editando la lista de artículos y corriendo `node normativa/generar_articulos_prompt.mjs` — el texto se deriva solo y `test_articulos_prompt.mjs` lo verifica.
