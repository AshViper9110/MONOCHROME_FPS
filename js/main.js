import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading-screen');
    const uiContainer = document.getElementById('ui-container');

    const game = new Game();

    try {
        await game.initialize();
        game.showTitle();
        if (loading) {
            loading.classList.add('hidden');
        }
    } catch (err) {
        console.error('Initialization failed:', err);
        if (loading) {
            loading.classList.add('hidden');
        }
        if (uiContainer) {
            uiContainer.innerHTML = `
                <div class="ui-screen" style="display:flex">
                    <div class="title-content" style="text-align:center;padding:40px">
                        <h1 class="game-title" style="font-size:36px;color:#ff4444">ERROR</h1>
                        <p style="color:#ff6666;margin-top:20px;font-size:14px;letter-spacing:2px">
                            ${err.message || 'Failed to initialize game'}
                        </p>
                        <p style="color:#888888;margin-top:12px;font-size:11px;letter-spacing:1px">
                            ${err.stack ? err.stack.split('\n')[0] : ''}
                        </p>
                        <button class="menu-btn" style="margin-top:30px" onclick="location.reload()">
                            RELOAD
                        </button>
                    </div>
                </div>
            `;
        }
    }

    window.game = game;
});
