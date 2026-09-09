import { toWord16 } from "p3-core";

const BUTTON_COUNT = 15;
const SOURCE_COUNT = 16;
const TIMER_SOURCE = 15;

export class InterruptController {
    private mask = 0;
    private pending = 0;
    private readonly buttonVectors = new Uint8Array(BUTTON_COUNT);

    public constructor() {
        for (let button = 0; button < BUTTON_COUNT; button += 1) {
            this.buttonVectors[button] = button;
        }
    }

    public readMask(): number {
        return this.mask;
    }

    public writeMask(value: number): void {
        this.mask = toWord16(value);
    }

    public readButtonVector(button: number): number {
        this.validateButton(button);
        return this.buttonVectors[button]!;
    }

    public writeButtonVector(button: number, vector: number): void {
        this.validateButton(button);

        if (!Number.isInteger(vector) || vector < 0 || vector > 0xff) {
            throw new Error(`Vector de interrupção inválido: ${vector}`);
        }

        this.buttonVectors[button] = vector;
    }

    public requestTimer(): void {
        this.pending |= 1 << TIMER_SOURCE;
    }

    public toggleButton(button: number): void {
        this.validateButton(button);
        this.pending ^= 1 << button;
    }

    public requestInterrupt(source: number): void {
        this.validateSource(source);
        this.pending = toWord16(this.pending | (1 << source));
    }

    public toggleInterruptRequest(source: number): void {
        this.validateSource(source);
        this.pending = toWord16(this.pending ^ (1 << source));
    }

    public pendingInterrupt(): boolean {
        return this.pending !== 0;
    }

    public getPendingSources(): number {
        return this.pending;
    }

    public takeInterruptVector(): number | undefined {
        const enabledPending = this.pending & this.mask;

        for (let source = 0; source < SOURCE_COUNT; source += 1) {
            const sourceBit = 1 << source;

            if ((enabledPending & sourceBit) === 0) {
                continue;
            }

            this.pending = toWord16(this.pending & ~sourceBit);
            return source === TIMER_SOURCE ? TIMER_SOURCE : this.buttonVectors[source]!;
        }

        return undefined;
    }

    public reset(): void {
        this.mask = 0;
        this.pending = 0;
    }

    private validateButton(button: number): void {
        if (!Number.isInteger(button) || button < 0 || button >= BUTTON_COUNT) {
            throw new Error(`Botão de interrupção inválido: ${button}`);
        }
    }

    private validateSource(source: number): void {
        if (!Number.isInteger(source) || source < 0 || source >= SOURCE_COUNT) {
            throw new Error(`Fonte de interrupção inválida: ${source}`);
        }
    }
}
