"""
HTTP middleware — security headers, request correlation, and access logging.

Three middlewares are exported; ``api/main.py`` wires them in the order they
run (FastAPI/Starlette invokes the most-recently-added middleware first on
the way in, last on the way out):

    1. :class:`RequestContextMiddleware` — stamps a request ID, binds
       structlog contextvars, emits access logs.
    2. :class:`SecurityHeadersMiddleware` — applies OWASP baseline headers
       to every response.
"""

from __future__ import annotations

import time
import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from logging_config import get_logger


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Applies the OWASP A05:2021 baseline response headers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' https: data:; "
            "connect-src 'self' ws: wss:; "
            "font-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attaches a request ID to every HTTP request for log correlation.

    For each request:

    * A request ID is read from the ``X-Request-ID`` header, or generated
      (UUID4, 12 hex chars) when the caller didn't supply one.
    * The ID is bound to :mod:`structlog` ``contextvars`` so every log line
      emitted during request handling carries a ``request_id`` field — this
      is what lets an operator grep a single trace across modules.
    * An access log line (``http.request``) is emitted on completion with
      method, path, status, duration (ms), and client host.
    * The ID is echoed back as ``X-Request-ID`` on the response so clients
      (and our own frontend) can pair request logs across the boundary.
    """

    _access_log = get_logger("api.access")

    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=req_id)

        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            self._access_log.info(
                "http.request",
                method=request.method,
                path=request.url.path,
                status=status,
                duration_ms=duration_ms,
                client=request.client.host if request.client else None,
            )
            # Response may not exist if call_next raised — only stamp header when it does.
            resp = locals().get("response")
            if resp is not None:
                resp.headers["X-Request-ID"] = req_id
            structlog.contextvars.clear_contextvars()
