"""
Structured logging via structlog — JSON-formatted logs for production,
human-readable for development.
"""

import os
import logging
import structlog


def setup_logging():
    env = os.getenv("ENV", "development")
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    renderer: object  # ``structlog`` processors are duck-typed; declared loosely
    if env == "production":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level, logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> "structlog.BoundLogger":
    logger: "structlog.BoundLogger" = structlog.get_logger(name)
    return logger
