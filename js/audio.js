import { TWO_PI } from './util.js';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.gainNode = null;
        this._initialized = false;
        this._enabled = true;
    }

    init() {
        if (this._initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.ctx.createGain();
            this.gainNode.connect(this.ctx.destination);
            this.gainNode.gain.value = 0.3;
            this._initialized = true;
        } catch (e) {
            console.warn('Audio not available:', e);
            this._enabled = false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setVolume(v) {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, v));
        }
    }

    loadSound(name, frequencies, duration = 0.15) {
        if (!this._enabled) return;
        if (!this._initialized) this.init();
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            let sample = 0;
            for (const f of frequencies) {
                const freq = typeof f === 'object' ? f.freq : f;
                const amp = typeof f === 'object' ? (f.amp || 1) : 1;
                const phase = typeof f === 'object' ? (f.phase || 0) : 0;
                sample += Math.sin(TWO_PI * freq * t + phase) * amp;
            }
            const envelope = Math.exp(-t * 8 / duration);
            data[i] = sample * envelope * 0.3;
        }
        this.buffers[name] = buffer;
    }

    loadNoiseSound(name, duration = 0.1) {
        if (!this._enabled) return;
        if (!this._initialized) this.init();
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6 / duration) * 0.3;
        }
        this.buffers[name] = buffer;
    }

    play(name, volume = 1, rate = 1) {
        if (!this._enabled || !this.ctx || !this.buffers[name]) return;
        this.resume();
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.playbackRate.value = rate;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(this.gainNode);
        source.start(0);
    }

    loadAll() {
        this.loadSound('pistol_fire', [{ freq: 800, amp: 1 }, { freq: 400, amp: 0.5 }], 0.1);
        this.loadSound('rifle_fire', [{ freq: 600, amp: 1 }, { freq: 300, amp: 0.3 }], 0.12);
        this.loadSound('shotgun_fire', [{ freq: 150, amp: 1 }, { freq: 80, amp: 0.5 }], 0.2);
        this.loadSound('smg_fire', [{ freq: 700, amp: 0.8 }, { freq: 350, amp: 0.3 }], 0.08);
        this.loadSound('sniper_fire', [{ freq: 1000, amp: 1 }, { freq: 200, amp: 0.5 }], 0.15);
        this.loadSound('railgun_fire', [{ freq: 1200, amp: 1 }, { freq: 600, amp: 0.5 }], 0.18);
        this.loadSound('rocket_fire', [{ freq: 200, amp: 1 }, { freq: 100, amp: 0.5 }], 0.25);
        this.loadSound('hit', [{ freq: 500, amp: 0.8 }], 0.05);
        this.loadSound('kill', [{ freq: 800, amp: 1 }, { freq: 1200, amp: 0.8 }], 0.3);
        this.loadNoiseSound('reload', 0.2);
        this.loadSound('jump', [{ freq: 400, amp: 0.5 }, { freq: 600, amp: 0.3 }], 0.1);
        this.loadSound('wallrun', [{ freq: 300, amp: 0.3 }], 0.05);
        this.loadSound('victory', [
            { freq: 523, amp: 1, phase: 0 },
            { freq: 659, amp: 1, phase: 0.2 },
            { freq: 784, amp: 1, phase: 0.4 },
        ], 0.5);
        this.loadSound('death', [{ freq: 200, amp: 0.8 }, { freq: 100, amp: 0.5 }], 0.4);
    }
}
