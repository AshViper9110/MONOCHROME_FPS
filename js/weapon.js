import { Vec3, randomRange } from './util.js';
import { Bullet } from './bullet.js';

const WeaponType = Object.freeze({
    HITSCAN: 'hitscan',
    PROJECTILE: 'projectile',
});

export class Weapon {
    constructor(config) {
        this.name = config.name;
        this.type = config.type || WeaponType.PROJECTILE;
        this.damage = config.damage || 10;
        this.fireRate = config.fireRate || 0.1;
        this.magSize = config.magSize || 30;
        this.maxAmmo = config.maxAmmo || 90;
        this.reloadTime = config.reloadTime || 1.5;
        this.bulletSpeed = config.bulletSpeed || 100;
        this.range = config.range || 100;
        this.spread = config.spread || 0.02;
        this.recoil = config.recoil || 0.01;
        this.pellets = config.pellets || 1;
        this.headshotMultiplier = config.headshotMultiplier || 2;
        this.bulletSize = config.bulletSize || 0.05;
        this.penetration = config.penetration || 0;
        this.automatic = config.automatic !== undefined ? config.automatic : true;
        this.description = config.description || '';
    }

    createProjectile(origin, direction, ownerId) {
        const projectiles = [];
        for (let i = 0; i < this.pellets; i++) {
            const spread = this._calculateSpread();
            const dir = new Vec3(
                direction.x + spread.x,
                direction.y + spread.y,
                direction.z + spread.z
            ).normalize();

            const bullet = new Bullet({
                origin: origin.clone(),
                direction: dir,
                speed: this.bulletSpeed,
                damage: this.damage,
                range: this.range,
                ownerId: ownerId,
                size: this.bulletSize,
                isHitscan: this.type === WeaponType.HITSCAN,
                headshotMultiplier: this.headshotMultiplier,
                weaponName: this.name,
            });
            projectiles.push(bullet);
        }
        return projectiles;
    }

    _calculateSpread() {
        return {
            x: randomRange(-this.spread, this.spread),
            y: randomRange(-this.spread, this.spread),
            z: randomRange(-this.spread, this.spread),
        };
    }
}

export const WEAPON_DEFINITIONS = Object.freeze({
    ASSAULT_RIFLE: {
        name: 'Assault Rifle',
        type: WeaponType.HITSCAN,
        damage: 12,
        fireRate: 0.1,
        magSize: 30,
        maxAmmo: 120,
        reloadTime: 1.5,
        bulletSpeed: 0,
        range: 80,
        spread: 0.03,
        recoil: 0.015,
        pellets: 1,
        headshotMultiplier: 2,
        bulletSize: 0.02,
        automatic: true,
        description: 'Balanced all-around rifle.',
    },
    SHOTGUN: {
        name: 'Shotgun',
        type: WeaponType.HITSCAN,
        damage: 8,
        fireRate: 0.6,
        magSize: 8,
        maxAmmo: 32,
        reloadTime: 2.0,
        bulletSpeed: 0,
        range: 30,
        spread: 0.15,
        recoil: 0.08,
        pellets: 8,
        headshotMultiplier: 1.5,
        bulletSize: 0.03,
        automatic: false,
        description: 'Powerful close-range burst.',
    },
    SMG: {
        name: 'SMG',
        type: WeaponType.HITSCAN,
        damage: 8,
        fireRate: 0.06,
        magSize: 35,
        maxAmmo: 140,
        reloadTime: 1.2,
        bulletSpeed: 0,
        range: 60,
        spread: 0.05,
        recoil: 0.02,
        pellets: 1,
        headshotMultiplier: 2,
        bulletSize: 0.015,
        automatic: true,
        description: 'Fast fire rate, low damage.',
    },
    SNIPER_RIFLE: {
        name: 'Sniper Rifle',
        type: WeaponType.HITSCAN,
        damage: 80,
        fireRate: 1.2,
        magSize: 5,
        maxAmmo: 15,
        reloadTime: 2.5,
        bulletSpeed: 0,
        range: 200,
        spread: 0.002,
        recoil: 0.1,
        pellets: 1,
        headshotMultiplier: 2,
        bulletSize: 0.01,
        automatic: false,
        description: 'High damage, slow fire rate.',
    },
    RAILGUN: {
        name: 'Railgun',
        type: WeaponType.HITSCAN,
        damage: 100,
        fireRate: 1.5,
        magSize: 1,
        maxAmmo: 5,
        reloadTime: 3.0,
        bulletSpeed: 0,
        range: 300,
        spread: 0.001,
        recoil: 0.15,
        pellets: 1,
        headshotMultiplier: 2,
        bulletSize: 0.05,
        automatic: false,
        description: 'One-shot kill, long reload.',
    },
    ROCKET_LAUNCHER: {
        name: 'Rocket Launcher',
        type: WeaponType.PROJECTILE,
        damage: 80,
        fireRate: 1.0,
        magSize: 1,
        maxAmmo: 5,
        reloadTime: 2.5,
        bulletSpeed: 25,
        range: 60,
        spread: 0.01,
        recoil: 0.1,
        pellets: 1,
        headshotMultiplier: 1,
        bulletSize: 0.3,
        automatic: false,
        description: 'Slow projectile, area damage.',
    },
});
