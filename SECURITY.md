# Security Policy

## Supported versions

Only the latest tagged release receives security fixes. Older releases are not patched — upgrade to the current `v*` tag on the [Releases page](https://github.com/mal0ware/Stock-Analyzer/releases).

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |
| `main` branch | Best-effort |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Email **mal0ss.network@gmail.com** with:

- A clear description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept code is welcome)
- The affected version (commit hash or release tag)
- Whether the issue has been disclosed elsewhere

You can expect:

- An acknowledgement within **5 business days**
- A triage decision (accepted / needs more info / out of scope) within **14 days**
- Coordinated disclosure once a fix is available — credit by name unless you prefer otherwise

## Scope

In scope:

- The bundled FastAPI backend (under [api/](api/) and [ml/](ml/))
- The Electron desktop shell ([src/electron/](src/electron/))
- The React frontend ([frontend/](frontend/))
- Build artifacts produced by [.github/workflows/build-desktop.yml](/.github/workflows/build-desktop.yml)

Out of scope:

- Third-party services (Yahoo Finance, GitHub) — report to those vendors directly
- Self-modifications to the source code or unsupported deployment topologies
- Issues that require physical access to the host machine
- Denial-of-service via crafted requests against a *self-hosted* backend you control (the desktop app binds to localhost only)

## Hardening notes

The app is designed to run on a single user's machine, not as a multi-tenant service:

- Backend binds to `127.0.0.1` in the desktop build (Electron main process)
- No authentication layer — assume any process on the loopback interface is trusted
- SQLite database is stored in `userData/` per platform conventions
- Bundled Python runtime (python-build-standalone CPython 3.13) is shipped read-only inside the app bundle

If you deploy the backend as a hosted service via the [Dockerfile](Dockerfile), you are responsible for adding authentication, TLS, and rate limiting in front of it. The built-in per-IP rate limiter is a soft guardrail, not a security boundary.

## What to expect when a CVE is filed

If a reported issue results in a CVE:

- A patch release will be published to GitHub Releases
- The release notes will reference the CVE ID and credit the reporter
- An advisory will be published via GitHub Security Advisories on the repository
