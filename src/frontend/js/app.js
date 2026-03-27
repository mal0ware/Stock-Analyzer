// Home page logic

document.addEventListener('DOMContentLoaded', () => {
    // Ticker chip click handlers
    const chips = document.querySelectorAll('.ticker-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const symbol = chip.dataset.symbol;
            window.location.href = `stock.html?s=${symbol}`;
        });
    });
});
