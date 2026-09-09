import { expect, it } from "vitest";
import { P3System } from "p3-system";

it("observa a entrada sem a consumir e escreve a letra lida na janela de texto", () => {
    const system = new P3System();
    system.loadSource(`
        MOV R1, FFFFh
        MOV M[FFFCh], R1
        MOV R1, M[FFFFh]
        MOV M[FFFEh], R1
    `);
    system.oneStep();
    system.oneStep();
    expect(system.capturePeripherals().textWindow.initialized).toBe(true);

    system.toggleVirtualTextCharacter(0x61);
    for (let i = 0; i < 2; i++) {
        const snapshot = system.captureSnapshot();
        expect(snapshot.peripherals.io[0xffff]!.value).toBe(0x61);
        expect(snapshot.peripherals.textWindow.pressedVirtualKey).toBe(0x61);
    }

    system.oneStep();
    expect(system.state.readReg(1)).toBe(0x61);
    expect(system.capturePeripherals().textWindow.pressedVirtualKey).toBeUndefined();

    system.oneStep();
    const text = system.capturePeripherals().textWindow;
    expect(text.characters[0]).toBe(0x61);
    expect(text.cursorRow).toBe(0);
    expect(text.cursorColumn).toBe(1);
});
