import { MEMORY_PAGE_COUNT, MEMORY_PAGE_WORD_COUNT, MEMORY_SIZE, type P3State } from "p3-core";

export type MemoryPageSnapshot = {
    version: number;
    words: Uint16Array;
};

export type MemorySnapshot = {
    pages: readonly MemoryPageSnapshot[];
};

export function captureMemorySnapshot(state: P3State, previous?: MemorySnapshot): MemorySnapshot {
    const pages: MemoryPageSnapshot[] = [];
    let changed = previous === undefined;

    for (let page = 0; page < MEMORY_PAGE_COUNT; page++) {
        const version = state.getMemoryPageVersion(page);
        const previousPage = previous?.pages[page];

        if (previousPage?.version === version) {
            pages.push(previousPage);
            continue;
        }

        changed = true;
        pages.push({version, words: state.copyMemoryPage(page)});
    }

    if (!changed && previous !== undefined) {
        return previous;
    }

    return {pages};
}

export class MemoryView {
    private readonly owner: P3State;
    private readonly snapshot: MemorySnapshot;

    private constructor(owner: P3State, snapshot: MemorySnapshot) {
        this.owner = owner;
        this.snapshot = snapshot;
    }

    public readWord(address: number): number {
        if (!Number.isInteger(address) || address < 0 || address >= MEMORY_SIZE) {
            throw new Error(`Endereço de memória inválido: ${address}`);
        }

        const pageIndex = Math.floor(address / MEMORY_PAGE_WORD_COUNT);
        const wordIndex = address % MEMORY_PAGE_WORD_COUNT;
        const page = this.snapshot.pages[pageIndex]!;

        return page.words[wordIndex]!;
    }

    public static capture(state: P3State, previous?: MemoryView): MemoryView {
        let previousSnapshot: MemorySnapshot | undefined;
        if (previous !== undefined && previous.owner === state) {
            previousSnapshot = previous.snapshot;
        }
        const snapshot = captureMemorySnapshot(state, previousSnapshot);
        if (snapshot === previousSnapshot && previous !== undefined) {
            return previous;
        }
        return new MemoryView(state, snapshot);
    }
}
