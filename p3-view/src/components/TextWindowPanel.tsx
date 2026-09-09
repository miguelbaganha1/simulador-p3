import type { TextWindowSnapshot } from "p3-system";
import { TextKeyboard } from "./TextKeyboard";

const TEXT_WINDOW_COLUMNS = 80;

type TextWindowPanelProps = {
    textWindow: TextWindowSnapshot;
    onToggleVirtualCharacter: (value: number) => void;
};

function formatCharacter(code: number): string {
    const isPrintableASCII = code >= 0x20 && code <= 0x7e;
    const isExtendedCharacter = code >= 0xa0 && code <= 0xff;
    return isPrintableASCII || isExtendedCharacter ? String.fromCharCode(code) : "\u00a0";
}

export function TextWindowPanel({textWindow, onToggleVirtualCharacter}: TextWindowPanelProps) {
    const cursorIndex =
        textWindow.cursorRow * TEXT_WINDOW_COLUMNS +
        textWindow.cursorColumn;

    function renderCharacter(code: number, index: number): React.JSX.Element {
        return (
            <span
                key={index}
                className={index === cursorIndex ? "text-window-cell text-window-cursor" : "text-window-cell"}
            >
                {formatCharacter(code)}
            </span>
        );
    }

    return (
        <section className="panel text-window-panel">
            <div className="text-window-frame">
                <div className="text-window-screen">
                    {textWindow.characters.map(renderCharacter)}
                </div>
            </div>
            <TextKeyboard
                pressedKey={textWindow.pressedVirtualKey}
                onToggle={onToggleVirtualCharacter}
            />
        </section>
    );
}
