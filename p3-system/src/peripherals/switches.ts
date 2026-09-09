import type { SwitchSnapshot } from "./types";

const SWITCH_COUNT = 8;

export class SwitchDevice {
    private value = 0;

    public reset(): void {
        this.value = 0;
    }

    public readData(): number {
        return this.value;
    }

    public setSwitch(switchIndex: number, isUp: boolean): void {
        if (!Number.isInteger(switchIndex) || switchIndex < 0 || switchIndex >= SWITCH_COUNT) {
            throw new Error(`Interruptor inválido: ${switchIndex}`);
        }

        const bit = 1 << switchIndex;

        if (isUp) {
            this.value |= bit;
            return;
        }

        this.value &= ~bit;
    }

    public captureSnapshot(): SwitchSnapshot {
        return {value: this.value};
    }
}
