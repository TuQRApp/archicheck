# Auditoría Fase 1 — Detalle: `Fase 2/BIM/` (4 scripts no leídos previamente)

> Anexo de detalle. Ver síntesis y priorización en [Auditoria_Fase1_Hallazgos.md](Auditoria_Fase1_Hallazgos.md).
> Generado por agente Explore dedicado (2026-09-21), lectura completa línea por línea de `analizar_todos.py`, `generar_plano_pdf.py`, `piloto_ids_oguc.py`, `generar_json_colab.py`, más greps de confirmación. Reproducido casi verbatim por trazabilidad.

## Resumen ejecutivo (por severidad)

1. **BUG CRÍTICO confirmado en `generar_json_colab.py:551-568`**: el loop que evalúa incumplimiento de ancho de puerta usa una variable `ancho` que **nunca se calcula a partir de `d.OverallWidth`** (la puerta que se está iterando) — reutiliza silenciosamente el valor residual de una variable con el mismo nombre de un loop anterior sobre *ventanas* (línea 488) o del resguardo de ventilación a nivel edificio (línea 314). Esto es peor que el bug histórico 0.80→0.90 que el propio comentario del bloque (líneas 555-562) dice haber corregido: el umbral (0.90) SÍ se importa bien, pero el valor medido comparado contra ese umbral no es el de la puerta evaluada. Detalle completo en §4.
2. **Brecha de cobertura confirmada** entre `analizar_todos.py` y `generar_json_colab.py`: el adaptador que alimenta el portal web (el JSON real que ve el arquitecto) **no evalúa** tipo de recinto/área/ancho mínimo por tipo, círculo de giro accesible, pendiente/ancho de rampa, ni ancho de escalera — todas reglas que `analizar_todos.py` sí calcula. Confirmado por grep (0 coincidencias de `tipo_oguc`, `circulo_giro`, `cumple_pendiente`, `ancho_escalera_footprint`, etc. en `generar_json_colab.py`).
3. El fix histórico de la puerta (0.80→0.90) **sí se propagó correctamente** como umbral numérico a los 4 archivos — no hay ningún literal `0.80`/`0.90`/`1.10`/`1.20`/`1.50` hardcodeado en código ejecutable en ninguno de los 4 archivos (verificado por grep dirigido); todas las apariciones de esos números son comentarios históricos o texto descriptivo no vinculante.
4. Hardcodeos menores de **texto de cita** (no de umbral numérico) en `analizar_todos.py` y `piloto_ids_oguc.py`.
5. `piloto_ids_oguc.py` no aplica escala de unidades a `OverallWidth` — riesgo latente de la misma familia de bug ya conocida en este proyecto.
6. Triplicación de lógica de deduplicación escalera/rampa entre los 3 scripts ejecutables (no en `piloto_ids_oguc.py`).
7. Listas `ARCHIVOS` desincronizadas entre `analizar_todos.py` y `generar_plano_pdf.py`.

---

## 1. `Fase 2/BIM/analizar_todos.py`

### Qué hace / estructura
Extrae de cada IFC de ejemplo muros/puertas/ventanas/recintos/rampas/escaleras y arma un JSON `archicheck_geometrico`-like con los mismos campos que el pipeline PDF (`muros_geo`, `puertas_geo`, `ventanas_geo`, `rampas_geo`, `escaleras_geo`, `recintos_geo`, `incumplimientos_geo`, `resumen_global`). Funciones principales: `buscar_area()` (línea 212), `clasificar_tipo_recinto()` (232), `ancho_min_footprint()` (285), `es_candidato_accesible()`/`circulo_cabe_en_footprint()` (334/353), `geometria_3d_cruda()` (398), `dimensiones_rampa_footprint()` (434), `ancho_escalera_footprint()` (479), `num_o_none()`/`num_o_none_escalado()` (529/533), `analizar()` (549, función central) y `main()` (1054, corre el batch sobre `ARCHIVOS`).

Aplica 7 categorías de reglas OGUC: puerta_ancho_libre, muro_fire_rating (dato declarado), ventilacion_iluminacion_pct, rampa (ancho+pendiente calculada por geometría 3D real, no leída), escalera (ancho por geometría), área/ancho mínimo por tipo de recinto, círculo de giro accesible. Es, de los 4 archivos, el de mayor cobertura normativa.

