const CODE_MIN = 1000;
const CODE_MAX = 9999;
const MAX_RETRIES = 10;

export class RoomCodeManager {
    constructor() {
        this._generatedCodes = new Set();
        this._currentCode = null;
    }

    generateCode() {
        let code;
        let attempts = 0;
        do {
            code = Math.floor(CODE_MIN + Math.random() * (CODE_MAX - CODE_MIN + 1)).toString();
            attempts++;
        } while (this._generatedCodes.has(code) && attempts < MAX_RETRIES);
        this._generatedCodes.add(code);
        this._currentCode = code;
        return code;
    }

    getCurrentCode() {
        return this._currentCode;
    }

    clear() {
        this._generatedCodes.clear();
        this._currentCode = null;
    }
}
