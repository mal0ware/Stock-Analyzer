/* Search functionality — shared between home, stock, and learn pages.
 *
 * All search input goes through the /api/search endpoint first to validate
 * that a ticker exists before navigating. This prevents users from landing
 * on a "Stock Not Found" page by typing a company name like "Apple" which
 * is not a valid ticker symbol.
 */
(function() {
    let searchTimeout = null;

    function wireSearch(inputId, resultsId, btnId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const btn = btnId ? document.getElementById(btnId) : null;
        if (!input || !results) return;

        // Live search as user types (300ms debounce)
        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = input.value.trim();
            if (query.length < 1) { results.classList.remove('active'); return; }
            searchTimeout = setTimeout(() => performSearch(query, results), 300);
        });

        // Enter key — always validate through the search API
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = input.value.trim();
                if (query.length > 0) {
                    performSearch(query, results, true);
                }
            }
            if (e.key === 'Escape') results.classList.remove('active');
        });

        // Search button click — always validate through the search API
        if (btn) {
            btn.addEventListener('click', () => {
                const query = input.value.trim();
                if (query.length > 0) {
                    performSearch(query, results, true);
                }
            });
        }
    }

    // Escape HTML to prevent XSS from API responses (OWASP A07:2021)
    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /**
     * Perform a search against the API.
     * @param {string} query - The search string
     * @param {HTMLElement} resultsEl - The results dropdown container
     * @param {boolean} autoNavigate - If true and exactly one result, navigate directly
     */
    async function performSearch(query, resultsEl, autoNavigate) {
        try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);

            if (!resp.ok) {
                var errData = null;
                try { errData = await resp.json(); } catch(e) {}
                var msg = errData && errData.error ? errData.error : 'Search failed (HTTP ' + resp.status + ')';
                resultsEl.innerHTML = '<div class="search-result-item"><span class="search-result-name" style="color:var(--text-muted)">' + esc(msg) + '</span></div>';
                resultsEl.classList.add('active');
                return;
            }

            const data = await resp.json();

            if (data.results && data.results.length > 0) {
                // Auto-navigate if Enter was pressed and there's exactly one match
                if (autoNavigate && data.results.length === 1) {
                    window.location.href = `stock.html?s=${encodeURIComponent(data.results[0].symbol)}`;
                    return;
                }

                // Build results dropdown using DOM methods (prevents XSS)
                resultsEl.innerHTML = '';
                data.results.forEach(r => {
                    var item = document.createElement('div');
                    item.className = 'search-result-item';
                    item.addEventListener('click', function() {
                        window.location.href = 'stock.html?s=' + encodeURIComponent(r.symbol);
                    });

                    var symSpan = document.createElement('span');
                    symSpan.className = 'search-result-symbol';
                    symSpan.textContent = r.symbol;

                    var nameSpan = document.createElement('span');
                    nameSpan.className = 'search-result-name';
                    nameSpan.textContent = r.name;

                    var exchSpan = document.createElement('span');
                    exchSpan.className = 'search-result-exchange';
                    exchSpan.textContent = r.exchange || '';

                    item.appendChild(symSpan);
                    item.appendChild(nameSpan);
                    item.appendChild(exchSpan);
                    resultsEl.appendChild(item);
                });
                resultsEl.classList.add('active');
            } else {
                resultsEl.innerHTML = '<div class="search-result-item"><span class="search-result-name" style="color:var(--text-muted)">No results for &ldquo;' + esc(query) + '&rdquo;. Check the ticker symbol or try a company name.</span></div>';
                resultsEl.classList.add('active');
            }
        } catch (err) {
            resultsEl.innerHTML = '<div class="search-result-item"><span class="search-result-name" style="color:var(--text-muted)">Search is temporarily unavailable. Please try again.</span></div>';
            resultsEl.classList.add('active');
        }
    }

    function init() {
        // Home page main search
        wireSearch('searchInput', 'searchResults', 'searchBtn');
        // Navbar mini search (all pages)
        wireSearch('navSearchInput', 'navSearchResults', null);

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper') && !e.target.closest('.nav-search-mini') &&
                !e.target.closest('.search-results')) {
                document.querySelectorAll('.search-results').forEach(el => el.classList.remove('active'));
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
