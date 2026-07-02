import { Vec3, createViewMatrix, DEG2RAD, clamp } from './util.js';

const COLOR_BG = '#000000';
const COLOR_WALL = '#202020';
const COLOR_FLOOR = '#2d2d2d';
const COLOR_CEILING = '#1a1a1a';
const COLOR_PLAYER = '#ffffff';
const COLOR_ENEMY = '#333333';
const COLOR_ENEMY_OUTLINE = '#ffffff';
const COLOR_CROSSHAIR = '#ffffff';
const COLOR_WALLRUN_SURFACE = '#2a2a2a';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.halfWidth = 0;
        this.halfHeight = 0;
        this.fov = 90 * DEG2RAD;
        this._resize();
        this._depthBuffer = [];
        this._setupResize();
    }

    _setupResize() {
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.halfWidth = this.width / 2;
        this.halfHeight = this.height / 2;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this._depthBuffer = new Float32Array(this.width * this.height);
    }

    clear() {
        this.ctx.fillStyle = COLOR_BG;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this._depthBuffer.fill(Infinity);
    }

    render(player, otherPlayers, bullets, particles, muzzleFlashes, effects, map) {
        if (!player) return;
        this.clear();
        this._renderScene(player, map, otherPlayers, particles, bullets);
        this._renderMuzzleFlashes(muzzleFlashes, player);
        this._renderCrosshair(player);
    }

    _renderScene(player, map, otherPlayers, particles, bullets) {
        if (!player) return;
        const eyePos = player.getEyePosition();
        if (!eyePos) return;
        const viewMatrix = createViewMatrix(
            eyePos,
            player.yaw ?? 0,
            player.pitch ?? 0
        );

        const colliders = map ? map.colliders : [];
        const visibleObjects = [];

        for (const collider of colliders) {
            const obj = this._projectCollider(collider, viewMatrix);
            if (obj) visibleObjects.push(obj);
        }

        for (const other of otherPlayers) {
            if (other.isDead) continue;
            const sprite = this._projectPlayer(other, viewMatrix);
            if (sprite) visibleObjects.push(sprite);
        }

        for (const particle of particles) {
            if (!particle.active) continue;
            const sprite = this._projectParticle(particle, viewMatrix);
            if (sprite) visibleObjects.push(sprite);
        }

        if (bullets) {
            for (const bullet of bullets) {
                if (!bullet.alive || bullet.isHitscan) continue;
                const sprite = this._projectBullet(bullet, viewMatrix);
                if (sprite) visibleObjects.push(sprite);
            }
        }

        visibleObjects.sort((a, b) => b.depth - a.depth);

        for (const obj of visibleObjects) {
            this._drawObject(obj);
        }

        this._renderSkybox(viewMatrix);
    }

    _renderSkybox(viewMatrix) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const halfH = h / 2;

        const pitchFactor = viewMatrix[5] || 0;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, halfH + pitchFactor * 100);
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, halfH + pitchFactor * 100, w, halfH - pitchFactor * 100);
    }

    _projectCollider(collider, viewMatrix) {
        const pos = collider.position;
        const size = collider.size;

        const corners = [
            new Vec3(pos.x, pos.y, pos.z),
            new Vec3(pos.x + size.x, pos.y, pos.z),
            new Vec3(pos.x + size.x, pos.y, pos.z + size.z),
            new Vec3(pos.x, pos.y, pos.z + size.z),
            new Vec3(pos.x, pos.y + size.y, pos.z),
            new Vec3(pos.x + size.x, pos.y + size.y, pos.z),
            new Vec3(pos.x + size.x, pos.y + size.y, pos.z + size.z),
            new Vec3(pos.x, pos.y + size.y, pos.z + size.z),
        ];

        const projected = [];
        let avgDepth = 0;
        let allBehind = true;

        for (const corner of corners) {
            const p = this._projectPoint(corner, viewMatrix);
            if (p) {
                allBehind = false;
                projected.push(p);
                avgDepth += p.depth;
            }
        }

        if (allBehind || projected.length < 3) return null;

        avgDepth /= projected.length;

        const faces = this._getBoxFaces(corners, projected, collider);

        return {
            type: 'mesh',
            faces,
            depth: avgDepth,
            collider,
            isWalkable: collider.walkable,
        };
    }

    _getBoxFaces(corners, projected, collider) {
        const faces = [];

        const faceIndices = [
            [0, 1, 2, 3],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [2, 3, 7, 6],
            [0, 3, 7, 4],
            [1, 2, 6, 5],
        ];

        const isWalkable = collider.walkable;

        for (const fi of faceIndices) {
            const faceProjected = fi.map(i => projected[i]).filter(p => p);
            if (faceProjected.length < 3) continue;

            const avgZ = faceProjected.reduce((s, p) => s + p.depth, 0) / faceProjected.length;

            const center = new Vec3();
            for (const i of fi) {
                center.add(corners[i]);
            }
            center.scale(1 / fi.length);

            const isTop = Math.abs(center.y - (collider.position.y + collider.size.y)) < 0.1;
            const isBottom = Math.abs(center.y - collider.position.y) < 0.1;

            let color = isWalkable ? COLOR_WALLRUN_SURFACE : COLOR_WALL;
            if (isTop) color = COLOR_FLOOR;
            else if (isBottom) color = 'transparent';

            faces.push({
                points: faceProjected,
                depth: avgZ,
                color,
                isWalkable,
            });
        }

        return faces;
    }

    _projectPlayer(playerObj, viewMatrix) {
        if (!playerObj || !playerObj.body || !playerObj.body.position) return null;
        const pos = playerObj.body.position;
        const projected = this._projectPoint(pos, viewMatrix);
        if (!projected) return null;

        const size = 20 / projected.depth;

        return {
            type: 'sprite',
            x: projected.x,
            y: projected.y - size * 2,
            width: size * 1.5,
            height: size * 3,
            depth: projected.depth,
            color: playerObj.isLocal ? COLOR_PLAYER : COLOR_ENEMY,
            outline: !playerObj.isLocal ? COLOR_ENEMY_OUTLINE : null,
            health: playerObj.health,
            name: playerObj.name,
            isEnemy: !playerObj.isLocal,
        };
    }

    _projectParticle(particle, viewMatrix) {
        if (!particle || !particle.position) return null;
        const projected = this._projectPoint(particle.position, viewMatrix);
        if (!projected) return null;

        const size = particle.size * 20 / projected.depth;

        return {
            type: 'particle',
            x: projected.x,
            y: projected.y,
            size: Math.max(1, size),
            depth: projected.depth,
            color: particle.color,
            alpha: particle.alpha,
        };
    }

    _projectBullet(bullet, viewMatrix) {
        if (!bullet) return null;
        const pos = bullet.getPosition();
        if (!pos) return null;
        const projected = this._projectPoint(pos, viewMatrix);
        if (!projected) return null;

        const size = bullet.size * 30 / projected.depth;
        return {
            type: 'particle',
            x: projected.x,
            y: projected.y,
            size: Math.max(2, size),
            depth: projected.depth,
            color: '#ffff44',
            alpha: 1,
        };
    }

    _renderMuzzleFlashes(muzzleFlashes, player) {
        if (!muzzleFlashes || muzzleFlashes.length === 0) return;
        if (!player) return;
        const ctx = this.ctx;
        const flash = muzzleFlashes[muzzleFlashes.length - 1];
        if (!flash || !flash.direction) return;
        const intensity = flash.timer / (flash.maxTimer || 1);

        ctx.save();
        ctx.globalAlpha = intensity * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 30;

        const fovScale = 1 / Math.tan(this.fov / 2);
        const size = 20 * fovScale;

        const cx = this.halfWidth;
        const cy = this.halfHeight;
        const offsetX = -flash.direction.x * size * 2;
        const offsetY = -flash.direction.y * size * 2;

        ctx.beginPath();
        ctx.arc(cx + offsetX, cy + offsetY, size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = intensity * 0.3;
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath();
        ctx.arc(cx + offsetX, cy + offsetY, size * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _projectPoint(point, viewMatrix) {
        const transformed = this._applyViewMatrix(viewMatrix, point);
        if (transformed.z <= 0.1) return null;

        const f = 1 / Math.tan(this.fov / 2);
        const aspect = this.width / this.height;
        const sx = (transformed.x / transformed.z) * f / aspect;
        const sy = (transformed.y / transformed.z) * f;

        return {
            x: (sx + 1) * this.halfWidth,
            y: (1 - sy) * this.halfHeight,
            depth: transformed.z,
            raw: { x: transformed.x, y: transformed.y, z: transformed.z },
        };
    }

    _applyViewMatrix(m, v) {
        return {
            x: m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3],
            y: m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7],
            z: m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11],
        };
    }

    _drawObject(obj) {
        if (obj.type === 'mesh') {
            this._drawMesh(obj);
        } else if (obj.type === 'sprite') {
            this._drawSprite(obj);
        } else if (obj.type === 'particle') {
            this._drawParticle(obj);
        }
    }

    _drawMesh(obj) {
        const ctx = this.ctx;
        for (const face of obj.faces) {
            if (face.color === 'transparent') continue;
            if (face.points.length < 3) continue;

            ctx.beginPath();
            ctx.moveTo(face.points[0].x, face.points[0].y);
            for (let i = 1; i < face.points.length; i++) {
                ctx.lineTo(face.points[i].x, face.points[i].y);
            }
            ctx.closePath();

            ctx.fillStyle = face.color;
            ctx.fill();

            if (face.isWalkable) {
                ctx.strokeStyle = '#444444';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }

    _drawSprite(obj) {
        const ctx = this.ctx;
        const x = obj.x - obj.width / 2;
        const y = obj.y - obj.height;

        ctx.fillStyle = obj.color;
        ctx.fillRect(x, y, obj.width, obj.height);

        if (obj.outline) {
            ctx.strokeStyle = obj.outline;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, obj.width, obj.height);
        }

        if (obj.isEnemy) {
            const eyeY = y + obj.height * 0.15;
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(x + obj.width * 0.2, eyeY, obj.width * 0.2, obj.height * 0.08);
            ctx.fillRect(x + obj.width * 0.6, eyeY, obj.width * 0.2, obj.height * 0.08);
        }

        if (obj.name && obj.health !== undefined) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${obj.name} [${Math.max(0, obj.health)}]`, obj.x, y - 5);
        }
    }

    _drawParticle(obj) {
        const ctx = this.ctx;
        ctx.globalAlpha = obj.alpha;
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    _renderCrosshair(player) {
        const ctx = this.ctx;
        const cx = this.halfWidth;
        const cy = this.halfHeight;
        const size = 8;
        const gap = 4;

        ctx.strokeStyle = COLOR_CROSSHAIR;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;

        ctx.beginPath();
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy);
        ctx.lineTo(cx + size, cy);
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap);
        ctx.lineTo(cx, cy + size);
        ctx.stroke();

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = COLOR_CROSSHAIR;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    renderHUD(player, otherPlayers, gameMode, networkStats) {
        if (!player) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        if ((player.damageFlash ?? 0) > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${(player.damageFlash ?? 0) * 0.3})`;
            ctx.fillRect(0, 0, w, h);
        }

        this._drawHealthBar(player);
        this._drawAmmo(player);
        this._drawSetScore(player, gameMode);
        this._drawNetworkStats(networkStats);
        this._drawWeaponName(player);
        this._drawReloadBar(player);
    }

    _drawHealthBar(player) {
        if (!player) return;
        const ctx = this.ctx;
        const barWidth = 200;
        const barHeight = 20;
        const x = 20;
        const y = this.height - 50;
        const health = player.health ?? 100;
        const maxHealth = player.maxHealth ?? 100;
        const healthPercent = maxHealth > 0 ? health / maxHealth : 1;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);

        ctx.fillStyle = healthPercent > 0.5 ? '#ffffff' : healthPercent > 0.25 ? '#aaaaaa' : '#ff4444';
        ctx.fillRect(x, y, barWidth * healthPercent, barHeight);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2, y - 2, barWidth + 4, barHeight + 4);

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`HP ${Math.ceil(health)}`, x + 5, y + 15);
    }

    _drawAmmo(player) {
        if (!player || !player.weapon) return;
        const ctx = this.ctx;
        const w = this.width;
        const currentAmmo = (typeof player.getCurrentAmmo === 'function') ? player.getCurrentAmmo() : 0;
        const totalAmmo = (typeof player.getTotalAmmo === 'function') ? player.getTotalAmmo() : 0;
        const ammoText = `${currentAmmo} / ${totalAmmo}`;

        ctx.fillStyle = '#ffffff';
        ctx.font = '24px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(ammoText, w - 30, this.height - 40);

        if (player.reloading) {
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('RELOADING...', w - 30, this.height - 60);
        }
    }

    _drawSetScore(player, gameMode) {
        if (!gameMode) return;
        const ctx = this.ctx;
        const w = this.width;

        const setsWon = gameMode.setsWon ?? [0, 0];
        const playerOrder = gameMode.playerIdOrder ?? [];
        if (!Array.isArray(playerOrder) || playerOrder.length < 2) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '32px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('0 - 0', w / 2, 40);
            return;
        }

        const setsText = `${setsWon[0] ?? 0} - ${setsWon[1] ?? 0}`;
        ctx.fillStyle = '#ffffff';
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(setsText, w / 2, 40);

        const currentSet = gameMode.currentSet ?? 0;
        ctx.font = '12px monospace';
        ctx.fillText(`Set ${currentSet + 1}`, w / 2, 58);
    }

    _drawNetworkStats(stats) {
        if (!stats) return;
        const ctx = this.ctx;

        ctx.fillStyle = '#666666';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';

        let y = 20;
        if (stats.fps) {
            ctx.fillText(`FPS: ${stats.fps}`, this.width - 20, y);
            y += 14;
        }
        if (stats.ping !== undefined) {
            ctx.fillText(`Ping: ${stats.ping}ms`, this.width - 20, y);
            y += 14;
        }
        if (stats.connected !== undefined) {
            ctx.fillText(`Peer: ${stats.connected ? 'Connected' : 'Disconnected'}`, this.width - 20, y);
        }
    }

    _drawWeaponName(player) {
        if (!player.weapon) return;
        const ctx = this.ctx;

        ctx.fillStyle = '#888888';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(player.weapon.name, 20, this.height - 70);
    }

    _drawReloadBar(player) {
        if (!player || !player.reloading || !player.weapon) return;
        const ctx = this.ctx;
        const barWidth = 100;
        const barHeight = 4;
        const x = this.width - 30 - barWidth;
        const y = this.height - 45;
        const reloadTime = player.weapon.reloadTime || 1;
        const progress = 1 - (player.reloadTimer ?? 0) / reloadTime;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, barWidth * progress, barHeight);
    }

    renderWinScreen(player, gameMode) {
        if (!player || !gameMode) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';

        const isWinner = gameMode.winner === player.id;
        ctx.fillText(isWinner ? 'VICTORY' : 'DEFEAT', w / 2, h / 2 - 40);

        const setsWon = Array.isArray(gameMode.setsWon) ? gameMode.setsWon : [0, 0];
        ctx.font = '18px monospace';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`Final Score: ${setsWon[0] ?? 0} - ${setsWon[1] ?? 0}`, w / 2, h / 2 + 20);

        ctx.font = '14px monospace';
        ctx.fillText('Press SPACE to return to menu', w / 2, h / 2 + 60);
    }

    renderSetTransition(setNumber) {
        if (setNumber == null) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = '36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`SET ${setNumber + 1}`, w / 2, h / 2 - 20);

        ctx.font = '16px monospace';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('GET READY', w / 2, h / 2 + 20);
    }

    renderKillFeed(kills) {
        if (!kills || kills.length === 0) return;
        const ctx = this.ctx;
        const startY = 80;

        ctx.font = '12px monospace';
        ctx.textAlign = 'left';

        const maxKills = Math.min(kills.length, 5);
        const startIdx = Math.max(0, kills.length - 5);
        const killCount = Math.min(kills.length - startIdx, 5);
        for (let i = startIdx; i < startIdx + killCount; i++) {
            const kill = kills[i];
            if (!kill) continue;
            const y = startY + (i - startIdx) * 18;
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - (killCount - (i - startIdx)) * 0.15})`;
            ctx.fillText(`${kill.killer ?? '?'} → ${kill.victim ?? '?'}`, 20, y);
        }
    }
}
