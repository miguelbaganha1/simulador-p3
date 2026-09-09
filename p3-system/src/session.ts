import { assembleSource } from "./assembler";
import type { P3Snapshot, MachineSnapshot } from "./snapshot";
import {
    AddressingMode,
    decodeInstruction,
    type FlagBit,
    type InstructionEffects,
    REGISTER_COUNT,
    RAM_END,
    STACK_POINTER_REGISTER,
    IO_BASE,
    Opcode,
    P3State,
    step,
    toWord16,
    WORD_MASK,
} from "p3-core";
import {
    DEFAULT_MAX_STEPS,
    getExecutionStopReason,
    validateMaxSteps,
} from "./controller";
import { loadProgram } from "./loader";
import type {
    AssemblyListRow,
    AssembledProgram,
    LoadedProgram,
    P3Assembler,
    P3SystemOptions,
    ProcessOptions,
    ProcessResult,
    ProcessStepEvent,
    StopReason,
    ExecutionOptions,
} from "./types";
import { PeripheralBus } from "./peripherals/bus";
import type { PeripheralsSnapshot } from "./peripherals/types";
import {
    captureMemorySnapshot,
    MemoryView,
    type MemorySnapshot,
} from "./memory-snapshot";


const NO_INSTRUCTION_EFFECTS: InstructionEffects = {
    registers: [],
    memoryAddresses: [],
    changedFlags: [],
};

export class P3System {
    public readonly state: P3State;
    public readonly initialSp: number;
    private readonly peripheralBus: PeripheralBus;

    private readonly assembler: P3Assembler;
    private memorySnapshot: MemorySnapshot | undefined;
    private memoryView: MemoryView | undefined;
    private activeExecution: {
        controller: AbortController;
        completion: Promise<ProcessResult>;
    } | undefined;
    private breakpointResumeAddress: number | undefined;

    private assembledProgram: AssembledProgram | undefined;
    private assemblyList: readonly AssemblyListRow[] | undefined;
    private loadedProgram: LoadedProgram | undefined;
    private stackBase: number | undefined;
    private lastInstructionEffects = NO_INSTRUCTION_EFFECTS;
    private lastExecutedPc: number | undefined;

    public constructor(options: P3SystemOptions = {}) {
        this.peripheralBus = new PeripheralBus();
        this.state = new P3State(this.peripheralBus);
        this.assembler = options.assembler ?? assembleSource;
        this.initialSp = toWord16(options.initialSp ?? RAM_END);
    }

    public get programCounter(): number { return this.state.getPC(); }

    public get isRunning(): boolean { return this.activeExecution !== undefined; }

    public get hasLoadedProgram(): boolean { return this.loadedProgram !== undefined; }

    public captureSnapshot(): P3Snapshot {
        const registers: number[] = [];
        for (let index = 0; index < REGISTER_COUNT; index++) registers.push(this.state.readReg(index));
        this.memoryView = MemoryView.capture(this.state, this.memoryView);
        const machine: MachineSnapshot = {registers, pc: this.state.getPC(), lastExecutedPc: this.lastExecutedPc, sp: this.state.getSP(), re: this.state.getRE(), instructionCount: this.state.instructionCount, halted: this.state.halted, memory: this.memoryView, stackBase: this.stackBase, lastStepEffects: {accessedRegisters: this.lastInstructionEffects.registers, accessedDataAddresses: this.lastInstructionEffects.memoryAddresses, changedFlags: this.lastInstructionEffects.changedFlags}};
        return {machine, peripherals: this.capturePeripherals()};
    }

    public capturePeripherals(): PeripheralsSnapshot {
        return this.peripheralBus.captureSnapshot();
    }

    public clearBreakpointResume(): void { this.breakpointResumeAddress = undefined; }

