"""Fixed native-runtime adapters shipped with the SDK.

These files execute INSIDE their engine's own Python (FreeCAD, ...), never in a
normal interpreter, so nothing here imports them. Resolve a path with
agentsam_sdk.cad.freecad_adapter_path().
"""
