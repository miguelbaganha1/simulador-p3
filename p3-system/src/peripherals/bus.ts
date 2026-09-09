import { LCDDevice } from "./lcd";
import { LEDDevice } from "./led";
import { toWord16, type IoBus } from "p3-core";
import type { IoPortSnapshot, IoSnapshot, PeripheralsSnapshot } from "./types";
import { InterruptController } from "./interrupt-controller";
import { SwitchDevice } from "./switches";
import { DisplayDevice } from "./display";
import { TextWindowDevice } from "./text-window";
import { TimerDevice, type TimerSnapshot } from "./timer";

const TIMER_DISPLAY_STEP = 5;
export const PERIPHERALS_REFRESH_INTERVAL_MS = TIMER_DISPLAY_STEP * 100;

type IoPort = {
    peek?: (timer: TimerSnapshot) => number;
    read?: () => number;
    write?: (value: number) => void;
};

export class PeripheralBus implements IoBus {
    private readonly lcd = new LCDDevice();
    private readonly led = new LEDDevice();
    private readonly interruptController = new InterruptController();
    private readonly timer = new TimerDevice(() => {
        this.interruptController.requestTimer();
    });
    private readonly switches = new SwitchDevice();
    private readonly display = new DisplayDevice();
    private readonly textWindow = new TextWindowDevice();
    private lastWrites: Partial<Record<number, number>> = {};
    private timerDisplayCount = 0;

    private readonly ports: Record<number, IoPort> = {
        0xFFF0: { write: value => this.display.writeDigit(0, value) },
        0xFFF1: { write: value => this.display.writeDigit(1, value) },
        0xFFF2: { write: value => this.display.writeDigit(2, value) },
        0xFFF3: { write: value => this.display.writeDigit(3, value) },
        0xFFF4: { write: value => this.lcd.writeControl(value) },
        0xFFF5: { write: value => this.lcd.writeCharacter(value) },
        0xFFF6: {
            peek: timer => this.captureTimerCount(timer),
            read: () => this.timer.readCount(),
            write: value => {
                this.timer.writeCount(value);
                this.timerDisplayCount = this.timer.readCount();
            },
        },
        0xFFF7: {
            read: () => this.timer.readControl(),
            peek: timer => timer.running ? 1 : 0,
            write: value => {
                this.timer.writeControl(value);
                this.timerDisplayCount = this.timer.readCount();
            },
        },
        0xFFF8: { write: value => this.led.writeData(value) },
        0xFFF9: { read: () => this.switches.readData() },
        0xFFFA: {
            read: () => this.interruptController.readMask(),
            write: value => this.interruptController.writeMask(value),
        },
        0xFFFC: { write: value => this.textWindow.writeControl(value) },
        0xFFFD: { read: () => this.textWindow.readStatus() },
        0xFFFE: { write: value => this.textWindow.writeCharacter(value) },
        0xFFFF: {
            peek: () => this.textWindow.peekCharacter(),
            read: () => this.textWindow.readCharacter(),
        },
    };

    public read(address: number): number {
        return this.ports[address]?.read?.() ?? 0xFFFF;
    }

    public write(address: number, value: number): void {
        const port = this.ports[address];
        if (port?.write === undefined) return;

        const word = toWord16(value);
        port.write(word);
        if (port.read === undefined) this.lastWrites[address] = word;
    }

    public pendingInterrupt(): boolean {
        this.timer.synchronize();
        return this.interruptController.pendingInterrupt();
    }

    public getInterrupt(): number | undefined {
        this.timer.synchronize();
        return this.interruptController.takeInterruptVector();
    }

    public toggleInterruptButton(button: number): void {
        this.interruptController.toggleButton(button);
    }

    public setSwitch(switchIndex: number, isUp: boolean): void {
        this.switches.setSwitch(switchIndex, isUp);
    }

    public toggleVirtualTextCharacter(value: number): void {
        this.textWindow.toggleVirtualCharacter(value);
    }

    public resetOperationalState(): void {
        this.lcd.reset();
        this.led.reset();
        this.timer.reset();
        this.interruptController.reset();
        this.display.reset();
        this.textWindow.reset();
        this.lastWrites = {};
        this.timerDisplayCount = 0;
    }

    public resetSwitches(): void {
        this.switches.reset();
    }

    public captureSnapshot(): PeripheralsSnapshot {
        const timer = this.timer.captureSnapshot();
        const io = this.captureIo(timer);

        return {lcd: this.lcd.captureSnapshot(), led: this.led.captureSnapshot(), display: this.display.captureSnapshot(), textWindow: this.textWindow.captureSnapshot(), switches: this.switches.captureSnapshot(), pendingInterruptSources: this.interruptController.getPendingSources(), io, timerRunning: timer.running};
    }

    private captureIo(timer: TimerSnapshot): IoSnapshot {
        const io: Partial<Record<number, IoPortSnapshot>> = {};
        const ports = Object.entries(this.ports);
        for (const [address, port] of ports) {
            const portAddress = Number(address);
            let value = port.peek?.(timer);
            if (value === undefined || value === null) {
                value = port.read?.();
            }
            if (value === undefined || value === null) {
                value = this.lastWrites[portAddress];
            }

            io[portAddress] = {value};
        }
        return io;
    }

    private captureTimerCount({ count, running }: TimerSnapshot): number {
        if (!running) {
            this.timerDisplayCount = count;
        } else {
            const steps = Math.floor((this.timerDisplayCount - count) / TIMER_DISPLAY_STEP);
            this.timerDisplayCount -= steps * TIMER_DISPLAY_STEP;
        }
        return this.timerDisplayCount;
    }

    public reset(): void { this.resetOperationalState(); }
    public resetUserInputs(): void { this.resetSwitches(); }
    public getSnapshot(): PeripheralsSnapshot { return this.captureSnapshot(); }

}
