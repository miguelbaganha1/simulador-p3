import { describe, expect, it, vi } from "vitest";
import { P3State, step } from "p3-core";
import { PeripheralBus } from "../p3-system/src/peripherals/bus";

const MODES = [
    {name: "registo", bits: 0x02, extension: []},
    {name: "indirecto", bits: 0x13, extension: []},
    {name: "imediato", bits: 0x20, extension: [0x4321]},
    {name: "directo", bits: 0x30, extension: [0x1020]},
    {name: "indexado", bits: 0x33, extension: [0x20]},
    {name: "relativo a PC", bits: 0x3f, extension: [0x0f1e]},
    {name: "relativo a SP", bits: 0x3e, extension: [0x9020]},
];

const CONDITIONS = [
    {name: "Z", bits: 0x000, flags: [8, 9, 10, 11, 12, 13, 14, 15]},
    {name: "NZ", bits: 0x040, flags: [0, 1, 2, 3, 4, 5, 6, 7]},
    {name: "C", bits: 0x080, flags: [4, 5, 6, 7, 12, 13, 14, 15]},
    {name: "NC", bits: 0x0c0, flags: [0, 1, 2, 3, 8, 9, 10, 11]},
    {name: "N", bits: 0x100, flags: [2, 3, 6, 7, 10, 11, 14, 15]},
    {name: "NN", bits: 0x140, flags: [0, 1, 4, 5, 8, 9, 12, 13]},
    {name: "O", bits: 0x180, flags: [1, 3, 5, 7, 9, 11, 13, 15]},
    {name: "NO", bits: 0x1c0, flags: [0, 2, 4, 6, 8, 10, 12, 14]},
    {name: "P", bits: 0x200, flags: [0, 1, 4, 5]},
    {name: "NP", bits: 0x240, flags: [2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]},
    {name: "I", bits: 0x280, flags: []},
    {name: "NI", bits: 0x2c0, flags: []},
];

const CONDITIONAL_CASES = CONDITIONS.flatMap(condition => Array.from({length: 16}, (_, re) => [false, true].map(pending => ({...condition, re, pending, taken: condition.name === "I" ? pending : condition.name === "NI" ? !pending : condition.flags.includes(re)}))).flat());

function prepareState(bits: number, extension: readonly number[]): P3State {
    const state = new P3State(new PeripheralBus());
    state.setPC(0x100);
    state.setSP(0x8000);
    for (let register = 1; register < 8; register++) state.writeReg(register, register * 0x111);
    state.writeReg(2, 0x4321);
    state.writeReg(3, bits === 0x13 ? 0x1020 : 0x1000);
    state.writeMem(0x1020, 0x4321);
    for (let i = 0; i < extension.length; i++) state.writeMem(0x101 + i, extension[i]!);
    return state;
}

describe("Instruções sem operandos", () => {
    it.each([["NOP", 0x0000, 0x1f, 0x1f], ["ENI", 0x0400, 0x0f, 0x1f], ["DSI", 0x0800, 0x1f, 0x0f], ["STC", 0x0c00, 0x1b, 0x1f], ["CLC", 0x1000, 0x1f, 0x1b], ["CMC", 0x1400, 0x1f, 0x1b], ["CMC", 0x1400, 0x1b, 0x1f]] as const)("%s altera apenas as flags previstas", (name, word, initialRe, re) => {
        const state = prepareState(0x02, []);
        state.setRE(initialRe);
        state.writeMem(0x100, word);
        const registers = Array.from({length: 8}, (_, index) => state.readReg(index));
        step(state);
        expect(Array.from({length: 8}, (_, index) => state.readReg(index))).toEqual(registers);
        expect([state.getPC(), state.getSP(), state.getRE(), state.instructionCount]).toEqual([0x101, 0x8000, re, 1]);
        expect(state.readMem(0x100)).toBe(word);
        expect(state.readMem(0x1020)).toBe(0x4321);
    });

    it.each([[0x1800, 0, 0x8001], [0x2400, 0, 0x8001], [0x2403, 3, 0x8004], [0x27ff, 1023, 0x8400]])("RET/RETN %i recupera o retorno e liberta %i posições", (word, count, sp) => {
        const state = prepareState(0x02, []);
        state.writeMem(0x100, word);
        state.writeMem(0x8001, 0x4567);
        state.setRE(0x1f);
        step(state);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0x4567, sp, 0x1f]);
        expect(state.readMem(0x8001)).toBe(0x4567);
    });

    it("RTI recupera primeiro PC e depois RE", () => {
        const state = prepareState(0x02, []);
        state.writeMem(0x100, 0x1c00);
        state.writeMem(0x8001, 0x4567);
        state.writeMem(0x8002, 0x001b);
        step(state);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0x4567, 0x8002, 0x1b]);
    });

    it.each([0, 1, 255])("INT %i guarda RE e PC mesmo com E e máscara a zero", vector => {
        const state = prepareState(0x02, []);
        state.setRE(0x0b);
        state.writeMem(0x100, 0x2000 | vector);
        state.writeMem(0xfe00 + vector, 0x4567);
        step(state);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0x4567, 0x7ffe, 0]);
        expect(state.readMem(0x8000)).toBe(0x0b);
        expect(state.readMem(0x7fff)).toBe(0x101);
    });
});