### Hardcodeos
- **Ninguno de umbral numérico** — todos los umbrales (`_ANCHO_MIN_PUERTA_M`, `_ANCHO_MIN_RAMPA_M`, `_ANCHO_MIN_ESCALERA_M`, `_VENTILACION_MIN_PCT`, `OGUC_REGLAS['circulo_giro_accesible_m'][0]`) se importan correctamente de `reglas_normativas.py` (líneas 60-80, 811).
- **`analizar_todos.py:674`**: `"referencia": "OGUC Art. 4.1.7 N°4",` — string literal escrito a mano en vez de `OGUC_REGLAS['puerta_ancho_libre'][2]` (que en `reglas_normativas.py:191` contiene el texto completo). Hoy el artículo citado coincide, pero es un segundo punto de verdad no sincronizado por importación — exactamente la clase de riesgo que ya causó el incidente histórico 0.80/0.90.
- **`analizar_todos.py:884`**: `"referencia": "OGUC Art. 4.3.3"` — mismo patrón, en vez de `OGUC_REGLAS['muro_fire_rating']['ref']` (`reglas_normativas.py:202`).
- Contraste: para rampa (`_REF_RAMPA_ANCHO`, línea 64), escalera (`_REF_ESCALERA_ANCHO`, línea 80), ventilación (`_REF_VENTILACION`, línea 79), círculo de giro (línea 937-938, accede directo a `OGUC_REGLAS[...]`) y área/ancho de recinto (`ref_oguc` desempaquetado de `OGUC_REGLAS.get(tipo_recinto,...)`, línea 805) el archivo **sí** sigue el patrón correcto de una sola fuente. Solo puerta y muro-fire-rating rompen ese patrón consistente.
- **`analizar_todos.py:67-68`**: `_REF_RAMPA_PENDIENTE` es un string escrito a mano que documenta la fórmula como `"i%=12,8-0,5333*L"`. Verificado contra `reglas_normativas.py:354-382`: la función real `pendiente_maxima_rampa_pct()` que este archivo importa y usa (línea 719) **no** usa la constante truncada `0.5333` — usa la fracción exacta `4.0/7.5`, corregida explícitamente tras un hallazgo de DeepSeek documentado en `reglas_normativas.py:367-375` porque `0.5333` truncado difiere en 133 puntos del rango 1.5-9.0m al redondear a 2 decimales. Es decir: **el texto de referencia que ve el usuario en cada incumplimiento de pendiente de rampa (usado en líneas 958 y 961) describe una fórmula desactualizada/menos precisa que la que el código realmente ejecuta.** No es un error de cálculo (el cálculo usa la función correcta), es una inconsistencia de documentación expuesta al usuario final. **Nota de consolidación:** este mismo patrón — texto/prompt con `0.5333` truncado en vez de la fracción exacta — aparece también en `_celda4_actual.py:1168` (ahí sí afecta el cálculo, no solo el texto) y en `src/App.jsx:1051` (el prompt de producción que usa el modelo). Ver hallazgo transversal en el documento de síntesis.
- `_MEDIDA_MIN_PLAUSIBLE_M = 0.05` (línea 138) y `_FILL_RATIO_MIN_TRAMO_RECTO = 0.85` (línea 172): el propio código aclara explícitamente (líneas 118-127, 160-172) que son estimaciones técnicas de plausibilidad geométrica, no umbrales normativos. Correctamente excluidos de la fuente única, con justificación escrita.

