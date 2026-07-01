(() => {
    'use strict';

    // ============================================================
    // CONFIG
    // ============================================================
    const CFG = {
        fov: Math.PI / 2,
        rayCount: 320,
        moveSpeed: 3.0,
        rotSpeed: 0.003,
        playerSize: 0.25,
        shootCooldown: 0.18,
        damage: 34,
        maxHealth: 100,
        respawnTime: 3,
        botCount: 3,
        killLimit: 10,
        roundTime: 180,
        mapCols: 21,
        mapRows: 10,
        tickRate: 30,
    };

    const MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,1],
        [1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];

    const SPAWN_POINTS = [
        [2.5, 2.5], [18.5, 2.5], [2.5, 7.5], [18.5, 7.5],
        [10.5, 1.5], [10.5, 8.5], [5.5, 5.5], [15.5, 5.5],
    ];

    const BOT_NAMES = ['NOVA', 'CRYPT', 'SHARD', 'VOID', 'GRID', 'FLUX', 'NEON', 'ZERO'];

    function isWall(x, y) {
        const mx = Math.floor(x);
        const my = Math.floor(y);
        return mx < 0 || mx >= CFG.mapCols || my < 0 || my >= CFG.mapRows || MAP[my][mx] === 1;
    }

    function collides(px, py, r) {
        const checks = [[-r,-r],[r,-r],[-r,r],[r,r],[-r,0],[r,0],[0,-r],[0,r]];
        return checks.some(([dx, dy]) => isWall(px + dx, py + dy));
    }

    function genId() { return Math.random().toString(36).substring(2, 8); }

    function genRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    // ============================================================
    // AUDIO
    // ============================================================
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function beep(freq, dur, vol, type) {
        try {
            initAudio();
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            g.gain.setValueAtTime(vol, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch(_) {}
    }

    function playShoot() { beep(600, 0.06, 0.12, 'sawtooth'); }
    function playHit() { beep(1000, 0.08, 0.08); }
    function playKill() { [523, 659, 784].forEach((f, i) => beep(f, 0.1, 0.06, 'square', i * 0.06)); }
    function playDeath() { beep(200, 0.35, 0.1, 'sawtooth'); }
    function playHurt() { beep(180, 0.1, 0.08); }

    // ============================================================
    // RAYCASTER
    // ============================================================
    class Raycaster {
        cast(x, y, angle, maxDist) {
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            let mx = Math.floor(x), my = Math.floor(y);
            const ddX = sinA === 0 ? 1e30 : Math.abs(1 / cosA);
            const ddY = cosA === 0 ? 1e30 : Math.abs(1 / sinA);
            let sdX, sdY, stX, stY;
            if (cosA < 0) { stX = -1; sdX = (x - mx) * ddX; }
            else { stX = 1; sdX = (mx + 1 - x) * ddX; }
            if (sinA < 0) { stY = -1; sdY = (y - my) * ddY; }
            else { stY = 1; sdY = (my + 1 - y) * ddY; }
            let hit = false, side = 0, dist = 0;
            while (!hit && dist < maxDist) {
                if (sdX < sdY) { dist = sdX; sdX += ddX; mx += stX; side = 0; }
                else { dist = sdY; sdY += ddY; my += stY; side = 1; }
                if (mx < 0 || mx >= CFG.mapCols || my < 0 || my >= CFG.mapRows) break;
                if (MAP[my][mx] === 1) hit = true;
            }
            let pDist = side === 0 ? (mx - x + (1 - stX) / 2) / cosA : (my - y + (1 - stY) / 2) / sinA;
            if (pDist < 0.01) pDist = 0.01;
            let wallX = side === 0 ? y + pDist * sinA : x + pDist * cosA;
            wallX -= Math.floor(wallX);
            return { dist: pDist, side, wallX, mx, my, hit };
        }

        castDist(x, y, angle, maxDist) {
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            let mx = Math.floor(x), my = Math.floor(y);
            const ddX = sinA === 0 ? 1e30 : Math.abs(1 / cosA);
            const ddY = cosA === 0 ? 1e30 : Math.abs(1 / sinA);
            let sdX, sdY, stX, stY;
            if (cosA < 0) { stX = -1; sdX = (x - mx) * ddX; }
            else { stX = 1; sdX = (mx + 1 - x) * ddX; }
            if (sinA < 0) { stY = -1; sdY = (y - my) * ddY; }
            else { stY = 1; sdY = (my + 1 - y) * ddY; }
            let hit = false, dist = 0;
            while (!hit && dist < maxDist) {
                if (sdX < sdY) { dist = sdX; sdX += ddX; mx += stX; }
                else { dist = sdY; sdY += ddY; my += stY; }
                if (mx < 0 || mx >= CFG.mapCols || my < 0 || my >= CFG.mapRows) break;
                if (MAP[my][mx] === 1) hit = true;
            }
            return hit ? dist : maxDist;
        }
    }

    const raycaster = new Raycaster();

    // ============================================================
    // STATE
    // ============================================================
    const state = {
        players: new Map(),
        running: false,
        elapsed: 0,
        startTime: 0,
        tick: 0,
    };

    function createPlayerState(id, name, isBot) {
        const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        return {
            id, name, isBot: !!isBot,
            x: sp[0], y: sp[1],
            angle: Math.random() * Math.PI * 2,
            health: CFG.maxHealth,
            kills: 0, deaths: 0,
            alive: true,
            shootCooldown: 0,
            lastDamageTime: 0,
            respawnTimer: 0,
        };
    }

    // ============================================================
    // BOT
    // ============================================================
    class Bot {
        constructor(id, name) { this.id = id; this.name = name; this.reset(); }
        reset() {
            this.patrolTarget = null;
            this.state = 'patrol';
            this.lostSightTimer = 0;
            this.accuracy = 0.85 + Math.random() * 0.12;
            this.aggressiveness = 0.5 + Math.random() * 0.5;
            this.shootCooldown = 0;
            this.lastDamageTime = 0;
        }
        update(dt, allPlayers, selfP) {
            if (!selfP.alive) { this.respawnTimer -= dt; return null; }
            this.shootCooldown -= dt;
            if (Date.now() - this.lastDamageTime > 4000 && selfP.health < CFG.maxHealth) {
                selfP.health = Math.min(CFG.maxHealth, selfP.health + 15 * dt);
            }
            const player = this.findTarget(allPlayers, selfP);
            const canSee = this.canSee(player);
            const dist = player ? Math.hypot(player.x - selfP.x, player.y - selfP.y) : 99;
            if (canSee && player && dist < 12) {
                this.state = 'chase';
                this.lostSightTimer = 0;
            } else if (this.state === 'chase') {
                this.lostSightTimer += dt;
                if (this.lostSightTimer > 3) { this.state = 'patrol'; this.patrolTarget = null; }
            }
            if (this.state === 'patrol') return this.doPatrol(dt, selfP);
            return this.doChase(dt, selfP, player);
        }
        findTarget(allPlayers, selfP) {
            let closest = null, minDist = 15;
            for (const p of allPlayers) {
                if (p.id === selfP.id || !p.alive) continue;
                const d = Math.hypot(p.x - selfP.x, p.y - selfP.y);
                if (d < minDist) { minDist = d; closest = p; }
            }
            return closest;
        }
        canSee(target) {
            if (!target || !target.alive) return false;
            const dx = target.x - this.x, dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 14) return false;
            const angle = Math.atan2(dy, dx);
            let diff = angle - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > 1.2) return false;
            return raycaster.castDist(this.x, this.y, angle, dist) >= dist;
        }
        doPatrol(dt, selfP) {
            if (!this.patrolTarget || Math.hypot(this.patrolTarget[0] - selfP.x, this.patrolTarget[1] - selfP.y) < 0.5) {
                this.pickPatrol(selfP);
            }
            if (this.patrolTarget) this.moveToward(selfP, this.patrolTarget[0], this.patrolTarget[1], dt * 0.7);
        }
        pickPatrol(selfP) {
            for (let i = 0; i < 20; i++) {
                const tx = 1 + Math.random() * (CFG.mapCols - 2);
                const ty = 1 + Math.random() * (CFG.mapRows - 2);
                if (!isWall(tx, ty) && Math.hypot(tx - selfP.x, ty - selfP.y) > 3) {
                    this.patrolTarget = [tx, ty]; return;
                }
            }
            this.patrolTarget = [selfP.x + (Math.random() - 0.5) * 2, selfP.y + (Math.random() - 0.5) * 2];
        }
        doChase(dt, selfP, target) {
            if (!target || !target.alive) { this.state = 'patrol'; return null; }
            const dist = Math.hypot(target.x - selfP.x, target.y - selfP.y);
            if (dist > 1.5) this.moveToward(selfP, target.x, target.y, dt * (1 + this.aggressiveness * 0.5));
            const at = Math.atan2(target.y - selfP.y, target.x - selfP.x);
            let diff = at - selfP.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            selfP.angle += diff * Math.min(1, 8 * dt);
            if (dist < 10 && this.shootCooldown <= 0) {
                this.shootCooldown = CFG.shootCooldown * (0.8 + Math.random() * 0.4);
                return { bot: this, target };
            }
            return null;
        }
        moveToward(p, tx, ty, speed) {
            const dx = tx - p.x, dy = ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 0.1) return;
            const mx = (dx / d) * speed, my = (dy / d) * speed;
            if (!collides(p.x + mx, p.y, CFG.playerSize)) p.x += mx;
            if (!collides(p.x, p.y + my, CFG.playerSize)) p.y += my;
            p.angle = Math.atan2(dy, dx);
        }
    }

    // ============================================================
    // NETWORK (PeerJS)
    // ============================================================
    const net = {
        peer: null,
        conns: new Map(),
        isHost: false,
        myId: null,
        roomCode: null,
        joined: false,
        onLobby: null,
        onState: null,
        onJoined: null,
        onKill: null,
        onGameEnd: null,
        onError: null,
        inputBuffer: new Map(), // id -> latest input
        msgQueue: [], // pending messages
    };

    function netCreateRoom(code) {
        cleanupNet();
        net.isHost = true;
        net.roomCode = code;
        net.myId = 'host';
        try {
            net.peer = new Peer(code);
        } catch(e) {
            if (net.onError) net.onError('Failed to create Peer: ' + e.message);
            return;
        }
        net.peer.on('open', (id) => {
            net.myId = id;
            joinedAsHost();
        });
        net.peer.on('connection', (conn) => {
            const cid = genId();
            net.conns.set(cid, { conn, id: cid, name: '...', ready: false });
            conn.on('data', (data) => handleMsg(cid, data));
            conn.on('close', () => {
                net.conns.delete(cid);
                broadcast({ type: 'player_left', id: cid });
                if (net.onLobby) net.onLobby(getLobbyData());
            });
            conn.on('error', () => {});
        });
        net.peer.on('error', (e) => {
            if (e.type === 'unavailable-id') {
                if (net.onError) net.onError('Room code "' + code + '" is already in use.');
            } else if (net.onError) net.onError('Connection error');
        });
    }

    function netJoinRoom(code) {
        cleanupNet();
        net.isHost = false;
        net.roomCode = code;
        try {
            net.peer = new Peer();
        } catch(e) {
            if (net.onError) net.onError('Failed to create Peer');
            return;
        }
        net.peer.on('open', (id) => {
            net.myId = id;
            const conn = net.peer.connect(code, { reliable: true });
            net.conns.set('host', { conn, id: 'host' });
            conn.on('open', () => {
                conn.send({ type: 'join', name: myName, id: net.myId });
            });
            conn.on('data', (data) => handleMsg('host', data));
            conn.on('close', () => {
                if (net.onError) net.onError('Disconnected from host');
            });
            conn.on('error', () => {});
        });
        net.peer.on('error', (e) => {
            if (net.onError) net.onError('Connection failed. Check room code.');
        });
    }

    let myName = 'PLAYER';

    function joinedAsHost() {
        net.joined = true;
        if (net.onJoined) net.onJoined(true);
    }

    function handleMsg(fromId, data) {
        if (!data || !data.type) return;
        switch (data.type) {
            case 'join': {
                if (!net.isHost) return;
                const info = net.conns.get(fromId);
                if (info) { info.name = data.name || 'Player'; info.playerId = data.id; }
                broadcast({ type: 'lobby_update', players: getLobbyData() });
                sendTo(fromId, { type: 'joined', id: fromId });
                if (net.onLobby) net.onLobby(getLobbyData());
                break;
            }
            case 'input': {
                if (!net.isHost) return;
                net.inputBuffer.set(data.pid || fromId, data);
                break;
            }
            case 'start': {
                if (!net.isHost) return;
                startGame();
                break;
            }
            case 'state': {
                if (net.isHost) return;
                if (net.onState) net.onState(data);
                break;
            }
            case 'joined': {
                net.myId = data.id;
                net.joined = true;
                if (net.onJoined) net.onJoined(false);
                break;
            }
            case 'lobby_update': {
                if (net.onLobby) net.onLobby(data.players);
                break;
            }
            case 'game_start': {
                if (net.onState) net.onState(data);
                break;
            }
            case 'kill': {
                if (net.onKill) net.onKill(data);
                break;
            }
            case 'game_end': {
                if (net.onGameEnd) net.onGameEnd(data);
                break;
            }
            case 'player_left': {
                state.players.delete(data.id);
                if (net.onLobby) net.onLobby(getLobbyData());
                break;
            }
            case 'ping': {
                sendTo(fromId, { type: 'pong' });
                break;
            }
        }
    }

    function sendTo(id, data) {
        const info = net.conns.get(id);
        if (info && info.conn && info.conn.open) {
            try { info.conn.send(data); } catch(_) {}
        }
    }

    function broadcast(data) {
        for (const [id, info] of net.conns) {
            if (info.conn && info.conn.open) {
                try { info.conn.send(data); } catch(_) {}
            }
        }
    }

    function getLobbyData() {
        const arr = [{ id: 'host', name: myName + ' (Host)', ready: true }];
        for (const [id, info] of net.conns) {
            arr.push({ id, name: info.name || '...', ready: info.ready || false });
        }
        return arr;
    }

    function sendInput(data) {
        if (net.isHost) {
            net.inputBuffer.set('host', data);
        } else {
            const info = net.conns.get('host');
            if (info && info.conn && info.conn.open) {
                try { info.conn.send(data); } catch(_) {}
            }
        }
    }

    function cleanupNet() {
        if (net.peer) {
            for (const [id, info] of net.conns) {
                if (info.conn) try { info.conn.close(); } catch(_) {}
            }
            net.conns.clear();
            try { net.peer.destroy(); } catch(_) {}
            net.peer = null;
        }
        net.isHost = false;
        net.joined = false;
        net.roomCode = null;
        net.inputBuffer.clear();
    }

    // ============================================================
    // HOST GAME LOGIC
    // ============================================================
    let bots = [];
    let hostTickTimer = 0;
    let killFeedItems = [];
    let gameEnded = false;

    function startGame() {
        gameEnded = false;
        state.players.clear();
        bots = [];
        killFeedItems = [];

        // Create host player
        const hp = createPlayerState('host', myName, false);
        state.players.set('host', hp);

        // Create remote players
        for (const [id, info] of net.conns) {
            const pp = createPlayerState(id, info.name, false);
            state.players.set(id, pp);
        }

        // Create bots
        const bc = parseInt(document.getElementById('bot-count')?.value) || 3;
        for (let i = 0; i < bc; i++) {
            const bid = 'bot_' + i;
            const bp = createPlayerState(bid, BOT_NAMES[i % BOT_NAMES.length], true);
            state.players.set(bid, bp);
            const bot = new Bot(bid, bp.name);
            bot.x = bp.x; bot.y = bp.y;
            bots.push(bot);
        }

        state.running = true;
        state.startTime = Date.now();
        state.elapsed = 0;
        state.tick = 0;

        document.getElementById('death-screen')?.classList.remove('active');
        document.getElementById('game-over')?.classList.remove('active');
        document.getElementById('kill-feed').innerHTML = '';

        showScene('game');
        resizeCanvas();
        if (canvas && !net.isHost) {
            canvas.requestPointerLock();
        }

        broadcast({ type: 'game_start', players: serializePlayers(), running: true, elapsed: 0 });
    }

    function serializePlayers() {
        return Array.from(state.players.values()).map(p => ({
            id: p.id, name: p.name, isBot: p.isBot,
            x: p.x, y: p.y, angle: p.angle,
            health: p.health, kills: p.kills, deaths: p.deaths,
            alive: p.alive,
        }));
    }

    function hostTick(dt) {
        if (!state.running || gameEnded) return;
        state.elapsed = (Date.now() - state.startTime) / 1000;
        if (state.elapsed >= CFG.roundTime) { endGame('time'); return; }

        const allPlayers = Array.from(state.players.values());

        // Process inputs
        for (const p of allPlayers) {
            if (p.shootCooldown > 0) p.shootCooldown -= 1 / CFG.tickRate;
            if (!p.alive) {
                p.respawnTimer -= 1 / CFG.tickRate;
                if (p.respawnTimer <= 0) respawnPlayer(p);
                continue;
            }
            if (Date.now() - p.lastDamageTime > 4000 && p.health < CFG.maxHealth) {
                p.health = Math.min(CFG.maxHealth, p.health + 15 / CFG.tickRate);
            }
            const input = p.id === 'host' ? net.inputBuffer.get('host') : net.inputBuffer.get(p.id);
            if (input) {
                const moveAngle = p.angle + (input.strafe * Math.PI / 2);
                const mx = Math.cos(moveAngle) * input.forward * CFG.moveSpeed / CFG.tickRate;
                const my = Math.sin(moveAngle) * input.forward * CFG.moveSpeed / CFG.tickRate;
                if (mx !== 0 || my !== 0) {
                    if (!collides(p.x + mx, p.y, CFG.playerSize)) p.x += mx;
                    if (!collides(p.x, p.y + my, CFG.playerSize)) p.y += my;
                }
                if (input.angle !== undefined) p.angle = input.angle;
                if (input.shoot) processShot(p, allPlayers);
            }
        }

        // Bot AI
        hostTickBots(1 / CFG.tickRate);

        // Check win
        for (const p of allPlayers) {
            if (!p.isBot && p.kills >= CFG.killLimit) { endGame('kills'); return; }
        }

        state.tick++;
        hostTickTimer = 0;

        // Broadcast state
        broadcast({ type: 'state', tick: state.tick, players: serializePlayers(), running: true, elapsed: state.elapsed });
    }

    function respawnPlayer(p) {
        const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        p.x = sp[0]; p.y = sp[1];
        p.angle = Math.random() * Math.PI * 2;
        p.health = CFG.maxHealth;
        p.alive = true;
    }

    function processShot(shooter, allPlayers) {
        if (shooter.shootCooldown > 0) return;
        shooter.shootCooldown = CFG.shootCooldown;
        playShoot();
        const dirX = Math.cos(shooter.angle);
        const dirY = Math.sin(shooter.angle);
        let closest = null, closestDist = Infinity;
        for (const target of allPlayers) {
            if (target.id === shooter.id || !target.alive) continue;
            const dx = target.x - shooter.x, dy = target.y - shooter.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 12) continue;
            if (dx * dirX + dy * dirY <= 0) continue;
            const at = Math.atan2(dy, dx);
            let diff = at - shooter.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > 0.3) continue;
            if (raycaster.castDist(shooter.x, shooter.y, at, dist) >= dist && dist < closestDist) {
                closestDist = dist; closest = target;
            }
        }
        if (closest) {
            closest.health -= CFG.damage;
            closest.lastDamageTime = Date.now();
            if (closest.health <= 0 && closest.alive) {
                closest.alive = false;
                closest.health = 0;
                closest.respawnTimer = CFG.respawnTime;
                closest.deaths++;
                shooter.kills++;
                const msg = { type: 'kill', killer: shooter.id, killed: closest.id, killerName: shooter.name, killedName: closest.name };
                broadcast(msg);
                addKillFeedUI(shooter.name + ' killed ' + closest.name);
                playKill();
                if (!shooter.isBot && shooter.kills >= CFG.killLimit) endGame('kills');
            } else {
                playHit();
            }
        }
    }

    function hostTickBots(dt) {
        const allPlayers = Array.from(state.players.values());
        for (const bot of bots) {
            const selfP = state.players.get(bot.id);
            if (!selfP) continue;
            const result = bot.update(dt, allPlayers, selfP);
            if (result) {
                const target = result.target;
                const dx = target.x - selfP.x, dy = target.y - selfP.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const at = Math.atan2(dy, dx);
                let diff = at - selfP.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) > 0.25) continue;
                if (raycaster.castDist(selfP.x, selfP.y, at, dist) < dist) continue;
                if (Math.random() > bot.accuracy) continue;
                target.health -= CFG.damage;
                target.lastDamageTime = Date.now();
                if (target.health <= 0 && target.alive) {
                    target.alive = false;
                    target.health = 0;
                    target.respawnTimer = CFG.respawnTime;
                    target.deaths++;
                    selfP.kills++;
                    const msg = { type: 'kill', killer: selfP.id, killed: target.id, killerName: selfP.name, killedName: target.name };
                    broadcast(msg);
                    addKillFeedUI(selfP.name + ' killed ' + target.name);
                    playDeath();
                } else {
                    playHurt();
                }
            }
        }
    }

    function addKillFeedUI(text) {
        const feed = document.getElementById('kill-feed');
        if (!feed) return;
        const el = document.createElement('div');
        el.className = 'kf-item';
        el.textContent = text;
        feed.appendChild(el);
        setTimeout(() => el.remove(), 3000);
        if (feed.children.length > 5) feed.firstChild.remove();
    }

    function endGame(reason) {
        gameEnded = true;
        state.running = false;
        const scores = Array.from(state.players.values())
            .filter(p => !p.isBot)
            .map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }));
        scores.sort((a, b) => b.kills - a.kills);
        broadcast({ type: 'game_end', reason, scores });
        showGameOver(scores);
        if (document.pointerLockElement) document.exitPointerLock();
    }

    // ============================================================
    // RENDER
    // ============================================================
    let canvas, ctx;
    let minimapCanvas, minimapCtx;
    let W, H;

    function render(renderPlayers, elapsed, running) {
        resizeCanvas();
        if (!ctx || !canvas) return;
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        if (!renderPlayers || renderPlayers.length === 0) return;

        const myP = renderPlayers.find(p => p.id === (net.myId || 'host'));
        const p = myP || renderPlayers[0];
        if (!p) return;

        const rayW = w / CFG.rayCount;
        const wallDistances = [];

        for (let i = 0; i < CFG.rayCount; i++) {
            const rayAngle = p.angle - CFG.fov / 2 + (i / CFG.rayCount) * CFG.fov;
            const result = raycaster.cast(p.x, p.y, rayAngle, 20);
            wallDistances.push(result.dist);
            const wallH = result.hit ? Math.floor(h / result.dist) : 0;
            const wallTop = Math.floor(h / 2 - wallH / 2);
            const wallBot = Math.floor(h / 2 + wallH / 2);

            ctx.fillStyle = '#111';
            ctx.fillRect(i * rayW, 0, rayW + 1, wallTop);
            ctx.fillStyle = '#080808';
            ctx.fillRect(i * rayW, wallBot, rayW + 1, h - wallBot);

            if (result.hit) {
                const shade = Math.max(30, Math.min(220, Math.floor(255 - result.dist * 14)));
                const s = result.side ? Math.floor(shade * 0.5) : shade;
                const tex = Math.floor(result.wallX * 4) % 2 === 0;
                const c = tex ? s : Math.floor(s * 0.8);
                ctx.fillStyle = `rgb(${c},${c},${c})`;
                ctx.fillRect(i * rayW, wallTop, rayW + 1, wallBot - wallTop);
            }
        }

        renderSprites(renderPlayers, p, w, h, rayW, wallDistances);

        if (p.shootCooldown > CFG.shootCooldown - 0.05) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        if (damageFlash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.2, damageFlash * 0.5)})`;
            ctx.fillRect(0, 0, w, h);
        }

        renderMinimap(renderPlayers);
    }

    let damageFlash = 0;

    function renderSprites(players, viewer, w, h, rayW, wallDist) {
        const sprites = players
            .filter(sp => sp.id !== viewer.id && sp.alive)
            .map(sp => {
                const dx = sp.x - viewer.x, dy = sp.y - viewer.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const at = Math.atan2(dy, dx);
                let diff = at - viewer.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                return { ...sp, dist, angleDiff: diff };
            })
            .filter(sp => Math.abs(sp.angleDiff) < CFG.fov / 2 + 0.1 && sp.dist < 20)
            .sort((a, b) => b.dist - a.dist);

        for (const s of sprites) {
            const sx = Math.floor((s.angleDiff / CFG.fov + 0.5) * CFG.rayCount);
            if (sx < 0 || sx >= CFG.rayCount) continue;
            if (wallDist[Math.max(0, Math.min(CFG.rayCount - 1, sx))] < s.dist) continue;

            const sh = Math.floor(h / s.dist);
            const sw = Math.floor(sh * 0.4);
            const st = Math.floor(h / 2 - sh / 2);
            const sl = Math.floor(sx * rayW - sw / 2);
            const shade = Math.max(20, Math.min(255, Math.floor(255 - s.dist * 10)));
            const c = s.isBot ? Math.floor(shade * 0.6) : shade;

            ctx.fillStyle = `rgb(${c},${c},${c})`;
            ctx.fillRect(sl, st + sh * 0.15, sw, sh * 0.7);
            ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
            ctx.fillRect(sl + sw * 0.2, st, sw * 0.6, sh * 0.2);

            if (shade > 60) {
                ctx.fillStyle = '#000';
                ctx.fillRect(sl + sw * 0.3, st + sh * 0.06, sw * 0.1, sh * 0.06);
                ctx.fillRect(sl + sw * 0.55, st + sh * 0.06, sw * 0.1, sh * 0.06);
            }
        }
    }

    function renderMinimap(players) {
        const mc = minimapCanvas;
        if (!mc) return;
        const mctx = minimapCtx;
        const size = 140;
        const cs = size / CFG.mapCols;
        mc.width = size; mc.height = size;
        mctx.fillStyle = '#000'; mctx.fillRect(0, 0, size, size);

        for (let y = 0; y < CFG.mapRows; y++)
            for (let x = 0; x < CFG.mapCols; x++)
                if (MAP[y][x] === 1) { mctx.fillStyle = '#333'; mctx.fillRect(x * cs, y * cs, cs, cs); }

        for (const p of players) {
            if (!p.alive) continue;
            mctx.fillStyle = p.id === (net.myId || 'host') ? '#fff' : '#666';
            mctx.beginPath();
            mctx.arc(p.x * cs, p.y * cs, p.id === (net.myId || 'host') ? 2.5 : 1.5, 0, Math.PI * 2);
            mctx.fill();
        }
    }

    // ============================================================
    // HUD
    // ============================================================
    function updateHUD(stateData) {
        const myP = stateData?.players?.find(p => p.id === (net.myId || 'host'));
        if (!myP && !stateData?.running) return;

        const hp = document.getElementById('health-fill');
        const ht = document.getElementById('health-text');
        if (hp && ht && myP) {
            const pct = Math.max(0, (myP.health / CFG.maxHealth) * 100);
            hp.style.width = pct + '%';
            ht.textContent = Math.ceil(myP.health);
        }

        if (myP) {
            document.getElementById('kills-count').textContent = myP.kills;
        }

        const remaining = Math.max(0, CFG.roundTime - (stateData?.elapsed || 0));
        const m = Math.floor(remaining / 60);
        const s = Math.floor(remaining % 60);
        document.getElementById('timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;

        const re = document.getElementById('respawn-timer');
        if (re && myP) re.textContent = Math.max(0, Math.ceil(myP.respawnTimer || 0));
    }

    // ============================================================
    // SCENES
    // ============================================================
    function showScene(name) {
        document.querySelectorAll('.scene').forEach(el => el.classList.remove('active'));
        const el = document.getElementById('scene-' + name);
        if (el) el.classList.add('active');
    }

    function showGameOver(scores) {
        const go = document.getElementById('game-over');
        if (!go) return;
        go.classList.add('active');
        const container = document.getElementById('final-scores');
        if (!container) return;
        let html = '';
        scores.forEach((s, i) => {
            const isMe = s.id === (net.myId || 'host');
            html += `<div class="go-row${isMe ? ' go-me' : ''}">
                <span>${i + 1}.</span>
                <span>${s.name}</span>
                <span>${s.kills}K ${s.deaths}D</span>
            </div>`;
        });
        container.innerHTML = html;
        document.getElementById('death-screen')?.classList.remove('active');
    }

    // ============================================================
    // INPUT
    // ============================================================
    let keys = {};
    let pointerLocked = false;
    let shooting = false;
    let localAngle = 0;

    function populateScoreboard() {
        const container = document.getElementById('scoreboard-content');
        if (!container) return;
        const players = net.isHost
            ? Array.from(state.players.values())
            : (latestState?.players || []);
        const sorted = players.filter(p => !p.isBot).sort((a, b) => b.kills - a.kills);
        let html = '<h2>SCOREBOARD</h2>';
        sorted.forEach(p => {
            const isMe = p.id === (net.myId || 'host');
            html += `<div class="sb-row${isMe ? ' sb-me' : ''}">
                <span>${p.name}</span>
                <span>${p.kills}K ${p.deaths}D</span>
            </div>`;
        });
        container.innerHTML = html;
    }

    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === ' ' || e.key === 'Space') e.preventDefault();
        if (e.key === 'Tab') {
            e.preventDefault();
            const sb = document.getElementById('scoreboard');
            if (sb) {
                populateScoreboard();
                sb.classList.toggle('active');
            }
        }
        if (e.key === 'Enter') {
            const titleScene = document.getElementById('scene-title');
            if (titleScene && titleScene.classList.contains('active')) {
                showScene('lobby'); return;
            }
            const gameOver = document.getElementById('game-over');
            if (gameOver && gameOver.classList.contains('active')) {
                gameOver.classList.remove('active');
                cleanupNet();
                showScene('lobby'); return;
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    document.addEventListener('mousemove', (e) => {
        if (pointerLocked) {
            localAngle += (e.movementX || 0) * CFG.rotSpeed;
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            const gameScene = document.getElementById('scene-game');
            if (gameScene && gameScene.classList.contains('active') && !pointerLocked) {
                if (canvas) canvas.requestPointerLock();
            }
            shooting = true;
        }
    });

    document.addEventListener('mouseup', (e) => { if (e.button === 0) shooting = false; });

    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('click', () => { initAudio(); });

    // ============================================================
    // GAME LOOP
    // ============================================================
    let lastTime = 0;
    let latestState = null;
    let isRunning = false;
    let gameOverScoreData = null;

    function gameLoop(time) {
        const dt = Math.min(0.05, (time - lastTime) / 1000);
        lastTime = time;

        const gameScene = document.getElementById('scene-game');
        const isGameActive = gameScene && gameScene.classList.contains('active');

        if (isGameActive) {
            if (net.isHost && state.running) {
                hostTickTimer += dt;
                if (hostTickTimer >= 1 / CFG.tickRate) {
                    hostTick(dt);
                }
            }

            // Read local input every frame (for both host and client)
            let forward = 0, strafe = 0;
            if (keys['w'] || keys['arrowup']) forward = 1;
            if (keys['s'] || keys['arrowdown']) forward = -1;
            if (keys['a'] || keys['arrowleft']) strafe = -1;
            if (keys['d'] || keys['arrowright']) strafe = 1;
            sendInput({ type: 'input', pid: net.myId || 'host', forward, strafe, angle: localAngle, shoot: shooting });

            // Render latest state
            const renderData = net.isHost ? { players: serializePlayers(), running: state.running, elapsed: state.elapsed } : latestState;
            if (renderData) {
                render(renderData.players, renderData.elapsed, renderData.running);
                updateHUD(renderData);
            }

            if (gameOverScoreData) {
                showGameOver(gameOverScoreData);
                gameOverScoreData = null;
            }
        }

        requestAnimationFrame(gameLoop);
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        canvas = document.getElementById('game-canvas');
        if (canvas) ctx = canvas.getContext('2d');
        resizeCanvas();
        minimapCanvas = document.getElementById('minimap');
        if (minimapCanvas) minimapCtx = minimapCanvas.getContext('2d');

        // ---- Lobby ----
        const nameInput = document.getElementById('pname');
        const createBtn = document.getElementById('btn-create');
        const joinBtn = document.getElementById('btn-join');
        const roomInput = document.getElementById('room-input');
        const roomDisplay = document.getElementById('room-code');
        const playerList = document.getElementById('player-list');
        const lobbyStatus = document.getElementById('lobby-status');
        const startBtn = document.getElementById('btn-start-game');
        const lobbyCreate = document.getElementById('lobby-create');
        const lobbyWait = document.getElementById('lobby-wait');

        // ---- NETWORK CALLBACKS ----
        net.onJoined = (isHost) => {
            if (isHost) {
                lobbyCreate.style.display = 'block';
                roomDisplay.textContent = net.roomCode;
                document.getElementById('lobby-connect').style.display = 'none';
                lobbyStatus.textContent = 'Waiting for players...';
                updatePlayerList();
            } else {
                lobbyWait.style.display = 'block';
                lobbyStatus.textContent = 'Connected. Waiting for host...';
                document.getElementById('lobby-connect').style.display = 'none';
                updatePlayerList();
            }
        };
        net.onLobby = (players) => {
            updatePlayerList(players);
        };
        net.onState = (data) => {
            if (data.type === 'game_start') {
                showScene('game');
                resizeCanvas();
                if (canvas && !net.isHost) canvas.requestPointerLock();
                document.getElementById('death-screen')?.classList.remove('active');
                document.getElementById('game-over')?.classList.remove('active');
                document.getElementById('kill-feed').innerHTML = '';
            }
            if (data.type === 'state') {
                latestState = data;
                isRunning = data.running;
                // Apply angle from server for non-host players
                const myP = data.players?.find(p => p.id === net.myId);
                if (myP) localAngle = myP.angle;
            }
        };
        net.onKill = (data) => {
            addKillFeedUI(data.killerName + ' killed ' + data.killedName);
            if (data.killed === net.myId) { playDeath(); document.getElementById('death-screen')?.classList.add('active'); damageFlash = 0.3; }
            else if (data.killer === net.myId) { playKill(); }
            else { playShoot(); }
        };
        net.onGameEnd = (data) => {
            gameOverScoreData = data.scores;
            state.running = false;
            isRunning = false;
            if (document.pointerLockElement) document.exitPointerLock();
        };
        net.onError = (msg) => {
            lobbyStatus.textContent = 'Error: ' + msg;
        };

        function updatePlayerList(players) {
            const list = players || getLobbyData();
            if (!playerList) return;
            if (list.length === 0) { playerList.innerHTML = '<div class="lobby-empty">No players</div>'; return; }
            playerList.innerHTML = list.map(p =>
                `<div class="pl-entry${p.id === (net.myId || 'host') ? ' pl-me' : ''}">${p.name}</div>`
            ).join('');
        }

        // ---- CREATE ROOM ----
        createBtn.addEventListener('click', () => {
            myName = nameInput.value.trim() || 'PLAYER';
            const code = genRoomCode();
            netCreateRoom(code);
            lobbyStatus.textContent = 'Creating room...';
            createBtn.disabled = true;
            joinBtn.disabled = true;
        });

        // ---- JOIN ROOM ----
        joinBtn.addEventListener('click', () => {
            const code = roomInput.value.trim().toUpperCase();
            if (!code || code.length < 3) { lobbyStatus.textContent = 'Enter a room code'; return; }
            myName = nameInput.value.trim() || 'PLAYER';
            netJoinRoom(code);
            lobbyStatus.textContent = 'Connecting...';
            createBtn.disabled = true;
            joinBtn.disabled = true;
        });

        roomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinBtn.click();
        });

        // ---- START GAME ----
        startBtn.addEventListener('click', () => {
            if (net.isHost) {
                sendInput({ type: 'start', pid: 'host' });
                // Host starts locally
                startGame();
            }
        });

        showScene('title');
        lastTime = performance.now();
        gameLoop(lastTime);
    }

    function resizeCanvas() {
        const container = document.getElementById('scene-game');
        if (!container) return;
        const c = document.getElementById('game-canvas');
        if (!c) return;
        c.width = container.clientWidth || window.innerWidth;
        c.height = container.clientHeight || window.innerHeight;
        W = c.width; H = c.height;
    }

    window.addEventListener('resize', resizeCanvas);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
