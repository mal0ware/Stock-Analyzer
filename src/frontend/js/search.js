// Search functionality — shared between home and stock pages

(function() {
    let searchTimeout = null;

    function initSearch() {
        const input = document.getElementById('searchInput');
        const results = document.getElementById('searchResults');
        const searchBtn = document.getElementById('searchBtn');

        if (!input || !results) return;

        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = input.value.trim();

            if (query.length < 1) {
                results.classList.add('hidden');
                return;
            }

            searchTimeout = setTimeout(() => performSearch(query, results), 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = input.value.trim();
                if (query.length > 0) {
                    // If it looks like a ticker (all uppercase, short), go directly
                    if (/^[A-Z]{1,5}$/.test(query)) {
                        window.location.href = `stock.html?s=${query}`;
                    } else {
                        performSearch(query, results, true);
                    }
                }
            }
            if (e.key === 'Escape') {
                results.classList.add('hidden');
            }
        });

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
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

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container') && !e.target.closest('.nav-search-mini')) {
                results.classList.add('hidden');
            }
        });
    }

    async function performSearch(query, resultsEl, autoNavigate = false) {
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
                resultsEl.classList.remove('hidden');
            } else {
                resultsEl.innerHTML = '<div class="search-no-results">No results found</div>';
                resultsEl.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsEl.innerHTML = '<div class="search-no-results">Search unavailable</div>';
            resultsEl.classList.remove('hidden');
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
})();