### Inconsistencia/gap interno
- **`circulo_cabe_en_footprint()` (líneas 353-395) no aplica el guard `_MEDIDA_MIN_PLAUSIBLE_M`**, a diferencia de `ancho_min_footprint()` (guard en línea 328), `dimensiones_rampa_footprint()` (guard en líneas 468 y 474-475) y `ancho_escalera_footprint()` (guard en líneas 521 y 526). Las 4 funciones comparten el mismo `g.footprint_2d()` con el mismo riesgo documentado de colapso de precisión de punto flotante (líneas 82-137, el caso real de HouseZ con ancho_m=0.0045). Si un recinto cuyo nombre matchea `es_candidato_accesible()` (línea 334) sufriera ese mismo colapso geométrico, `circulo_cabe_en_footprint()` erosionaría (`poly.buffer(-radio_px)`, línea 392) un polígono de pocos mm y devolvería `False` (no cabe) en vez de `None` (no medible) — generando un incumplimiento `circulo_giro` espurio en vez de `circulo_giro_sin_dato`. No hay evidencia en estos 4 archivos de que esto haya ocurrido realmente en los 10 IFC de prueba (ningún nombre de recinto conocido combina "accesible/universal/pmr/discapacita" con el caso HouseZ documentado) — se marca como gap de cobertura del guard, **no** como bug ya disparado.

### Código muerto
No se encontró código muerto en este archivo.

---

## 2. `Fase 2/BIM/generar_plano_pdf.py`

### Qué hace / estructura
Genera un PDF (una página por nivel) triangulando la geometría 3D real de cada elemento IFC (`ifcopenshell.geom`) y proyectándola a XY vía convex hull (`footprint_2d()`, línea 238). No aplica ninguna regla normativa — es puramente de dibujo/diagnóstico, y así lo confirma el grep: cero literales `0.80/0.90/1.10/1.20/1.50` en código, solo en comentarios históricos (líneas 109-114). Funciones clave, todas reutilizadas por los otros 3 archivos vía `import generar_plano_pdf as g`: `filtrar_vanos_reales()` (95), `escala_area()` (129), `footprint_2d()` (238), `mapa_operacion_puertas()` (362), `mapa_salida_emergencia()` (400), `bisagra_por_geometria()` (464), `arco_apertura_puerta()` (493), `validar_niveles()` (600), `es_nivel_cubierta()` (216), diccionarios `ESTILOS`/`ORDEN_DIBUJO`/`ORDEN_DIBUJO_CUBIERTA` (144-213), y `main()` (692).

### Hardcodeos
Ninguno normativo (no aplica). El único hardcode notable es de naturaleza distinta: `UMBRAL_ASIMETRIA_BISAGRA_M = 0.02` (línea 448) y `UMBRAL_MARGEN_HULL_M = 0.08` (línea 460), calibrados contra **un único caso real conocido** (la puerta "D1R" de Schependomlaan) — el propio código lo admite sin rodeos en las líneas 440-447: "es una calibracion de UN SOLO caso, no una validacion estadistica". No es un hardcode normativo, es heurística geométrica de dibujo, pero es un límite real de robustez documentado honestamente.

### Bugs / casos límite
- **`main()` líneas 719-727**: `ox, oy` (origen para trasladar coordenadas y evitar UTM absolutas) se calculan **solo a partir del primer muro** de `todos_muros[:1]`. Si ese muro específico falla al triangular (`except Exception: pass`, línea 725), el código hace `break` (línea 727) sin intentar con el segundo muro — `ox, oy` quedan en `(0.0, 0.0)` aunque otros muros del mismo archivo sí sean triangulables. Esto no está cubierto por el comentario de cabecera (líneas 712-717), que solo documenta el caso "cero muros en todo el archivo", no el caso "el primer muro específico no triangula pero hay otros que sí". Consecuencia: coordenadas del PDF en UTM/mundo absoluto (potencialmente ~10⁵-10⁶) en vez de relativas, degradando la legibilidad del plano sin ningún aviso. Este mismo patrón se duplica textualmente en `generar_json_colab.py:262-270`.
- **`es_nivel_cubierta()` (líneas 216-222)**: usa igualdad exacta de float (`nivel.Elevation == max(cotas)`, línea 222) para decidir cuál nivel es la cubierta. El propio archivo ya implementa detección de "cotas_duplicadas" en `validar_niveles()` (línea 624: `cotas_duplicadas = len(elevaciones) != len(set(elevaciones))`) como alerta genérica — pero `es_nivel_cubierta()` no consulta esa alerta: si dos niveles empatan en la cota máxima, **ambos** se tratarían como cubierta simultáneamente. No hay evidencia de que esto ocurra en los archivos de prueba actuales — se señala como caso límite no cubierto, no como bug ya disparado.
- **`__main__` (líneas 915-921)**: el batch runner captura únicamente `PermissionError`. Cualquier otra excepción (IFC corrupto, geometría no triangulable en un punto no protegido, etc.) aborta el batch completo y ningún archivo posterior en `ARCHIVOS` se procesa. Contrasta con `analizar_todos.py:1059-1063`, que captura `Exception` genérica y hace `continue` — política de tolerancia a fallos distinta entre los dos batch runners del mismo proyecto operando sobre listas de archivos equivalentes.

