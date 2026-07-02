const CODE_LENGTH = 4;
const CODE_MIN = 1000;
const CODE_MAX = 9999;
const CODE_PREFIX = 'mono-';

export class RoomCodeManager {
    constructor() {
        this._codeMap = new Map();
        this._currentCode = null;
        this._currentPeerId = null;
    }

    generateCode() {
        let code;
        do {
            code = Math.floor(CODE_MIN + Math.random() * (CODE_MAX - CODE_MIN + 1)).toString();
        } while (this._codeMap.has(code));
        this._currentCode = code;
        this._currentPeerId = `${CODE_PREFIX}${code}`;
        this._codeMap.set(code, this._currentPeerId);
        return code;
    }

    getPeerId(code) {
        if (this._codeMap.has(code)) {
            return this._codeMap.get(code);
        }
        return `${CODE_PREFIX}${code}`;
    }

    getCode(peerId) {
        if (peerId && peerId.startsWith(CODE_PREFIX)) {
            return peerId.slice(CODE_PREFIX.length);
        }
        for (const [code, id] of this._codeMap) {
            if (id === peerId) return code;
        }
        return null;
    }

    getCurrentCode() {
        return this._currentCode;
    }

    getCurrentPeerId() {
        return this._currentPeerId;
    }

    remove(code) {
        const peerId = this._codeMap.get(code);
        if (peerId) {
            this._codeMap.delete(code);
        }
        if (this._currentCode === code) {
            this._currentCode = null;
            this._currentPeerId = null;
        }
    }

    clear() {
        this._codeMap.clear();
        this._currentCode = null;
        this._currentPeerId = null;
    }
}
