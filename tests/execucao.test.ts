import { expect, it } from "vitest";
import { FlagBit, P3System } from "p3-system";

it("monta e executa a soma com transporte e o salto condicional", () => {
    const system = new P3System();
    system.loadSource(`
        ORIG 0000h
        MOV R1, FFFFh
        ADD R1, 1
        BR.Z fim
        MOV R1, 4
fim     NOP
    `);

    const expectedWords = [0xae60, 0xffff, 0x8660, 0x0001, 0xe402, 0xae60, 0x0004, 0x0000];
    for (let address = 0; address < expectedWords.length; address++) {
        expect(system.state.readMem(address)).toBe(expectedWords[address]);
    }

    system.oneStep();
    expect(system.state.readReg(1)).toBe(0xffff);
    expect(system.programCounter).toBe(2);

    system.oneStep();
    expect(system.captureSnapshot().machine.registers[1]).toBe(0);
    expect(system.state.getFlag(FlagBit.Z)).toBe(true);
    expect(system.state.getFlag(FlagBit.C)).toBe(true);
    expect(system.state.getFlag(FlagBit.O)).toBe(false);
    expect(system.programCounter).toBe(4);

    system.oneStep();
    expect(system.programCounter).toBe(0x0007);

    system.oneStep();
    const machine = system.captureSnapshot().machine;
    expect(machine.pc).toBe(0x0008);
    expect(machine.registers[1]).toBe(0);
    expect(machine.instructionCount).toBe(4);
});
