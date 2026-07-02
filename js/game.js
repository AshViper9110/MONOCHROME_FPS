import { InputManager } from './input.js';
import { Player } from './player.js';
import { Renderer } from './renderer.js';
import { MapData } from './map.js';
import { PhysicsWorld } from './physics.js';
import { BulletManager } from './bullet.js';
import { EffectsManager } from './effects.js';
import { NetworkManager } from './network.js';
import { GameMode, GamePhase } from './gamemode.js';
import { UIManager } from './ui.js';
import { WEAPON_DEFINITIONS, Weapon } from './weapon.js';
import { Vec3, clamp } from './util.js';
import { CameraController } from './camera.js';
import { RoomCodeManager } from './roomcode.js';

const MOUSE_SENSITIVITY = 0.002;

export class Game {
    constructor() {
        this.canvas = null;
        this.input = null;
        this.renderer = null;
        this.physics = null;
        this.bulletManager = null;
        this.effects = null;
        this.network = null;
        this.gamemode = null;
        this.ui = null;
        this.map = null;

        this.localPlayer = null;
        this.remotePlayer = null;
        this.allPlayers = [];
        this.playerName = 'Player';
        this.selectedWeapon = null;
        this.weaponConfirmed = false;

        this._lastTime = 0;
        this._running = false;
        this._requestId = null;
        this._fps = 0;
        this._frameCount = 0;
        this._fpsTimer = 0;
        this.camera = null;
        this._initialized = false;
        this._lastPhase = null;
        this.roomCodeManager = new RoomCodeManager();
    }

