import { describe, expect, it } from "vitest";
import { P3State, step } from "p3-core";
import { PeripheralBus } from "../p3-system/src/peripherals/bus";

const MODES = [
    {name: "registo", bits: 0x02, extension: []},
    {name: "indirecto", bits: 0x13, extension: []},
    {name: "imediato", bits: 0x20, extension: [0]},
    {name: "directo", bits: 0x30, extension: [0x1020]},
    {name: "indexado", bits: 0x33, extension: [0x0020]},
    {name: "relativo a PC", bits: 0x3f, extension: [0x0f1e]},
    {name: "relativo a SP", bits: 0x3e, extension: [0x9020]},
];

const BINARY_CASES = [
    ["CMP", 0x8000, 6, 3, 0x1f, 6, 3, 0x14],
    ["CMP", 0x8000, 0x8000, 1, 0x1f, 0x8000, 1, 0x15],
    ["CMP", 0x8000, 3, 3, 0, 3, 3, 0x0c],
    ["ADD", 0x8400, 6, 3, 0x1f, 9, 3, 0x10],
    ["ADD", 0x8400, 0xffff, 1, 0x1f, 0, 1, 0x1c],
    ["ADD", 0x8400, 0x7fff, 1, 0, 0x8000, 1, 0x03],
    ["ADD", 0x8400, 0x8000, 0x8000, 0, 0, 0x8000, 0x0d],
    ["ADDC", 0x8800, 6, 3, 0x1f, 10, 3, 0x10],
    ["ADDC", 0x8800, 0xffff, 0, 0x04, 0, 0, 0x0c],
    ["ADDC", 0x8800, 0x7fff, 0, 0x04, 0x8000, 0, 0x03],
    ["ADDC", 0x8800, 6, 3, 0, 9, 3, 0],
    ["SUB", 0x8c00, 6, 3, 0x1f, 3, 3, 0x14],
    ["SUB", 0x8c00, 0, 1, 0x1f, 0xffff, 1, 0x12],
    ["SUB", 0x8c00, 0x8000, 1, 0, 0x7fff, 1, 0x05],
    ["SUB", 0x8c00, 0x7fff, 0xffff, 0, 0x8000, 0xffff, 0x03],
    ["SUBB", 0x9000, 6, 3, 0x1f, 3, 3, 0x14],
    ["SUBB", 0x9000, 6, 3, 0, 2, 3, 0x04],
    ["SUBB", 0x9000, 0, 0, 0, 0xffff, 0, 0x02],
    ["SUBB", 0x9000, 0x8000, 0, 0, 0x7fff, 0, 0x05],
    ["MUL", 0x9400, 6, 3, 0x1f, 0, 18, 0x10],
    ["MUL", 0x9400, 0xffff, 0xffff, 0x1f, 0xfffe, 1, 0x10],
    ["MUL", 0x9400, 0, 0xffff, 0x1f, 0, 0, 0x18],
    ["MUL", 0x9400, 0x8000, 2, 0x1f, 1, 0, 0x10],
    ["DIV", 0x9800, 7, 3, 0x1f, 2, 1, 0x10],
    ["DIV", 0x9800, 0xffff, 2, 0x1f, 0x7fff, 1, 0x10],
    ["DIV", 0x9800, 1, 2, 0x1f, 0, 1, 0x18],
    ["DIV", 0x9800, 0x8000, 1, 0x1f, 0x8000, 0, 0x10],
    ["TEST", 0x9c00, 6, 3, 0x1f, 6, 3, 0x15],
    ["TEST", 0x9c00, 0x8000, 0x7fff, 0x1f, 0x8000, 0x7fff, 0x1d],
    ["AND", 0xa000, 6, 3, 0x1f, 2, 3, 0x15],
    ["AND", 0xa000, 0x8000, 0xffff, 0x1f, 0x8000, 0xffff, 0x17],
    ["OR", 0xa400, 6, 3, 0x1f, 7, 3, 0x15],
    ["OR", 0xa400, 0, 0, 0x1f, 0, 0, 0x1d],
    ["XOR", 0xa800, 6, 3, 0x1f, 5, 3, 0x15],
    ["XOR", 0xa800, 0xffff, 0xffff, 0x1f, 0, 0xffff, 0x1d],
    ["MOV", 0xac00, 6, 3, 0x1f, 3, 3, 0x1f],
    ["MOV", 0xac00, 0, 0xffff, 0, 0xffff, 0xffff, 0],
    ["MVBH", 0xb000, 0xab12, 0x34cd, 0x1f, 0x3412, 0x34cd, 0x1f],
    ["MVBL", 0xb400, 0xab12, 0x34cd, 0x1f, 0xabcd, 0x34cd, 0x1f],
    ["XCH", 0xb800, 6, 3, 0x1f, 3, 6, 0x1f],
] as const;

