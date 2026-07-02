import { Vec3 } from './util.js';
import { Collider } from './collision.js';

export class MapData {
    constructor() {
        this.colliders = [];
        this.spawnPoints = [];
        this.wallRunSurfaces = [];
        this.bounds = { min: new Vec3(-50, 0, -50), max: new Vec3(50, 30, 50) };
    }

    build() {
        this._buildArena();
        this._buildPlatforms();
        this._buildWalls();
        this._buildPillars();
        this._setSpawnPoints();
        return this.colliders;
    }

    _buildArena() {
        const floor = new Collider(
            new Vec3(-50, 0, -50),
            new Vec3(100, 1, 100),
            false
        );
        this.colliders.push(floor);

        const ceiling = new Collider(
            new Vec3(-50, 20, -50),
            new Vec3(100, 1, 100),
            false
        );
        this.colliders.push(ceiling);

        const wallNorth = new Collider(
            new Vec3(-50, 0, -51),
            new Vec3(100, 20, 1),
            true
        );
        this.colliders.push(wallNorth);

        const wallSouth = new Collider(
            new Vec3(-50, 0, 50),
            new Vec3(100, 20, 1),
            true
        );
        this.colliders.push(wallSouth);

        const wallWest = new Collider(
            new Vec3(-51, 0, -50),
            new Vec3(1, 20, 100),
            true
        );
        this.colliders.push(wallWest);

        const wallEast = new Collider(
            new Vec3(50, 0, -50),
            new Vec3(1, 20, 100),
            true
        );
        this.colliders.push(wallEast);
    }

    _buildPlatforms() {
        const plat1 = new Collider(
            new Vec3(-20, 4, -20),
            new Vec3(10, 0.5, 10),
            false
        );
        this.colliders.push(plat1);

        const plat2 = new Collider(
            new Vec3(15, 6, -15),
            new Vec3(8, 0.5, 8),
            false
        );
        this.colliders.push(plat2);

        const plat3 = new Collider(
            new Vec3(-10, 8, 20),
            new Vec3(12, 0.5, 6),
            false
        );
        this.colliders.push(plat3);

        const plat4 = new Collider(
            new Vec3(25, 10, 20),
            new Vec3(6, 0.5, 6),
            false
        );
        this.colliders.push(plat4);

        const plat5 = new Collider(
            new Vec3(-30, 12, 30),
            new Vec3(8, 0.5, 8),
            false
        );
        this.colliders.push(plat5);

        const centerPlat = new Collider(
            new Vec3(-5, 3, -5),
            new Vec3(10, 0.5, 10),
            false
        );
        this.colliders.push(centerPlat);

        const highPlat = new Collider(
            new Vec3(-8, 14, -8),
            new Vec3(6, 0.5, 6),
            false
        );
        this.colliders.push(highPlat);
    }

    _buildWalls() {
        const innerWall1 = new Collider(
            new Vec3(-10, 0, 0),
            new Vec3(1, 8, 15),
            true
        );
        this.colliders.push(innerWall1);

        const innerWall2 = new Collider(
            new Vec3(10, 0, -10),
            new Vec3(1, 6, 12),
            true
        );
        this.colliders.push(innerWall2);

        const innerWall3 = new Collider(
            new Vec3(0, 0, 15),
            new Vec3(10, 5, 1),
            true
        );
        this.colliders.push(innerWall3);

        const innerWall4 = new Collider(
            new Vec3(-25, 0, -25),
            new Vec3(1, 10, 10),
            true
        );
        this.colliders.push(innerWall4);

        const innerWall5 = new Collider(
            new Vec3(30, 0, -30),
            new Vec3(1, 7, 8),
            true
        );
        this.colliders.push(innerWall5);

        const innerWall6 = new Collider(
            new Vec3(-30, 0, 25),
            new Vec3(8, 6, 1),
            true
        );
        this.colliders.push(innerWall6);
    }

    _buildPillars() {
        const pillarPositions = [
            [-15, -15], [15, -15], [-15, 15], [15, 15],
            [-35, -35], [35, -35], [-35, 35], [35, 35],
            [0, -30], [0, 30], [-40, 0], [40, 0]
        ];

        for (const [x, z] of pillarPositions) {
            const pillar = new Collider(
                new Vec3(x - 1, 0, z - 1),
                new Vec3(2, 12, 2),
                true
            );
            this.colliders.push(pillar);
        }

        const shortPillarPositions = [
            [-20, 20], [20, -20], [-5, 25], [25, 5]
        ];

        for (const [x, z] of shortPillarPositions) {
            const pillar = new Collider(
                new Vec3(x - 0.5, 0, z - 0.5),
                new Vec3(1, 5, 1),
                true
            );
            this.colliders.push(pillar);
        }
    }

    _setSpawnPoints() {
        this.spawnPoints = [
            { position: new Vec3(-45, 1, -45), yaw: 0.8 },
            { position: new Vec3(45, 1, 45), yaw: -2.3 },
            { position: new Vec3(-45, 1, 45), yaw: -0.8 },
            { position: new Vec3(45, 1, -45), yaw: 2.3 },
            { position: new Vec3(-40, 1, 0), yaw: 0 },
            { position: new Vec3(40, 1, 0), yaw: Math.PI },
        ];
    }

    getSpawnPoint(index) {
        const sp = this.spawnPoints[index % this.spawnPoints.length];
        return {
            position: sp.position.clone(),
            yaw: sp.yaw
        };
    }

    getWallRunSurfaces() {
        return this.colliders.filter(c => c.walkable);
    }
}