### Inconsistencia con otros archivos
- **`ARCHIVOS` (líneas 34-63, 15 entradas) no incluye `Esplanades` ni `FOJAB_Landsarkivet`** — verificado por grep, cero coincidencias. Estos son, según `analizar_todos.py:195-202`, los **únicos 2 archivos del set con `IfcRamp` real**, agregados el 2026-09-20 específicamente para motivar el soporte de rampas. Ese mismo soporte de rampas (`ESTILOS["IfcRamp"]`/`["IfcRampFlight"]`, líneas 172-186; lógica de dibujo en 810-820) **ya existe en este archivo**, pero nunca se ejercita al correr `python generar_plano_pdf.py` standalone porque su lista `ARCHIVOS` quedó desactualizada respecto a la de `analizar_todos.py:174-203` (que sí las incluye).

### Código muerto
- `arco_apertura_puerta()` línea 504: `if n_segmentos <= 0: return None, None` — el propio comentario admite que "ningun llamado actual usa otro valor que el default" (n_segmentos=8, verificado: los 2 call sites no pasan ese parámetro). No es código muerto en sentido estricto (es alcanzable si cambia la firma de la llamada) pero es una guardia defensiva actualmente inejercitada.

---

## 3. `Fase 2/BIM/piloto_ids_oguc.py`

### Qué hace / estructura
Piloto de `ifctester`/IDS (motor declarativo) contra un único IFC (`Administrativo (ES)`, línea 35) para 3 reglas OGUC: puerta ancho libre (Specification `s1`, líneas 63-76), muro FireRating declarado (`_regla_fire_rating()`, función en 95-109, invocada 2 veces en 112-113 para `IFCWALLSTANDARDCASE` e `IFCWALL` por separado, porque `ids.Entity` hace match exacto de clase sin incluir subtipos — hallazgo histórico de Codex documentado en líneas 85-94), y ancho de tramo de escalera (`s3`, líneas 141-155). Corre `specs.validate(model)` (línea 159) y reporta por consola. Cobertura deliberadamente menor que `analizar_todos.py`: sin rampa, sin ventilación, sin círculo de giro, sin área/ancho de recinto — documentado explícitamente como decisión de alcance (líneas 121-140).

### Hardcodeos
- Umbrales numéricos correctamente importados: `_ANCHO_MIN_PUERTA_M = OGUC_REGLAS['puerta_ancho_libre'][1]` (línea 31), `_PSET_FIRE_RATING, _PROP_FIRE_RATING` (línea 32), `_ANCHO_MIN_ESCALERA_M = OGUC_REGLAS['escalera'][1]` (línea 33) — y usados correctamente en las restricciones reales de validación.
- **Pero el texto descriptivo `name`/`instructions` de nivel `Specification` sí hardcodea los números como texto plano, no como valor derivado de la variable**:
  - **Línea 65**: `instructions="Toda puerta debe tener OverallWidth >= 0.90 m (ancho libre minimo de accesibilidad universal, caso general)."` — string literal, no f-string.
  - **Línea 142**: `name="Escaleras -- ancho de tramo minimo (OGUC Art. 4.2.10, piso 1.10 m)"`.
  - **Línea 143**: `instructions="Todo tramo de escalera debe tener Width >= 1.10 m (minimo OGUC segun carga de ocupacion, no diferenciado en este piloto)."`.

  Contraste inmediato dentro del mismo archivo: las `instructions` anidadas dentro de `ids.Attribute`/`ids.Property` (líneas 73 y 153) **sí** son f-strings correctamente derivadas: `instructions=f"OGUC Art. 4.1.7 N°4 -- ancho libre minimo {_ANCHO_MIN_PUERTA_M} m"` y similar para escalera. Es decir, **en las mismas 2 reglas, dos textos casi idénticos: uno sincronizado con la fuente única y otro no**, dentro del mismo archivo. Si `OGUC_REGLAS['puerta_ancho_libre'][1]` o `['escalera'][1]` cambiaran de valor, las líneas 65/142/143 quedarían desactualizadas mientras que las f-strings se actualizarían solas. Esto contradice parcialmente la propia afirmación de cabecera del archivo (líneas 16-20): "los 3 valores de abajo ahora se importan directo de Fase 2/reglas_normativas.py -- ya no son copia manual" — cierto para el valor funcional de validación, falso para el texto descriptivo mostrado en el reporte.