const UNARY_CASES = [
    ["NEG", 0x4000, 1, 0x1f, 0xffff, 0x12],
    ["NEG", 0x4000, 0, 0x1f, 0, 0x1c],
    ["NEG", 0x4000, 0x8000, 0, 0x8000, 0x03],
    ["INC", 0x4400, 0xffff, 0x1f, 0, 0x1c],
    ["INC", 0x4400, 0x7fff, 0, 0x8000, 0x03],
    ["DEC", 0x4800, 0, 0x1f, 0xffff, 0x12],
    ["DEC", 0x4800, 0x8000, 0, 0x7fff, 0x05],
    ["COM", 0x4c00, 0xffff, 0x1f, 0, 0x1d],
    ["COM", 0x4c00, 0x7fff, 0x1f, 0x8000, 0x17],
] as const;

const SHIFT_CASES = [
    ["SHR", 0x6000, 1, 0x8001, 0x1f, 0x4000, 0x15],
    ["SHR", 0x6000, 16, 0x8001, 0x1f, 0, 0x1d],
    ["SHL", 0x6400, 1, 0x8001, 0x1f, 2, 0x15],
    ["SHL", 0x6400, 16, 0x8001, 0x1f, 0, 0x1d],
    ["SHRA", 0x6800, 1, 0x8001, 0x1f, 0xc000, 0x16],
    ["SHRA", 0x6800, 16, 0x8001, 0x1f, 0xffff, 0x16],
    ["SHRA", 0x6800, 1, 0x7fff, 0x1f, 0x3fff, 0x14],
    ["SHLA", 0x6c00, 1, 0x4000, 0x1f, 0x8000, 0x13],
    ["SHLA", 0x6c00, 1, 1, 0x1f, 2, 0x10],
    ["SHLA", 0x6c00, 16, 1, 0x1f, 0, 0x1d],
    ["ROR", 0x7000, 1, 0x8001, 0x1f, 0xc000, 0x17],
    ["ROR", 0x7000, 16, 0x8001, 0x1f, 0x8001, 0x17],
    ["ROL", 0x7400, 1, 0x8001, 0x1f, 3, 0x15],
    ["ROL", 0x7400, 16, 0x8001, 0x1f, 0x8001, 0x17],
    ["RORC", 0x7800, 1, 0x8001, 0x1f, 0xc000, 0x17],
    ["RORC", 0x7800, 1, 0x8001, 0x10, 0x4000, 0x14],
    ["RORC", 0x7800, 16, 0x8001, 0x1f, 3, 0x15],
    ["RORC", 0x7800, 16, 0x8001, 0x10, 2, 0x14],
    ["ROLC", 0x7c00, 1, 0x8001, 0x1f, 3, 0x15],
    ["ROLC", 0x7c00, 1, 0x8001, 0x10, 2, 0x14],
    ["ROLC", 0x7c00, 16, 0x8001, 0x1f, 0xc000, 0x17],
    ["ROLC", 0x7c00, 16, 0x8001, 0x10, 0x4000, 0x14],
] as const;

function prepareState(bits: number, extension: readonly number[], value: number): P3State {
    const state = new P3State(new PeripheralBus());
    for (let register = 1; register < 8; register++) state.writeReg(register, register * 0x111);
    state.setPC(0x100);
    state.setSP(0x8000);
    state.writeReg(3, bits === 0x13 ? 0x1020 : 0x1000);
    if (bits === 0x02) state.writeReg(2, value);
    else if (bits !== 0x20) state.writeMem(0x1020, value);
    for (let i = 0; i < extension.length; i++) state.writeMem(0x101 + i, bits === 0x20 ? value : extension[i]!);
    return state;
}

function captureRegisters(state: P3State): number[] {
    return Array.from({length: 8}, (_, register) => state.readReg(register));
}

function captureMemory(state: P3State): Uint16Array {
    const memory = new Uint16Array(0x10000);
    for (let page = 0; page < 256; page++) memory.set(state.copyMemoryPage(page), page * 256);
    return memory;
}

