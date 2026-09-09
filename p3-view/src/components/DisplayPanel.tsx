import type { DisplaySnapshot } from "p3-system";

const SEGMENTS: readonly string[] = ["a", "b", "c", "d", "e", "f", "g"];
const DIGIT_ORDER = [3, 2, 1, 0] as const;
const SEGMENT_CHARACTERS: readonly number[] = [
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6d, 0x7d, 0x07,
    0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5e, 0x79, 0x71
];


type DisplayPanelProps = {
    display: DisplaySnapshot;
};

type DisplayDigitProp = {
    value: number;
};

function DisplayDigit({value}: DisplayDigitProp) {
    const segments = SEGMENT_CHARACTERS[value]!;

    function renderSegment(segment: string, segmentIndex: number): React.JSX.Element {
        const on: boolean = (segments & (1 << segmentIndex)) !== 0;

        return (
            <span
                key={segment}
                className={`display segment-${segment} ${on ? "segment-on" : "segment-off"}`}
            />
        );
    }

    return (
        <span
            className="display-digit"
        >
            {SEGMENTS.map(renderSegment)}
        </span>
    );
}

export function DisplayPanel({display}: DisplayPanelProps) {
    function renderDigit(index: 0 | 1 | 2 | 3): React.JSX.Element {
        return (
            <DisplayDigit
                key={index}
                value={display.digits[index]}
            />
        );
    }

    return (
        <section className="display-panel">
            {DIGIT_ORDER.map(renderDigit)}
        </section>
    );
}
