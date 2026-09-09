import { LEDSnapshot } from "./types";

export class LEDDevice {
    private value: number;


    public constructor() { this.value = 0; }

    public captureSnapshot(): LEDSnapshot {
        return {value: this.value};
    }

    public reset(): void {
        this.value = 0;
    }

    public writeData(value: number): void {
        this.value = value & 0xFFFF;
    }
}
