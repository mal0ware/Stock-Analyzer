// Learn / Glossary page logic

(function() {
    let allTerms = [];
    let activeCategory = 'all';

    document.addEventListener('DOMContentLoaded', () => {
        loadGlossary();

        const search = document.getElementById('glossarySearch');
        if (search) {
            search.addEventListener('input', () => filterTerms());
        }
    });

    async function loadGlossary() {
        const content = document.getElementById('glossaryContent');

        try {
            const resp = await fetch('/api/glossary');
            const data = await resp.json();

            if (data.terms && data.terms.length > 0) {
                allTerms = data.terms;
                buildCategoryFilters();
                renderTerms(allTerms);
            } else {
                content.innerHTML = '<p class="muted">Glossary unavailable.</p>';
            }
        } catch (err) {
            console.error('Glossary error:', err);
            content.innerHTML = '<p class="muted">Failed to load glossary. Make sure the application server is running.</p>';
        }
    }

    function buildCategoryFilters() {
        const categories = [...new Set(allTerms.map(t => t.category))].sort();
        const container = document.getElementById('categoryFilters');

        container.innerHTML = `<button class="cat-btn active" data-category="all">All</button>`;
        categories.forEach(cat => {
            container.innerHTML += `<button class="cat-btn" data-category="${cat}">${cat}</button>`;
        });

        container.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.category;
                filterTerms();
            });
        });
    }

    function filterTerms() {
        const searchQuery = (document.getElementById('glossarySearch')?.value || '').toLowerCase();

        let filtered = allTerms;

        if (activeCategory !== 'all') {
            filtered = filtered.filter(t => t.category === activeCategory);
        }

        if (searchQuery) {
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(searchQuery) ||
                t.definition.toLowerCase().includes(searchQuery) ||
                t.category.toLowerCase().includes(searchQuery)
            );
        }

        renderTerms(filtered);
    }

    function renderTerms(terms) {
        const content = document.getElementById('glossaryContent');

        if (terms.length === 0) {
            content.innerHTML = '<p class="muted" style="text-align:center;padding:40px;">No matching terms found.</p>';
            return;
        }

        content.innerHTML = terms.map(t => `
            <div class="glossary-card">
                <div class="glossary-card-header">
                    <span class="glossary-term">${escapeHtml(t.name)}</span>
                    <span class="glossary-category">${escapeHtml(t.category)}</span>
                </div>
                <div class="glossary-section">
                    <div class="glossary-section-title">What is it?</div>
                    <div class="glossary-section-text">${escapeHtml(t.definition)}</div>
                </div>
                <div class="glossary-section">
                    <div class="glossary-section-title">Why does it matter?</div>
                    <div class="glossary-section-text">${escapeHtml(t.whyItMatters)}</div>
                </div>
                <div class="glossary-section">
                    <div class="glossary-section-title">Typical Ranges</div>
                    <div class="glossary-ranges">${escapeHtml(t.ranges)}</div>
                </div>
            </div>
        `).join('');
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