### Riesgo no confirmable con estos 4 archivos: falta de escala de unidades
Verificado por grep (`escala|unit_scale|calculate_unit`): **cero coincidencias** en todo `piloto_ids_oguc.py`. El archivo compara `OverallWidth` directo contra `_ANCHO_MIN_PUERTA_M=0.90` vía `ids.Restriction`, sin ningún `ifcopenshell.util.unit.calculate_unit_scale()` de por medio — exactamente el mecanismo que causó el bug histórico documentado en `analizar_todos.py:538-544` y `generar_plano_pdf.py:107-115` ("en archivos con LENGTHUNIT en milimetros... cualquier ancho crudo... es siempre >= 0.80"). No se pudo confirmar si la librería `ifctester` normaliza unidades internamente (no se leyó su código fuente, dependencia externa fuera de alcance). El único IFC de prueba de este piloto (`Administrativo (ES)`, línea 35) no figura en la lista de los 3 archivos identificados como afectados por LENGTHUNIT=mm (BasicHouse/HouseZ/Schependomlaan) — sugiere que en la práctica podría no estar afectado, pero el piloto no lo verifica ni lo maneja explícitamente, a diferencia de los otros 2 scripts. **SIN VERIFICAR.**

### Inconsistencias con `analizar_todos.py` (mismo dato, mecanismo distinto)
- **Regla 3 (escalera)**: consulta `Qto_StairFlightBaseQuantities.Width` declarado (líneas 148-150). El propio archivo documenta (líneas 121-134) que **ninguno de los 10 IFC de prueba declara esa Qto**, por lo que esta regla nunca puede dar "cumple" con datos reales — es exactamente por esto que `analizar_todos.py` decidió NO reusar esta regla IDS y en cambio calcula el ancho desde geometría 3D real (`ancho_escalera_footprint()`). Divergencia de alcance ya documentada y reconocida como tal, no un hallazgo nuevo.
- **Regla 2 (fire rating)**: mecanismo de matching de entidad distinto de `analizar_todos.py` (exact-match de IDS vs. `by_type()` de ifcopenshell que incluye subtipos) — ya corregido y documentado como bug histórico real, hoy mitigado agregando 2 Specifications. No se verificó si ambos mecanismos producen el mismo conteo total sobre `Administrativo (ES)` (no se ejecutó el pipeline, solo se leyó código). **SIN VERIFICAR.**

### Código muerto
No se detectó código muerto en este archivo.

---

## 4. `Fase 2/BIM/generar_json_colab.py`

### Qué hace / estructura
Adaptador que reempaqueta los datos extraídos del IFC (mismo método que `analizar_todos.py`, pero desglosado por nivel/página en vez de agregado por edificio) al esquema JSON exacto que consume el portal web de ArchiCheck (`paginas`, `analisis_semantico`, `mediciones_geometricas`, `incumplimientos_geo`, `muros_geo`/`puertas_geo`/`ventanas_simples_por_linea_central`, `resumen_global`). Función principal `render_nivel_png()` (105) dibuja el PNG y proyecta la geometría real a coordenadas de píxel usando la transformación `ax.transData` ya fijada; `main()` (255) orquesta todo, por nivel, escribe el PNG y el JSON final.

