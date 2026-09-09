import { beforeEach, describe, expect, it } from "vitest";
import { FlagBit, P3State } from "p3-core";
import { PeripheralBus } from "../p3-system/src/peripherals/bus";

const WORD_VALUES = [
    [0, 0],
    [1, 1],
    [0x7fff, 0x7fff],
    [0x8000, 0x8000],
    [0xffff, 0xffff],
    [0x10000, 0],
    [0x10001, 1],
    [-1, 0xffff],
    [-0x8000, 0x8000],
    [-0x10001, 0xffff],
] as const;

const FLAGS = [
    {name: "O", flag: FlagBit.O, mask: 0x0001, remaining: 0x001e},
    {name: "N", flag: FlagBit.N, mask: 0x0002, remaining: 0x001d},
    {name: "C", flag: FlagBit.C, mask: 0x0004, remaining: 0x001b},
    {name: "Z", flag: FlagBit.Z, mask: 0x0008, remaining: 0x0017},
    {name: "E", flag: FlagBit.E, mask: 0x0010, remaining: 0x000f},
] as const;

describe("Representação do estado", () => {
    let state: P3State;

    beforeEach(() => {
        state = new P3State(new PeripheralBus());
    });

    it.each([1, 2, 3, 4, 5, 6, 7])("lê e escreve R%i sem alterar os restantes registos", register => {
        for (let index = 1; index < 8; index++) state.writeReg(index, index * 10);
        state.writeReg(register, 0x1234);

        for (let index = 0; index < 8; index++) {
            const expected = index === register ? 0x1234 : index * 10;
            expect(state.readReg(index)).toBe(expected);
        }
    });

    it.each(WORD_VALUES)("normaliza o valor %i para %i em R1 a R7, PC, SP e memória", (value, expected) => {
        for (let register = 1; register < 8; register++) {
            state.writeReg(register, value);
            expect(state.readReg(register)).toBe(expected);
        }

        state.writeReg(0, value);
        state.setPC(value);
        state.setSP(value);
        state.writeMem(0x100, value);

        expect(state.readReg(0)).toBe(0);
        expect(state.getPC()).toBe(expected);
        expect(state.getSP()).toBe(expected);
        expect(state.readMem(0x100)).toBe(expected);
    });

    it.each([[0, 0], [0x001f, 0x001f], [0xffe0, 0], [0xffff, 0x001f], [0x10000, 0], [0x10008, 0x0008], [-1, 0x001f]])("conserva apenas os bits das flags ao escrever %i em RE", (value, expected) => {
        state.setRE(value);
        expect(state.getRE()).toBe(expected);
    });

    it.each(FLAGS)("coloca a flag $name no bit correcto e preserva as restantes", ({flag, mask, remaining}) => {
        state.setFlag(flag, true);
        expect(state.getRE()).toBe(mask);

        for (const other of FLAGS) {
            expect(state.getFlag(other.flag)).toBe(other.flag === flag);
        }

        state.setRE(mask);
        expect(state.getFlag(flag)).toBe(true);
        state.setFlag(flag, false);
        expect(state.getRE()).toBe(0);
        expect(state.getFlag(flag)).toBe(false);

        state.setRE(0x001f);
        state.setFlag(flag, false);
        expect(state.getRE()).toBe(remaining);

        for (const other of FLAGS) {
            expect(state.getFlag(other.flag)).toBe(other.flag !== flag);
        }

        state.setFlag(flag, true);
        expect(state.getRE()).toBe(0x001f);
    });

    it("mantém R0 a zero, normaliza os valores e apaga apenas a flag escolhida", () => {
        state.writeReg(0, 7);
        state.writeReg(2, 5);
        state.writeReg(1, -1);
        state.writeMem(0x100, 0x10001);

        expect(state.readReg(0)).toBe(0);
        expect(state.readReg(1)).toBe(0xffff);
        expect(state.readReg(2)).toBe(5);
        expect(state.readMem(0x100)).toBe(1);

        state.setFlag(FlagBit.C, true);
        state.setFlag(FlagBit.Z, true);
        state.setFlag(FlagBit.C, false);

        expect(state.getFlag(FlagBit.C)).toBe(false);
        expect(state.getFlag(FlagBit.Z)).toBe(true);
        expect(state.getRE()).toBe(0x0008);
    });

    it("lê e escreve os dois limites da memória", () => {
        state.writeMem(0, 0x1234);
        state.writeMem(0xffff, 0xabcd);

        expect(state.readMem(0)).toBe(0x1234);
        expect(state.readMem(0xffff)).toBe(0xabcd);
        expect(state.readMem(1)).toBe(0);
        expect(state.readMem(0xfffe)).toBe(0);
    });

    it("repõe os registos, PC, SP, RE, memória e contador a zero", () => {
        for (let register = 0; register < 8; register++) state.writeReg(register, register + 1);
        state.setPC(0x100);
        state.setSP(0x8000);
        state.setRE(0x001f);
        state.instructionCount = 4;
        state.writeMem(0, 0x1234);
        state.writeMem(0x100, 0x5678);
        state.writeMem(0xffff, 0xabcd);

        state.reset();

        for (let register = 0; register < 8; register++) expect(state.readReg(register)).toBe(0);
        for (const {flag} of FLAGS) expect(state.getFlag(flag)).toBe(false);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([0, 0, 0]);
        expect(state.instructionCount).toBe(0);
        expect(state.readMem(0)).toBe(0);
        expect(state.readMem(0x100)).toBe(0);
        expect(state.readMem(0xffff)).toBe(0);
    });

    it.each([-1, 8, 1.5, NaN, Infinity])("rejeita o índice de registo inválido %s", index => {
        expect(() => state.readReg(index)).toThrow();
        expect(() => state.writeReg(index, 1)).toThrow();
    });

    it.each([-1, 0x10000, 1.5, NaN, Infinity])("rejeita o endereço de memória inválido %s", address => {
        expect(() => state.readMem(address)).toThrow();
        expect(() => state.writeMem(address, 1)).toThrow();
    });

    it.each([-1, 5, 1.5, NaN, Infinity])("rejeita o identificador de flag inválido %s", flag => {
        expect(() => state.getFlag(flag)).toThrow();
        expect(() => state.setFlag(flag, true)).toThrow();
    });
});
