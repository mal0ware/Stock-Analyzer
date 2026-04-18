# Contributing to Stock Analyzer

Thanks for your interest. This document covers how to set up a development environment, the coding standards expected in PRs, and how releases are produced.

## Quick start

```bash
# Backend (Python 3.13 recommended; 3.10+ supported)
pip install -r api/requirements.txt
python -m uvicorn main:app --reload --port 8080 --app-dir api

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

The frontend dev server proxies API calls to `http://localhost:8080`. Override with `VITE_API_URL` if running the backend elsewhere.

## Project layout

| Path | Purpose |
|------|---------|
| [api/](api/) | FastAPI backend, ingestion, routing, persistence |
| [ml/](ml/) | From-scratch gradient boosting, anomaly detector, sentiment scorer, training CLI |
| [frontend/](frontend/) | React 19 + TypeScript + Vite SPA |
| [src/electron/](src/electron/) | Electron desktop shell, build config, packaging assets |
| [tests/](tests/) | pytest suite (API contracts, ML, integration) |
| [benchmarks/](benchmarks/) | Performance benchmarks (gradient boosting, endpoint latency) |
| [scripts/](scripts/) | Local packaging scripts (`package-macos.sh`) |
| [.github/workflows/](/.github/workflows/) | CI and desktop-build pipelines |

For a deeper architectural reference, see the main [README](README.md).

## Branch and commit conventions

- Work on a feature branch off `main` (e.g. `feat/order-book-improvements`, `fix/ws-reconnect-leak`).
- Commit messages: short imperative subject (≤72 chars), optional body explaining the *why*. The first line should make sense in `git log --oneline`.
- Squash noisy WIP commits before opening a PR — reviewers care about the final shape.

## Coding standards

### Python
- Format with `ruff format`, lint with `ruff check api/ ml/ tests/`. CI runs ruff in `continue-on-error` mode for now; keep new files clean so we can flip the switch later.
- Type-check with mypy (`mypy api ml`); see [pyproject.toml](pyproject.toml) for the gradual-strict config.
- Module-level imports stay at the top of the file unless there's a documented reason (e.g. side-effect ordering).
- Prefer `structlog`'s `get_logger(__name__)` over the stdlib `logging` module — context propagation matters for the WebSocket layer.

### TypeScript / React
- Strict mode is on (`tsconfig.app.json`). Don't add `any` to make types pass; widen at the boundary or refactor.
- Components live in [frontend/src/components/](frontend/src/components/), pages in [frontend/src/pages/](frontend/src/pages/), shared state in [frontend/src/stores/](frontend/src/stores/).
- Use `React.memo` where a component re-renders frequently and props are stable; the simulator relies on this.
- Theming goes through CSS custom properties in [frontend/src/index.css](frontend/src/index.css), not inline color literals.

### Tests
- Run `pytest tests/ -v` before opening a PR. New endpoints should have at least one contract test in [tests/](tests/).
- The simulator engine in [frontend/src/stores/simulatorStore.ts](frontend/src/stores/simulatorStore.ts) is currently uncovered (see issue #12). New simulator changes should add tests.
- Don't mock yfinance in tests that exercise the integration boundary — use the existing fixtures in [tests/conftest.py](tests/conftest.py).

## Pull requests

1. Open a draft PR early if you want feedback on direction.
2. Fill out the PR template — the "Test plan" section is the most important part.
3. CI must be green: ruff (informational), pytest, TypeScript type-check, frontend build, Docker smoke test.
4. Keep PRs scoped. A 600-line PR that touches three subsystems is harder to review than three 200-line PRs.
5. UI changes need a screenshot or short clip in the PR description.

## Releases

**Releases are production. Do not push tags casually.**

- Releases are produced by [.github/workflows/build-desktop.yml](/.github/workflows/build-desktop.yml), triggered by pushing a tag that matches `v*`.
- The release job creates `.dmg` (macOS arm64), `.exe` (Windows NSIS), and `.AppImage` (Linux) artifacts and uploads them to GitHub Releases.
- The maintainer follows an **in-place retag** workflow when a release is broken: delete the GitHub release + tag, fix forward, re-push the same tag. Don't bump the version just because the previous tag was bad.
- Contributors should not push tags directly. If your change is release-worthy, mention it in the PR description and the maintainer will handle the tag.
- `workflow_dispatch` on the build pipeline produces artifacts but does **not** publish a release (the release job is gated by `startsWith(github.ref, 'refs/tags/v')`).

## Reporting bugs and requesting features

Use the issue templates at [.github/ISSUE_TEMPLATE/](/.github/ISSUE_TEMPLATE/). Bug reports without reproduction steps may be closed without comment.

## Security

Vulnerabilities should be reported privately per [SECURITY.md](SECURITY.md), not as public issues.
