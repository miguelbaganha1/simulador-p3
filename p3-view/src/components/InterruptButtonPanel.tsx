const INTERRUPT_BUTTONS = [
    0x7, 0x8, 0x9, 0xc,
    0x4, 0x5, 0x6, 0xd,
    0x1, 0x2, 0x3, 0xe,
    0x0, 0xa, 0xb,
] as const;

function formatButton(button: number): string {
    return `I${button.toString(16).toUpperCase()}`;
}

type InterruptButtonPanelProps = {
    pendingSources: number;
    onToggle: (button: number) => void;
};

export function InterruptButtonPanel({pendingSources, onToggle}: InterruptButtonPanelProps) {
    function renderInterruptButton(button: number): React.JSX.Element {
        const isPending = (pendingSources & (1 << button)) !== 0;

        function toggleInterrupt(): void {
            onToggle(button);
        }

        return (
            <button
                key={button}
                type="button"
                className={isPending ? "interrupt-button pressed" : "interrupt-button"}
                onClick={toggleInterrupt}
            >
                <span className="interrupt-button-cap">
                    {formatButton(button)}
                </span>
            </button>
        );
    }

    return (
        <section
            className="interrupt-button-panel"
        >
            {INTERRUPT_BUTTONS.map(renderInterruptButton)}
        </section>
    );
}
