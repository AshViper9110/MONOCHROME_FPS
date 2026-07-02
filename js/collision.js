import { Vec3 } from './util.js';

const CELL_SIZE = 4;

export class Collider {
    constructor(position, size, walkable = false) {
        this.position = position.clone();
        this.size = size.clone();
        this.walkable = walkable;
    }

    get center() {
        return new Vec3(
            this.position.x + this.size.x * 0.5,
            this.position.y + this.size.y * 0.5,
            this.position.z + this.size.z * 0.5
        );
    }

    overlaps(other) {
        const aMin = this.position;
        const aMax = Vec3.add(this.position, this.size);
        const bMin = other.position;
        const bMax = Vec3.add(other.position, other.size);

        return (
            aMin.x < bMax.x && aMax.x > bMin.x &&
            aMin.y < bMax.y && aMax.y > bMin.y &&
            aMin.z < bMax.z && aMax.z > bMin.z
        );
    }

    containsPoint(point) {
        return (
            point.x >= this.position.x &&
            point.x <= this.position.x + this.size.x &&
            point.y >= this.position.y &&
            point.y <= this.position.y + this.size.y &&
            point.z >= this.position.z &&
            point.z <= this.position.z + this.size.z
        );
    }

    closestPoint(point) {
        const min = this.position;
        const max = Vec3.add(this.position, this.size);
        return new Vec3(
            Math.max(min.x, Math.min(max.x, point.x)),
            Math.max(min.y, Math.min(max.y, point.y)),
            Math.max(min.z, Math.min(max.z, point.z))
        );
    }

    distanceToPoint(point) {
        return Vec3.distance(point, this.closestPoint(point));
    }
}

export class SpatialHash {
    constructor(cellSize = CELL_SIZE) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _hashKey(x, y, z) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)},${Math.floor(z / this.cellSize)}`;
    }

    insert(collider) {
        const min = collider.position;
        const max = Vec3.add(collider.position, collider.size);

        const minX = Math.floor(min.x / this.cellSize);
        const minY = Math.floor(min.y / this.cellSize);
        const minZ = Math.floor(min.z / this.cellSize);
        const maxX = Math.floor(max.x / this.cellSize);
        const maxY = Math.floor(max.y / this.cellSize);
        const maxZ = Math.floor(max.z / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${y},${z}`;
                    if (!this.cells.has(key)) {
                        this.cells.set(key, []);
                    }
                    this.cells.get(key).push(collider);
                }
            }
        }
    }

    clear() {
        this.cells.clear();
    }

    query(position, radius) {
        const results = new Set();
        const minX = Math.floor((position.x - radius) / this.cellSize);
        const minY = Math.floor((position.y - radius) / this.cellSize);
        const minZ = Math.floor((position.z - radius) / this.cellSize);
        const maxX = Math.floor((position.x + radius) / this.cellSize);
        const maxY = Math.floor((position.y + radius) / this.cellSize);
        const maxZ = Math.floor((position.z + radius) / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${y},${z}`;
                    const cell = this.cells.get(key);
                    if (cell) {
                        for (const c of cell) {
                            results.add(c);
                        }
                    }
                }
            }
        }

        return Array.from(results);
    }

    queryRay(origin, direction, maxDist) {
        const results = new Set();
        const step = direction.clone().normalize();
        const steps = Math.ceil(maxDist / this.cellSize);

        for (let i = 0; i <= steps; i++) {
            const pos = Vec3.add(origin, Vec3.scale(step, i * this.cellSize));
            const key = this._hashKey(pos.x, pos.y, pos.z);
            const cell = this.cells.get(key);
            if (cell) {
                for (const c of cell) {
                    results.add(c);
                }
            }
        }

        return Array.from(results);
    }
}
