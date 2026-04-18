"""
FastAPI routers grouped by resource.

Each submodule exposes a module-level ``router`` (``APIRouter`` instance)
which is mounted in :mod:`api.main`. Keeping routers in their own modules
keeps ``main.py`` small and makes per-endpoint ownership obvious.
"""