### Verificación específica: ¿se propagó el fix de puerta 0.80→0.90?
**El umbral SÍ se propagó correctamente como valor**: no hay ningún literal `0.80` (ni `0.90`) en código ejecutable de este archivo (confirmado por grep — las únicas apariciones de "0.80"/"0.90" están en comentarios narrativos, líneas 553, 556, 558). La comparación de umbral usa `a._ANCHO_MIN_PUERTA_M` (línea 563, 566) y la cita usa `a.OGUC_REGLAS['puerta_ancho_libre'][2]` (línea 567) — ambos correctamente importados vía `import analizar_todos as a` (línea 56), que a su vez importa de `reglas_normativas.py`. Hasta acá, el hallazgo histórico documentado en el propio comentario de cabecera (líneas 555-562) está genuinamente resuelto en cuanto al valor del umbral.

### BUG CRÍTICO no documentado: el "ancho" comparado no es el de la puerta
Sin embargo, al leer el bloque completo línea por línea (verificado también por grep de `ancho\s*=` y de `OverallWidth` en todo el archivo), se encontró que **la variable `ancho` usada en la comparación nunca se calcula a partir de la puerta iterada**:

```
550:        incumplimientos_geo = []
551:        for d in puertas:
...
563:            if ancho is not None and ancho < a._ANCHO_MIN_PUERTA_M:
564:                incumplimientos_geo.append({
565:                    "tipo": "ancho", "recinto": d.Name or "Puerta",
566:                    "medido": round(ancho, 2), "minimo": a._ANCHO_MIN_PUERTA_M,
567:                    "ref": a.OGUC_REGLAS['puerta_ancho_libre'][2],
568:                })
```

No existe ninguna línea `ancho = a.num_o_none_escalado(d.OverallWidth, escala_m)` dentro de este loop (ni en ningún otro punto del archivo — `d.OverallWidth`/`.OverallWidth` de una puerta **jamás se lee en todo el archivo**, confirmado por grep: las únicas 2 referencias a `.OverallWidth` en el archivo son `v.OverallWidth` en la línea 307 y en la línea 488, ambas sobre **ventanas** (`v`), nunca sobre puertas (`d`)).

En Python las variables de `for` no tienen scope de bloque — `ancho` es local a la función `main()` completa. Por lo tanto, en la línea 563 el código reutiliza silenciosamente lo que haya quedado de:
- **línea 488**, dentro de `for v in ventanas: ancho = a.num_o_none_escalado(v.OverallWidth, escala_m)` (líneas 482-489) — el ancho de la **última ventana** procesada en el nivel, si `ventanas` no estaba vacío para ese nivel; o si no,
- **línea 314**, dentro del resguardo de ventilación a nivel edificio (líneas 306-320) — el ancho de alguna ventana vinculada a algún `IfcSpace` en cualquier parte del edificio, si `ventilacion_aplicable` era `True`; o si ninguno de los dos casos se ejecutó,
- **`ancho` queda sin asignar en absoluto**, y la línea 563 lanza `UnboundLocalError: local variable 'ancho' referenced before assignment` — esto ocurre con certeza en cualquier IFC con puertas reales pero **cero `IfcWindow` reales en todo el edificio** (lo que hace `ventilacion_aplicable=False` en línea 305, saltándose el bloque 306-320 completo, y además `ventanas` vacío en cada nivel, saltándose también el bloque 482-489). `analizar_todos.py:638-647` documenta que el archivo de prueba "Administrativo (ES)" es exactamente ese caso ("100% muro cortina", 0 `IfcWindow`) — no hay evidencia directa dentro de estos 4 archivos de que ese IFC en particular tenga puertas reales (no se leyó su contenido, solo el código), pero la condición de disparo del crash es una propiedad del código en sí, no de un archivo puntual: cualquier IFC con esa combinación (puertas reales + cero ventanas reales) rompe este script. `main()` no tiene ningún `try/except` propio ni en el `__main__` (líneas 676-677) que lo proteja.

