import type { P3State } from "./state";
import { PROGRAM_COUNTER_REGISTER, STACK_POINTER_REGISTER } from "./state";
import { AddressingMode } from "./instruction";
import { toWord16 } from "./word";

export type Operand =
    | { kind: "register"; index: number; }
    | { kind: "stack-pointer"; }
    | { kind: "memory"; address: number; }
    | { kind: "immediate"; value: number; };

export function operandFromEncoding(state: P3State, mode: AddressingMode, addressRegister: number, extensionWord?: number): Operand {
    switch (mode) {
        case AddressingMode.Register:
            return {kind: "register", index: addressRegister};
        case AddressingMode.RegisterIndirect:
            return {kind: "memory", address: state.readReg(addressRegister)};
        case AddressingMode.Immediate:
            return {kind: "immediate", value: requireExtensionWord(extensionWord)};
        case AddressingMode.Extended: {
            const displacement = requireExtensionWord(extensionWord);
            const address = toWord16(readBaseRegister(state, addressRegister) + displacement);
            return {kind: "memory", address};
        }
        default: {
            const exhaustive: never = mode;
            throw new Error(`Modo de endereçamento desconhecido: ${exhaustive}`);
        }
    }
}

function readBaseRegister(state: P3State, index: number): number {
    if (index === 0) return 0;
    if (index >= 1 && index <= 7) return state.readReg(index);
    if (index === STACK_POINTER_REGISTER || index === PROGRAM_COUNTER_REGISTER) {
        state.recordRegisterAccess(index);
        return index === STACK_POINTER_REGISTER ? state.getSP() : state.getPC();
    }
    throw new Error(`regModo inválido: ${index}`);
}

function requireExtensionWord(word: number | undefined): number {
    if (word === undefined) {
        throw new Error("Este modo de endereçamento pede palavra de extensão.");
    }
    return word;
}

export function readOperandValue(state: P3State, operand: Operand): number {
    switch (operand.kind) {
        case "register":
            return state.readReg(operand.index);
        case "stack-pointer":
            state.recordRegisterAccess(STACK_POINTER_REGISTER);
            return state.getSP();
        case "immediate":
            return operand.value;
        case "memory":
            return state.readData(operand.address);
    }
}

export function writeOperandValue(state: P3State, operand: Operand, value: number): void {
    switch (operand.kind) {
        case "register":
            state.writeReg(operand.index, value);
            return;
        case "stack-pointer":
            state.setSP(value);
            return;
        case "immediate":
            throw new Error("Operando imediato não pode escrever.");
        case "memory":
            state.writeData(operand.address, value);
            return;
    }
}

export function readOperand(state: P3State, mode: AddressingMode, addressRegister: number, extensionWord?: number): number {
    return readOperandValue(state, operandFromEncoding(state, mode, addressRegister, extensionWord));
}

export function writeOperand(state: P3State, mode: AddressingMode, addressRegister: number, value: number, extensionWord?: number): void {
    writeOperandValue(state, operandFromEncoding(state, mode, addressRegister, extensionWord), value);
}
