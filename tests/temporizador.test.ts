import { describe, expect, it, vi } from "vitest";
import { TimerDevice } from "../p3-system/src/peripherals/timer";

describe("Contagem do temporizador", () => {
    it("preserva a fracção de tempo e notifica o fim da contagem uma única vez", () => {
        let now = 0;
        const finished = vi.fn();
        const timer = new TimerDevice(finished, () => now);
        timer.writeCount(10);
        timer.writeControl(1);

        now = 350;
        expect(timer.readCount()).toBe(7);
        now = 400;
        expect(timer.readCount()).toBe(6);
        expect(finished).not.toHaveBeenCalled();

        now = 1000;
        expect(timer.readCount()).toBe(0);
        timer.readCount();
        expect(finished).toHaveBeenCalledTimes(1);
        expect(timer.readControl()).toBe(0);
    });

    it("mantém a contagem depois de writeControl(0), mesmo com o avanço do tempo", () => {
        let now = 0;
        const finished = vi.fn();
        const timer = new TimerDevice(finished, () => now);
        timer.writeCount(10);
        timer.writeControl(1);

        now = 350;
        timer.writeControl(0);
        expect(timer.readCount()).toBe(7);
        expect(timer.readControl()).toBe(0);

        now = 2000;
        expect(timer.readCount()).toBe(7);
        expect(finished).not.toHaveBeenCalled();
    });
});
