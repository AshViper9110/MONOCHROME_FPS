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
        this._initialized = false;
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
                    if (this.weaponConfirmed) {
                        this._beginMatch();
                    }
                }
            },
            onSetStart: (data) => {
                this._spawnPlayers();
                this.gamemode.currentSet = data.setNumber;
                this.gamemode.startSet();
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

        if (this.remotePlayer && this.remotePlayer.weapon) {
            this._beginMatch();
        }
    }

    _beginMatch() {
        if (!this.gamemode) return;
        if (this.ui) {
            this.ui.showHUD();
        }
        if (this.network && this.network.peer) {
            if (this.network.peer.isHost()) {
                this.network.sendSetStart(0);
            }
        }
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

        const projectiles = this.localPlayer.fire(performance.now() / 1000);
        if (projectiles) {
            if (this.bulletManager) {
                this.bulletManager.addBullets(projectiles);
            }
            if (this.localPlayer.weapon && this.effects) {
                this.effects.spawnMuzzleFlash(
                    this.localPlayer.getEyePosition(),
                    this.localPlayer.getForward()
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
        if (this.bulletManager) {
            this.bulletManager.update(dt, this.physics, this.allPlayers);
        }

        this._checkBulletHits();

        if (this.network && this.network.isConnected()) {
            this.network.update(dt, this.localPlayer);
        }

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
        this.localPlayer.pitch -= mouseDelta.dy * MOUSE_SENSITIVITY;
        this.localPlayer.pitch = clamp(this.localPlayer.pitch, -Math.PI / 2.2, Math.PI / 2.2);

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
        this.localPlayer = null;
        this.remotePlayer = null;
        this.allPlayers = [];
        this.weaponConfirmed = false;
        this._running = true;
        this._lastTime = performance.now();
        if (this.ui) {
            this.ui.showScreen('title');
        }
        this._loop(this._lastTime);
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

            this.renderer.render(
                this.localPlayer,
                otherPlayers,
                this.bulletManager ? this.bulletManager.getActiveBullets() : [],
                this.effects ? this.effects.getParticles() : [],
                this.effects ? this.effects.getMuzzleFlashes() : [],
                this.effects,
                this.map
            );

            if (this.gamemode.phase === GamePhase.FIGHTING ||
                this.gamemode.phase === GamePhase.SET_TRANSITION) {
                this.renderer.renderHUD(
                    this.localPlayer,
                    [],
                    this.gamemode,
                    {
                        fps: this._fps,
                        ping: this.network ? this.network.getPing() : 0,
                        connected: this.network ? this.network.isConnected() : false,
                    }
                );
            }

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