function expectMemory(state: P3State, expected: Uint16Array): void {
    const actual = captureMemory(state);
    const changed = [];
    for (let address = 0; address < actual.length; address++) {
        if (actual[address] !== expected[address]) changed.push({address, expected: expected[address], actual: actual[address]});
    }
    expect(changed).toEqual([]);
}

describe.each(MODES)("Execução com endereçamento $name", ({bits, extension}) => {
    for (const registerFirst of [true, false]) {
        const cases = BINARY_CASES.filter(([name]) => bits !== 0x20 || (!["MUL", "DIV", "XCH"].includes(name) && (registerFirst || name === "CMP" || name === "TEST")));
        const order = registerFirst ? "registo primeiro" : "registo segundo";

        it.each(cases)(`%s, ${order}, palavra %i, operandos %i e %i, RE %i`, (name, opcode, left, right, re, result, second, flags) => {
            const state = prepareState(bits, extension, registerFirst ? right : left);
            state.writeReg(1, registerFirst ? left : right);
            state.setRE(re);
            state.writeMem(0x100, opcode | (registerFirst ? 0x0240 : 0x0040) | bits);
            const registers = captureRegisters(state);
            const memory = captureMemory(state);
            registers[1] = registerFirst ? result : second;
            const addressedResult = registerFirst ? second : result;
            if (bits === 0x02) registers[2] = addressedResult;
            else if (bits !== 0x20) memory[0x1020] = addressedResult;

            step(state);

            expect(captureRegisters(state)).toEqual(registers);
            expect([state.getPC(), state.getSP(), state.getRE(), state.instructionCount]).toEqual([0x101 + extension.length, 0x8000, flags, 1]);
            expectMemory(state, memory);
        });
    }

    if (bits !== 0x20) {
        it.each(UNARY_CASES)("%s, palavra %i, operando %i, RE %i", (name, opcode, value, re, result, flags) => {
            const state = prepareState(bits, extension, value);
            state.setRE(re);
            state.writeMem(0x100, opcode | bits);
            const registers = captureRegisters(state);
            const memory = captureMemory(state);
            if (bits === 0x02) registers[2] = result;
            else memory[0x1020] = result;

            step(state);

            expect(captureRegisters(state)).toEqual(registers);
            expect([state.getPC(), state.getSP(), state.getRE(), state.instructionCount]).toEqual([0x101 + extension.length, 0x8000, flags, 1]);
            expectMemory(state, memory);
        });

        it.each(SHIFT_CASES)("%s, palavra %i, %i posições, operando %i, RE %i", (name, opcode, count, value, re, result, flags) => {
            const state = prepareState(bits, extension, value);
            state.setRE(re);
            state.writeMem(0x100, opcode | ((count % 16) << 6) | bits);
            const registers = captureRegisters(state);
            const memory = captureMemory(state);
            if (bits === 0x02) registers[2] = result;
            else memory[0x1020] = result;

            step(state);

            expect(captureRegisters(state)).toEqual(registers);
            expect([state.getPC(), state.getSP(), state.getRE(), state.instructionCount]).toEqual([0x101 + extension.length, 0x8000, flags, 1]);
            expectMemory(state, memory);
        });
    }

    it("PUSH guarda o operando no endereço anterior ao decremento de SP", () => {
        const state = prepareState(bits, extension, 0x1234);
        state.setRE(0x1f);
        state.writeMem(0x100, 0x5000 | bits);
        const registers = captureRegisters(state);
        const memory = captureMemory(state);
        memory[0x8000] = 0x1234;

        step(state);

        expect(captureRegisters(state)).toEqual(registers);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0x101 + extension.length, 0x7fff, 0x1f]);
        expectMemory(state, memory);
    });

    if (bits !== 0x20) {
        it("POP escreve no endereço calculado antes de incrementar SP", () => {
            const state = prepareState(bits, extension, 0x1234);
            state.setRE(0x1f);
            state.writeMem(0x8001, 0xabcd);
            state.writeMem(0x100, 0x5400 | bits);
            const registers = captureRegisters(state);
            const memory = captureMemory(state);
            if (bits === 0x02) registers[2] = 0xabcd;
            else memory[0x1020] = 0xabcd;

            step(state);

            expect(captureRegisters(state)).toEqual(registers);
            expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0x101 + extension.length, 0x8001, 0x1f]);
            expectMemory(state, memory);
        });
    }
});