**Impacto incluso cuando NO crashea** (el caso más común, p. ej. sobre el IFC por defecto `DuplexHouse.ifc`): **todas las puertas de un mismo nivel comparten el mismo valor de "ancho"** (el de la última ventana procesada, no el de cada puerta individual) — el campo `"recinto": d.Name` en la línea 565 identifica correctamente a la puerta `d`, pero `"medido": round(ancho, 2)` en la línea 566 reporta la dimensión de una **ventana** no relacionada. Esto produce, según el valor incidental de esa ventana: (a) falsos positivos — todas las puertas del nivel marcadas como "ancho insuficiente" si esa ventana era angosta, o (b) falsos negativos — ninguna puerta marcada aunque alguna sí sea real y genuinamente angosta, si esa ventana era ancha. El comentario que acompaña este bloque (líneas 552-562) describe con precisión el bug histórico del umbral crudo pero no menciona ni corrige este problema — sugiere que la corrección del umbral (2026-09-21) dejó (o introdujo) este defecto sin ser detectada.

Este es el bug más severo de los 4 archivos: afecta directamente al **único JSON que llega al portal real** usado por arquitectos, para la única regla de puerta que este adaptador expone.

### Brecha de cobertura confirmada (portal vs. pipeline geométrico completo)
Grep dirigido de `tipo_oguc|area_min_oguc|ancho_min_oguc|circulo_giro|clasificar_tipo_recinto|es_candidato_accesible|cumple_pendiente|pendiente_maxima|ancho_escalera_footprint|dimensiones_rampa_footprint` sobre `generar_json_colab.py`: **cero coincidencias**. Esto confirma que el adaptador:
- No clasifica tipo de recinto ni evalúa área/ancho mínimo por tipo (dormitorio/sala/cocina/baño/etc.), pese a que `analizar_todos.py:755-835` sí lo hace.
- No evalúa círculo de giro accesible (`analizar_todos.py:807-812, 935-942`).
- No evalúa pendiente ni ancho mínimo de rampa (`analizar_todos.py:708-733, 951-970`) — cuenta y posiciona rampas (`rampas_detalle`, línea 598) pero nunca su cumplimiento.
- No evalúa ancho mínimo de escalera (`analizar_todos.py:743-753, 977-986`) — mismo caso, solo posición (`escaleras_detalle`, línea 593).

Los campos `cumple_oguc` (línea 535, `analisis_semantico.recintos`) y `cumple_geo` (línea 547, `mediciones_geometricas`) **son exclusivamente el resultado de ventilación** — la variable `cumple` se define una sola vez en todo el bloque de recintos (línea 523: `cumple = (pct >= a._VENTILACION_MIN_PCT) if pct is not None else None`) y se reutiliza sin cambios para ambos campos. Un recinto que incumple área o ancho mínimo, o que necesita y no tiene círculo de giro, pero que sí ventila bien, sale con `cumple_oguc: true` en el JSON del portal — un nombre de campo que sugiere cumplimiento normativo general pero que en realidad solo refleja un subconjunto (ventilación). De los límites documentados en la cabecera del archivo (líneas 32-42) solo se reconoce explícitamente la omisión de FireRating de muro y el tratamiento de ventilación fuera de `incumplimientos_geo` — la omisión de tipo_recinto/área/ancho/círculo_giro/rampa/escalera **no está documentada en ningún comentario del archivo**, a diferencia del resto de límites del proyecto, que sí suelen quedar anotados explícitamente cuando son decisiones conscientes.

Adicionalmente, `"incumplimientos_oguc": []` (línea 589) queda siempre vacío con el comentario "no se fabrican candidatas" — no se verificó (fuera del alcance de estos 4 archivos, requeriría leer `src/App.jsx`) si el prompt del portal lee `incumplimientos_geo` o `incumplimientos_oguc` para mostrar hallazgos de puerta. **SIN VERIFICAR.**

### Otros hallazgos
- **Líneas 262-270**: mismo patrón de `ox, oy` desde solo el primer muro, con `except Exception: pass` silencioso, duplicado literal de `generar_plano_pdf.py:719-727`.
- **Línea 622**: `"ventanas_simples_por_linea_central": geo_pixeles["ventana"]` — el nombre de la clave sugiere una línea central simplificada, pero el contenido real (`geo_pixeles["ventana"]`) se construye por el mismo camino que muro/puerta: el contorno completo del polígono como segmentos, no una línea central. No se pudo confirmar el impacto real sin leer `src/App.jsx`. **SIN VERIFICAR** — posible discrepancia nombre/contenido, no bug confirmado.
- **Líneas 389-445**: reimplementación propia (tercera copia independiente en el proyecto) de la deduplicación escalera/rampa por decomposición+fallback.