describe.each(MODES)("Saltos absolutos com endereçamento $name", mode => {
    it.each([["JMP", 0xc000], ["CALL", 0xc800]] as const)("%s obtém o destino e conserva os registos", (name, opcode) => {
        const state = prepareState(mode.bits, mode.extension);
        state.setRE(0x1f);
        state.writeMem(0x100, opcode | mode.bits);
        const registers = Array.from({length: 8}, (_, index) => state.readReg(index));
        step(state);
        expect(state.getPC()).toBe(0x4321);
        expect(state.getRE()).toBe(0x1f);
        expect(Array.from({length: 8}, (_, index) => state.readReg(index))).toEqual(registers);
        expect(state.getSP()).toBe(name === "CALL" ? 0x7fff : 0x8000);
        expect(state.readMem(0x8000)).toBe(name === "CALL" ? 0x101 + mode.extension.length : 0);
    });

    for (const [name, opcode] of [["JMP", 0xc400], ["CALL", 0xcc00]] as const) {
        it.each(CONDITIONAL_CASES)(`${name}.$name com RE $re e pedido pendente $pending`, ({bits, re, pending, taken}) => {
            const state = prepareState(mode.bits, mode.extension);
            state.setRE(re);
            if (pending) (state.bus as PeripheralBus).toggleInterruptButton(0);
            state.writeMem(0x100, opcode | bits | mode.bits);
            step(state);
            expect(state.getPC()).toBe(taken ? 0x4321 : 0x101 + mode.extension.length);
            expect(state.getRE()).toBe(re);
            expect(state.getSP()).toBe(taken && name === "CALL" ? 0x7fff : 0x8000);
            expect(state.readMem(0x8000)).toBe(taken && name === "CALL" ? 0x101 + mode.extension.length : 0);
            expect(state.bus.pendingInterrupt()).toBe(pending);
        });
    }
});

describe("Saltos relativos e limites dos endereços", () => {
    it.each(CONDITIONAL_CASES)("BR.$name com RE $re e pedido pendente $pending", ({bits, re, pending, taken}) => {
        const state = prepareState(0x02, []);
        state.setRE(re);
        if (pending) (state.bus as PeripheralBus).toggleInterruptButton(0);
        state.writeMem(0x100, 0xe400 | bits | 0x3e);
        step(state);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([taken ? 0xff : 0x101, 0x8000, re]);
        expect(state.bus.pendingInterrupt()).toBe(pending);
    });

    it.each([[0xe020, 0x100, 0xe1], [0xe01f, 0x100, 0x120], [0xe03f, 0x100, 0x100], [0xe000, 0x100, 0x101], [0xe020, 0, 0xffe1]])("BR %i em %i aplica o deslocamento de seis bits", (word, pc, expected) => {
        const state = prepareState(0x02, []);
        state.setPC(pc);
        state.writeMem(pc, word);
        step(state);
        expect(state.getPC()).toBe(expected);
    });

    it("a palavra de extensão atravessa FFFFh e o PC regressa a zero", () => {
        const read = vi.fn((address: number) => address === 0xfffe ? 0xae60 : 0xabcd);
        const state = new P3State({read, write: vi.fn(), pendingInterrupt: () => false, getInterrupt: () => undefined});
        state.setPC(0xfffe);
        step(state);
        expect([state.getPC(), state.readReg(1)]).toEqual([0, 0xabcd]);
        expect(read.mock.calls).toEqual([[0xfffe], [0xffff]]);
    });

    it("o endereço indexado é reduzido a 16 bits", () => {
        const state = prepareState(0x33, [0x21]);
        state.writeReg(3, 0xffff);
        state.writeMem(0x100, 0xae73);
        state.writeMem(0x20, 0xabcd);
        step(state);
        expect(state.readReg(1)).toBe(0xabcd);
    });

    it("PUSH e POP atravessam o limite de SP entre zero e FFFFh", () => {
        const state = prepareState(0x02, []);
        state.setSP(0);
        state.writeMem(0x100, 0x5002);
        state.writeMem(0x101, 0x5401);
        step(state);
        expect([state.getSP(), state.readMem(0)]).toEqual([0xffff, 0x4321]);
        step(state);
        expect([state.getSP(), state.readReg(1)]).toEqual([0, 0x4321]);
    });

    it.each([[0xac4e, 0x0111, 0x0111], [0xae4e, 0x8000, 0x8000]])("MOV %i permite transferências entre SP e R1", (word, register, sp) => {
        const state = prepareState(0x02, []);
        state.setRE(0x1f);
        state.writeMem(0x100, word);
        step(state);
        expect([state.readReg(1), state.getSP(), state.getRE()]).toEqual([register, sp, 0x1f]);
    });
});
