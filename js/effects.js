import { Vec3, randomRange, ObjectPool } from './util.js';

export class Particle {
    constructor() {
        this.position = new Vec3();
        this.velocity = new Vec3();
        this.life = 0;
        this.maxLife = 1;
        this.size = 0.1;
        this.color = '#ffffff';
        this.alpha = 1;
        this.gravity = 0;
        this.active = false;
    }

    init(config) {
        this.position.copy(config.position);
        this.velocity.copy(config.velocity || new Vec3());
        this.life = config.life || 1;
        this.maxLife = this.life;
        this.size = config.size || 0.1;
        this.color = config.color || '#ffffff';
        this.alpha = config.alpha || 1;
        this.gravity = config.gravity || 0;
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;
        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
            return;
        }
        this.velocity.y -= this.gravity * dt;
        this.position.add(Vec3.scale(this.velocity, dt));
        this.alpha = (this.life / this.maxLife);
    }

    reset() {
        this.active = false;
        this.life = 0;
    }
}

export class EffectsManager {
    constructor() {
        this._particlePool = new ObjectPool(
            () => new Particle(),
            (p) => { p.active = false; p.life = 0; },
            200
        );
        this._muzzleFlashes = [];
        this._hitMarkers = [];
        this._damageIndicators = [];
    }

    spawnMuzzleFlash(origin, direction, duration = 0.05) {
        this._muzzleFlashes.push({
            position: origin.clone(),
            direction: direction.clone(),
            timer: duration,
            maxTimer: duration,
        });
    }

    spawnHitEffect(position, normal, color = '#ffffff') {
        for (let i = 0; i < 6; i++) {
            const vel = new Vec3(
                randomRange(-3, 3),
                randomRange(1, 5),
                randomRange(-3, 3)
            );
            const particle = this._particlePool.get();
            particle.init({
                position: Vec3.add(position, Vec3.scale(normal, 0.1)),
                velocity: vel,
                life: randomRange(0.2, 0.5),
                size: randomRange(0.02, 0.08),
                color: color,
                gravity: 5,
            });
        }
    }

    spawnDeathEffect(position) {
        for (let i = 0; i < 20; i++) {
            const vel = new Vec3(
                randomRange(-8, 8),
                randomRange(2, 10),
                randomRange(-8, 8)
            );
            const particle = this._particlePool.get();
            particle.init({
                position: position.clone(),
                velocity: vel,
                life: randomRange(0.5, 1.5),
                size: randomRange(0.05, 0.15),
                color: i % 2 === 0 ? '#ff4444' : '#ffffff',
                gravity: 8,
            });
        }
    }

    spawnBulletImpact(position, normal) {
        for (let i = 0; i < 3; i++) {
            const vel = new Vec3(
                randomRange(-1, 1),
                randomRange(-1, 1),
                randomRange(-1, 1)
            );
            if (normal) {
                const dot = vel.dot(normal);
                if (dot < 0) vel.reflect(normal);
            }
            const particle = this._particlePool.get();
            particle.init({
                position: Vec3.add(position, Vec3.scale(normal, 0.05)),
                velocity: vel,
                life: randomRange(0.1, 0.3),
                size: randomRange(0.01, 0.04),
                color: '#aaaaaa',
                gravity: 2,
            });
        }
    }

    spawnReloadEffect(position) {
        for (let i = 0; i < 3; i++) {
            const vel = new Vec3(
                randomRange(-1, 1),
                randomRange(0.5, 2),
                randomRange(-1, 1)
            );
            const particle = this._particlePool.get();
            particle.init({
                position: position.clone(),
                velocity: vel,
                life: 0.3,
                size: 0.03,
                color: '#888888',
                gravity: 3,
            });
        }
    }

    update(dt) {
        for (let i = this._muzzleFlashes.length - 1; i >= 0; i--) {
            this._muzzleFlashes[i].timer -= dt;
            if (this._muzzleFlashes[i].timer <= 0) {
                this._muzzleFlashes.splice(i, 1);
            }
        }

        const particles = this._particlePool.getActive();
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(dt);
            if (!particles[i].active) {
                this._particlePool.release(particles[i]);
            }
        }
    }

    getParticles() {
        return this._particlePool.getActive();
    }

    getMuzzleFlashes() {
        return this._muzzleFlashes;
    }

    clear() {
        this._particlePool.releaseAll();
        this._muzzleFlashes.length = 0;
        this._hitMarkers.length = 0;
    }
}