### Código muerto
No se detectó código muerto propio de este archivo.

---

## 5. Inconsistencias cruzadas entre los 4 archivos

| Punto | `analizar_todos.py` | `generar_plano_pdf.py` | `generar_json_colab.py` | `piloto_ids_oguc.py` |
|---|---|---|---|---|
| Lista de archivos de prueba | 10 archivos, líneas 174-203, **incluye** Esplanades/FOJAB | 15 archivos, líneas 34-63, **no incluye** Esplanades/FOJAB | Un solo IFC por invocación (parámetro) | Un solo IFC fijo, `Administrativo (ES)` |
| Rampa: ancho+pendiente OGUC | Evalúa (708-733, 951-970) | No evalúa normativa (solo dibuja) | **No evalúa**, solo posiciona | No cubre |
| Escalera: ancho OGUC | Evalúa (743-753, 977-986) | No evalúa (solo dibuja) | **No evalúa**, solo posiciona | Evalúa (vía Qto que nunca existe en los datos reales) |
| Círculo de giro / tipo de recinto | Evalúa (755-835, 935-942) | N/A | **No evalúa en absoluto** | No cubre |
| Manejo de errores en batch multi-archivo | `except Exception: continue` por archivo (1059-1063) | `except PermissionError` únicamente (918-921) — cualquier otro error aborta el batch completo | Sin batch / sin try-except en `__main__` (676-677) | N/A (un solo archivo, sin loop) |
| Deduplicación escalera/rampa | Implementación propia #1 (568-611) | Implementación propia #2 (791-820) | Implementación propia #3 (389-445) | N/A |
| Escala de unidades aplicada a OverallWidth | Sí (`num_o_none_escalado`, 533-546) | N/A (no compara umbrales) | Sí, pero solo para ventanas (488-489); nunca se llega a aplicar a puertas por el bug de la sección 4 | **No aplica ninguna** (grep: 0 coincidencias) |
| Cita de referencia de puerta/muro (texto) | Hardcodeada corta (674, 884), no importada | N/A | Importada correctamente (567) | Texto de `Specification` hardcodeado (65, 142-143); texto de `Attribute`/`Property` importado (73, 153) |

Estas tres últimas filas son, en conjunto, la misma clase de riesgo estructural que ya produjo el incidente histórico documentado (0.80→0.90 no propagado durante semanas): **la lógica compartida entre los 3 scripts ejecutables (deduplicación escalera/rampa, cálculo de origen ox/oy, escala de unidades) está triplicada/hardcodeada a mano en vez de centralizada** en el módulo `g` (`generar_plano_pdf.py`) que ya sirve como fuente compartida para `footprint_2d()`, `escala_area()`, `filtrar_vanos_reales()`, `mapa_salida_emergencia()`, `mapa_operacion_puertas()`, `ESTILOS`, `ORDEN_DIBUJO`, `es_nivel_cubierta()` y `arco_apertura_puerta()` — funciones que sí están correctamente centralizadas y reusadas por los 3 scripts. No es un bug ejecutándose hoy (salvo el de la sección 4), pero es el mismo patrón de riesgo de propagación que el propio proyecto ya identificó como causa raíz del incidente de la puerta.

---

## Nota metodológica
Todos los hallazgos de esta sección fueron verificados por lectura directa de los 4 archivos completos línea por línea más greps dirigidos de confirmación (variables `ancho=`, referencias a `.OverallWidth`, literales `0.80/0.90/1.10/1.20/1.50`, y símbolos de reglas de recinto/rampa/escalera) — no se especuló sobre comportamiento en runtime; donde no se pudo confirmar algo sin ejecutar el pipeline o sin leer `src/App.jsx` (fuera del alcance de estos 4 archivos), quedó marcado explícitamente como SIN VERIFICAR.
