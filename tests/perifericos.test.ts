import { describe, expect, it } from "vitest";
import { P3System } from "p3-system";
import { TimerDevice } from "../p3-system/src/peripherals/timer";

function createSystem(): P3System {
    const system = new P3System();
    system.loadSource("NOP");
    return system;
}

describe("LEDs, mostradores e interruptores", () => {
    it.each(Array.from({length: 16}, (_, bit) => bit))("o bit %i controla o LED correspondente", bit => {
        const system = createSystem();
        system.state.writeData(0xfff8, 1 << bit);
        expect(system.capturePeripherals().led.value).toBe(1 << bit);
        expect(system.capturePeripherals().io[0xfff8]?.value).toBe(1 << bit);
        system.state.writeData(0xfff8, 0);
        expect(system.capturePeripherals().led.value).toBe(0);
    });

    for (let digit = 0; digit < 4; digit++) {
        it.each(Array.from({length: 16}, (_, value) => value))(`o mostrador ${digit} apresenta %i e preserva os restantes`, value => {
            const system = createSystem();
            for (let index = 0; index < 4; index++) system.state.writeData(0xfff0 + index, index + 1);
            system.state.writeData(0xfff0 + digit, 0xab00 | value);
            const expected = [1, 2, 3, 4];
            expected[digit] = value;
            expect(system.capturePeripherals().display.digits).toEqual(expected);
            expect(system.capturePeripherals().io[0xfff0 + digit]?.value).toBe(0xab00 | value);
        });
    }

    it.each(Array.from({length: 8}, (_, bit) => bit))("o interruptor %i altera apenas o seu bit no porto FFF9h", bit => {
        const system = createSystem();
        system.setSwitch(bit, true);
        expect(system.state.readData(0xfff9)).toBe(1 << bit);
        expect(system.capturePeripherals().switches.value).toBe(1 << bit);
        expect(system.capturePeripherals().io[0xfff9]?.value).toBe(1 << bit);
        for (let index = 0; index < 8; index++) system.setSwitch(index, true);
        system.setSwitch(bit, false);
        expect(system.state.readData(0xfff9)).toBe(0xff ^ (1 << bit));
    });
});

describe("LCD", () => {
    it.each(Array.from({length: 32}, (_, position) => position))("escreve na posição %i sem avançar o cursor", position => {
        const system = createSystem();
        system.state.writeData(0xfff4, 0x8000 | position);
        system.state.writeData(0xfff5, 0x0141);
        const lcd = system.capturePeripherals().lcd;
        const expected = Array(32).fill(0x20);
        expected[position] = 0x41;
        expect(lcd.characters).toEqual(expected);
        expect(lcd.on).toBe(true);
        expect([lcd.row, lcd.column]).toEqual([Math.floor(position / 16), position % 16]);
    });

    for (const initialOn of [false, true]) {
        it.each([0x0020, 0x003f, 0x8020, 0x803f])(`o controlo %i limpa o LCD inicialmente ${initialOn ? "ligado" : "desligado"}`, control => {
            const system = createSystem();
            if (initialOn) system.state.writeData(0xfff4, 0x8000);
            system.state.writeData(0xfff5, 0x41);
            system.state.writeData(0xfff4, control);
            const lcd = system.capturePeripherals().lcd;
            expect(lcd.characters).toEqual(Array(32).fill(0x20));
            expect(lcd.on).toBe(control >= 0x8000 ? !initialOn : initialOn);
            expect([lcd.row, lcd.column]).toEqual(control % 0x20 === 0 ? [0, 0] : [1, 15]);
        });
    }

    it("ligar e desligar o LCD conserva os caracteres", () => {
        const system = createSystem();
        system.state.writeData(0xfff4, 0x8000);
        system.state.writeData(0xfff5, 0x41);
        system.state.writeData(0xfff4, 0x8000);
        expect(system.capturePeripherals().lcd.on).toBe(false);
        expect(system.capturePeripherals().lcd.characters[0]).toBe(0x41);
        system.state.writeData(0xfff4, 0x8000);
        expect(system.capturePeripherals().lcd.on).toBe(true);
        expect(system.capturePeripherals().lcd.characters[0]).toBe(0x41);
    });
});

