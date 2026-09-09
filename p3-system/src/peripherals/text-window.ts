import type { TextWindowSnapshot } from "./types";

const TEXT_WINDOW_ROWS = 24;
const TEXT_WINDOW_COLUMNS = 80;
const TEXT_WINDOW_CELL_COUNT = TEXT_WINDOW_ROWS * TEXT_WINDOW_COLUMNS;
const SPACE_CHARACTER = 0x20;

export class TextWindowDevice {
    private initialized = false;
    private cursor = 0;
    private pendingInput: number | undefined;
    private readonly characters = new Uint8Array(TEXT_WINDOW_CELL_COUNT);

    public constructor() {
        this.reset();
    }

    public reset(): void {
        this.initialized = false;
        this.clearOutput();
        this.pendingInput = undefined;
    }

    public readStatus(): number {
        return this.pendingInput === undefined ? 0 : 1;
    }

    public readCharacter(): number {
        const character = this.peekCharacter();
        this.pendingInput = undefined;
        return character;
    }

    public peekCharacter(): number {
        return this.pendingInput ?? 0;
    }

    public writeCharacter(value: number): void {
        const character = value & 0x00ff;

        if (this.cursor === TEXT_WINDOW_CELL_COUNT) {
            this.characters.copyWithin(0, 1);
            this.characters[TEXT_WINDOW_CELL_COUNT - 1] = character;
            return;
        }

        this.characters[this.cursor] = character;
        this.cursor++;
    }

    public writeControl(value: number): void {
        const control = value & 0xffff;

        if (control === 0xffff) {
            this.initialized = true;
            this.clearOutput();
            return;
        }

        if (!this.initialized) return;

        const row = (control >>> 8) & 0x00ff;
        const externalColumn = control & 0x00ff;

        if (
            row >= TEXT_WINDOW_ROWS ||
            externalColumn < 1 ||
            externalColumn > TEXT_WINDOW_COLUMNS
        ) {
            return;
        }

        this.cursor = row * TEXT_WINDOW_COLUMNS + externalColumn - 1;
    }

    public toggleVirtualCharacter(value: number): void {
        const character = value & 0x00ff;

        if (this.pendingInput === character) {
            this.pendingInput = undefined;
            return;
        }

        this.pendingInput = character;
    }

    public captureSnapshot(): TextWindowSnapshot {
        const visibleCursor = Math.min(this.cursor, TEXT_WINDOW_CELL_COUNT - 1);

        const cursorRow = Math.floor(visibleCursor / TEXT_WINDOW_COLUMNS);
        const cursorColumn = visibleCursor % TEXT_WINDOW_COLUMNS;
        const characters = Array.from(this.characters);
        return {initialized: this.initialized, cursorRow, cursorColumn, pressedVirtualKey: this.pendingInput, characters};
    }

    private clearOutput(): void {
        this.characters.fill(SPACE_CHARACTER);
        this.cursor = 0;
    }
}
