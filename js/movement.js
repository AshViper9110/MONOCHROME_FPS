import { Vec3, GRAVITY } from './util.js';

const MOVE_SPEED = 8;
const SPRINT_MULTIPLIER = 1.6;
const AIR_MULTIPLIER = 0.7;
const ACCELERATION = 12;
const AIR_ACCELERATION = 18;
const FRICTION = 0.85;
const AIR_FRICTION = 0.95;
const JUMP_VELOCITY = 8;
const DOUBLE_JUMP_VELOCITY = 7;
const GRAVITY_SCALE = 1;
const FALL_SPEED_MAX = 30;
const SLIDE_SPEED = 12;
const SLIDE_DURATION = 0.5;
const WALLRUN_GRAVITY_MULT = 0.3;
const WALLRUN_MAX_DURATION = 1.5;
const WALLRUN_MIN_SPEED = 3;
const WALLKICK_FORCE = 6;
const WALLKICK_UP = 5;
const AIR_STRAFE_FORCE = 2;

export const MoveState = {
    IDLE: 'idle',
    WALKING: 'walking',
    SPRINTING: 'sprinting',
    JUMPING: 'jumping',
    FALLING: 'falling',
    DOUBLE_JUMPING: 'doubleJumping',
    WALLRUNNING: 'wallRunning',
    SLIDING: 'sliding',
};

export class MovementController {
    constructor(body, input) {
        this.body = body;
        this.input = input;
        this.state = MoveState.IDLE;
        this.canDoubleJump = true;
        this.wallRunTimer = 0;
        this.wallRunNormal = new Vec3();
        this.slideTimer = 0;
        this.isSliding = false;
        this.coyoteTime = 0.08;
        this._airborneTime = 0;
        this._previousOnGround = true;
        this._wallRunCooldown = 0;
    }

    reset() {
        this.state = MoveState.IDLE;
        this.canDoubleJump = true;
        this.wallRunTimer = 0;
        this.slideTimer = 0;
        this.isSliding = false;
        this._airborneTime = 0;
        this._previousOnGround = true;
    }

    update(dt) {
        const body = this.body;
        const input = this.input;
        const isGrounded = body.onGround;
        const wasGrounded = this._previousOnGround;

        if (isGrounded && !wasGrounded) {
            this.canDoubleJump = true;
            this.wallRunTimer = 0;
            this._airborneTime = 0;
        }

        if (!isGrounded) {
            this._airborneTime += dt;
        } else {
            this._airborneTime = 0;
        }

        this._wallRunCooldown = Math.max(0, this._wallRunCooldown - dt);

        if (this.isSliding) {
            this.slideTimer -= dt;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                body.size.y = 1.8;
            }
        }

        const moveDir = this._getMoveDirection();

        if (body.onWall && !isGrounded && this._wallRunCooldown <= 0) {
            const canWallRun = this._tryWallRun(dt, moveDir);
            if (canWallRun) {
                this.state = MoveState.WALLRUNNING;
                this._applyWallRunMovement(dt, moveDir);
                return;
            }
        }

        if (this.wallRunTimer > 0) {
            this.wallRunTimer = Math.max(0, this.wallRunTimer - dt * 2);
        }

        if (input.wasKeyPressed('Space')) {
            if (isGrounded || this._airborneTime < this.coyoteTime) {
                this._jump(JUMP_VELOCITY);
                this.state = MoveState.JUMPING;
            } else if (this.canDoubleJump) {
                this._jump(DOUBLE_JUMP_VELOCITY);
                this.canDoubleJump = false;
                this.state = MoveState.DOUBLE_JUMPING;
            }
        }

        if (input.wasKeyPressed('KeyC') || input.wasKeyPressed('ShiftLeft') || input.wasKeyPressed('ShiftRight')) {
            if (isGrounded && !this.isSliding && input.isKeyDown('KeyC')) {
                this._startSlide();
            }
        }

        if (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight')) {
            this._applySprintMovement(dt, moveDir);
        } else {
            this._applyNormalMovement(dt, moveDir);
        }

