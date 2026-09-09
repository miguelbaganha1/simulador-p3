import { useLayoutEffect, useRef, useState } from "react";
import { formatWord16 } from "../format";

type EditableWordProps = {
    value: number;
    className: string;
    disabled?: boolean;
    onChange: (value: number) => void;
};

export function EditableWord({value, className, disabled = false, onChange}: EditableWordProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [invalid, setInvalid] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const editFinished = useRef(false);

    function focusInput(): void {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }

    useLayoutEffect(focusInput, [editing]);

    function beginEdit(): void {
        if (disabled) return;
        editFinished.current = false;
        setDraft(formatWord16(value));
        setInvalid(false);
        setEditing(true);
    }

    function commitEdit(): boolean {
        const parsed = parseHexWord(draft);

        if (parsed === undefined) {
            setInvalid(true);
            return false;
        }

        editFinished.current = true;
        setEditing(false);

        if (parsed !== value) {
            onChange(parsed);
        }

        return true;
    }

    function cancelEdit(): void {
        editFinished.current = true;
        setEditing(false);
        setInvalid(false);
    }

    if (editing) {
        function changeDraft(event: React.ChangeEvent<HTMLInputElement>): void {
            setDraft(event.target.value.toUpperCase());
            setInvalid(false);
        }

        function finishEdit(): void {
            if (editFinished.current) return;

            if (!commitEdit()) {
                cancelEdit();
            }
        }

        function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
            if (event.key === "Enter") {
                event.preventDefault();
                commitEdit();
            } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
            }
        }

        return (
            <input
                ref={inputRef}
                className={`${className} editable-word-input`}
                value={draft}
                maxLength={4}
                inputMode="text"
                spellCheck={false}
                {...{invalid: String(invalid)}}
                onChange={changeDraft}
                onBlur={finishEdit}
                onKeyDown={handleKeyDown}
            />
        );
    }

    return (
        <button
            type="button"
            className={`${className} editable-word`}
            disabled={disabled}
            onClick={beginEdit}
        >
            {formatWord16(value)}
        </button>
    );
}

function parseHexWord(value: string): number | undefined {
    const trimmed = value.trim();

    if (!/^[0-9A-F]{1,4}$/i.test(trimmed)) {
        return undefined;
    }

    return Number.parseInt(trimmed, 16);
}
