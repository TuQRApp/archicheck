# Complemento a "Criterios gráficos muros" — feedback del arquitecto (2026-08-20)

Este documento **complementa** el criterio ya implementado (`Criterios_graficos_muros.txt`), no lo reemplaza. Se mantiene la misma numeración de etapas para que sea fácil ubicar qué cambia en cada una.

## 1. Extracción base — incluir curvas Bézier

Ya no se difieren las curvas ('c') a `otros_items`. Deben incorporarse como candidatas a borde de muro igual que los segmentos rectos ('l'). Esto habilita, entre otras cosas, detectar arcos de puerta como señal para el punto 2 del apartado "Elementos abiertos" más abajo.

## 2. Exclusión por color — no es regla universal del pipeline

El descarte por color amarillo/rojo documentado en la etapa 2 fue un ajuste específico de PdV. **No debe replicarse por defecto en proyectos nuevos.** Cada proyecto requiere su propio muestreo de colores antes de activar cualquier filtro de color (esto ya estaba anotado como advertencia; ahora se explicita que el filtro en sí es opcional y project-specific, no parte del pipeline base).

## 3. Filtro de ángulo — es una prioridad, no una definición

Que se priorice lo axis-aligned sigue siendo válido como señal (la mayoría de los muros en estos planos son ortogonales), pero en ningún caso debe operar como filtro excluyente: un muro real puede tener tramos curvos o no ortogonales, y no debe descartarse solo por no ser horizontal/vertical.

## 4. Filtro por capa nativa (OCG)

Sin cambios, confirmado tal como está.

## 5. Exclusión de líneas de referencia — extender a ejes estructurales

Se confirma: las líneas de **eje** (grilla estructural, ejes de replanteo) deben quedar **siempre excluidas**, con el mismo carácter de regla permanente que ya aplica a deslinde/rasante/línea oficial/cortes — no solo cuando hay contaminación evidente, y sin depender de si existe una capa OCG mapeada para "eje/cota". Hoy (punto 4 del documento original) la heurística geométrica de eje/cota solo se omite si hay capa mapeada; se eleva a regla permanente, igual que la de la etapa 5.

## 6. Exclusión del rectángulo perimetral completo

Sin cambios, confirmado tal como está.

## 7. Definición de muro como cuerpo cerrado — reemplaza el criterio de validación de la fusión

Esta es la pieza central del complemento. Cita del arquitecto:

> "Que sea un cuerpo sólido cerrado significa que su perímetro parte en un punto y termina en el mismo punto. El muro puede estar compuesto de muchos segmentos rectos, en L, en T, en O, etc., pero siempre comunicados."

Definición operacional para Code:

- Un muro es un **cuerpo sólido cerrado**: su contorno es un loop que empieza y termina en el mismo punto, sin importar cuántos segmentos rectos o curvos lo compongan, ni las formas que tome en el camino (L, T, O, I, empalmes sucesivos).
- El cuerpo está delimitado **siempre por dos líneas de borde paralelas entre sí** (los dos cantos del muro). Esa condición de paralelismo no es una propiedad de cada segmento aislado, sino del muro completo: en cada tramo recto, en cada esquina, en cada empalme en T, las dos líneas de borde se mantienen paralelas entre sí y corren de forma continua — incluyendo curvas y quiebres — hasta encontrarse en los vértices o cruces.
- **Test operacional (para verificar programáticamente, no solo visualmente):** si se trata el interior del muro como un recipiente y se "vierte agua" dentro de él, el agua debe llegar a cualquier punto del cuerpo sin escaparse por ningún punto del contorno. Esto equivale a un flood-fill de la región cerrada entre las dos polilíneas paralelas: si el flood-fill se escapa, hay una discontinuidad real y esa fusión no es válida como muro único; si el flood-fill queda contenido, es un cuerpo válido.
- Esto es una condición **más fuerte** que la fusión actual por proximidad punto-segmento (Union-Find con tolerancia ≤10px). La proximidad geométrica sigue sirviendo para *proponer* candidatos a fusión, pero la validación final de que el resultado es "un muro" debe confirmar que el contorno cierra como loop y que las dos líneas de borde son paralelas de forma continua a lo largo de todo el desarrollo — no solo que los segmentos están geométricamente cerca.
- No se fija un rango numérico de espesor como criterio (el espesor puede variar por tramo). Lo relevante es que, dentro de cada tramo, las dos líneas se mantengan paralelas y el contorno cierre.
- Se mantiene sin cambios la regla de que una puerta interrumpiendo el tramo es separación explícita: corta la fusión aunque la geometría cruda esté dentro de la tolerancia.

(Nota: los muros marcados a mano con distintos colores en las capturas que compartió el arquitecto sirvieron solo para identificar visualmente cada cuerpo — no son parte de la especificación ni codifican una regla de color.)

## 8. Verificación humana obligatoria

Sin cambios, confirmado tal como está.

---

## Elementos abiertos (actualización del estado "no resuelto")

**Muros curvos:** dejan de estar diferidos — ver etapa 1. Deben incorporarse ahora al pipeline, no esperar a un caso de prueba adicional.

**Clasificador muro vs. puerta/ventana:** pasa de ser solo diagnóstico a ser necesario, porque la validación de cuerpo cerrado del punto 7 depende de distinguir correctamente un vano de puerta (separación explícita legítima) de una discontinuidad accidental de la geometría. Recomendación: no construir un clasificador nuevo desde cero; derivarlo de señales ya disponibles — ancho del hueco compatible con vano de puerta, presencia de un arco de puerta arrancando en ese hueco (detectable ahora que se incluyen curvas Bézier), y nombre de capa OCG cuando exista — todas como señal aditiva, igual que el mapeo de capas de la etapa 4, nunca como filtro único. Pasa igual por verificación humana (etapa 8).

**Pilares como caso degenerado de muro:** un pilar es un caso particular del mismo cuerpo cerrado con dos pares de líneas paralelas, donde los cuatro lados tienen igual longitud, equivalente al lado corto (espesor) de un muro normal — es decir, ancho = largo, ambos iguales al espesor típico de muro. Esto permite marcarlo como "candidato a pilar" usando el mismo detector de cuerpo cerrado del punto 7, sin lógica geométrica aparte: basta revisar si el cuerpo resultante tiene proporción ancho/largo ≈ 1. Sigue requiriendo confirmación humana (etapa 8), porque un pilar y un tramo de muro muy corto pueden verse geométricamente igual.

**Distinguir muro real de otros elementos que actúan igual geométricamente (reja, pilar):** se confirma que esto queda pendiente de resolver — no hay regla automática todavía más allá de lo indicado para pilares arriba. Sigue dependiendo de criterio caso a caso.
