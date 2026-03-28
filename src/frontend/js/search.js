/* Search functionality — shared between home, stock, and learn pages */
(function() {
    let searchTimeout = null;

    function wireSearch(inputId, resultsId, btnId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const btn = btnId ? document.getElementById(btnId) : null;
        if (!input || !results) return;

        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = input.value.trim();
            if (query.length < 1) { results.classList.remove('active'); return; }
            searchTimeout = setTimeout(() => performSearch(query, results), 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = input.value.trim();
                if (query.length > 0) {
                    if (/^[A-Z]{1,5}$/.test(query.toUpperCase())) {
                        window.location.href = `stock.html?s=${query.toUpperCase()}`;
                    } else {
                        performSearch(query, results, true);
                    }
                }
            }
            if (e.key === 'Escape') results.classList.remove('active');
        });

        if (btn) {
            btn.addEventListener('click', () => {
                const query = input.value.trim();
                if (query.length > 0) {
                    if (/^[A-Z]{1,5}$/.test(query.toUpperCase())) {
                        window.location.href = `stock.html?s=${query.toUpperCase()}`;
                    } else {
                        performSearch(query, results, true);
                    }
                }
            });
        }
    }

    async function performSearch(query, resultsEl, autoNavigate) {
        try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await resp.json();
            if (data.results && data.results.length > 0) {
                if (autoNavigate && data.results.length === 1) {
                    window.location.href = `stock.html?s=${data.results[0].symbol}`;
                    return;
                }
                resultsEl.innerHTML = data.results.map(r => `
                    <div class="search-result-item" onclick="window.location.href='stock.html?s=${r.symbol}'">
                        <span class="search-result-symbol">${r.symbol}</span>
                        <span class="search-result-name">${r.name}</span>
                        <span class="search-result-exchange">${r.exchange || ''}</span>
                    </div>
                `).join('');
                resultsEl.classList.add('active');
            } else {
                resultsEl.innerHTML = '<div class="search-result-item"><span class="search-result-name" style="color:var(--text-muted)">No results found</span></div>';
                resultsEl.classList.add('active');
            }
        } catch (err) {
            resultsEl.innerHTML = '<div class="search-result-item"><span class="search-result-name" style="color:var(--text-muted)">Search unavailable</span></div>';
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
            if (!e.target.closest('.search-wrapper') && !e.target.closest('.nav-search-mini')) {
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
