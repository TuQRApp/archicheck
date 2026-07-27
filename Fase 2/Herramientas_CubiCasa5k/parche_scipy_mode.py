# ══════════════════════════════════════════════════════════
# PARCHE v2 — mas robusto: parchea scipy.stats.mode directamente en memoria,
# no edita ningun archivo. Funciona sin importar que ya este importado
# floortrans.post_prosessing, porque "stats.mode(...)" se resuelve como
# atributo del modulo scipy.stats en el momento de llamarlo, no al importar.
#
# Pegar como celda NUEVA, correr UNA VEZ, antes de llamar a procesar_imagen()
# (puede ir antes o despues de importar floortrans, no importa el orden).
# ══════════════════════════════════════════════════════════
import scipy.stats

_mode_original = scipy.stats.mode

def _mode_compatible(a, *args, **kwargs):
    kwargs['keepdims'] = True
    try:
        return _mode_original(a, *args, **kwargs)
    except TypeError:
        # scipy viejo no acepta el parametro keepdims -- reintentar sin el
        kwargs.pop('keepdims', None)
        return _mode_original(a, *args, **kwargs)

scipy.stats.mode = _mode_compatible
print('✓ scipy.stats.mode parcheado en memoria — ahora volve a correr procesar_imagen() y el loop')
