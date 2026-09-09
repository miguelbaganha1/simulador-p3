import type { P3State } from "./state";

export interface IoBus {
    read(address: number): number;
    write(address: number, value: number): void;
    pendingInterrupt(): boolean;
    getInterrupt(): number | undefined;
}

export function readData(state: P3State, address: number): number {
    return state.readData(address);
}

export function readInstructionWord(state: P3State, address: number): number {
    return state.fetchWord(address);
}

export function writeData(state: P3State, address: number, value: number): void {
    state.writeData(address, value);
}
