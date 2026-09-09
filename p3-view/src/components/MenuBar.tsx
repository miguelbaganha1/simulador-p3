import { useEffect, useRef, useState } from "react";
import { EditableWord } from "./EditableWord";

type MenuBarProps = {
    onNewFile: () => void | Promise<void>;
    onOpenFile: (file: File) => void | Promise<void>;
    onSaveFile: () => void;
    interruptMask: number;
    onInterruptMaskChange: (value: number) => void;
    maxSteps: number;
    onMaxStepsChange: (value: number) => void;
    isRunning: boolean;
};

export function MenuBar({onNewFile, onOpenFile, onSaveFile, interruptMask, onInterruptMaskChange, maxSteps, onMaxStepsChange, isRunning}: MenuBarProps) {
    const [openMenu, setOpenMenu] = useState<"file" | "edit" | null>(null);
    const [editOption, setEditOption] = useState<"mask" | "maxSteps" | null>(null);
    const menuRef = useRef<HTMLElement>(null);
    const fileMenuButtonRef = useRef<HTMLButtonElement>(null);
    const editMenuButtonRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function watchMenu(): (() => void) | undefined {
        if (openMenu === null) {
            return;
        }

        function handleClick(event: MouseEvent): void {
            if (!menuRef.current?.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key !== "Escape") {
                return;
            }

            setOpenMenu(null);
            const button = openMenu === "file" ? fileMenuButtonRef : editMenuButtonRef;
            button.current?.focus();
        }

        document.addEventListener("click", handleClick, true);
        document.addEventListener("keydown", handleKeyDown);

        function stopWatchingMenu(): void {
            document.removeEventListener("click", handleClick, true);
            document.removeEventListener("keydown", handleKeyDown);
        }

        return stopWatchingMenu;
    }

    useEffect(watchMenu, [openMenu]);

    function toggleMenu(menu: "file" | "edit"): void {
        function selectMenu(current: "file" | "edit" | null): "file" | "edit" | null {
            return current === menu ? null : menu;
        }

        setOpenMenu(selectMenu);
        setEditOption(null);
    }

    function createNewFile(): void {
        setOpenMenu(null);
        void onNewFile();
    }

    function chooseFile(): void {
        setOpenMenu(null);

        if (fileInputRef.current !== null) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    }

    function saveFile(): void {
        setOpenMenu(null);
        onSaveFile();
    }

    function openSelectedFile(event: React.ChangeEvent<HTMLInputElement>): void {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";

        if (file !== undefined) {
            void onOpenFile(file);
        }
    }

    function toggleFileMenu(): void {
        toggleMenu("file");
    }

    function toggleEditMenu(): void {
        toggleMenu("edit");
    }

    function toggleMaskOption(): void {
        function selectMaskOption(current: "mask" | "maxSteps" | null): "mask" | null {
            return current === "mask" ? null : "mask";
        }

        setEditOption(selectMaskOption);
    }

    function toggleMaxStepsOption(): void {
        function selectMaxStepsOption(current: "mask" | "maxSteps" | null): "maxSteps" | null {
            return current === "maxSteps" ? null : "maxSteps";
        }

        setEditOption(selectMaxStepsOption);
    }

    function selectMaxSteps(event: React.FocusEvent<HTMLInputElement>): void {
        event.currentTarget.select();
    }

    function commitMaxSteps(event: React.FocusEvent<HTMLInputElement>): void {
        const input = event.currentTarget;

        if (input.validity.valid) {
            onMaxStepsChange(Number(input.value));
        } else {
            input.value = String(maxSteps);
        }
    }

    function handleMaxStepsKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
        const input = event.currentTarget;

        if (event.key === "Enter") {
            event.preventDefault();
            if (input.reportValidity()) input.blur();
        } else if (event.key === "Escape") {
            input.value = String(maxSteps);
        }
    }

    return (
        <nav className="menu-bar" ref={menuRef}>
            <div className="menu-bar-item">
                <button
                    ref={fileMenuButtonRef}
                    type="button"
                    className={openMenu === "file" ? "menu-bar-button menu-bar-button-open" : "menu-bar-button"}
                    onClick={toggleFileMenu}
                >
                    Ficheiro
                </button>

                {openMenu === "file" && (
                    <div className="dropdown-menu">
                        <button
                            type="button"
                            className="menu-option"
                            onClick={createNewFile}
                        >
                            Novo
                        </button>
                        <button
                            type="button"
                            className="menu-option"
                            onClick={chooseFile}
                        >
                            Abrir
                        </button>
                        <button
                            type="button"
                            className="menu-option"
                            onClick={saveFile}
                        >
                            Guardar
                        </button>
                    </div>
                )}
            </div>

            <div className="menu-bar-item">
                <button
                    ref={editMenuButtonRef}
                    type="button"
                    className={openMenu === "edit" ? "menu-bar-button menu-bar-button-open" : "menu-bar-button"}
                    onClick={toggleEditMenu}
                >
                    Editar
                </button>

                {openMenu === "edit" && (
                    <div className="dropdown-menu">
                        <div className="menu-option-row">
                            <button
                                type="button"
                                className="menu-option"
                                {...{expanded: String(editOption === "mask")}}
                                onClick={toggleMaskOption}
                            >
                                Máscara
                            </button>
                            {editOption === "mask" && (
                                <div
                                    className="dropdown-menu edit-menu-value"
                                    title="0000h–FFFFh. Cada bit a 1 habilita a respectiva interrupção."
                                >
                                    <EditableWord
                                        value={interruptMask}
                                        className="cell menu-value"
                                        disabled={isRunning}
                                        onChange={onInterruptMaskChange}
                                    />
                                    <span>h</span>
                                </div>
                            )}
                        </div>
                        <div className="menu-option-row">
                            <button
                                type="button"
                                className="menu-option"
                                {...{expanded: String(editOption === "maxSteps")}}
                                onClick={toggleMaxStepsOption}
                            >
                                Max Instruções
                            </button>
                            {editOption === "maxSteps" && (
                                <div className="dropdown-menu edit-menu-value">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        pattern="[1-9][0-9]{0,5}"
                                        autoComplete="off"
                                        className="cell menu-value"
                                        title="De 1 a 999999 instruções por execução."
                                        required
                                        defaultValue={maxSteps}
                                        disabled={isRunning}
                                        onFocus={selectMaxSteps}
                                        onBlur={commitMaxSteps}
                                        onKeyDown={handleMaxStepsKeyDown}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".p3,.as,.asm,.txt,text/plain"
                hidden
                onChange={openSelectedFile}
            />
        </nav>
    );
}
