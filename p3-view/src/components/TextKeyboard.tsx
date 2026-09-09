import { useState } from "react";

const CHARACTER_ROWS = ["1234567890-=", "qwertyuiop()\\", "asdfghjkl;[]", "zxcvbnm,.:"] as const;
const SHIFT_ROWS = ["!@#$%^&*'`_+", "QWERTYUIOP{}|", "ASDFGHJKL:\"~", "ZXCVBNM<>?"] as const;
const ARITHMETIC_OPERATORS = "+-*/";

type TextKeyboardProps = {
    pressedKey: number | undefined;
    onToggle: (value: number) => void;
};

type TextKeyProps = {
    label: string;
    value: number;
    pressedKey: number | undefined;
    width?: "space" | "enter" | "backspace";
    onToggle: (value: number) => void;
};

function getKeyClassName(isPressed: boolean, width: TextKeyProps["width"]): string {
    let className = "text-keyboard-key";

    if (width !== undefined) {
        className += ` text-keyboard-key-${width}`;
    }

    if (isPressed) {
        className += " pressed";
    }

    return className;
}

function TextKey({label, value, pressedKey, width, onToggle}: TextKeyProps) {
    const isPressed = pressedKey === value;

    function toggleKey(): void {
        onToggle(value);
    }

    return (
        <button
            type="button"
            className={getKeyClassName(isPressed, width)}
            onClick={toggleKey}
        >
            {label}
        </button>
    );
}

export function TextKeyboard({pressedKey, onToggle}: TextKeyboardProps) {
    const [shift, setShift] = useState(pressedKey !== undefined && SHIFT_ROWS.some(row => row.includes(String.fromCharCode(pressedKey))) && !CHARACTER_ROWS.some(row => row.includes(String.fromCharCode(pressedKey))));
    const rows = shift ? SHIFT_ROWS : CHARACTER_ROWS;

    function toggleShift(): void {
        setShift(!shift);
    }

    function renderKeyboardRow(row: string): React.JSX.Element {
        function renderCharacterKey(character: string): React.JSX.Element {
            return (
                <TextKey
                    key={character}
                    label={character}
                    value={character.charCodeAt(0)}
                    pressedKey={pressedKey}
                    onToggle={onToggle}
                />
            );
        }

        return (
            <div key={row} className="text-keyboard-row">
                {Array.from(row).map(renderCharacterKey)}
            </div>
        );
    }

    function renderOperatorKey(operator: string): React.JSX.Element {
        return (
            <TextKey
                key={operator}
                label={operator}
                value={operator.charCodeAt(0)}
                pressedKey={pressedKey}
                onToggle={onToggle}
            />
        );
    }

    return (
        <section className="text-keyboard">
            <div className="text-keyboard-classic">
                {rows.map(renderKeyboardRow)}
                <div className="text-keyboard-row">
                    <button
                        type="button"
                        className={shift ? "text-keyboard-key text-keyboard-key-shift pressed" : "text-keyboard-key text-keyboard-key-shift"}
                        onClick={toggleShift}
                    >
                        Shift
                    </button>
                    <TextKey
                        label=""
                        value={0x20}
                        width="space"
                        pressedKey={pressedKey}
                        onToggle={onToggle}
                    />
                    <TextKey
                        label="Enter"
                        value={0x0d}
                        width="enter"
                        pressedKey={pressedKey}
                        onToggle={onToggle}
                    />
                </div>
            </div>
            <div className="text-keyboard-operations">
                <TextKey
                    label="⌫"
                    value={0x08}
                    width="backspace"
                    pressedKey={pressedKey}
                    onToggle={onToggle}
                />
                {Array.from(ARITHMETIC_OPERATORS).map(renderOperatorKey)}
            </div>
        </section>
    );
}
