# ══════════════════════════════════════════════════════════
# CELDA 6 — Informe en consola + guardar JSON
# ══════════════════════════════════════════════════════════
import json
from datetime import datetime
import sys as _sys_log_c6

# NUEVO (2026-08-26, pedido del usuario): mismo patron de log-a-txt que
# la Celda 4 -- espeja todo el output impreso de esta celda a un .txt,
# ademas de la consola. Se define aca su propia clase/timestamp (no
# depende de que la Celda 4 se haya corrido antes en esta sesion).
class _TeeLogC6:
    _es_tee_log = True
    def __init__(self, *streams):
        self._streams = streams
    def write(self, data):
        for s in self._streams:
            s.write(data)
    def flush(self):
        for s in self._streams:
            s.flush()

if getattr(_sys_log_c6.stdout, '_es_tee_log', False):
    _sys_log_c6.stdout = _sys_log_c6.stdout._streams[0]  # repara redireccion de una corrida anterior sin cerrar

_RUN_TS_C6 = _RUN_TS if '_RUN_TS' in dir() else datetime.now().strftime('%d%b_%H%M').lower()
_LOG_TXT_NOMBRE_C6 = f'Celda6_log_{_RUN_TS_C6}.txt'
_log_txt_archivo_c6 = open(_LOG_TXT_NOMBRE_C6, 'w', encoding='utf-8')
_stdout_real_c6 = _sys_log_c6.stdout
_sys_log_c6.stdout = _TeeLogC6(_stdout_real_c6, _log_txt_archivo_c6)

SEP  = '=' * 66
SEP2 = '-' * 66

print(SEP)
print('  ARCHICHECK — INFORME CAPA 1 GEOMETRICA')
print(SEP)
print(f'  Proyecto: {NOMBRE_PROYECTO}')
print(f'  Archivo : {pdf_name}')
print(f'  Fecha   : {datetime.now().strftime("%d/%m/%Y %H:%M")}')
print(f'  Páginas : {" + ".join(str(p["pagina"]) for p in resultados_paginas)}')

for res in resultados_paginas:
    pag      = res['pagina']
    escala   = res['escala']
    tabla    = res['mediciones_geometricas']
    incs     = res['incumplimientos_geo']
    analisis = res['analisis_semantico']

    print(f'\n  {SEP2}')
    print(f'  PAGINA {pag} [{res["fname_tag"]}]  |  {escala}  |  {analisis.get("tipo_plano")} — {analisis.get("uso_del_proyecto")}')
    print(f'  Nivel: {analisis.get("nivel")}')
    print(f'  {SEP2}')

    print(f"  {'ID':<7} {'Nombre':<26} {'Tipo':<12} {'Area m2':>8} {'Ancho m':>8}  Estado")
    print(f"  {'--':<7} {'------':<26} {'----':<12} {'-------':>8} {'-------':>8}  ------")
    for f in tabla:
        st  = 'INCUMPLE' if not f['cumple_geo'] else 'OK'
        aw  = str(f['ancho_min_m']) if f['ancho_min_m'] else '-'
        nom = f['nombre'][:25]
        print(f"  {f['id']:<7} {nom:<26} {f['tipo']:<12} {f['area_m2']:>8.2f} {aw:>8}  {st}")
    print(f"  {'':7} {'TOTAL':26} {'':12} {res['total_area_m2']:>8.2f}")

    if incs:
        print(f'\n  INCUMPLIMIENTOS GEOMETRICOS ({len(incs)})')
        print(f'  {SEP2}')
        for inc in incs:
            tipo_inc = inc['tipo'].upper()
            print(f"  [{tipo_inc}]  {inc['id']} {inc['recinto']}")
            # FIX 2026-07-31: 'discrepancia_area_declarada' (cruce cuadro de
            # superficies vs. area medida, agregado 2026-07-26) usa un
            # esquema de claves distinto ('declarado'/'diff_pct', sin
            # 'minimo'/'deficit') al resto de incumplimientos_geo -- nunca
            # se habia probado con datos reales porque cuadro_superficies_
            # oficial siempre llegaba vacio antes de la funcionalidad de
            # extraccion de texto agregada esta sesion. Primera corrida real
            # (Campo Lindo, 2026-07-31) disparo un KeyError: 'minimo' al
            # asumir el esquema viejo para todos los tipos.
            if inc['tipo'] == 'discrepancia_area_declarada':
                print(f"    Medido: {inc['medido']} m2  |  Declarado (cuadro): {inc['declarado']} m2  |  Diferencia: {inc['diff_pct']}%")
            else:
                unidad = 'm2' if inc['tipo'] == 'area' else 'm'
                print(f"    Medido: {inc['medido']} {unidad}  |  Minimo: {inc['minimo']} {unidad}  |  Deficit: {inc['deficit']} {unidad}")
            print(f"    Ref: {inc['ref']}")

    inc_sem = analisis.get('incumplimientos_oguc', [])
    if inc_sem:
        print(f'\n  OBSERVACIONES NORMATIVAS CLAUDE ({len(inc_sem)})')
        for inc in inc_sem:
            g = inc.get('gravedad', '?')
            d = inc.get('descripcion', '')[:80]
            print(f"  [{g}] {inc.get('articulo', '')} — {d}")

