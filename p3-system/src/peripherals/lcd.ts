import type { LCDSnapshot } from "./types";

export class LCDDevice {
    private on = false;
    private cursor = 0;
    private readonly characters = new Uint8Array(32);

    public captureSnapshot(): LCDSnapshot {
        const row = this.cursor < 16 ? 0 : 1;
        const column = this.cursor % 16;
        const characters = Array.from(this.characters);
        return {on: this.on, row, column, characters};
    }

    public reset(): void {
        this.on = false;
        this.cursor = 0;
        this.characters.fill(0x20);
    }

    public writeCharacter(value: number): void {
        this.characters[this.cursor] = value & 0x00ff;
    }

    public writeControl(value: number): void {
        if ((value & 0x0020) !== 0) this.characters.fill(0x20);
        if ((value & 0x8000) !== 0) this.on = !this.on;
        this.cursor = value & 0x001f;
    }
}