        this._applyGravity(dt);
        this._capFallSpeed();
        this._applyFriction(dt, isGrounded);

        if (input.isKeyDown('KeyX') && !isGrounded) {
            const flatVel = new Vec3(body.velocity.x, 0, body.velocity.z);
            if (flatVel.length() > 0.5) {
                this._applyAirStrafe(dt, moveDir);
            }
        }

        this._previousOnGround = isGrounded;
    }

    _getMoveDirection() {
        const input = this.input;
        const dir = new Vec3();

        if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) dir.z -= 1;
        if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) dir.z += 1;
        if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) dir.x -= 1;
        if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) dir.x += 1;

        if (dir.lengthSq() > 0) {
            dir.normalize();
        }

        return dir;
    }

    _tryWallRun(dt, moveDir) {
        const body = this.body;
        if (!body.onWall) return false;

        const horizontalSpeed = new Vec3(body.velocity.x, 0, body.velocity.z).length();
        if (horizontalSpeed < WALLRUN_MIN_SPEED) return false;

        const wallDot = moveDir.dot(body.wallNormal);
        if (Math.abs(wallDot) < 0.3) return false;

        if (this.wallRunTimer <= 0) {
            this.wallRunTimer = WALLRUN_MAX_DURATION;
            this.wallRunNormal.copy(body.wallNormal);
        }

        this.wallRunTimer -= dt;
        if (this.wallRunTimer <= 0) return false;

        body.gravityMultiplier = WALLRUN_GRAVITY_MULT;

        const forward = new Vec3();
        const wallNormal = body.wallNormal;
        if (Math.abs(wallNormal.x) > 0.5) {
            forward.set(0, 0, -Math.sign(moveDir.z) || 1);
        } else {
            forward.set(-Math.sign(moveDir.x) || 1, 0, 0);
        }

        const speed = horizontalSpeed;
        body.velocity.x = forward.x * speed;
        body.velocity.z = forward.z * speed;

        if (body.velocity.y < 0) {
            body.velocity.y *= 0.8;
        }

        return true;
    }

    _applyWallRunMovement(dt, moveDir) {
        const body = this.body;

        if (this.input.wasKeyPressed('Space')) {
            this._wallKick();
            return;
        }

        const speed = new Vec3(body.velocity.x, 0, body.velocity.z).length();
        const targetSpeed = MOVE_SPEED * SPRINT_MULTIPLIER;

        if (speed < targetSpeed && moveDir.lengthSq() > 0) {
            const addSpeed = targetSpeed - speed;
            if (addSpeed > 0) {
                const accel = addSpeed * ACCELERATION * dt;
                body.velocity.x += moveDir.x * accel;
                body.velocity.z += moveDir.z * accel;
            }
        }

        const flatVel = new Vec3(body.velocity.x, 0, body.velocity.z);
        if (flatVel.length() > 0) {
            flatVel.normalize();
            const currentSpeed = flatVel.length();
            body.velocity.x = flatVel.x * currentSpeed;
            body.velocity.z = flatVel.z * currentSpeed;
        }
    }

    _wallKick() {
        const body = this.body;
        const normal = body.wallNormal;

        const kickDir = new Vec3(normal.x, 0, normal.z);
        body.velocity.x = kickDir.x * WALLKICK_FORCE + normal.x * 2;
        body.velocity.y = WALLKICK_UP;
        body.velocity.z = kickDir.z * WALLKICK_FORCE + normal.z * 2;

        this.wallRunTimer = 0;
        this.canDoubleJump = true;
        this._wallRunCooldown = 0.3;
        body.gravityMultiplier = GRAVITY_SCALE;
    }

    _jump(velocity) {
        this.body.velocity.y = velocity;
        this.body.onGround = false;
    }

    _startSlide() {
        this.isSliding = true;
        this.slideTimer = SLIDE_DURATION;
        this.body.size.y = 0.9;

        const flatVel = new Vec3(this.body.velocity.x, 0, this.body.velocity.z);
        const speed = flatVel.length();
        if (speed < SLIDE_SPEED) {
            const dir = speed > 0.1 ? flatVel.normalize() : this._getMoveDirection();
            this.body.velocity.x = dir.x * SLIDE_SPEED;
            this.body.velocity.z = dir.z * SLIDE_SPEED;
        }
    }

    _applySprintMovement(dt, moveDir) {
        const body = this.body;
        const isGrounded = body.onGround;
        const targetSpeed = MOVE_SPEED * SPRINT_MULTIPLIER;
        const accel = isGrounded ? ACCELERATION : AIR_ACCELERATION;
        const mult = isGrounded ? 1 : AIR_MULTIPLIER;

        if (moveDir.lengthSq() > 0) {
            const currentSpeed = new Vec3(body.velocity.x, 0, body.velocity.z).length();
            const addSpeed = targetSpeed * mult - currentSpeed;
            if (addSpeed > 0) {
                const accelAmount = Math.min(accel * dt * mult, addSpeed);
                body.velocity.x += moveDir.x * accelAmount;
                body.velocity.z += moveDir.z * accelAmount;
            }
            this.state = MoveState.SPRINTING;
        } else {
            this.state = MoveState.IDLE;
        }
    }

    _applyNormalMovement(dt, moveDir) {
        const body = this.body;
        const isGrounded = body.onGround;
        const targetSpeed = MOVE_SPEED;
        const accel = isGrounded ? ACCELERATION : AIR_ACCELERATION;
        const mult = isGrounded ? 1 : AIR_MULTIPLIER;

        if (moveDir.lengthSq() > 0) {
            const currentSpeed = new Vec3(body.velocity.x, 0, body.velocity.z).length();
            const addSpeed = targetSpeed * mult - currentSpeed;
            if (addSpeed > 0) {
                const accelAmount = Math.min(accel * dt * mult, addSpeed);
                body.velocity.x += moveDir.x * accelAmount;
                body.velocity.z += moveDir.z * accelAmount;
            }
            this.state = MoveState.WALKING;
        } else {
            this.state = isGrounded ? MoveState.IDLE : MoveState.FALLING;
        }
    }

    _applyGravity(dt) {
        if (!this.body.onGround && !this.body.onWall) {
            this.body.velocity.y -= GRAVITY * GRAVITY_SCALE * dt;
        }
    }

    _capFallSpeed() {
        if (this.body.velocity.y < -FALL_SPEED_MAX) {
            this.body.velocity.y = -FALL_SPEED_MAX;
        }
    }

    _applyFriction(dt, isGrounded) {
        const body = this.body;
        const friction = isGrounded ? FRICTION : AIR_FRICTION;

        if (isGrounded) {
            const inputDir = this._getMoveDirection();
            if (inputDir.lengthSq() === 0) {
                body.velocity.x *= Math.pow(friction, dt * 10);
                body.velocity.z *= Math.pow(friction, dt * 10);
            }
        } else {
            body.velocity.x *= Math.pow(friction, dt * 2);
            body.velocity.z *= Math.pow(friction, dt * 2);
        }
    }

    _applyAirStrafe(dt, moveDir) {
        const body = this.body;
        if (moveDir.lengthSq() > 0) {
            const flatVel = new Vec3(body.velocity.x, 0, body.velocity.z);
            const speed = flatVel.length();
            if (speed > 0.1) {
                const forward = flatVel.clone().normalize();
                const right = new Vec3(forward.z, 0, -forward.x);

                const strafeForce = AIR_STRAFE_FORCE * dt;
                body.velocity.x += right.x * moveDir.x * strafeForce;
                body.velocity.z += right.z * moveDir.x * strafeForce;
                body.velocity.x += forward.x * moveDir.z * strafeForce;
                body.velocity.z += forward.z * moveDir.z * strafeForce;

                const newSpeed = new Vec3(body.velocity.x, 0, body.velocity.z).length();
                if (newSpeed > speed) {
                    const scale = speed / newSpeed;
                    body.velocity.x *= scale;
                    body.velocity.z *= scale;
                }
            }
        }
    }
}
