export function formatWord16(value: number): string {
    return (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
