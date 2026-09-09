import { describe, expect, it } from "vitest";
import { P3State } from "p3-core";
import { loadProgram, P3System } from "p3-system";
import { PeripheralBus } from "../p3-system/src/peripherals/bus";

const INVALID_PROGRAMS = [
    {name: "segmento que ultrapassa o fim da memória", program: {entryPoint: 0, segments: [{origin: 0, words: [7]}, {origin: 0xffff, words: [1, 2]}]}},
    {name: "segmentos sobrepostos", program: {entryPoint: 0, segments: [{origin: 0, words: [7, 8]}, {origin: 1, words: [9]}]}},
    {name: "entrada fora dos segmentos", program: {entryPoint: 2, segments: [{origin: 0, words: [7, 8]}]}},
] as const;

describe("Validação antes de alterar a memória", () => {
    it.each(INVALID_PROGRAMS)("rejeita $name e conserva o estado anterior", ({program}) => {
        const state = new P3State(new PeripheralBus());
        state.writeMem(0, 0x1234);
        state.writeMem(1, 0x5678);
        state.writeMem(0xffff, 0xabcd);
        state.writeReg(1, 3);
        state.setPC(10);
        state.setSP(0x8000);
        state.setRE(0x001f);
        state.instructionCount = 4;

        expect(() => loadProgram(state, program)).toThrow();
        expect(state.readMem(0)).toBe(0x1234);
        expect(state.readMem(1)).toBe(0x5678);
        expect(state.readMem(0xffff)).toBe(0xabcd);
        expect(state.readReg(1)).toBe(3);
        expect([state.getPC(), state.getSP(), state.getRE()]).toEqual([10, 0x8000, 0x001f]);
        expect(state.instructionCount).toBe(4);
    });

    it("rejeita um imediato acima de 16 bits sem substituir o programa carregado", () => {
        const system = new P3System();
        const loadedProgram = system.loadSource("MOV R1, 3\nNOP");
        system.oneStep();
        const snapshot = system.captureSnapshot();
        const assemblyList = system.getAssemblyList();

        expect(() => system.loadSource("MOV R1, 10000h")).toThrow();
        expect(system.getLoadedProgram()).toBe(loadedProgram);
        expect(system.getAssemblyList()).toEqual(assemblyList);
        expect(system.captureSnapshot()).toEqual(snapshot);
        expect(system.state.readMem(0)).toBe(0xae60);
        expect(system.state.readMem(1)).toBe(3);
        expect(system.state.readMem(2)).toBe(0);
    });
});
