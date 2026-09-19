import os
import sys

# Python embeddable (sin instalacion normal) no agrega el directorio del
# script/test a sys.path por su cuenta (ver python313._pth) -- sin esto,
# "from cuerpo_cerrado import ..." falla con ModuleNotFoundError al
# correr pytest desde cualquier directorio.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
