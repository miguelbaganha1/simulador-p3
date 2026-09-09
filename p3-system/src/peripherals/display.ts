import type { DisplaySnapshot } from "./types";

export class DisplayDevice {
    private readonly digits = new Uint8Array(4);


    public writeDigit(index: number, value: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= 4) {
            throw new Error(`Ìndice inválido: ${index}`);
        }
        this.digits[index] = value & 0x000F;
    }

    public reset(): void {
        this.digits.fill(0);
    }

    public captureSnapshot(): DisplaySnapshot {
        return {digits: [this.digits[0]!, this.digits[1]!, this.digits[2]!, this.digits[3]!]};
    }
}