describe("Janela de texto", () => {
    it("o estado não consome a tecla e um segundo clique cancela a entrada", () => {
        const system = createSystem();
        system.toggleVirtualTextCharacter(0x61);
        expect(system.state.readData(0xfffd)).toBe(1);
        expect(system.state.readData(0xfffd)).toBe(1);
        system.toggleVirtualTextCharacter(0x61);
        expect(system.state.readData(0xfffd)).toBe(0);
        system.toggleVirtualTextCharacter(0x62);
        system.toggleVirtualTextCharacter(0x63);
        expect(system.state.readData(0xffff)).toBe(0x63);
        expect(system.state.readData(0xfffd)).toBe(0);
    });

    it.each([[0x0001, 0], [0x0050, 79], [0x1701, 1840], [0x1750, 1919]])("o controlo %i escreve na posição %i", (control, position) => {
        const system = createSystem();
        system.state.writeData(0xfffc, 0xffff);
        system.state.writeData(0xfffc, control);
        system.state.writeData(0xfffe, 0x0141);
        expect(system.capturePeripherals().textWindow.characters[position]).toBe(0x41);
    });

    it("inicializar limpa a janela e repõe o cursor", () => {
        const system = createSystem();
        system.state.writeData(0xfffc, 0xffff);
        system.state.writeData(0xfffc, 0x0506);
        system.state.writeData(0xfffe, 0x41);
        system.state.writeData(0xfffc, 0xffff);
        const text = system.capturePeripherals().textWindow;
        expect(text.initialized).toBe(true);
        expect([text.cursorRow, text.cursorColumn]).toEqual([0, 0]);
        expect(text.characters).toEqual(Array(1920).fill(0x20));
    });

    it.each([0, 0x0051, 0x1801])("ignora a posição inválida %i", control => {
        const system = createSystem();
        system.state.writeData(0xfffc, 0xffff);
        system.state.writeData(0xfffc, 0x0102);
        system.state.writeData(0xfffc, control);
        const text = system.capturePeripherals().textWindow;
        expect([text.cursorRow, text.cursorColumn]).toEqual([1, 1]);
    });
});

describe("Temporizador e reposição dos periféricos", () => {
    it("reescrever a contagem durante a execução inicia um novo período completo", () => {
        let now = 0;
        let finished = 0;
        const timer = new TimerDevice(() => finished++, () => now);
        timer.writeCount(10);
        timer.writeControl(1);
        now = 350;
        timer.writeCount(2);
        now = 449;
        expect(timer.readCount()).toBe(2);
        now = 450;
        expect(timer.readCount()).toBe(1);
        now = 550;
        expect(timer.readCount()).toBe(0);
        expect(finished).toBe(1);
    });

    it("retoma a contagem parada sem incluir o tempo em pausa", () => {
        let now = 0;
        let finished = 0;
        const timer = new TimerDevice(() => finished++, () => now);
        timer.writeCount(3);
        timer.writeControl(1);
        now = 100;
        timer.writeControl(0);
        now = 1000;
        timer.writeControl(1);
        now = 1100;
        expect(timer.readCount()).toBe(1);
        expect(finished).toBe(0);
        now = 1200;
        expect(timer.readCount()).toBe(0);
        expect(finished).toBe(1);
    });

    it("carregar e reiniciar repõe os dispositivos e conserva os interruptores", () => {
        const system = createSystem();
        system.setSwitch(7, true);
        system.state.writeData(0xfff8, 0xffff);
        system.state.writeData(0xfff0, 15);
        system.state.writeData(0xfff4, 0x8000);
        system.state.writeData(0xfff5, 0x41);
        system.state.writeData(0xfff6, 10);
        system.state.writeData(0xfff7, 1);
        system.setInterruptMask(0xffff);
        system.toggleInterruptButton(0);
        system.toggleVirtualTextCharacter(0x61);
        system.loadSource("NOP");
        const peripherals = system.capturePeripherals();
        expect(peripherals.led.value).toBe(0);
        expect(peripherals.display.digits).toEqual([0, 0, 0, 0]);
        expect(peripherals.lcd.on).toBe(false);
        expect(peripherals.lcd.characters).toEqual(Array(32).fill(0x20));
        expect(peripherals.timerRunning).toBe(false);
        expect(peripherals.pendingInterruptSources).toBe(0);
        expect(peripherals.textWindow.pressedVirtualKey).toBeUndefined();
        expect(peripherals.switches.value).toBe(0x80);
        expect(peripherals.io[0xfffa]?.value).toBe(0);
        expect(peripherals.io[0xfff6]?.value).toBe(0);
        expect(peripherals.io[0xfff8]?.value).toBeUndefined();
        system.reset();
        expect(system.capturePeripherals().switches.value).toBe(0x80);
        system.resetAll();
        expect(system.capturePeripherals().switches.value).toBe(0);
    });
});
