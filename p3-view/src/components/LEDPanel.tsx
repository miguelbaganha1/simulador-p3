import type { LEDSnapshot } from "p3-system";

type LEDPanelProps = {
    leds: LEDSnapshot;
};

export function LEDPanel({leds}: LEDPanelProps) {
    const bits = [];
    for (let i = 0; i < 16; i++) {
        bits.push(15 - i);
    }

    function renderLed(bit: number): React.JSX.Element {
        const isOn = ((leds.value >>> bit) & 1) === 1;

        return (
            <span
                key={bit}
                className={isOn ? "led led-on" : "led led-off"}
            />
        );
    }

    return (
        <section className="led-panel">
            {bits.map(renderLed)}
        </section>
    );
}