    async initialize() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) {
            throw new Error('DOM: #game-canvas not found');
        }

        this.input = new InputManager();
        this.renderer = new Renderer(this.canvas);
        if (!this.renderer || !this.renderer.ctx) {
            throw new Error('Renderer: failed to create 2D context');
        }

        try {
            this.map = new MapData();
            this.physics = new PhysicsWorld();
            this.physics.setColliders(this.map.build());
        } catch (e) {
            throw new Error(`Map/Physics: ${e.message}`);
        }

        this.camera = new CameraController();
        this.bulletManager = new BulletManager();
        this.effects = new EffectsManager();
        this.gamemode = new GameMode();

        try {
            this.network = new NetworkManager();
        } catch (e) {
            throw new Error(`Network: ${e.message}`);
        }

        try {
            this.ui = new UIManager(this);
        } catch (e) {
            throw new Error(`UI: ${e.message}`);
        }

        this._setupInput();
        this._setupNetwork();

        this._initialized = true;
    }

    showTitle() {
        if (!this._initialized) return;
        if (this.ui) {
            this.ui.showScreen('title');
        }
    }

    _setupInput() {
        if (!this.canvas) return;

        this.canvas.addEventListener('click', () => {
            if (this.gamemode && this.gamemode.phase === GamePhase.FIGHTING) {
                this.input.requestPointerLock(this.canvas);
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.gamemode && this.gamemode.phase === GamePhase.FIGHTING && e.button === 0) {
                this._handleFire();
            }
        });
    }

    _setupNetwork() {
        if (!this.network) return;

        this.network.setCallbacks({
            onConnected: (remoteId) => {
                this.ui.showMessage('Connected to opponent!');
                if (!this.network.peer.isHost()) {
                    this.network.sendJoinRequest(this.playerName);
                }
            },
            onJoinRequest: (data) => {
                const remoteId = this.network.peer.remotePeerId;
                this.network.sendJoinAccept(this.localPlayer.id, this.playerName);
                this.remotePlayer = new Player(remoteId, data.playerName || 'Opponent');
                this.allPlayers = [this.localPlayer, this.remotePlayer];
                this.gamemode.playerIdOrder = [this.localPlayer.id, this.remotePlayer.id];
                this._startWeaponSelect();
            },
            onJoinAccept: (data) => {
                const remoteId = this.network.peer.remotePeerId;
                this.remotePlayer = new Player(remoteId, data.playerName || 'Opponent');
                this.allPlayers = [this.localPlayer, this.remotePlayer];
                this.gamemode.playerIdOrder = [this.localPlayer.id, this.remotePlayer.id];
                this._startWeaponSelect();
            },
            onWeaponSelect: (data) => {
                if (this.remotePlayer) {
                    const def = Object.values(WEAPON_DEFINITIONS).find(w => w.name === data.weaponName);
                    if (def) {
                        this.remotePlayer.addWeapon(new Weapon(def));
                        this.remotePlayer.equipWeapon(this.remotePlayer.weapons[0]);
                    }
                    this.ui.updateWeaponStatus('Opponent has selected a weapon!');
                    console.log('Remote weapon locked');
                    this._checkBothLocked();
                }
            },
            onSetStart: (data) => {
                console.log('Received SET_START, starting round');
                this._startRound(data.setNumber);
            },
            onRemoteFire: (data) => {
                if (this.remotePlayer && this.effects) {
                    this.effects.spawnMuzzleFlash(
                        new Vec3(data.origin.x, data.origin.y, data.origin.z),
                        new Vec3(data.direction.x, data.direction.y, data.direction.z)
                    );
                }
            },
            onRemoteHit: (data) => {
                if (this.localPlayer && data.victimId === this.localPlayer.id) {
                    this.localPlayer.damageFlash = 0.2;
                }
            },
            onRemoteKill: (data) => {
                if (this.localPlayer && data.victimId === this.localPlayer.id && this.effects) {
                    this.effects.spawnDeathEffect(this.localPlayer.body.position);
                }
            },
            onSetWin: (data) => {
                this.gamemode.setsWon[this.gamemode.playerIdOrder.indexOf(data.winnerId)]++;
            },
            onMatchEnd: (data) => {
                this.gamemode.winner = data.winnerId;
                this.gamemode.phase = GamePhase.MATCH_END;
            },
        });
    }

    async hostGame() {
        try {
            const roomCode = this.roomCodeManager.generateCode();
            const customPeerId = `mono-${roomCode}`;
            const peerId = await this.network.init(customPeerId);
            this.localPlayer = new Player(peerId, this.playerName);
            this.localPlayer.initLocal(this.input);
            this.network.setLocalPlayerId(peerId);
            this._startGameLoop();
            this.ui.showScreen('lobby');
            this.ui.updateLobby(roomCode, [this.localPlayer]);
            this.ui.showMessage('Waiting for opponent to join...', 0);
        } catch (err) {
            console.error('Host game failed:', err);
            this.ui.showMessage(`Error: ${err.message}`);
        }
    }

    async joinGame(roomCode) {
        try {
            const peerId = await this.network.init();
            const targetPeerId = `mono-${roomCode}`;
            this.localPlayer = new Player(peerId, this.playerName);
            this.localPlayer.initLocal(this.input);
            this.network.setLocalPlayerId(peerId);
            this.network.connect(targetPeerId);
            this._startGameLoop();
            this.ui.showScreen('lobby');
            this.ui.updateLobby(null, [this.localPlayer]);
            this.ui.showMessage('Connecting...', 0);
        } catch (err) {
            console.error('Join game failed:', err);
            this.ui.showMessage(`Error: ${err.message}`);
        }
    }

    setPlayerName(name) {
        this.playerName = name || 'Player';
    }

    _startGameLoop() {
        if (this._running) return;
        this._running = true;
        this._lastTime = performance.now();
        this._loop(this._lastTime);
    }

    _startWeaponSelect() {
        if (!this.gamemode) return;
        this.gamemode.startMatch(this.gamemode.playerIdOrder);
        if (this.ui) {
            this.ui.showScreen('weaponSelect');
            this.ui.showMessage('Select your weapon!');
        }
    }

    selectWeapon(weaponName) {
        const def = Object.values(WEAPON_DEFINITIONS).find(w => w.name === weaponName);
        if (!def) return;

        this.selectedWeapon = new Weapon(def);
        if (this.localPlayer) {
            this.localPlayer.addWeapon(this.selectedWeapon);
            this.localPlayer.equipWeapon(this.selectedWeapon);
        }
        this.weaponConfirmed = true;

        if (this.network) {
            this.network.sendWeaponSelect(weaponName);
        }
        if (this.ui) {
            this.ui.updateWeaponStatus('Weapon locked! Waiting for opponent...');
        }

        console.log('Local weapon locked');
        this._checkBothLocked();
    }

    _checkBothLocked() {
        if (!this.weaponConfirmed) return;
        if (!this.remotePlayer || !this.remotePlayer.weapon) return;
        if (!this.network || !this.network.peer || !this.network.peer.isHost()) return;

        console.log('Both locked in. Host starting match...');
        this._beginMatch();
    }

    _beginMatch() {
        if (!this.gamemode) return;
        console.log('Host sending SET_START');
        if (this.network && this.network.peer) {
            this.network.sendSetStart(0);
        }
        this._startRound();
    }

    _startRound(setNumber = 0) {
        if (!this.gamemode) return;
        console.log('Starting round');
        this.ui.showHUD();
        this.ui.hideScreen('weaponSelect');
        const wsEl = document.getElementById('screen-weapon-select');
        if (wsEl) wsEl.style.display = 'none';
        this.gamemode.currentSet = setNumber;
        this.gamemode.startSet();
        this._spawnPlayers();
    }

    _spawnPlayers() {
        if (!this.map || !this.localPlayer) return;
        try {
            const spawn1 = this.map.getSpawnPoint(0);
            const spawn2 = this.map.getSpawnPoint(1);

            this.localPlayer.reset(spawn1.position);
            this.localPlayer.setRotation(spawn1.yaw, 0);

            if (this.remotePlayer) {
                this.remotePlayer.reset(spawn2.position);
                this.remotePlayer.setRotation(spawn2.yaw, 0);
            }

            if (this.bulletManager) {
                this.bulletManager.clear();
            }
            if (this.effects) {
                this.effects.clear();
            }

            this.input.requestPointerLock(this.canvas);
        } catch (e) {
            console.warn('Failed to spawn players:', e.message);
        }
    }

    _handleFire() {
        if (!this.gamemode) return;
        if (this.gamemode.phase !== GamePhase.FIGHTING) return;
        if (!this.localPlayer || this.localPlayer.isDead) return;

        const fireDir = this.camera ? this.camera.getForward() : this.localPlayer.getForward();
        const projectiles = this.localPlayer.fire(performance.now() / 1000, fireDir);
        if (projectiles) {
            if (this.bulletManager) {
                this.bulletManager.addBullets(projectiles);
            }
            if (this.localPlayer.weapon && this.effects) {
                this.effects.spawnMuzzleFlash(
                    this.localPlayer.getEyePosition(),
                    fireDir
                );
            }
            if (this.network) {
                this.network.sendFireEvent(this.localPlayer, this.localPlayer.weapon ? this.localPlayer.weapon.name : 'Unknown');
            }
        }
    }

    _handleReload() {
        if (!this.localPlayer || this.localPlayer.isDead) return;
        this.localPlayer.startReload();
        if (this.localPlayer.reloading && this.effects) {
            this.effects.spawnReloadEffect(this.localPlayer.getEyePosition());
        }
    }

    update(dt) {
        if (!this._running) return;
        if (!this.gamemode) {
            this.input.endFrame();
            return;
        }

        this._updateInput(dt);

        if (this.gamemode.phase === GamePhase.FIGHTING) {
            this._updateFighting(dt);
        }

        this.gamemode.update(dt, this.allPlayers);

        if (this.effects) {
            this.effects.update(dt);
        }
        if (this.physics) {
            this.physics.update(dt);
        }
        if (this.camera) {
            this.camera.update(dt, this.localPlayer);
        }

        if (this.bulletManager) {
            this.bulletManager.update(dt, this.physics, this.allPlayers);
        }

        this._checkBulletHits();

        if (this.network && this.network.isConnected()) {
            this.network.update(dt, this.localPlayer);
        }

        this._updatePhaseUI();
        this._updateUI(dt);
        this.input.endFrame();
    }

    _updateInput(dt) {
        if (!this.localPlayer || this.localPlayer.isDead) return;
        if (this.gamemode.phase !== GamePhase.FIGHTING) {
            if (this.gamemode.phase === GamePhase.MATCH_END) {
                if (this.input.wasKeyPressed('Space')) {
                    this._returnToMenu();
                }
            }
            return;
        }

        const mouseDelta = this.input.getMouseDelta();
        this.localPlayer.yaw -= mouseDelta.dx * MOUSE_SENSITIVITY;
        if (this.camera) {
            this.camera.pitch -= mouseDelta.dy * MOUSE_SENSITIVITY;
            this.camera.pitch = clamp(this.camera.pitch, -Math.PI / 2.2, Math.PI / 2.2);
        }

        if (this.input.wasKeyPressed('KeyR')) {
            this._handleReload();
        }

        if (this.localPlayer.weapon && this.localPlayer.weapon.automatic) {
            if (this.input.isMouseDown(0)) {
                this._handleFire();
            }
        }
    }

    _updateFighting(dt) {
        if (!this.localPlayer || this.localPlayer.isDead) return;
        this.localPlayer.update(dt);

        if (this.remotePlayer && !this.remotePlayer.isDead && this.network) {
            const remoteState = this.network.getRemotePlayerState(this.remotePlayer.id);
            if (remoteState) {
                this.remotePlayer.body.position.copy(remoteState.position);
                this.remotePlayer.yaw = remoteState.yaw;
                this.remotePlayer.pitch = remoteState.pitch;
            }

            const currentState = this.network.interpolation.getCurrentState(this.remotePlayer.id);
            if (currentState) {
                this.remotePlayer.health = currentState.health;
                this.remotePlayer.isDead = currentState.isDead;
            }
        }

        if (this.localPlayer.body.position.y < -20) {
            this.localPlayer.health = 0;
            this.localPlayer.isDead = true;
        }

        if (this.localPlayer.isDead) {
            this._onLocalPlayerDeath();
        }

        if (this.remotePlayer && this.remotePlayer.isDead) {
            this._onRemotePlayerDeath();
        }
    }

    _checkBulletHits() {
        if (!this.bulletManager || !this.localPlayer) return;
        for (const bullet of this.bulletManager.getActiveBullets()) {
            if (!bullet.alive) continue;
            if (bullet.hitEntity) {
                const victim = bullet.hitEntity;
                if (victim.id !== this.localPlayer.id && victim.id !== this.remotePlayer?.id) {
                    continue;
                }

                const killerId = bullet.ownerId;
                const isKill = victim.isDead;

                if (isKill) {
                    if (this.gamemode) {
                        this.gamemode.onPlayerDeath(victim, this.localPlayer, bullet.weaponName);
                    }
                    if (this.network) {
                        this.network.sendKillEvent(killerId, victim.id, bullet.weaponName);
                    }
                    if (this.effects) {
                        this.effects.spawnDeathEffect(victim.body.position);
                    }

                    if (this.network && victim.id === this.network.getRemotePeerId()) {
                        this.network.sendSetWin(this.localPlayer.id, this.gamemode ? this.gamemode.currentSet : 0);
                    }
                } else {
                    if (this.effects) {
                        this.effects.spawnHitEffect(
                            bullet.hitPosition || victim.body.position,
                            bullet.hitNormal || new Vec3(0, 1, 0)
                        );
                    }
                    if (this.network) {
                        this.network.sendHitEvent(killerId, victim.id, bullet.damage, bullet.isHeadshot);
                    }
                }
            }
        }
    }

    _onLocalPlayerDeath() {
        if (this.effects && this.localPlayer) {
            this.effects.spawnDeathEffect(this.localPlayer.body.position);
        }
        if (this.input) {
            this.input.exitPointerLock();
        }
    }

    _onRemotePlayerDeath() {
        if (this.effects && this.remotePlayer) {
            this.effects.spawnDeathEffect(this.remotePlayer.body.position);
        }
    }

    _returnToMenu() {
        this._running = false;
        if (this._requestId) {
            cancelAnimationFrame(this._requestId);
        }
        if (this.network) {
            this.network.disconnect();
        }
        if (this.gamemode) {
            this.gamemode.reset();
        }
        if (this.roomCodeManager) {
            this.roomCodeManager.clear();
        }
        if (this.ui) {
            this.ui.cleanup();
        }
        if (this.bulletManager) {
            this.bulletManager.clear();
        }
        if (this.effects) {
            this.effects.clear();
        }
        if (this.camera) {
            this.camera.reset();
        }
        this.localPlayer = null;
        this.remotePlayer = null;
        this.allPlayers = [];
        this.weaponConfirmed = false;
        this._lastPhase = null;
        this._running = true;
        this._lastTime = performance.now();
        if (this.ui) {
            this.ui.showScreen('title');
        }
        this._loop(this._lastTime);
    }

    _updatePhaseUI() {
        if (!this.gamemode) return;
        const phase = this.gamemode.phase;
        if (phase === this._lastPhase) {
            if (phase !== GamePhase.WEAPON_SELECT) {
                const wsEl = document.getElementById('screen-weapon-select');
                if (wsEl && wsEl.style.display !== 'none') {
                    console.log('Force-hiding weapon select (phase=' + phase + ')');
                    wsEl.style.display = 'none';
                }
            }
            return;
        }
        console.log('Phase changed: ' + this._lastPhase + ' -> ' + phase);
        this._lastPhase = phase;

        if (phase !== GamePhase.WEAPON_SELECT) {
            console.log('Hiding weapon select on phase change');
            this.ui.hideScreen('weaponSelect');
            const wsEl = document.getElementById('screen-weapon-select');
            if (wsEl) wsEl.style.display = 'none';
        }
    }

    _updateUI(dt) {
        this._fpsTimer += dt;
        this._frameCount++;
        if (this._fpsTimer >= 1) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTimer = 0;
        }

        if (this.ui && this.localPlayer && this.gamemode &&
            (this.gamemode.phase === GamePhase.FIGHTING ||
             this.gamemode.phase === GamePhase.SET_TRANSITION)) {
            this.ui.updateHUD(
                this.localPlayer,
                this.gamemode,
                this.network ? this.network.getPing() : 0,
                this._fps
            );
        }
    }

    render() {
        if (!this.localPlayer || !this.renderer) return;
        if (!this.gamemode) return;

        if (this.gamemode.phase === GamePhase.FIGHTING ||
            this.gamemode.phase === GamePhase.SET_TRANSITION ||
            this.gamemode.phase === GamePhase.MATCH_END) {

            const otherPlayers = this.remotePlayer ? [this.remotePlayer] : [];

            const allVisible = [this.localPlayer, ...otherPlayers];

            this.renderer.render(
                this.camera,
                allVisible,
                this.bulletManager ? this.bulletManager.getActiveBullets() : [],
                this.effects ? this.effects.getParticles() : [],
                this.effects ? this.effects.getMuzzleFlashes() : [],
                this.effects,
                this.map
            );

            this.renderer.renderDamageFlash(this.localPlayer);

            if (this.gamemode.phase === GamePhase.MATCH_END) {
                this.renderer.renderWinScreen(this.localPlayer, this.gamemode);
            }

            if (this.gamemode.phase === GamePhase.SET_TRANSITION) {
                this.renderer.renderSetTransition(this.gamemode.currentSet);
            }

            if (this.gamemode.phase === GamePhase.FIGHTING) {
                this.renderer.renderKillFeed(this.gamemode.getKillFeed());
            }
        }
    }

    _loop(timestamp) {
        if (!this._running) return;

        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
        this._lastTime = timestamp;

        try {
            this.update(dt);
            this.render();
        } catch (e) {
            console.error('Game loop error:', e);
        }

        this._requestId = requestAnimationFrame((t) => this._loop(t));
    }
}
