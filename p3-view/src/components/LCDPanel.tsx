import type { LCDSnapshot } from "p3-system";

type LCDPanelProps = {
    lcd: LCDSnapshot;
};

function formatCharacter(code: number): string {
    const isASCII = code >= 0x20 && code <= 0x7F;
    const isExtended = code >= 0xA0 && code <= 0xFF;
    return (isASCII || isExtended) ? String.fromCharCode(code) : " ";
}

export function LCDPanel({lcd}: LCDPanelProps) {
    function renderCharacter(code: number, i: number): React.JSX.Element {
        return (
            <span key={i} className="lcd-cell">
                {lcd.on ? formatCharacter(code) : "\u00a0"}
            </span>
        );
    }

    return (
        <section className="lcd-panel">
            <div className="lcd-border">
                <div className={lcd.on ? "lcd-screen lcd-screen-on" : "lcd-screen lcd-screen-off"}>
                    {lcd.characters.map(renderCharacter)}
                </div>
            </div>
        </section>
    );
}
