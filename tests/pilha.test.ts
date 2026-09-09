import { expect, it } from "vitest";
import { P3System } from "p3-system";

it("guarda o retorno e R1 na pilha e recupera-os ao terminar a rotina", () => {
    const system = new P3System();
    system.loadSource(`
        MOV R1, 3
        CALL rotina
        NOP
rotina  PUSH R1
        MOV R1, 9
        POP R1
        RET
    `);
    const initialSp = system.state.getSP();

    system.oneStep();
    system.oneStep();
    expect(system.programCounter).toBe(5);
    expect(system.state.getSP()).toBe(initialSp - 1);
    expect(system.state.readMem(initialSp)).toBe(4);

    system.oneStep();
    expect(system.state.getSP()).toBe(initialSp - 2);
    expect(system.state.readMem(initialSp - 1)).toBe(3);

    system.oneStep();
    expect(system.state.readReg(1)).toBe(9);

    system.oneStep();
    expect(system.state.readReg(1)).toBe(3);
    expect(system.state.getSP()).toBe(initialSp - 1);

    system.oneStep();
    expect(system.state.readReg(1)).toBe(3);
    expect(system.programCounter).toBe(4);
    expect(system.state.getSP()).toBe(initialSp);
});
