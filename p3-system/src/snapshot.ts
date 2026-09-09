import type { FlagBit } from "p3-core";
import type { MemoryView } from "./memory-snapshot";
import type { PeripheralsSnapshot } from "./peripherals";

export type StepEffects = {
    readonly accessedRegisters: readonly number[];
    readonly accessedDataAddresses: readonly number[];
    readonly changedFlags: readonly FlagBit[];
};

export type MachineSnapshot = {
    readonly registers: readonly number[];
    readonly pc: number;
    readonly lastExecutedPc: number | undefined;
    readonly sp: number;
    readonly re: number;
    readonly instructionCount: number;
    readonly halted: boolean;
    readonly memory: MemoryView;
    readonly stackBase: number | undefined;
    readonly lastStepEffects: StepEffects;
};

export type P3Snapshot = {
    readonly machine: MachineSnapshot;
    readonly peripherals: PeripheralsSnapshot;
};

export type MemoryCellRole = "pc" | "previous-pc" | "sp" | "accessed" | "stack";

export function getMemoryCellRole(machine: MachineSnapshot, address: number): MemoryCellRole | undefined {
    if (address === machine.pc) return "pc";
    if (address === machine.lastExecutedPc) return "previous-pc";
    if (address === machine.sp) return "sp";
    if (machine.lastStepEffects.accessedDataAddresses.includes(address)) return "accessed";
    if (machine.stackBase !== undefined && address > machine.sp && address <= machine.stackBase) return "stack";
    return undefined;
}
