import { IO_BASE, step, type P3State } from "p3-core";
import type {
    ProcessStepEvent,
    RunProgramOptions,
    RunProgramResult,
    StopReason,
} from "./types";

export const DEFAULT_MAX_STEPS = 10_000;

export function validateMaxSteps(value: number): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`maxSteps inválido: ${value}`);
    }

    return value;
}

export function getExecutionStopReason(state: P3State): StopReason | undefined {
    if (state.halted) return "halted";
    return state.getPC() >= IO_BASE ? "end-of-memory" : undefined;
}

export function getRunStopReason(state: P3State, steps: number, maxSteps: number): StopReason | undefined {
    const executionStopReason = getExecutionStopReason(state);

    if (executionStopReason !== undefined) return executionStopReason;
    if (steps >= maxSteps) return "max-steps";
    return undefined;
}

export function runProgram(state: P3State, options: RunProgramOptions = {}): RunProgramResult {
    const maxSteps = validateMaxSteps(options.maxSteps ?? DEFAULT_MAX_STEPS);
    let steps = 0;

    while (true) {
        const stopReason = getRunStopReason(state, steps, maxSteps);

        if (stopReason !== undefined) {
            return {state, steps, stopReason};
        }

        step(state);
        steps++;
    }
}

export function executeStep(state: P3State): ProcessStepEvent {
    const stopReason = getExecutionStopReason(state);

    if (stopReason !== undefined) {
        return {state, didProcess: false, stopReason};
    }

    const effects = step(state);

    return {state, didProcess: true, effects};
}
