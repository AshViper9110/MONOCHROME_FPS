import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.game = game;
    const loading = document.getElementById('loading-screen');
    if (loading) {
        loading.classList.add('hidden');
    }
});
