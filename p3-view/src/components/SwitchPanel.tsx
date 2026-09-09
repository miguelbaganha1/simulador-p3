import type { SwitchSnapshot } from "p3-system";

const SWITCH_BITS = [7, 6, 5, 4, 3, 2, 1, 0] as const;

type SwitchPanelProps = {
    switches: SwitchSnapshot;
    onChange: (switchIndex: number, isUp: boolean) => void;
};

export function SwitchPanel({switches, onChange}: SwitchPanelProps) {
    function renderSwitch(bit: number): React.JSX.Element {
        const isUp = (switches.value & (1 << bit)) !== 0;

        function toggleSwitch(): void {
            onChange(bit, !isUp);
        }

        return (
            <button
                key={bit}
                type="button"
                className={isUp ? "switch-control" : "switch-control switch-down"}
                onClick={toggleSwitch}
            >
                <span
                    className="switch-track"
                >
                    <span className="switch-handle" />
                </span>
                <span className="switch-label">{bit}</span>
            </button>
        );
    }

    return (
        <section
            className="switch-panel"
        >
            {SWITCH_BITS.map(renderSwitch)}
        </section>
    );
}