print(f'\n{SEP}')

# NUEVO (2026-08-09): antes habia un intento de conteo via Grounding DINO +
# SAM 2 (Celdas 4b/4c, eliminadas -- confirmado ~0% recall en planos CAD,
# DINO fue entrenado en fotografias) con fallback al conteo semantico de
# Claude Vision cuando DINO no encontraba nada -- que era SIEMPRE, en la
# practica. Se saca el intento muerto: el conteo semantico de Claude Vision
# es ahora la unica fuente (era, de hecho, la unica fuente real desde antes).
# Nota: 'rampas' no tiene conteo semantico (Claude Vision no lo extrae en
# 'elementos_detectados') -- queda en 0, gap conocido, no un bug nuevo.
puertas_n = ventanas_n = escaleras_n = rampas_n = 0
for r in resultados_paginas:
    sem = r.get('analisis_semantico', {}).get('elementos_detectados', {})
    puertas_n   += sem.get('puertas', 0)
    ventanas_n  += sem.get('ventanas', 0)
    escaleras_n += sem.get('escaleras', 0)
fuente_conteo = 'semantico'

resultado_final = {
    'fuente'          : 'colab_opencv_multipagina',
    'proyecto'        : NOMBRE_PROYECTO,
    'archivo'         : pdf_name,
    'fecha'           : datetime.now().isoformat(),
    'basename'        : BASENAME,
    'dpi'             : DPI,
    'paginas'         : resultados_paginas,
    'resumen_global'  : {
        'paginas_analizadas'       : len(resultados_paginas),
        'total_area_m2'            : round(sum(p['total_area_m2'] for p in resultados_paginas), 1),
        'total_recintos'           : sum(len(p['mediciones_geometricas']) for p in resultados_paginas),
        'incumplimientos_geo_total': sum(len(p['incumplimientos_geo']) for p in resultados_paginas),
        'puertas_detectadas'       : puertas_n,
        'ventanas_detectadas'      : ventanas_n,
        'escaleras_detectadas'     : escaleras_n,
        'rampas_detectadas'        : rampas_n,
        'fuente_conteo_elementos'  : fuente_conteo,
    }
}

# JSON: {BASENAME}.json → archicheck_geometrico_pdv_30jun_1729.json
fname_json = f'{BASENAME}.json'
with open(fname_json, 'w', encoding='utf-8') as f:
    json.dump(resultado_final, f, ensure_ascii=False, indent=2)

rg = resultado_final['resumen_global']
print(f'\n✓ JSON guardado: {fname_json}')
print(f'  Paginas   : {rg["paginas_analizadas"]}')
print(f'  Area total: {rg["total_area_m2"]} m2')
print(f'  Recintos  : {rg["total_recintos"]}')
print(f'  Incumpl.  : {rg["incumplimientos_geo_total"]}')
print(f'  Elementos ({rg["fuente_conteo_elementos"]}) — Puertas:{rg["puertas_detectadas"]}  Ventanas:{rg["ventanas_detectadas"]}  Escaleras:{rg["escaleras_detectadas"]}  Rampas:{rg["rampas_detectadas"]}')

# Restaura stdout real y cierra el log -- SIEMPRE al final.
_sys_log_c6.stdout = _stdout_real_c6
_log_txt_archivo_c6.close()
print(f'\n✓ Log completo de esta corrida guardado en {_LOG_TXT_NOMBRE_C6} -- bajalo del panel de Archivos (clic derecho > Descargar).')
if 'AUTO_DESCARGAR_DIAGNOSTICOS' in dir() and AUTO_DESCARGAR_DIAGNOSTICOS:
    try:
        from google.colab import files as _files_log_c6
        _files_log_c6.download(_LOG_TXT_NOMBRE_C6)
    except Exception:
        pass
