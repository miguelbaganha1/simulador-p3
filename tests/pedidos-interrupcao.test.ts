import { afterEach, describe, expect, it, vi } from "vitest";
import { P3System } from "p3-system";

function createSystem(): P3System {
    const system = new P3System();
    system.loadSource("ENI\nNOP\nNOP\nORIG 100h\nRTI\nORIG 200h\nRTI\nORIG 300h\nRTI\nORIG FE00h\nWORD 100h, 200h\nORIG FE0Fh\nWORD 300h");
    return system;
}

afterEach(() => {
    vi.useRealTimers();
});

describe("Pedidos de interrupção", () => {
    it("atende primeiro o menor índice e mantém o segundo pedido até RTI", () => {
        const system = createSystem();
        system.setInterruptMask(3);
        system.toggleInterruptButton(1);
        system.toggleInterruptButton(0);
        const initialSp = system.state.getSP();
        expect(system.capturePeripherals().pendingInterruptSources).toBe(3);

        system.oneStep();
        expect(system.programCounter).toBe(0x100);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(2);
        expect(system.state.readMem(initialSp - 1)).toBe(1);

        system.oneStep();
        expect(system.programCounter).toBe(0x200);
        expect(system.state.getSP()).toBe(initialSp - 2);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0);

        system.oneStep();
        expect([system.programCounter, system.state.getSP(), system.state.getRE()]).toEqual([1, initialSp, 0x10]);
    });

    it("um pedido mascarado não impede atender outro pedido autorizado", () => {
        const system = createSystem();
        system.setInterruptMask(2);
        system.toggleInterruptButton(0);
        system.toggleInterruptButton(1);
        system.oneStep();
        expect(system.programCounter).toBe(0x200);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(1);
        system.oneStep();
        expect(system.programCounter).toBe(1);
        system.setInterruptMask(1);
        system.oneStep();
        expect(system.programCounter).toBe(0x100);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0);
    });

    it("um segundo clique cancela apenas o pedido desse botão", () => {
        const system = createSystem();
        system.toggleInterruptButton(0);
        system.toggleInterruptButton(1);
        system.toggleInterruptButton(0);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(2);
    });

    it("DSI conserva o pedido pendente e ENI permite a sua aceitação", () => {
        const system = createSystem();
        system.setMemoryWord(0, 0x0800);
        system.setMemoryWord(1, 0x0400);
        system.setInterruptMask(1);
        system.state.setRE(0x1f);
        system.toggleInterruptButton(0);
        system.oneStep();
        expect(system.programCounter).toBe(1);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(1);
        system.oneStep();
        expect(system.programCounter).toBe(0x100);
        expect(system.state.readMem(system.initialSp)).toBe(0x1f);
    });

    it("ENI dentro da rotina permite uma interrupção aninhada e ambos os retornos", () => {
        const system = createSystem();
        system.setMemoryWord(0x100, 0x0400);
        system.setMemoryWord(0x101, 0x1c00);
        system.setInterruptMask(3);
        system.toggleInterruptButton(0);
        system.toggleInterruptButton(1);
        system.oneStep();
        system.oneStep();
        expect(system.programCounter).toBe(0x200);
        expect(system.state.getSP()).toBe(system.initialSp - 4);
        expect(system.state.readMem(system.initialSp - 3)).toBe(0x101);
        system.oneStep();
        expect(system.programCounter).toBe(0x101);
        system.oneStep();
        expect([system.programCounter, system.state.getSP(), system.state.getRE()]).toEqual([1, system.initialSp, 0x10]);
    });

    it("o temporizador gera um único pedido no vector 15 ao terminar", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const system = createSystem();
        system.setInterruptMask(0x8000);
        system.state.writeData(0xfff6, 10);
        system.state.writeData(0xfff7, 1);
        system.oneStep();
        vi.setSystemTime(999);
        system.oneStep();
        expect(system.programCounter).toBe(2);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0);
        vi.setSystemTime(1000);
        system.oneStep();
        expect(system.programCounter).toBe(0x300);
        expect(system.capturePeripherals().timerRunning).toBe(false);
        system.oneStep();
        expect(system.programCounter).toBe(3);
        vi.setSystemTime(2000);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0);
    });

    it("atende um botão antes do temporizador quando ambos estão pendentes", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const system = createSystem();
        system.setInterruptMask(0x8001);
        system.state.writeData(0xfff6, 1);
        system.state.writeData(0xfff7, 1);
        system.toggleInterruptButton(0);
        vi.setSystemTime(100);
        system.oneStep();
        expect(system.programCounter).toBe(0x100);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0x8000);
        system.oneStep();
        expect(system.programCounter).toBe(0x300);
        expect(system.capturePeripherals().pendingInterruptSources).toBe(0);
    });
});
