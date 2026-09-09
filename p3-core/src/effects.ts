import type { FlagBit } from "./instruction";

export type InstructionEffects = {
    readonly registers: readonly number[];
    readonly memoryAddresses: readonly number[];
    readonly changedFlags: readonly FlagBit[];
};
