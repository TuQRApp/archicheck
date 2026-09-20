# -*- coding: utf-8 -*-
"""
Fuente UNICA de reglas normativas de ArchiCheck -- OGUC hoy, con espacio
explicito para LGUC/PRC/circulares DDU/lo que venga despues.

Decision del usuario, 2026-09-20 (ver Proyecto/Diseno_Funcional_ArchiCheck.md
S3.15): "Deben incorporarse siempre todas las reglas existentes y las
nuevas de manera unificada para que sean usados en ambos pipeline" -- CAD
(Fase 2/Herramientas_CubiCasa5k/) y BIM (Fase 2/BIM/) NUNCA vuelven a tener
su propia copia de un umbral/cita normativa. Ambos importan de aca.

LIMITACION REAL, no resuelta hoy (documentada para no fingir que no
existe): el pipeline CAD corre como celda de Colab pegada directamente en
el notebook -- Colab no tiene acceso al filesystem de este repo (sin
git clone, sin drive.mount, verificado leyendo el notebook real), asi que
la celda pegada en Colab NO PUEDE hacer `from reglas_normativas import
OGUC_REGLAS`. Este modulo SI es importable de forma limpia por:
  - Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py (el espejo LOCAL de
    esa celda, usado para correr/testear Celda 4 sin Colab -- antes tenia
    su propia copia de OGUC_REGLAS, ahora importa de aca).
  - Fase 2/BIM/analizar_todos.py y piloto_ids_oguc.py (scripts locales
    reales, sin restriccion de Colab).
Para el notebook de Colab en si, la disciplina sigue siendo copiar el
CONTENIDO EXACTO de este archivo dentro de la celda (no re-transcribir de
memoria) hasta que el flujo de Colab cambie (fuera de alcance hoy).

Ninguna regla de aca se inventa ni se estima -- cada entrada tiene su cita
y su historial de verificacion real contra el texto de la norma (ver
comentarios). Donde no hay fuente confirmada, se marca "SIN VERIFICAR"
explicitamente en vez de omitirse o inventarse (mismo principio que
"nunca fallar en silencio").
"""

