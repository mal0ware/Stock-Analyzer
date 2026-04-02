/**
 * API configuration.
 *
 * When the frontend is served by the same server as the API (Electron, Docker,
 * or FastAPI in dev), leave API_BASE as empty string — all fetches use relative
 * paths (/api/...) which resolve against the current origin.
 *
 * When the frontend is deployed to a CDN (Vercel, Netlify) and the API lives
 * elsewhere, set API_BASE to the full API URL:
 *   window.STOCK_ANALYZER_API = "https://api.yourapp.com";
 */
window.STOCK_ANALYZER_API = window.STOCK_ANALYZER_API || "";
