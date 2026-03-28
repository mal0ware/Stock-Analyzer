/* Theme switcher — shared across all pages */
(function() {
    const STORAGE_KEY = 'stock-analyzer-theme';

    function getTheme() {
        return localStorage.getItem(STORAGE_KEY) || 'dark';
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateActiveOption(theme);
    }

    function updateActiveOption(theme) {
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    // Apply saved theme immediately (before DOM ready to prevent flash)
    document.documentElement.setAttribute('data-theme', getTheme());

    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('themeToggle');
        const dropdown = document.getElementById('themeDropdown');

        if (!toggle || !dropdown) return;

        updateActiveOption(getTheme());

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        dropdown.addEventListener('click', function(e) {
            const option = e.target.closest('.theme-option');
            if (option && option.dataset.theme) {
                setTheme(option.dataset.theme);
                dropdown.classList.remove('open');
            }
        });

        document.addEventListener('click', function() {
            dropdown.classList.remove('open');
        });
    });
})();
