import { useLayoutEffect, useRef } from "react";
import {type VirtualItem, useVirtualizer} from "@tanstack/react-virtual";
import {
    IO_BASE,
    MEMORY_SIZE,
    getMemoryCellRole,
    type IoPortSnapshot,
    type IoSnapshot,
    type MachineSnapshot,
} from "p3-system";
import { formatWord16 } from "../format";
import { EditableWord } from "./EditableWord";

const WORDS_PER_ROW = 8;
const ROW_COUNT = MEMORY_SIZE / WORDS_PER_ROW;
const ROW_HEIGHT = 23;

function getColumnOffset(_: unknown, offset: number): number {
    return offset;
}

const columnOffsets = Array.from(
    {length: WORDS_PER_ROW},
    getColumnOffset,
);

type MainMemoryPanelProps = {
    snapshot: MachineSnapshot;
    io: IoSnapshot;
    navigation: { address: number; } | undefined;
    editingDisabled: boolean;
    onMemoryChange: (address: number, value: number) => void;
};

export function MainMemoryPanel({snapshot, io, navigation, editingDisabled, onMemoryChange}: MainMemoryPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialAddress = useRef(navigation?.address ?? snapshot.pc);

    function getScrollElement(): HTMLDivElement | null {
        return scrollRef.current;
    }

    function estimateRowHeight(): number {
        return ROW_HEIGHT;
    }

    const rowVirtualizer = useVirtualizer({count: ROW_COUNT, getScrollElement, estimateSize: estimateRowHeight, overscan: 8});

    function navigateToAddress(): void {
        const scrollArea = scrollRef.current;
        if (scrollArea === null) return;
        const address = navigation?.address ?? initialAddress.current;
        const rowIndex = Math.floor(address / WORDS_PER_ROW);
        centerMemoryRow(scrollArea, rowIndex);
    }

    useLayoutEffect(navigateToAddress, [navigation]);

    function renderColumnHeader(offset: number): React.JSX.Element {
        return (
            <th key={offset}>+{offset}</th>
        );
    }

    function renderMemoryRow(virtualRow: VirtualItem): React.JSX.Element {
        const baseAddress = virtualRow.index * WORDS_PER_ROW;

        function renderMemoryCell(offset: number): React.JSX.Element {
            const address = baseAddress + offset;
            const role = getMemoryCellRole(snapshot, address);
            let word;

            if (address >= IO_BASE) {
                word = <IoMemoryWord port={io[address]} />;
            } else {
                const value = snapshot.memory.readWord(address);

                function changeMemoryWord(value: number): void {
                    onMemoryChange(address, value);
                }
                word = <EditableWord value={value} className="memory-word" disabled={editingDisabled} onChange={changeMemoryWord} />;
            }

            return (
                <td
                    key={offset}
                    className={role === undefined ? undefined : `memory-cell-${role}`}
                >
                    {word}
                </td>
            );
        }

        return (
            <tr
                key={virtualRow.key}
                className={baseAddress >= IO_BASE ? "memory-row-io" : undefined}
                style={{height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`}}
            >
                <th>
                    {formatWord16(baseAddress)}
                </th>
                {columnOffsets.map(renderMemoryCell)}
            </tr>
        );
    }

    return (
        <section className="panel main-memory-panel">
            <h2 className="panel-title">Memória</h2>
            <div className="scroll" ref={scrollRef}>
                <table className="memory-table">
                    <thead>
                        <tr>
                            <th>Endereço</th>
                            {columnOffsets.map(renderColumnHeader)}
                        </tr>
                    </thead>
                    <tbody
                        style={{height: `${rowVirtualizer.getTotalSize()}px`}}
                    >
                        {rowVirtualizer.getVirtualItems().map(renderMemoryRow)}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function IoMemoryWord({port}: {port: IoPortSnapshot | undefined;}) {
    const value = port?.value === undefined ? "----" : formatWord16(port.value);

    return (
        <span
            className="memory-word memory-word-io"
            tabIndex={0}
        >
            {value}
        </span>
    );
}

function centerMemoryRow(scrollArea: HTMLElement, rowIndex: number): void {
    const visibleBodyHeight = scrollArea.clientHeight - ROW_HEIGHT;
    const rowCenter = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    scrollArea.scrollTop = Math.max(0, rowCenter - visibleBodyHeight / 2);
}
