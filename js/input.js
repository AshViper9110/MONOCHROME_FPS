export class InputManager {
    constructor() {
        this.keys = {};
        this.keysDown = {};
        this.keysUp = {};
        this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
        this.mouseButtonsDown = {};
        this.mouseButtonsUp = {};
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
        this.isPointerLocked = false;
        this._pointerLockCallbacks = [];

        this._setupListeners();
    }

    _setupListeners() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('contextmenu', this._onContextMenu);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
    }

    _onKeyDown(e) {
        if (!this.keys[e.code]) {
            this.keysDown[e.code] = true;
        }
        this.keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
        this.keysUp[e.code] = true;
    }

    _onMouseMove(e) {
        if (this.isPointerLocked) {
            this.mouse.dx += e.movementX;
            this.mouse.dy += e.movementY;
        }
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    _onMouseDown(e) {
        this.mouse.buttons[e.button] = true;
        this.mouseButtonsDown[e.button] = true;
        if (this.isPointerLocked) {
            e.preventDefault();
        }
    }

    _onMouseUp(e) {
        this.mouse.buttons[e.button] = false;
        this.mouseButtonsUp[e.button] = true;
    }

    _onContextMenu(e) {
        if (this.isPointerLocked) {
            e.preventDefault();
        }
    }

    _onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement !== null;
        if (this.isPointerLocked) {
            this._pointerLockCallbacks.forEach(cb => cb(true));
        }
    }

    onPointerLockChange(callback) {
        this._pointerLockCallbacks.push(callback);
    }

    requestPointerLock(element) {
        try {
            element.requestPointerLock();
        } catch (e) {
            console.warn('Pointer lock request failed:', e.message);
        }
    }

    exitPointerLock() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }

    isKeyDown(code) {
        return !!this.keys[code];
    }

    wasKeyPressed(code) {
        return !!this.keysDown[code];
    }

    wasKeyReleased(code) {
        return !!this.keysUp[code];
    }

    isMouseDown(button = 0) {
        return !!this.mouse.buttons[button];
    }

    wasMousePressed(button = 0) {
        return !!this.mouseButtonsDown[button];
    }

    wasMouseReleased(button = 0) {
        return !!this.mouseButtonsUp[button];
    }

    getMouseDelta() {
        const dx = this.mouse.dx;
        const dy = this.mouse.dy;
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        return { dx, dy };
    }

    endFrame() {
        this.keysDown = {};
        this.keysUp = {};
        this.mouseButtonsDown = {};
        this.mouseButtonsUp = {};
    }
}
