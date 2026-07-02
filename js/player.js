import { Vec3, clamp } from './util.js';
import { PhysicsBody } from './physics.js';
import { MovementController } from './movement.js';

const MAX_HEALTH = 100;
const HEADSHOT_MULTIPLIER = 2;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.5;
const EYE_HEIGHT = 1.6;

export class Player {
    constructor(id, name = 'Player') {
        this.id = id;
        this.name = name;
        this.body = new PhysicsBody();
        this.body.size.set(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
        this.movement = new MovementController(this.body, null);
        this.health = MAX_HEALTH;
        this.maxHealth = MAX_HEALTH;
        this.yaw = 0;
        this.pitch = 0;
        this.weapon = null;
        this.weapons = [];
        this.selectedWeaponIndex = 0;
        this.kills = 0;
        this.deaths = 0;
        this.setsWon = 0;
        this.isDead = false;
        this.isLocal = false;
        this.ammo = {};
        this.lastFireTime = 0;
        this.reloading = false;
        this.reloadTimer = 0;
        this.damageFlash = 0;
        this.muzzleFlashTimer = 0;
    }

    initLocal(input) {
        this.isLocal = true;
        this.movement.input = input;
    }

    setPosition(pos) {
        this.body.position.copy(pos);
    }

    setRotation(yaw, pitch) {
        this.yaw = yaw;
        this.pitch = clamp(pitch, -Math.PI / 2.2, Math.PI / 2.2);
    }

    getEyePosition() {
        return new Vec3(
            this.body.position.x,
            this.body.position.y + EYE_HEIGHT,
            this.body.position.z
        );
    }

    getForward() {
        const cosY = Math.cos(this.yaw);
        const sinY = Math.sin(this.yaw);
        const cosP = Math.cos(this.pitch);
        const sinP = Math.sin(this.pitch);
        return new Vec3(sinY * cosP, sinP, -cosY * cosP).normalize();
    }

    takeDamage(amount, isHeadshot = false) {
        if (this.isDead) return false;
        const dmg = isHeadshot ? amount * HEADSHOT_MULTIPLIER : amount;
        this.health -= dmg;
        this.damageFlash = 0.2;
        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
            return true;
        }
        return false;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    equipWeapon(weapon) {
        this.weapon = weapon;
        if (!this.ammo[weapon.name]) {
            this.ammo[weapon.name] = weapon.maxAmmo;
        }
    }

    addWeapon(weapon) {
        this.weapons.push(weapon);
        if (!this.ammo[weapon.name]) {
            this.ammo[weapon.name] = weapon.maxAmmo;
        }
    }

    canFire(time) {
        if (!this.weapon) return false;
        if (this.isDead) return false;
        if (this.reloading) return false;
        if (time - this.lastFireTime < this.weapon.fireRate) return false;
        if (this.getCurrentAmmo() <= 0) return false;
        return true;
    }

    fire(time, dir) {
        if (!this.canFire(time)) return null;
        this.lastFireTime = time;
        this.ammo[this.weapon.name]--;
        this.muzzleFlashTimer = 0.05;
        const fireDir = dir || this.getForward();
        return this.weapon.createProjectile(this.getEyePosition(), fireDir, this.id);
    }

    startReload() {
        if (!this.weapon) return;
        if (this.reloading) return;
        if (this.getCurrentAmmo() >= this.weapon.magSize) return;
        if (this.getTotalAmmo() <= 0) return;
        this.reloading = true;
        this.reloadTimer = this.weapon.reloadTime;
    }

    updateReload(dt) {
        if (!this.reloading) return;
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
            this.reloading = false;
            const need = this.weapon.magSize - this.ammo[this.weapon.name];
            const available = Math.min(need, this.weapon.maxAmmo - this.ammo[this.weapon.name]);
            this.ammo[this.weapon.name] += available;
        }
    }

    getCurrentAmmo() {
        if (!this.weapon) return 0;
        return this.ammo[this.weapon.name] || 0;
    }

    getTotalAmmo() {
        if (!this.weapon) return 0;
        return this.weapon.maxAmmo;
    }

    update(dt) {
        if (this.isDead) return;
        if (this.isLocal) {
            this.movement.update(dt);
        }
        this.updateReload(dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt);
        this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    }

    reset(spawnPos) {
        this.health = this.maxHealth;
        this.isDead = false;
        this.reloading = false;
        this.reloadTimer = 0;
        this.damageFlash = 0;
        this.body.reset();
        this.movement.reset();
        if (spawnPos) {
            this.body.position.copy(spawnPos);
        }
        this.body.velocity.set(0, 0, 0);
        if (this.weapon) {
            this.ammo[this.weapon.name] = this.weapon.magSize;
        }
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            position: { x: this.body.position.x, y: this.body.position.y, z: this.body.position.z },
            velocity: { x: this.body.velocity.x, y: this.body.velocity.y, z: this.body.velocity.z },
            yaw: this.yaw,
            pitch: this.pitch,
            health: this.health,
            isDead: this.isDead,
            weapon: this.weapon ? this.weapon.name : null,
            setsWon: this.setsWon,
            onGround: this.body.onGround,
            onWall: this.body.onWall,
        };
    }

    deserialize(data) {
        this.name = data.name || this.name;
        this.body.position.set(data.position.x, data.position.y, data.position.z);
        this.body.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        this.yaw = data.yaw || 0;
        this.pitch = data.pitch || 0;
        this.health = data.health;
        this.isDead = data.isDead;
        this.setsWon = data.setsWon || 0;
    }
}
