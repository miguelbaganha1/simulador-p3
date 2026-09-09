export const MEMORY_SIZE = 0x10000;
export const MEMORY_PAGE_WORD_COUNT = 0x0100;
export const MEMORY_PAGE_COUNT = MEMORY_SIZE / MEMORY_PAGE_WORD_COUNT;
export const WORD_MASK = 0xffff;

export const RAM_BASE = 0x0000;
export const RAM_END = 0xfdff;
export const INTERRUPT_VECTOR_BASE = 0xfe00;
export const INTERRUPT_VECTOR_END = 0xfeff;
export const IO_BASE = 0xff00;
export const IO_END = 0xffff;

export function signExtend(value: number, bits: number): number {
    const mask = 1 << (bits - 1);
    const trimmed = value & ((1 << bits) - 1);

    if ((trimmed & mask) !== 0) {
        return trimmed - (1 << bits);
    }

    return trimmed;
}

export function toWord16(value: number): number {
    return value & WORD_MASK;
}

export function toSignedWord16(value: number): number {
    return signExtend(value, 16);
}
