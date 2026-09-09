import { describe, expect, it, vi } from "vitest";
import { P3State, step } from "p3-core";

const BINARY_INSTRUCTIONS = [
    ["CMP", 0x8000], ["ADD", 0x8400], ["ADDC", 0x8800], ["SUB", 0x8c00],
    ["SUBB", 0x9000], ["MUL", 0x9400], ["DIV", 0x9800], ["TEST", 0x9c00],
    ["AND", 0xa000], ["OR", 0xa400], ["XOR", 0xa800], ["MOV", 0xac00],
    ["MVBH", 0xb000], ["MVBL", 0xb400], ["XCH", 0xb800],
] as const;

describe("Acessos das instruções a I/O", () => {
    for (const registerFirst of [true, false]) {
        it.each(BINARY_INSTRUCTIONS)(`%s com o registo ${registerFirst ? "primeiro" : "segundo"} não duplica acessos`, (name, opcode) => {
            const read = vi.fn(() => 6);
            const write = vi.fn();
            const state = new P3State({read, write, pendingInterrupt: () => false, getInterrupt: () => undefined});
            state.writeMem(0, opcode | (registerFirst ? 0x0270 : 0x0070));
            state.writeMem(1, 0xfff8);
            state.writeMem(0xfff8, 0xaaaa);
            state.writeReg(1, 3);

            step(state);

            const reads = name === "MOV" && !registerFirst ? 0 : 1;
            const writes = ["CMP", "TEST"].includes(name) ? 0 : (!registerFirst || ["MUL", "DIV", "XCH"].includes(name) ? 1 : 0);
            expect(read).toHaveBeenCalledTimes(reads);
            expect(write).toHaveBeenCalledTimes(writes);
            if (reads) expect(read).toHaveBeenCalledWith(0xfff8);
            if (writes) expect(write.mock.calls[0]?.[0]).toBe(0xfff8);
            expect(state.readMem(0xfff8)).toBe(0xaaaa);
        });
    }

    it.each([["NEG", 0x4030], ["INC", 0x4430], ["DEC", 0x4830], ["COM", 0x4c30], ["SHR", 0x6070], ["SHL", 0x6470], ["SHRA", 0x6870], ["SHLA", 0x6c70], ["ROR", 0x7070], ["ROL", 0x7470], ["RORC", 0x7870], ["ROLC", 0x7c70]] as const)("%s lê e escreve o porto uma única vez", (name, word) => {
        const read = vi.fn(() => 6);
        const write = vi.fn();
        const state = new P3State({read, write, pendingInterrupt: () => false, getInterrupt: () => undefined});
        state.writeMem(0, word);
        state.writeMem(1, 0xfff8);
        step(state);
        expect(read.mock.calls).toEqual([[0xfff8]]);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0]?.[0]).toBe(0xfff8);
    });

    it.each([[0x5030, 1, 0], [0x5430, 0, 1], [0xc030, 1, 0], [0xc830, 1, 0], [0xc430, 0, 0], [0xcc30, 0, 0]])("a instrução %i faz apenas %i leituras e %i escritas no porto", (word, reads, writes) => {
        const read = vi.fn(() => 6);
        const write = vi.fn();
        const state = new P3State({read, write, pendingInterrupt: () => false, getInterrupt: () => undefined});
        state.setSP(0x8000);
        state.writeMem(0, word);
        state.writeMem(1, 0xfff8);
        state.writeMem(0x8001, 0x1234);
        step(state);
        expect(read).toHaveBeenCalledTimes(reads);
        expect(write).toHaveBeenCalledTimes(writes);
    });

    it("FEFFh pertence à memória e FF00h é encaminhado para o bus", () => {
        const read = vi.fn(() => 0xabcd);
        const write = vi.fn();
        const state = new P3State({read, write, pendingInterrupt: () => false, getInterrupt: () => undefined});
        state.writeMem(0xfeff, 0x1234);
        state.writeMem(0, 0xae70);
        state.writeMem(1, 0xfeff);
        state.writeMem(2, 0xae70);
        state.writeMem(3, 0xff00);
        step(state);
        expect(state.readReg(1)).toBe(0x1234);
        expect(read).not.toHaveBeenCalled();
        step(state);
        expect(state.readReg(1)).toBe(0xabcd);
        expect(read.mock.calls).toEqual([[0xff00]]);
        expect(write).not.toHaveBeenCalled();
    });
});
