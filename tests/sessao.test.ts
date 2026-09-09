import { describe, expect, it, vi } from "vitest";
import { P3System } from "p3-system";

describe("Controlo da execução", () => {
    it("pára antes do breakpoint e retoma sem ficar preso no mesmo endereço", async () => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        const options = {breakpoints: new Set([0]), maxSteps: 10, yieldControl: async () => {}};

        const first = await system.startExecution(options);
        expect([first.stopReason, first.steps, system.programCounter, system.state.readReg(1)]).toEqual(["breakpoint", 0, 0, 0]);

        const second = await system.startExecution(options);
        expect([second.stopReason, second.steps, system.programCounter, system.state.readReg(1)]).toEqual(["breakpoint", 2, 0, 1]);

        const third = await system.startExecution(options);
        expect([third.stopReason, third.steps, system.programCounter, system.state.readReg(1)]).toEqual(["breakpoint", 2, 0, 2]);
        expect(system.isRunning).toBe(false);
    });

    it("interrompe a execução quando pause é pedido e permite continuar", async () => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        const onStep = vi.fn(() => {
            if (system.state.instructionCount === 3) system.pause();
        });

        const execution = system.startExecution({maxSteps: 100, onStep, yieldControl: async () => {}});
        expect(system.isRunning).toBe(true);
        const result = await execution;
        expect([result.stopReason, result.steps, system.programCounter, system.state.readReg(1)]).toEqual(["paused", 3, 1, 2]);
        expect(onStep).toHaveBeenCalledTimes(3);
        expect(system.isRunning).toBe(false);

        const resumed = await system.startExecution({maxSteps: 2, yieldControl: async () => {}});
        expect([resumed.stopReason, resumed.steps, system.state.readReg(1)]).toEqual(["max-steps", 2, 3]);
    });

    it("stopExecution cancela uma espera e aguarda pela paragem", async () => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        let signal: AbortSignal | undefined;
        const execution = system.startExecution({maxSteps: 100, yieldControl: abortSignal => new Promise<void>(resolve => {
            signal = abortSignal;
            abortSignal.addEventListener("abort", () => resolve(), {once: true});
        })});
        await Promise.resolve();
        expect(system.isRunning).toBe(true);
        expect(system.state.instructionCount).toBe(1);

        await system.stopExecution();
        const result = await execution;
        expect(signal?.aborted).toBe(true);
        expect(result.stopReason).toBe("paused");
        expect(system.state.instructionCount).toBe(1);
        expect(system.isRunning).toBe(false);
    });

    it("dois pedidos de execução partilham a mesma execução activa", async () => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        const first = system.startExecution({maxSteps: 4, yieldControl: async () => {}});
        const second = system.startExecution({maxSteps: 100, yieldControl: async () => {}});
        expect(second).toBe(first);
        await first;
        expect(system.state.instructionCount).toBe(4);
        expect(system.state.readReg(1)).toBe(2);
    });

    it.each([0, 1, 4])("respeita o limite de %i instruções", async maxSteps => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        const result = await system.run({maxSteps});
        expect(result.stopReason).toBe("max-steps");
        expect(result.steps).toBe(maxSteps);
        expect(system.state.instructionCount).toBe(maxSteps);
    });

    it.each([-1, 1.5, NaN, Infinity])("rejeita o limite inválido %s e termina a execução activa", async maxSteps => {
        const system = new P3System();
        system.loadSource("NOP");
        await expect(system.startExecution({maxSteps, yieldControl: async () => {}})).rejects.toThrow(/maxSteps/);
        expect(system.isRunning).toBe(false);
        expect(system.state.instructionCount).toBe(0);
    });

    it("pára ao entrar em I/O antes de executar outra instrução", async () => {
        const system = new P3System();
        system.loadSource("ORIG FEFEh\nNOP\nNOP");
        const result = await system.run({maxSteps: 10});
        expect([result.stopReason, result.steps, system.programCounter]).toEqual(["end-of-memory", 2, 0xff00]);
        expect(system.oneStep().didProcess).toBe(false);
        expect(system.state.instructionCount).toBe(2);
    });

    it("executa código máquina introduzido directamente sem fonte carregada", async () => {
        const system = new P3System();
        system.setMemoryWord(0, 0x4401);
        system.setMemoryWord(1, 0xe03e);
        expect(system.oneStep().didProcess).toBe(true);
        const result = await system.startExecution({maxSteps: 2, yieldControl: async () => {}});
        expect(system.state.readReg(1)).toBe(2);
        expect(system.programCounter).toBe(1);
        expect(result.assembledProgram).toBeUndefined();
        expect(result.loadedProgram).toBeUndefined();
    });

    it("uma instrução inválida rejeita a execução e liberta o estado activo", async () => {
        const system = new P3System();
        system.setMemoryWord(0, 0xfc00);
        await expect(system.startExecution({maxSteps: 10, yieldControl: async () => {}})).rejects.toThrow(/Opcode/);
        expect(system.isRunning).toBe(false);
        expect(system.state.instructionCount).toBe(0);
    });

    it("a execução passo a passo avança a partir de um breakpoint", async () => {
        const system = new P3System();
        system.loadSource("INC R1\nBR -2");
        const options = {breakpoints: new Set([0]), maxSteps: 10, yieldControl: async () => {}};
        await system.startExecution(options);
        system.oneStep();
        expect([system.programCounter, system.state.readReg(1)]).toEqual([1, 1]);
        const result = await system.startExecution(options);
        expect([result.stopReason, result.steps, system.programCounter]).toEqual(["breakpoint", 1, 0]);
    });

    it("as capturas anteriores conservam o estado depois de editar a memória", () => {
        const system = new P3System();
        system.loadSource("MOV R1, 3");
        const previous = system.captureSnapshot();
        system.setMemoryWord(1, 7);
        system.oneStep();
        const current = system.captureSnapshot();
        expect(previous.machine.memory.readWord(1)).toBe(3);
        expect(previous.machine.registers[1]).toBe(0);
        expect(current.machine.memory.readWord(1)).toBe(7);
        expect(current.machine.registers[1]).toBe(7);
        expect(current.machine.lastExecutedPc).toBe(0);
    });
});