    public startExecution(options: ExecutionOptions): Promise<ProcessResult> {
        if (this.activeExecution !== undefined) return this.activeExecution.completion;
        const controller = new AbortController();
        const breakpoints = new Set(options.breakpoints);
        const skipInitialBreakpoint = this.breakpointResumeAddress === this.state.getPC() && breakpoints.has(this.state.getPC());
        this.clearBreakpointResume();

        const completion = Promise.resolve().then(async () => {
            try {
                const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
                const shouldPause = () => controller.signal.aborted;
                const onStep = () => options.onStep?.();
                const yieldControl = () => options.yieldControl(controller.signal);
                const runOptions = {breakpoints, maxSteps, skipInitialBreakpoint, shouldPause, onStep, yieldControl};
                const result = await this.run(runOptions);
                this.breakpointResumeAddress = result.stopReason === "breakpoint" ? this.state.getPC() : undefined;
                return result;
            } finally {
                this.activeExecution = undefined;
            }
        });
        this.activeExecution = {controller, completion};
        return completion;
    }

    public pause(): void { this.activeExecution?.controller.abort(); }

    public async stopExecution(): Promise<void> {
        const active = this.activeExecution;
        if (active === undefined) return;
        active.controller.abort();
        await active.completion.catch(() => { });
    }

    public getMemorySnapshot(): MemorySnapshot {
        this.memorySnapshot = captureMemorySnapshot(this.state, this.memorySnapshot);
        return this.memorySnapshot;
    }

    public getLastInstructionEffects(): InstructionEffects {
        return this.lastInstructionEffects;
    }

    public toggleInterruptButton(button: number): void {
        this.peripheralBus.toggleInterruptButton(button);
    }

    public setSwitch(switchIndex: number, isUp: boolean): void {
        this.peripheralBus.setSwitch(switchIndex, isUp);
    }

    public setInterruptMask(value: number): void {
        this.peripheralBus.write(0xFFFA, validateWord("Valor da máscara de interrupções", value));
        this.clearInstructionEffects();
    }

    public setRegister(index: number, value: number): void {
        if (index === 0) {
            throw new Error("R0 é constante e não pode ser alterado.");
        }

        this.state.writeReg(index, validateWord("Valor do registo", value));
        this.clearInstructionEffects();
    }

    public setProgramCounter(value: number): void {
        this.state.setPC(validateWord("Valor do PC", value));
        this.clearInstructionEffects();
    }

    public setStackPointer(value: number): void {
        const word = validateWord("Valor do SP", value);

        this.state.setSP(word);
        this.stackBase = word;
        this.clearInstructionEffects();
    }

    public setFlag(flag: FlagBit, value: boolean): void {
        this.state.setFlag(flag, value);
        this.clearInstructionEffects();
    }

    public setMemoryWord(address: number, value: number): void {
        if (!Number.isInteger(address) || address < 0 || address >= IO_BASE) {
            throw new Error(`Endereço de memória editável inválido: ${address}`);
        }

        this.state.writeMem(address, validateWord("Valor da memória", value));
        this.clearInstructionEffects();
    }

    public toggleVirtualTextCharacter(value: number): void {
        this.peripheralBus.toggleVirtualTextCharacter(value);
    }

    public loadSource(sourceCode: string): LoadedProgram {
        const assembled = this.assembler(sourceCode);
        const loadedProgram = loadProgram(this.state, assembled.program, {initialSp: this.initialSp});

        this.peripheralBus.resetOperationalState();

        this.clearBreakpointResume();
        this.assembledProgram = assembled.program;
        this.assemblyList = assembled.list;
        this.loadedProgram = loadedProgram;
        this.stackBase = this.initialSp;
        this.clearInstructionEffects();

        return loadedProgram;
    }

