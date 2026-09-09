import { expect, it } from "vitest";
import { FlagBit, P3System } from "p3-system";

it("respeita a máscara e recupera PC, RE e SP depois da interrupção", () => {
    const system = new P3System();
    system.loadSource(`
        ENI
        NOP
        NOP
        ORIG 0100h
        RTI
        ORIG FE00h
        WORD 0100h
    `);
    const initialSp = system.state.getSP();
    system.toggleInterruptButton(0);

    system.oneStep();
    system.oneStep();
    expect(system.programCounter).toBe(2);
    expect(system.state.getFlag(FlagBit.E)).toBe(true);
    expect(system.capturePeripherals().pendingInterruptSources).toBe(1);
    const savedRe = system.state.getRE();

    system.setInterruptMask(1);
    system.oneStep();
    expect(system.programCounter).toBe(0x100);
    expect(system.state.getSP()).toBe(initialSp - 2);
    expect(system.state.readMem(initialSp)).toBe(savedRe);
    expect(system.state.readMem(initialSp - 1)).toBe(3);
    expect(system.state.getFlag(FlagBit.E)).toBe(false);
    expect(system.capturePeripherals().pendingInterruptSources).toBe(0);

    system.oneStep();
    expect([system.programCounter, system.state.getRE(), system.state.getSP()]).toEqual([3, savedRe, initialSp]);
    expect(system.capturePeripherals().pendingInterruptSources).toBe(0);
});
