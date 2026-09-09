import { FlagBit } from "./instruction";
import {
    IO_BASE,
    MEMORY_PAGE_COUNT,
    MEMORY_PAGE_WORD_COUNT,
    MEMORY_SIZE,
    toWord16,
} from "./word";
import { type IoBus} from "./bus";
import type { InstructionEffects } from "./effects";

export const REGISTER_COUNT = 8;
const STATUS_REGISTER_MASK = 0x001f;
export const STACK_POINTER_REGISTER = 14;
export const PROGRAM_COUNTER_REGISTER = 15;

type InstructionEffectsBuffer = {
    registers: Set<number>;
    memoryAddresses: Set<number>;
    changedFlags: Set<FlagBit>;
};

export class P3State {
    private readonly registers = new Uint16Array(REGISTER_COUNT);
    private readonly memory = new Uint16Array(MEMORY_SIZE);
    private readonly memoryPageVersions = new Uint32Array(MEMORY_PAGE_COUNT);

    public readonly bus: IoBus;

    private PC = 0;
    private SP = 0;
    private RE = 0;
    private instructionEffects: InstructionEffectsBuffer | undefined;

    public instructionCount = 0;
    public halted = false;


    public constructor(peripheralBus: IoBus) { 
        this.bus = peripheralBus;
    }

    public getPC(): number {
        return this.PC;
    }

    public setPC(value: number): void {
        this.PC = toWord16(value);
    }

    public getSP(): number {
        return this.SP;
    }

    public setSP(value: number): void {
        this.recordRegisterAccess(STACK_POINTER_REGISTER);
        this.SP = toWord16(value);
    }

    public getRE(): number {
        return this.RE;
    }

    public setRE(value: number): void {
        const next = toWord16(value) & STATUS_REGISTER_MASK;
        const changedBits = this.RE ^ next;

        for (let flag = FlagBit.O; flag <= FlagBit.E; flag++) {
            if ((changedBits & (1 << flag)) !== 0) {
                this.instructionEffects?.changedFlags.add(flag);
            }
        }

        this.RE = next;
    }


    reset(): void {
        this.registers.fill(0);
        this.memory.fill(0);
        for (let page = 0; page < MEMORY_PAGE_COUNT; page++) {
            this.markMemoryPageChanged(page);
        }
        this.PC = 0;
        this.SP = 0;
        this.RE = 0;
        this.instructionEffects = undefined;
        this.instructionCount = 0;
        this.halted = false;
    }

    private validateFlag(flag: number): void {
        if (!Number.isInteger(flag) || flag < FlagBit.O || flag > FlagBit.E) {
            throw new Error(`Flag inválida: ${flag}`);
        }
    }

    public getFlag(flag: FlagBit): boolean {
        this.validateFlag(flag);
        return ((this.RE >>> flag) & 1) === 1;
    }

    public setFlag(flag: FlagBit, value: boolean): void {
        this.validateFlag(flag);
        const mask = 1 << flag;
        let next: number;
        if (value) {
            next = this.RE | mask;
        } else {
            next = this.RE & ~mask;
        }
        this.setRE(next);
    }

    private validateRegister(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= REGISTER_COUNT) {
            throw new Error(`Índice de registo inválido: ${index}`);
        }
    }

    public readReg(index: number): number {
        this.validateRegister(index);
        this.recordRegisterAccess(index);

        if (index === 0) {
            return 0;
        }

        return this.registers[index] as number;
    }

    public writeReg(index: number, value: number): void {
        this.validateRegister(index);
        this.recordRegisterAccess(index);

        if (index === 0) {
            return;
        }

        this.registers[index] = toWord16(value);
    }

    public beginInstructionEffects(): void {
        this.instructionEffects = {registers: new Set(), memoryAddresses: new Set(), changedFlags: new Set()};
    }

    public endInstructionEffects(): InstructionEffects {
        const effects = this.instructionEffects;
        this.instructionEffects = undefined;

        if (effects === undefined) {
            return {registers: [], memoryAddresses: [], changedFlags: []};
        }

        return {registers: [...effects.registers], memoryAddresses: [...effects.memoryAddresses], changedFlags: [...effects.changedFlags]};
    }

    public cancelInstructionEffects(): void {
        this.instructionEffects = undefined;
    }

    public recordMemoryAccess(address: number): void {
        this.instructionEffects?.memoryAddresses.add(toWord16(address));
    }

    public recordRegisterAccess(index: number): void {
        this.instructionEffects?.registers.add(index);
    }

    private validateAddress(address: number): void {
        if (!Number.isInteger(address) || address < 0 || address >= MEMORY_SIZE) {
            throw new Error(`Endereço de memória inválido: ${address}`);
        }
    }

    public readData(address: number): number {
        const wordAddress = toWord16(address);
        this.recordMemoryAccess(wordAddress);
        return this.fetchWord(wordAddress);
    }

    public writeData(address: number, value: number): void {
        const wordAddress = toWord16(address);
        this.recordMemoryAccess(wordAddress);
        if (wordAddress < IO_BASE) {
            this.writeMem(wordAddress, value);
        } else {
            this.bus.write(wordAddress, toWord16(value));
        }
    }

    public fetchWord(address: number): number {
        const wordAddress = toWord16(address);
        return wordAddress < IO_BASE ? this.readMem(wordAddress) : this.bus.read(wordAddress);
    }

    public readMem(address: number): number {
        this.validateAddress(address);
        return this.memory[address] as number;
    }

    public writeMem(address: number, value: number): void {
        this.validateAddress(address);
        const word = toWord16(value);

        if (this.memory[address] === word) {
            return;
        }

        this.memory[address] = word;
        this.markMemoryPageChanged(this.getMemoryPageIndex(address));
    }

    public getMemoryPageVersion(page: number): number {
        this.validateMemoryPage(page);
        return this.memoryPageVersions[page] as number;
    }

    public copyMemoryPage(page: number): Uint16Array {
        this.validateMemoryPage(page);
        const start = page * MEMORY_PAGE_WORD_COUNT;
        return this.memory.slice(start, start + MEMORY_PAGE_WORD_COUNT);
    }

    private getMemoryPageIndex(address: number): number {
        return Math.floor(address / MEMORY_PAGE_WORD_COUNT);
    }

    private markMemoryPageChanged(page: number): void {
        this.memoryPageVersions[page] =
            (this.memoryPageVersions[page] as number) + 1;
    }

    private validateMemoryPage(page: number): void {
        if (!Number.isInteger(page) || page < 0 || page >= MEMORY_PAGE_COUNT) {
            throw new Error(`Página de memória inválida: ${page}`);
        }
    }
}
