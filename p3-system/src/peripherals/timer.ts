import { toWord16 } from "p3-core";

const COUNT_UNIT_MS = 100;

export type TimerSnapshot = { count: number; running: boolean; };

export class TimerDevice {
    private count = 0;
    private lastUpdateMs: number | undefined;

    public constructor(private readonly onFinished: () => void, private readonly now: () => number = Date.now) { }

    public synchronize(): void {
        if (this.lastUpdateMs === undefined) {
            return;
        }

        const currentMs = this.now();
        const elapsedMs = currentMs - this.lastUpdateMs;
        const elapsedUnits = Math.floor(elapsedMs / COUNT_UNIT_MS);

        if (elapsedUnits < 1) {
            return;
        }

        this.lastUpdateMs += elapsedUnits * COUNT_UNIT_MS;

        if (elapsedUnits < this.count) {
            this.count -= elapsedUnits;
            return;
        }

        this.count = 0;
        this.lastUpdateMs = undefined;
        this.onFinished();
    }

    public readCount(): number {
        this.synchronize();
        return this.count;
    }

    public writeCount(value: number): void {
        this.synchronize();
        this.count = toWord16(value);

        if (this.count === 0) {
            this.lastUpdateMs = undefined;
            return;
        }

        if (this.lastUpdateMs !== undefined) {
            this.lastUpdateMs = this.now();
        }
    }

    public readControl(): number {
        this.synchronize();
        return this.lastUpdateMs === undefined ? 0 : 1;
    }

    public captureSnapshot(): TimerSnapshot {
        this.synchronize();
        return {count: this.count, running: this.lastUpdateMs !== undefined};
    }

    public writeControl(value: number): void {
        this.synchronize();

        if ((value & 1) === 0 || this.count === 0) {
            this.lastUpdateMs = undefined;
            return;
        }

        this.lastUpdateMs = this.now();
    }

    public reset(): void {
        this.count = 0;
        this.lastUpdateMs = undefined;
    }
}
