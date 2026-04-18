"""
Data ingestion adapters.

One submodule per upstream source (yahoo, finnhub, alphavantage, reddit,
news). Each adapter implements the common :class:`ingestion.base.Ingestor`
interface, so the orchestrator can swap or chain sources behind a single
call site without caring about vendor-specific request shapes.
"""
