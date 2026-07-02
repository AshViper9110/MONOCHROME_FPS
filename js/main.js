import { Game } from "./game.js";

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const game = new Game();
        window.game = game;

        await game.initialize();
        game.showTitle();
    } catch (error) {
        console.error(error);

        document.body.innerHTML = `
            <div style="
                background:#000;
                color:#fff;
                display:flex;
                justify-content:center;
                align-items:center;
                height:100vh;
                font-family:sans-serif;
                flex-direction:column;">
                <h1>Initialization Error</h1>
                <pre>${error.stack}</pre>
            </div>
        `;
    }
});
