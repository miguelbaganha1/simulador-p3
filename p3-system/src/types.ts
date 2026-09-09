import type { InstructionEffects, P3State } from "p3-core";

export type ProgramSegment = {
    origin: number;
    words: readonly number[];
};

export type AssembledProgram = {
    entryPoint: number;
    segments: readonly ProgramSegment[];
};

export type AssemblyListRow = {
    sourceLine: number;
    address: number;
    words: readonly number[];
    label?: string;
    operation: string;
    argumentText: string;
};

export type AssemblyResult = {
    program: AssembledProgram;
    list: readonly AssemblyListRow[];
};

export type LoadedSegment = {
    origin: number;
    wordCount: number;
    endExclusive: number;
};

export type LoadedProgram = {
    state: P3State;
    entryPoint: number;
    segments: readonly LoadedSegment[];
};

export type LoadProgramOptions = {
    initialSp?: number;
};

export type StopReason =
    | "end-of-memory"
    | "breakpoint"
    | "halted"
    | "max-steps"
    | "paused";

export type ProcessStepEvent =
    | {
        state: P3State;
        didProcess: true;
        effects: InstructionEffects;
        stopReason?: never;
    }
    | {
        state: P3State;
        didProcess: false;
        stopReason: StopReason;
        effects?: never;
    };

export type RunProgramOptions = {
    maxSteps?: number;
};

export type RunProgramResult = {
    state: P3State;
    steps: number;
    stopReason: StopReason;
};

export type P3Assembler = (sourceCode: string) => AssemblyResult;

export type P3SystemOptions = {
    assembler?: P3Assembler;
    initialSp?: number;
};

export type ProcessOptions = {
    breakpoints?: ReadonlySet<number>;
    maxSteps?: number;
    onStep?: (event: ProcessStepEvent) => void;
    shouldPause?: () => boolean;
    skipInitialBreakpoint?: boolean;
    yieldControl?: () => Promise<void>;
};

export type ProcessResult = RunProgramResult & {
    assembledProgram: AssembledProgram | undefined;
    loadedProgram: LoadedProgram | undefined;
};

export type ExecutionOptions = {
    breakpoints?: ReadonlySet<number>;
    maxSteps?: number;
    onStep?: () => void;
    yieldControl: (signal: AbortSignal) => Promise<void>;
};
