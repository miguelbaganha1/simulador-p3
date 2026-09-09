export type LCDSnapshot = {
    on: boolean;
    row: 0 | 1;
    column: number;
    characters: readonly number[];
};

export type LEDSnapshot = {
    value: number;
};

export type SwitchSnapshot = {
    value: number;
};

export type DisplaySnapshot = {
    digits: readonly [number, number, number, number];
};

export type TextWindowSnapshot = {
    initialized: boolean;
    cursorRow: number;
    cursorColumn: number;
    pressedVirtualKey: number | undefined;
    characters: readonly number[];
};

export type IoPortSnapshot = {
    readonly value: number | undefined;
};

export type IoSnapshot = Readonly<Partial<Record<number, IoPortSnapshot>>>;

export type PeripheralsSnapshot = {
    lcd: LCDSnapshot;
    led: LEDSnapshot;
    switches: SwitchSnapshot;
    display: DisplaySnapshot;
    textWindow: TextWindowSnapshot;
    pendingInterruptSources: number;
    io: IoSnapshot;
    timerRunning: boolean;
};
