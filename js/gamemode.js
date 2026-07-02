import { Vec3 } from './util.js';

const SETS_TO_WIN = 3;
const RESPAWN_DELAY = 2;
const SET_START_DELAY = 3;

export const GamePhase = Object.freeze({
    TITLE: 'title',
    NAME_INPUT: 'nameInput',
    LOBBY: 'lobby',
    WEAPON_SELECT: 'weaponSelect',
    SET_TRANSITION: 'setTransition',
    FIGHTING: 'fighting',
    SET_END: 'setEnd',
    MATCH_END: 'matchEnd',
});

export class GameMode {
    constructor() {
        this.phase = GamePhase.TITLE;
        this.currentSet = 0;
        this.setsWon = [0, 0];
        this.playerIdOrder = [];
        this.winner = null;
        this.setWinner = null;
        this._setTimer = 0;
        this._respawnTimer = 0;
        this._matchEvents = [];
        this._killFeed = [];
    }

    startMatch(playerIds) {
        this.playerIdOrder = playerIds;
        this.currentSet = 0;
        this.setsWon = [0, 0];
        this.winner = null;
        this.setWinner = null;
        this._matchEvents = [];
        this._killFeed = [];
        this.phase = GamePhase.WEAPON_SELECT;
    }

    startSet() {
        this.phase = GamePhase.SET_TRANSITION;
        this._setTimer = SET_START_DELAY;
        this.setWinner = null;
    }

    update(dt, players) {
        switch (this.phase) {
            case GamePhase.SET_TRANSITION:
                this._updateSetTransition(dt);
                break;
            case GamePhase.FIGHTING:
                this._updateFighting(dt, players);
                break;
            case GamePhase.SET_END:
                this._updateSetEnd(dt);
                break;
        }
    }

    _updateSetTransition(dt) {
        this._setTimer -= dt;
        if (this._setTimer <= 0) {
            this.phase = GamePhase.FIGHTING;
        }
    }

    _updateFighting(dt, players) {
        const alivePlayers = players.filter(p => !p.isDead);

        if (alivePlayers.length <= 1 && players.length >= 2) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
            if (winner) {
                this._endSet(winner);
            } else if (players.every(p => p.isDead)) {
                this._endSet(null);
            }
        }
    }

    _updateSetEnd(dt) {
        this._respawnTimer -= dt;
        if (this._respawnTimer <= 0) {
            this.currentSet++;
            if (this.setsWon[0] >= SETS_TO_WIN || this.setsWon[1] >= SETS_TO_WIN) {
                this._endMatch();
            } else {
                this.phase = GamePhase.SET_TRANSITION;
                this._setTimer = SET_START_DELAY;
            }
        }
    }

    _endSet(winner) {
        this.phase = GamePhase.SET_END;
        this._respawnTimer = RESPAWN_DELAY;
        this.setWinner = winner;

        if (winner) {
            const winnerIdx = this.playerIdOrder.indexOf(winner.id);
            if (winnerIdx >= 0) {
                this.setsWon[winnerIdx]++;
                winner.setsWon = this.setsWon[winnerIdx];
            }
        }

        this._matchEvents.push({
            type: 'set_end',
            setNumber: this.currentSet,
            winner: winner ? winner.id : null,
        });
    }

    _endMatch() {
        this.phase = GamePhase.MATCH_END;
        this.winner = this.setsWon[0] >= SETS_TO_WIN ? this.playerIdOrder[0] : this.playerIdOrder[1];

        this._matchEvents.push({
            type: 'match_end',
            winner: this.winner,
        });
    }

    onPlayerDeath(victim, killer, weaponName) {
        this._killFeed.unshift({
            killer: killer || 'World',
            victim: victim || 'Someone',
            weapon: weaponName || 'Unknown',
            time: Date.now(),
        });

        if (this._killFeed.length > 20) {
            this._killFeed.pop();
        }

        this._matchEvents.push({
            type: 'kill',
            killer: killer ? killer.id : null,
            victim: victim ? victim.id : null,
            weapon: weaponName,
        });
    }

    getKillFeed() {
        return this._killFeed;
    }

    isMatchOver() {
        return this.phase === GamePhase.MATCH_END;
    }

    isSetOver() {
        return this.phase === GamePhase.SET_END || this.phase === GamePhase.SET_TRANSITION;
    }

    getWinnerId() {
        return this.winner;
    }

    getPhase() {
        return this.phase;
    }

    reset() {
        this.phase = GamePhase.TITLE;
        this.currentSet = 0;
        this.setsWon = [0, 0];
        this.playerIdOrder = [];
        this.winner = null;
        this.setWinner = null;
        this._matchEvents = [];
        this._killFeed = [];
    }
}