    public async run(options: ProcessOptions = {}): Promise<ProcessResult> {
        const maxSteps = validateMaxSteps(options.maxSteps ?? DEFAULT_MAX_STEPS);
        let steps = 0;
        let skipBreakpoint = options.skipInitialBreakpoint === true;

        while (true) {
            const stopReason = this.getStopReason(steps, maxSteps, options, skipBreakpoint);

            if (stopReason !== undefined) {
                return this.makeProcessResult(steps, stopReason);
            }

            skipBreakpoint = false;
            const effects = this.stepState();
            const event: ProcessStepEvent = {state: this.state, didProcess: true, effects};

            steps++;

            if (options.onStep !== undefined) {
                options.onStep(event);
            }

            const stopReasonAfterStep = this.getStopReason(steps, maxSteps, options, false);

            if (stopReasonAfterStep !== undefined) {
                return this.makeProcessResult(steps, stopReasonAfterStep);
            }

            if (options.yieldControl !== undefined) {
                await options.yieldControl();
            }
        }
    }

    public oneStep(): ProcessStepEvent {
        this.clearBreakpointResume();
        const stopReason = getExecutionStopReason(this.state);

        if (stopReason !== undefined) {
            return {state: this.state, didProcess: false, stopReason};
        }

        return {state: this.state, didProcess: true, effects: this.stepState()};
    }

    public async loadAndRunSource(sourceCode: string, options: ProcessOptions = {}): Promise<ProcessResult> {
        this.loadSource(sourceCode);
        return this.run(options);
    }

    public reset(): void {
        this.clearBreakpointResume();
        this.state.reset();
        this.peripheralBus.resetOperationalState();
        this.assembledProgram = undefined;
        this.assemblyList = undefined;
        this.loadedProgram = undefined;
        this.stackBase = undefined;
        this.clearInstructionEffects();
    }

    public resetAll(): void {
        this.reset();
        this.peripheralBus.resetSwitches();
    }

    public getAssemblyList(): readonly AssemblyListRow[] | undefined {
        return this.assemblyList;
    }

    public getLoadedProgram(): LoadedProgram | undefined {
        return this.loadedProgram;
    }

    private stepState(): InstructionEffects {
        const nextStackBase = detectStackBaseAssignment(this.state);

        this.clearInstructionEffects();
        const executedPc = this.state.getPC();
        const effects = step(this.state);
        this.lastExecutedPc = executedPc;
        this.lastInstructionEffects = effects;

        if (nextStackBase !== undefined) {
            this.stackBase = nextStackBase;
        }

        return effects;
    }

    private clearInstructionEffects(): void {
        this.lastInstructionEffects = NO_INSTRUCTION_EFFECTS;
        this.lastExecutedPc = undefined;
    }

    private getStopReason(steps: number, maxSteps: number, options: ProcessOptions, skipBreakpoint: boolean): StopReason | undefined {
        const stopReason = getExecutionStopReason(this.state);

        if (stopReason !== undefined) return stopReason;

        if (steps >= maxSteps) return "max-steps";

        if (options.shouldPause !== undefined && options.shouldPause()) {
            return "paused";
        }

        if (
            !skipBreakpoint && options.breakpoints?.has(this.state.getPC()) === true
        ) {
            return "breakpoint";
        }

        return undefined;
    }

    private makeProcessResult(steps: number, stopReason: StopReason): ProcessResult {
        return {state: this.state, steps, stopReason, assembledProgram: this.assembledProgram, loadedProgram: this.loadedProgram};
    }
}

function validateWord(name: string, value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > WORD_MASK) {
        throw new Error(`${name} inválido: ${value}`);
    }

    return value;
}

function detectStackBaseAssignment(state: P3State): number | undefined {
    const instruction = decodeInstruction(state.readMem(state.getPC()));

    if (
        instruction.format !== "two-op" ||
        instruction.opcode !== Opcode.MOV ||
        instruction.s !== 0 ||
        instruction.m !== AddressingMode.Register ||
        instruction.regModo !== STACK_POINTER_REGISTER
    ) {
        return undefined;
    }

    return state.readReg(instruction.regReg);
}
