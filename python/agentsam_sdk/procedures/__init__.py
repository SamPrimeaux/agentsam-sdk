"""Host-delegated PrimeTech procedure client; no independent execution authority."""
from .client import ProcedureClient, ProcedureClientError

__all__ = ["ProcedureClient", "ProcedureClientError"]