# ═══════════════════════════════════════════════════════════════════════
# OGUC -- Ordenanza General de Urbanismo y Construcciones
# ═══════════════════════════════════════════════════════════════════════
#
# Reglas de RECINTO: dict {tipo_recinto: (area_min_m2, ancho_min_m, ref)}.
# Cualquiera de area_min/ancho_min puede ser None (sin minimo de ese tipo
# para ese recinto). `ref` es SIEMPRE la cita + el historial de
# verificacion real (nunca solo el numero de articulo sin contexto).
#
# FIX 2026-07-26 (auditoria completa contra oguc_articulos.json, fuente verificada):
#   - 'pasillo' y 'escalera' citaban el articulo EQUIVOCADO uno del otro: 4.2.2 es
#     "escaleras_minimos" (no pasillos) y 4.2.4 es "carga_ocupacion" (tabla de
#     personas/m2, no ancho de escalera). El ancho minimo real de escalera de uso
#     comun (1.20 m) esta en 4.2.2; el ancho minimo real de pasillo/corredor de uso
#     comun (1.20 m) esta en 4.2.5 ("ancho_vias_evacuacion": "...el ancho minimo de
#     corredores de uso comun es 1,20 m"). Los VALORES (1.20 m ambos) eran correctos,
#     solo la cita estaba cruzada -- ya corregido abajo.
#   - Los minimos de AREA (dormitorio/sala/living/comedor/cocina/bano) citaban Art.
#     4.1.7 OGUC, que verificamos es INTEGRAMENTE sobre accesibilidad universal (ruta
#     accesible, rampas, puertas, ascensores, banos accesibles) -- no contiene NINGUN
#     minimo de superficie por tipo de recinto. Se revisaron ademas 4.1.1/4.1.2/4.1.3/
#     4.5.7 (los unicos otros articulos cargados que mencionan dormitorio/sala/living)
#     y tampoco fijan m2 minimos -- solo alturas, ventilacion e iluminacion. No se
#     encontro en ninguna fuente cargada una base real para estos 6 valores de area;
#     mismo patron de error que la formula de rampa fabricada por Revi (ver roadmap).
#   - FIX 2026-07-26 (b): investigado DS49 (Fondo Solidario de Eleccion de Vivienda,
#     2011, Cuadro Normativo Abreviado MINVU) como candidato. CONFIRMADO QUE NO ES LA
#     FUENTE: (1) los valores no coinciden -- DS49 exige Estar+Comedor COMBINADO 9.40 m2
#     (no separa 'sala'/'living' 10.0 de 'comedor' 8.0 como hace este dict), Dormitorio
#     Principal 7.20 m2 / Segundo Dormitorio 7.00 m2 (no un unico 'dormitorio' 8.0),
#     Cocina 4.00-5.00 m2 (mas exigente que nuestro 3.0, o sea nuestro umbral dejaria
#     pasar cocinas que DS49 rechazaria), Bano 2.50-3.50 m2 (mas exigente que nuestro
#     1.5, mismo problema). (2) Aunque coincidieran, DS49 SOLO aplica a proyectos del
#     programa de vivienda social subsidiada -- no es una norma general OGUC, no aplica
#     a un restaurante ni a vivienda de mercado. Conclusion: estos 6 valores no tienen
#     fuente identificada, ni en OGUC ni en DS49 -- se mantienen SIN VERIFICAR.
#     Se dejan ACTIVOS pero marcados como SIN VERIFICAR -- no se inventa una cita ni
#     se borra el chequeo, se marca la incertidumbre (mismo criterio que
#     'sin_nombre_confirmar' para recintos). Pendiente: decidir si se retiran del motor
#     de reglas o se dejan solo como referencia no vinculante mientras no haya fuente.
OGUC_REGLAS = {
    'dormitorio': (8.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'sala'      : (10.0, None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'living'    : (10.0, None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'comedor'   : (8.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'cocina'    : (3.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'bano'      : (1.5,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    # FIX 2026-07-26 (d) -- auditado 'pasillo' y 'escalera' contra oguc_pdf.json
    # (extraccion completa, 770 articulos). Confirmado que 4.2.1/4.2.3/4.2.4 SI
    # coinciden textualmente con lo que ya teniamos -- la numeracion no esta rota
    # en general. Pero:
    #   - 'escalera' citaba Art. 4.2.2 -- FALSO. El Art. 4.2.2 real es sobre
    #     "cambio de destino" (autorizacion, informe de profesional), no tiene nada
    #     que ver con escaleras. El articulo real es 4.2.10: "La cantidad y ancho
    #     minimo requerido para las escaleras que forman parte de una via de
    #     evacuacion, conforme a la carga de ocupacion del area servida" -- es una
    #     TABLA por carga de ocupacion (hasta 50 personas: 1,10 m; 51-100: 1,20 m;
    #     101-150: 1,30 m; 151-200: 1,40 m; 201-250: 1,50 m; sobre 250 se exigen 2
    #     escaleras), NO un valor fijo de 1,20 m. No calculamos carga de ocupacion
    #     todavia (requeriria area servida x factor m2/persona del Art. 4.2.4) --
    #     se usa 1,10 m como PISO conservador (el minimo de la tabla, aplica
    #     siempre sin importar ocupacion) en vez de 1,20 m: asi solo se marca
    #     incumplimiento cuando es inequivocamente insuficiente para cualquier
    #     ocupacion, sin arriesgar falsos positivos contra escaleras que si
    #     cumplen para su carga real (que hoy no medimos). Pendiente: implementar
    #     carga de ocupacion real para aplicar la tabla completa.
    #   - 'pasillo' cita Art. 4.2.5 -- el articulo SI es el correcto en tema (el
    #     texto real confirma que el ancho de vias de evacuacion, exceptuando
    #     escaleras, se determina "en base a la carga de ocupacion de la
    #     superficie que sirve"), pero el valor especifico "1,20 m para corredores
    #     de uso comun" que veniamos usando NO aparece textualmente en el articulo
    #     -- no se encontro en esta pasada la tabla equivalente a la de escaleras
    #     (4.2.10) para pasillos/corredores generales. Se mantiene el valor por
    #     ahora (es un minimo de uso muy extendido en la practica) pero queda
    #     marcado como parcialmente verificado, no confirmado al 100%.
    #
    # RE-VERIFICADO 2026-09-21 (curacion OGUC completa, busqueda exhaustiva
    # sobre las 770 secciones de oguc_pdf.json por "pasillo"/"corredor" +
    # "1,20"): CONFIRMADO que no existe una tabla general equivalente a la
    # de escaleras (4.2.10) para pasillos -- Art. 4.2.5 efectivamente deja
    # el ancho de pasillo librado a la carga de ocupacion, sin numero fijo.
    # Los UNICOS usos reales de "1,20 m" + "pasillo" encontrados en todo el
    # texto son: Art. 4.7.22 (pasillos de platea en salas de espectaculos
    # con cabida >500 personas, caso muy acotado, no general) y Art. 6.4.2
    # (pasillos dentro de una VIVIENDA accesible/adaptable: 0,90 m general,
    # 1,05 m si hay giro de silla de ruedas, reducible a 0,95 m si el giro
    # ensancha a 1,20 m -- tampoco es un pasillo de circulacion comun de
    # edificio). Ninguno de los 2 respalda "1,20 m para corredores de uso
    # comun" como esta redactado hoy. Se mantiene el valor 1,20 m (sigue
    # siendo un minimo de uso extendido en la practica de diseño, y no hay
    # evidencia de que sea insuficiente), pero la cita se corrige para no
    # afirmar una fuente que la busqueda exhaustiva no respalda.
    'pasillo'   : (None, 1.20, 'SIN VERIFICAR -- 1,20 m es un minimo de uso extendido en la practica, pero NO se encontro en OGUC (770 articulos revisados) una tabla general de ancho de pasillo equivalente a la de escaleras (Art. 4.2.10); Art. 4.2.5 remite a carga de ocupacion sin numero fijo'),
    'escalera'  : (None, 1.10, 'Art. 4.2.10 OGUC — tabla por carga de ocupacion, 1,10 m es el piso minimo (hasta 50 personas); puede exigir hasta 1,50 m o 2 escaleras segun ocupacion, no calculado todavia'),
    # FIX 2026-07-26 (c) -- CORRECCION IMPORTANTE tras auditar contra oguc_pdf.json
    # (extraccion completa del PDF oficial, 770 articulos, distinta de la fuente
    # curada oguc_articulos.json que se uso para el fix anterior). El Art. 4.1.7 N°2
    # real es MUCHO mas largo y matizado que el resumen que teniamos: el ancho de
    # rampa NO es un valor fijo de 1,50 m para todas las rampas -- el texto real dice
    # "su ancho debera corresponder a la via de evacuacion que enfrenta o de la que
    # es parte" (variable, 1,10-1,50 m segun el punto 1 de este mismo articulo,
    # 1,50 m especificamente para rutas que conducen a recintos con atencion de
    # publico) Y "las rampas que NO pertenezcan a esas vias del edificio podran
    # tener un ancho minimo de 0,90 m". No hay forma de saber desde la geometria
    # sola si una rampa es "parte de la ruta obligatoria" o no. Se mantiene 1,50 m
    # como default porque el caso de prueba (rampa de acceso a un restaurante,
    # recinto con atencion de publico) cae en ese supuesto -- pero es una
    # simplificacion, no la regla general. Ver tambien el fix de PENDIENTE en
    # Celda 4 (bloque "if tipo == 'rampa':"), que SI se corrigio a la formula real
    # de pendiente (Art. 4.1.7 N°2) -- pendiente portar esa formula tambien a BIM,
    # ver Proyecto/Diseno_Funcional_ArchiCheck.md S3.15.
    'rampa'     : (None, 1.50, 'Art. 4.1.7 N°2 OGUC — ancho min 1,50 m (supone ruta a recinto con atencion de publico; puede ser 0,90-1,50 m segun el caso, ver comentario)'),

    # Reglas de ELEMENTO (puerta, muro) -- no de recinto, agregadas 2026-09-19
    # para consolidar con el piloto BIM (Fase 2/BIM/piloto_ids_oguc.py,
    # analizar_todos.py). El loop que consume la parte de RECINTO de este
    # diccionario (Celda 4, pipeline CAD) busca por `tipo` de recinto
    # clasificado por Claude Vision (dormitorio, pasillo, escalera, etc.) --
    # "puerta_ancho_libre" y "muro_fire_rating" nunca calzan con un `tipo`
    # de recinto real, asi que esas 2 entradas no se consumen por ese loop
    # hoy (son consumidas por el pipeline BIM). Existen aca para que sean la
    # FUENTE UNICA del valor + la referencia normativa. Si algun dia el
    # pipeline PDF implementa su propio chequeo de ancho de puerta o
    # FireRating de muro, debe leer el valor de aca, no hardcodear uno nuevo.
    #
    # CORREGIDO 2026-09-21 -- hallazgo real curando la extraccion COMPLETA
    # y verbatim de OGUC (normativa/nacional/oguc_pdf.json, 770 articulos,
    # Art. 4.1.7 completo leido de punta a punta, no un resumen de tercero):
    # el valor anterior (0.80 m, citado como "N°6") estaba MAL -- 0.80 m
    # SI existe en el articulo, pero es el ancho libre de la puerta de UN
    # SERVICIO HIGIENICO ACCESIBLE especifico (numeral 6, letra b: "La
    # puerta de acceso consultara un vano de minimo de 0,90 m con un ancho
    # libre minimo de 0,80 m"), no el caso general. El caso general -- el
    # que en la practica se aplica a TODA puerta que hoy chequean
    # analizar_todos.py/piloto_ids_oguc.py, sin distinguir a que recinto
    # da cada puerta -- es el numeral 4 del mismo articulo: "Las puertas
    # de ingreso al edificio, o a las unidades o a los recintos de la
    # edificacion colectiva que consulten atencion de publico, deberan
    # tener un ancho libre de paso de 0,90 m... Las puertas interiores de
    # acceso a las unidades o recintos de la edificacion colectiva cuyo
    # destino sea residencial, deberan tener un ancho libre de paso de
    # 0,90 m." Verificado tambien que aplica a puertas correderas y de
    # escape (mismo numeral 4: "cumpliran con las mismas caracteristicas").
    # Confirmado por fuente independiente (DDU 351, normativa/nacional/
    # ddu_351.json, seccion 7.1/7.2, texto verbatim de la circular oficial):
    # cita el mismo 0,90 m para el mismo caso general. Corregido a 0,90 m,
    # cita corregida a numeral 4 (no "N°6"). El caso de 0,80 m del baño
    # accesible se separa en su propia entrada, ver abajo.
    'puerta_ancho_libre': (None, 0.90, 'OGUC Art. 4.1.7 N°4 — ancho libre minimo 0,90 m, puertas de ingreso/unidades/recintos con atencion de publico y puertas interiores residenciales (accesibilidad universal)'),
    # Caso especifico, distinto del general de arriba -- Art. 4.1.7 N°6,
    # letra b: SOLO la puerta de acceso al servicio higienico accesible
    # (vano 0,90 m, ancho libre 0,80 m). Sin consumidor hoy (ningun codigo
    # del proyecto vincula una puerta a que tipo de recinto da, a
    # diferencia de circulo_giro_accesible_m que si tiene un mecanismo de
    # deteccion por nombre) -- se declara aca como fuente unica para el
    # dia que se implemente ese vinculo, en vez de omitirla.
    'puerta_ancho_libre_bano_accesible': (None, 0.80, 'OGUC Art. 4.1.7 N°6 letra b) — ancho libre minimo 0,80 m (vano 0,90 m), puerta de servicio higienico accesible'),
    'muro_fire_rating': {
        'campo_requerido': 'Pset_WallCommon.FireRating',
        'ref': 'OGUC Art. 4.3.3 — resistencia al fuego segun destino/altura (chequeo de dato declarado, no de valor numerico)',
    },
    # Circulo de giro accesible -- MIGRADO 2026-09-20 (punto 2 del plan de
    # Proyecto/Diseno_Funcional_ArchiCheck.md S3.15), migrando a la vez el
    # literal 1.50 que vivia suelto en el chequeo 'circulo_giro' de Celda 4
    # (pipeline CAD) -- ver esa migracion en _celda4_actual.py, mismo dia.
    #
    # IMPORTANTE -- el MECANISMO de deteccion difiere entre pipelines, y es
    # correcto que difiera (no es un caso de "unificar mecanismo", solo de
    # unificar el UMBRAL): en CAD, 'es_accesible_universal'/'circulo_giro_
    # 1_50_detectado' vienen de Claude Vision LEYENDO el plano -- verifica
    # si el arquitecto ROTULO el recinto como accesible y si DIBUJO el
    # simbolo del circulo (una verificacion de anotacion/dibujo, no de
    # geometria real -- Claude Vision no calcula si el circulo cabe, solo
    # transcribe si se ve dibujado). En BIM, con geometria 3D real
    # disponible, el pipeline puede calcular DE VERDAD si un circulo de
    # 1.50 m de diametro cabe en el footprint del recinto (ver
    # Fase 2/BIM/analizar_todos.py, circulo_1_50_cabe_en_footprint()) --
    # mas riguroso que CAD, no solo un port. La deteccion de "es un
    # recinto que REQUIERE ser accesible" en BIM es por nombre (mismo
    # patron y misma limitacion de cobertura real que clasificar_tipo_
    # recinto()), no por lectura visual.
    'circulo_giro_accesible_m': (1.50, 'DDU 351 / Art. 4.1.7 OGUC — circulo de giro 1,50 m de diametro libre en recintos accesibles'),
    # Ventilacion/iluminacion natural -- MIGRADO 2026-09-21 (curacion OGUC
    # completa). Vivia hardcodeado por separado en 2 archivos BIM
    # (analizar_todos.py: `pct >= 10.0`; generar_json_colab.py: `pct >=
    # 10.0` + un string user-facing que afirmaba "minimo OGUC 10%") -- el
    # tipo de duplicacion que este modulo existe para evitar, encontrado
    # al consolidar. NINGUN pipeline CAD implementa este chequeo hoy
    # (verificado: _celda4_actual.py no tiene ningun chequeo de porcentaje
    # de ventilacion).
    #
    # CORREGIDO/DESMENTIDO 2026-09-21 -- hallazgo real, mismo tipo de
    # problema que puerta_ancho_libre pero sin numero de reemplazo directo:
    # la cita que traia reglas_verificacion.json ("OGUC Art. 4.2.5 - 4.2.6")
    # es FALSA -- verificado el texto completo de ambos articulos
    # (oguc_pdf.json): 4.2.5 es ancho de pasillos de evacuacion, 4.2.6 es
    # altura libre de vias de evacuacion (2,10 m) -- NINGUNO de los 2 trata
    # ventanas ni porcentajes. El articulo real que SI regula ventilacion/
    # iluminacion de locales habitables es el 4.1.2, y es CUALITATIVO (exige
    # "al menos una ventana" con 1,5 m de distancia libre frontal para
    # dormitorios) -- NO fija un porcentaje de superficie. Busqueda
    # exhaustiva de "10%" + ventilacion en las 770 secciones: el unico
    # porcentaje real encontrado es el Art. 4.5.5, una tabla especifica
    # SOLO para locales docentes (colegios), cuyo valor exacto no se pudo
    # confirmar (la tabla no se extrajo limpia del PDF a texto) y que de
    # todos modos no aplicaria al caso general (vivienda/oficina/comercio).
    #
    # DECISION DEL USUARIO (2026-09-21, preguntado explicitamente): mantener
    # el 10% (sigue siendo una convencion de diseño de uso extendido, sin
    # evidencia de que sea insuficiente) pero marcado SIN VERIFICAR de forma
    # honesta, igual que 'pasillo' arriba -- nunca mas afirmar una cita OGUC
    # que la busqueda exhaustiva no respalda.
    'ventilacion_iluminacion_pct': (10.0, 'SIN VERIFICAR -- 10% es una convencion de diseño de uso extendido, NO una cita OGUC real (Art. 4.2.5/4.2.6, la cita previa, tratan de pasillos/altura de evacuacion, no de ventanas; Art. 4.1.2 -- el articulo real de ventilacion de locales habitables -- es cualitativo, sin porcentaje)'),
}

# Tipos de RECINTO dentro de OGUC_REGLAS -- derivado, nunca una lista aparte
# a mano. Hallazgo real (revision propia, 2026-09-20): la primera version de
# clasificar_tipo_recinto() en Fase 2/BIM/analizar_todos.py hardcodeaba esta
# misma lista como un tuple literal -- exactamente el tipo de duplicacion
# que la regla de unificacion de reglas (Proyecto/Diseno_Funcional_
# ArchiCheck.md S3.15) existe para evitar: si mañana se agrega un tipo de
# recinto nuevo aca (ej. 'bodega'), esa lista hardcodeada en otro archivo
# jamas se hubiera enterado, en silencio.
#
# CORRECCION 1 (misma revision, 2026-09-20): la primera version de esta
# linea filtraba solo por FORMA (isinstance(v, tuple)) -- bug real,
# encontrado corriendo el resultado antes de confiar en el:
# 'puerta_ancho_libre' TAMBIEN es una tupla de 3 (None, 0.80, ref), misma
# forma que un tipo de recinto real, pero es una regla de ELEMENTO
# (puerta), no de recinto -- se habria colado en TIPOS_RECINTO_OGUC.
#
# CORRECCION 2 (2026-09-20, segunda vuelta, al agregar
# 'circulo_giro_accesible_m'): una exclusion explicita por NOMBRE
# (`_CLAVES_DE_ELEMENTO_NO_RECINTO`) no escala -- cada regla nueva que no
# sea "tipo de recinto" habria que acordarse de agregarla ahi a mano, el
# mismo problema de fondo que esta linea entera existe para evitar. El
# criterio real es estructural: una regla de RECINTO es siempre una tupla
# de EXACTAMENTE 3 (area_min, ancho_min, ref) -- 'puerta_ancho_libre'
# calza esa forma mientras que 'circulo_giro_accesible_m' es una tupla de
# 2 (valor, ref), asi que la longitud sola no basta tampoco. Se mantiene
# la exclusion explicita por nombre (unica alternativa honesta: no hay
# forma de inferir "es de recinto" sin una señal explicita en algun lado),
# pero se aplica una vez aca, no por cada consumidor -- y CUALQUIER regla
# nueva que no sea de recinto debe agregarse a este set, con su propio
# comentario, en el mismo commit que la agrega a OGUC_REGLAS.
_CLAVES_DE_ELEMENTO_NO_RECINTO = frozenset({
    'puerta_ancho_libre', 'puerta_ancho_libre_bano_accesible', 'muro_fire_rating', 'circulo_giro_accesible_m',
    'ventilacion_iluminacion_pct',
})
TIPOS_RECINTO_OGUC = tuple(k for k, v in OGUC_REGLAS.items()
                            if isinstance(v, tuple) and len(v) == 3 and k not in _CLAVES_DE_ELEMENTO_NO_RECINTO)

# Aserto de auto-consistencia (Revision Ing SW Paso 2, 2026-09-20, hallazgo
# real de DeepSeek): tanto Fase 2/BIM/analizar_todos.py como piloto_ids_
# oguc.py leen 'puerta_ancho_libre'[1] y 'escalera'[1] por POSICION (no por
# nombre de campo) para sacar el ancho minimo -- si algun dia se reordena
# esa forma de tupla (area_min, ancho_min, ref), esos [1] pasarian a leer
# otra cosa (ej. la referencia como string) SIN ningun error hasta que algo
# comparado contra ese valor reviente en runtime, potencialmente lejos de
# la causa real. Este assert corre una sola vez al importar el modulo y
# falla FUERTE e inmediato si la forma cambia, en vez de silencioso.
assert OGUC_REGLAS['puerta_ancho_libre'][0] is None and isinstance(OGUC_REGLAS['puerta_ancho_libre'][1], (int, float)), \
    "OGUC_REGLAS['puerta_ancho_libre'] cambio de forma -- revisar todos los [1] posicionales en BIM antes de continuar"
assert OGUC_REGLAS['escalera'][0] is None and isinstance(OGUC_REGLAS['escalera'][1], (int, float)), \
    "OGUC_REGLAS['escalera'] cambio de forma -- revisar todos los [1] posicionales en BIM antes de continuar"
assert isinstance(OGUC_REGLAS['circulo_giro_accesible_m'][0], (int, float)), \
    "OGUC_REGLAS['circulo_giro_accesible_m'] cambio de forma -- revisar el [0] posicional en BIM antes de continuar"

# Espacio explicito para futuras normas -- NO se agrega contenido sin
# evidencia real (misma disciplina que OGUC_REGLAS arriba: cita + fuente
# verificada, nunca un valor estimado). Se deja declarado vacio para que
# quede claro donde va cada una cuando exista evidencia real que agregar.
LGUC_REGLAS = {}
PRC_REGLAS = {}  # por comuna: PRC_REGLAS['nunoa'] = {...}, etc.

# Contenedor unificado -- forma preferida para código nuevo que necesite
# recorrer "todas las reglas de todas las normas" (ej. un futuro motor de
# reglas generico). OGUC_REGLAS/LGUC_REGLAS/PRC_REGLAS siguen existiendo
# como nombres de nivel superior (mismos objetos, no copias) para no
# romper a los consumidores actuales que ya hacen
# "from reglas_normativas import OGUC_REGLAS".
REGLAS_NORMATIVAS = {
    'OGUC': OGUC_REGLAS,
    'LGUC': LGUC_REGLAS,
    'PRC': PRC_REGLAS,
}

# Pendiente maxima de rampa -- MIGRADO 2026-09-20 (punto 3 del plan de
# Proyecto/Diseno_Funcional_ArchiCheck.md S3.15), migrando a la vez la
# formula que vivia inline en el chequeo 'pendiente_rampa' de Celda 4
# (pipeline CAD, ver Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py,
# bloque "if tipo == 'rampa':") -- interpolacion lineal de OGUC Art. 4.1.7
# N°2: pendiente maxima 12% para desarrollos <=1,50 m, 8% para
# desarrollos >=9,00 m, interpolada linealmente entre esos dos puntos.
#
# Ref. real (mismo texto que ya se cito en Celda 4, no re-verificado de
# nuevo aca -- mismo articulo, misma cita): "Art. 4.1.7 N°2 OGUC -- pendiente
# maxima de rampas peatonales, segun desarrollo (largo) de la rampa".
#
# IMPORTANTE -- MECANISMO distinto entre pipelines, a proposito (mismo
# patron que circulo_giro_accesible_m arriba): en CAD, `desarrollo_m` viene
# del `largo_max_m` del rectangulo delimitador del recinto, leido de la
# geometria 2D vectorizada del plano (proxy razonable pero no exacto de
# "desarrollo de la rampa" en el sentido del articulo). En BIM, con
# geometria 3D real disponible, `desarrollo_m` se calcula directamente del
# rectangulo orientado del footprint 2D del elemento IfcRamp/IfcRampFlight
# (mismo `minimum_rotated_rectangle`, misma tecnica que ancho_min_footprint
# en Fase 2/BIM/analizar_todos.py) y la pendiente real declarada se calcula
# de la geometria 3D cruda (rise/run), no de una etiqueta de texto leida
# por Claude Vision -- ver `pendiente_y_dimensiones_rampa()` en ese mismo
# archivo. Mas riguroso que CAD, no solo un port.
def pendiente_maxima_rampa_pct(desarrollo_m):
    """Pendiente maxima (%) permitida para una rampa de `desarrollo_m`
    metros de largo, segun Art. 4.1.7 N°2 OGUC (interpolacion lineal entre
    12% a 1,50 m y 8% a 9,00 m). Devuelve None si `desarrollo_m` es None
    o <= 0 (dato ausente o fisicamente invalido -- nunca se estima ni se
    asume un default silencioso).

    CORREGIDO 2026-09-20 (Revision Ing SW Paso 2, 2 hallazgos reales,
    verificados antes de corregir):
    (a) Codex: `desarrollo_m <= 0` caia en la rama `<= 1.5` y devolvia 12.0
        como si fuera un valor normativo valido -- un desarrollo negativo o
        cero es un dato invalido, no una rampa muy corta. Agregado un
        guard explicito que lo trata igual que None.
    (b) DeepSeek: la constante `0.5333` es una version truncada a 4
        decimales de la pendiente real exacta entre los 2 puntos de
        control del articulo (`(8-12)/(9-1.5) = -4/7.5 = -0.53333...`,
        periodico) -- verificado EMPIRICAMENTE (no asumido) escaneando
        todo el rango 1.5-9.0 m en pasos de 1 mm: hay 133 puntos donde
        `round(..., 2)` con la constante truncada da un resultado distinto
        al de la fraccion exacta (diferencia de 0.01 puntos porcentuales,
        suficiente para cambiar un cumple/no-cumple en un caso limite).
        Corregido usando la fraccion exacta en vez del literal truncado."""
    if desarrollo_m is None or desarrollo_m <= 0:
        return None
    if desarrollo_m <= 1.5:
        return 12.0
    if desarrollo_m >= 9.0:
        return 8.0
    return round(12.8 - (4.0 / 7.5) * desarrollo_m, 2)
