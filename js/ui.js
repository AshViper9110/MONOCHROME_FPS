import { GamePhase } from './gamemode.js';
import { WEAPON_DEFINITIONS } from './weapon.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.container = document.getElementById('ui-container');
        this.currentScreen = null;
        this.screens = {};
        this._setupScreens();
    }

    _setupScreens() {
        this._createTitleScreen();
        this._createLobbyScreen();
        this._createWeaponSelectScreen();
        this._createHUD();
    }

    _createTitleScreen() {
        const screen = document.createElement('div');
        screen.className = 'ui-screen';
        screen.id = 'screen-title';
        screen.innerHTML = `
            <div class="title-content">
                <h1 class="game-title">MONOCHROME</h1>
                <p class="subtitle">P2P MULTIPLAYER FPS</p>
                <div class="menu-buttons">
                    <button class="menu-btn" id="btn-create">HOST GAME</button>
                    <button class="menu-btn" id="btn-join">JOIN GAME</button>
                </div>
                <div class="join-section" id="join-section" style="display:none">
                    <input type="text" class="input-field room-code-input" id="room-code-input" placeholder="0000" maxlength="4" inputmode="numeric" pattern="[0-9]*">
                    <button class="menu-btn small" id="btn-connect">CONNECT</button>
                </div>
                <div class="name-section">
                    <input type="text" class="input-field" id="name-input" placeholder="Enter your name..." maxlength="16" value="Player">
                </div>
                <div class="status-text" id="status-text"></div>
            </div>
        `;
        this.container.appendChild(screen);
        this.screens.title = screen;

        const roomCodeInput = screen.querySelector('#room-code-input');
        roomCodeInput.addEventListener('input', () => {
            roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '');
        });

        screen.querySelector('#btn-create').addEventListener('click', () => {
            const name = screen.querySelector('#name-input').value.trim() || 'Player';
            this.game.setPlayerName(name);
            this.game.hostGame();
        });

        screen.querySelector('#btn-join').addEventListener('click', () => {
            document.getElementById('join-section').style.display = 'block';
            roomCodeInput.focus();
        });

        screen.querySelector('#btn-connect').addEventListener('click', () => {
            const roomCode = roomCodeInput.value.trim();
            const name = screen.querySelector('#name-input').value.trim() || 'Player';
            if (roomCode.length === 4) {
                this.game.setPlayerName(name);
                this.game.joinGame(roomCode);
            }
        });

        roomCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                screen.querySelector('#btn-connect').click();
            }
        });
    }

    _createLobbyScreen() {
        const screen = document.createElement('div');
        screen.className = 'ui-screen';
        screen.id = 'screen-lobby';
        screen.innerHTML = `
            <div class="lobby-content">
                <h2>LOBBY</h2>
                <div class="lobby-info">
                    <div class="room-code-display" id="room-code-display" style="display:none">
                        <p class="room-code-label">Room Code</p>
                        <div class="room-code-row">
                            <span class="room-code-value" id="room-code-value"></span>
                            <button class="copy-btn" id="btn-copy-code">📋 Copy</button>
                        </div>
                        <p class="copy-feedback" id="copy-feedback"></p>
                    </div>
                    <p class="lobby-status">Waiting for opponent...</p>
                </div>
                <div class="lobby-players">
                    <div class="player-slot" id="player-slot-0">
                        <span class="player-indicator"></span>
                        <span id="player-name-0">Waiting...</span>
                    </div>
                    <div class="vs-text">VS</div>
                    <div class="player-slot" id="player-slot-1">
                        <span class="player-indicator"></span>
                        <span id="player-name-1">Waiting...</span>
                    </div>
                </div>
                <div class="status-text" id="lobby-status-text"></div>
            </div>
        `;
        this.container.appendChild(screen);
        this.screens.lobby = screen;
    }

    _createWeaponSelectScreen() {
        const screen = document.createElement('div');
        screen.className = 'ui-screen';
        screen.id = 'screen-weapon-select';
        screen.innerHTML = `
            <div class="weapon-select-content">
                <h2>SELECT WEAPON</h2>
                <p class="select-hint">Choose your weapon for battle</p>
                <div class="weapon-grid" id="weapon-grid">
                </div>
                <div class="weapon-preview" id="weapon-preview">
                    <p class="weapon-name-display" id="weapon-name-display">Assault Rifle</p>
                    <p class="weapon-desc-display" id="weapon-desc-display">Balanced all-around rifle.</p>
                    <div class="weapon-stats" id="weapon-stats"></div>
                </div>
                <button class="menu-btn" id="btn-confirm-weapon">CONFIRM</button>
                <p class="status-text" id="weapon-status-text">Waiting for opponent to choose...</p>
            </div>
        `;
        this.container.appendChild(screen);
        this.screens.weaponSelect = screen;

        const grid = screen.querySelector('#weapon-grid');
        const weapons = Object.values(WEAPON_DEFINITIONS);
        let selectedIndex = 0;

        weapons.forEach((w, i) => {
            const card = document.createElement('div');
            card.className = `weapon-card ${i === 0 ? 'selected' : ''}`;
            card.dataset.index = i;
            card.innerHTML = `
                <div class="weapon-card-name">${w.name}</div>
                <div class="weapon-card-stats">
                    <span>DMG: ${w.damage}</span>
                    <span>RPM: ${Math.round(60 / w.fireRate)}</span>
                    <span>MAG: ${w.magSize}</span>
                </div>
            `;
            card.addEventListener('click', () => {
                grid.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedIndex = i;
                this._updateWeaponPreview(weapons[i]);
            });
            grid.appendChild(card);
        });

        this._updateWeaponPreview(weapons[0]);

        screen.querySelector('#btn-confirm-weapon').addEventListener('click', () => {
            const weaponName = weapons[selectedIndex].name;
            this.game.selectWeapon(weaponName);
            screen.querySelector('#btn-confirm-weapon').disabled = true;
            screen.querySelector('#btn-confirm-weapon').textContent = 'LOCKED IN';
        });
    }

    _updateWeaponPreview(weapon) {
        const nameDisplay = document.getElementById('weapon-name-display');
        const descDisplay = document.getElementById('weapon-desc-display');
        const statsContainer = document.getElementById('weapon-stats');

        if (nameDisplay) nameDisplay.textContent = weapon.name;
        if (descDisplay) descDisplay.textContent = weapon.description;

        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-bar">
                    <span>Damage</span>
                    <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, weapon.damage * 1.2)}%"></div></div>
                </div>
                <div class="stat-bar">
                    <span>Fire Rate</span>
                    <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, (1 / weapon.fireRate) * 10)}%"></div></div>
                </div>
                <div class="stat-bar">
                    <span>Range</span>
                    <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, weapon.range / 3)}%"></div></div>
                </div>
                <div class="stat-bar">
                    <span>Mag Size</span>
                    <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, weapon.magSize * 3)}%"></div></div>
                </div>
            `;
        }
    }

    _createHUD() {
        const hud = document.createElement('div');
        hud.className = 'ui-hud';
        hud.id = 'game-hud';
        hud.style.display = 'none';
        hud.innerHTML = `
            <div class="hud-top">
                <div class="hud-set-score" id="hud-set-score">0 - 0</div>
                <div class="hud-set-number" id="hud-set-number">Set 1</div>
            </div>
            <div class="hud-bottom">
                <div class="hud-left">
                    <div class="hud-health-bar" id="hud-health-bar">
                        <div class="hud-health-fill" id="hud-health-fill"></div>
                        <span class="hud-health-text" id="hud-health-text">100</span>
                    </div>
                    <div class="hud-name" id="hud-player-name"></div>
                </div>
                <div class="hud-right">
                    <div class="hud-ammo" id="hud-ammo">30 / 120</div>
                    <div class="hud-weapon-name" id="hud-weapon-name">Assault Rifle</div>
                </div>
            </div>
            <div class="hud-ping" id="hud-ping">0ms</div>
            <div class="hud-fps" id="hud-fps">0 FPS</div>
        `;
        this.container.appendChild(hud);
        this.screens.hud = hud;
    }

    showScreen(screenId) {
        Object.values(this.screens).forEach(s => {
            if (s && s.style) {
                s.style.display = 'none';
            }
        });

        if (this.screens[screenId]) {
            this.screens[screenId].style.display = 'flex';
        }
    }

    showHUD() {
        this.screens.hud.style.display = 'block';
    }

    hideHUD() {
        this.screens.hud.style.display = 'none';
    }

    updateLobby(roomCode, players) {
        const roomCodeDisplay = document.getElementById('room-code-display');
        const roomCodeValue = document.getElementById('room-code-value');
        if (roomCode && roomCodeDisplay) {
            roomCodeDisplay.style.display = 'block';
            if (roomCodeValue) roomCodeValue.textContent = roomCode;

            const copyBtn = document.getElementById('btn-copy-code');
            const feedback = document.getElementById('copy-feedback');
            if (copyBtn) {
                copyBtn.onclick = () => this._copyToClipboard(roomCode, copyBtn, feedback);
            }
        }

        if (players) {
            for (let i = 0; i < 2; i++) {
                const nameEl = document.getElementById(`player-name-${i}`);
                const slotEl = document.getElementById(`player-slot-${i}`);
                if (players[i]) {
                    if (nameEl) nameEl.textContent = players[i].name || `Player ${i + 1}`;
                    if (slotEl) slotEl.classList.add('filled');
                } else {
                    if (nameEl) nameEl.textContent = 'Waiting...';
                    if (slotEl) slotEl.classList.remove('filled');
                }
            }
        }
    }

    _copyToClipboard(text, button, feedbackEl) {
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this._showCopiedFeedback(button, feedbackEl);
            }).catch(() => {
                this._fallbackCopy(text, button, feedbackEl);
            });
        } else {
            this._fallbackCopy(text, button, feedbackEl);
        }
    }

    _fallbackCopy(text, button, feedbackEl) {
        const input = document.createElement('input');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try {
            document.execCommand('copy');
            this._showCopiedFeedback(button, feedbackEl);
        } catch (e) {
            if (feedbackEl) feedbackEl.textContent = 'Copy failed';
        }
        document.body.removeChild(input);
    }

    _showCopiedFeedback(button, feedbackEl) {
        if (button) button.textContent = 'Copied!';
        if (feedbackEl) feedbackEl.textContent = 'Copied!';
        setTimeout(() => {
            if (button) button.textContent = '📋 Copy';
            if (feedbackEl) feedbackEl.textContent = '';
        }, 2000);
    }

    updateWeaponStatus(text) {
        const el = document.getElementById('weapon-status-text');
        if (el) el.textContent = text;
    }

    updateHUD(player, gameMode, ping, fps) {
        if (!player) return;

        const healthFill = document.getElementById('hud-health-fill');
        const healthText = document.getElementById('hud-health-text');
        const ammoEl = document.getElementById('hud-ammo');
        const weaponNameEl = document.getElementById('hud-weapon-name');
        const setScoreEl = document.getElementById('hud-set-score');
        const setNumberEl = document.getElementById('hud-set-number');
        const pingEl = document.getElementById('hud-ping');
        const fpsEl = document.getElementById('hud-fps');
        const nameEl = document.getElementById('hud-player-name');

        if (healthFill) {
            const pct = ((player.health ?? 100) / (player.maxHealth ?? 100)) * 100;
            healthFill.style.width = `${pct}%`;
            if (pct <= 25) healthFill.style.background = '#ff4444';
            else if (pct <= 50) healthFill.style.background = '#aaaaaa';
            else healthFill.style.background = '#ffffff';
        }
        if (healthText) healthText.textContent = Math.ceil(player.health ?? 100);
        if (ammoEl && player.weapon) {
            ammoEl.textContent = `${player.getCurrentAmmo()} / ${player.getTotalAmmo()}`;
        }
        if (weaponNameEl && player.weapon) {
            weaponNameEl.textContent = player.weapon.name;
        }
        if (setScoreEl && gameMode) {
            const setsWon = gameMode.setsWon ?? [0, 0];
            setScoreEl.textContent = `${setsWon[0] ?? 0} - ${setsWon[1] ?? 0}`;
        }
        if (setNumberEl && gameMode) {
            const currentSet = gameMode.currentSet ?? 0;
            setNumberEl.textContent = `Set ${currentSet + 1}`;
        }
        if (pingEl) pingEl.textContent = `${ping || 0}ms`;
        if (fpsEl) fpsEl.textContent = `${fps || 0} FPS`;
        if (nameEl) nameEl.textContent = player.name ?? '';
    }

    showSetTransition(setNumber) {
        const overlay = document.createElement('div');
        overlay.className = 'set-transition-overlay';
        overlay.id = 'set-transition';
        overlay.innerHTML = `
            <div class="set-transition-content">
                <h2 class="set-title">SET ${setNumber + 1}</h2>
                <p class="set-subtitle">GET READY</p>
            </div>
        `;
        this.container.appendChild(overlay);
        setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 500);
        }, 2000);
    }

    showMatchEnd(isWinner, setsWon) {
        const overlay = document.createElement('div');
        overlay.className = 'match-end-overlay';
        overlay.id = 'match-end';
        const score0 = (setsWon ?? [0, 0])[0] ?? 0;
        const score1 = (setsWon ?? [0, 0])[1] ?? 0;
        overlay.innerHTML = `
            <div class="match-end-content">
                <h2 class="match-end-title">${isWinner ? 'VICTORY' : 'DEFEAT'}</h2>
                <p class="match-end-score">${score0} - ${score1}</p>
                <p class="match-end-hint">Press SPACE to return to menu</p>
            </div>
        `;
        this.container.appendChild(overlay);
    }

    showMessage(text, duration = 2000) {
        const el = document.getElementById('status-text') || document.getElementById('lobby-status-text');
        if (el) {
            el.textContent = text;
            if (duration > 0) {
                setTimeout(() => { el.textContent = ''; }, duration);
            }
        }
    }

    destroyTransitionOverlay() {
        const overlay = document.getElementById('set-transition');
        if (overlay) overlay.remove();

        const matchEnd = document.getElementById('match-end');
        if (matchEnd) matchEnd.remove();
    }

    cleanup() {
        this.container.innerHTML = '';
        this.screens = {};
        this._setupScreens();
    }
}
