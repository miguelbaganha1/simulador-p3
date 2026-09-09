import type { ReactNode } from "react";
import { formatWord16 } from "../format";
import type { AssemblyListRow } from "p3-system";

type AssemblyListingPanelProps = {
    assemblyList: readonly AssemblyListRow[];
    pc: number;
    lastExecutedPc: number | undefined;
    breakpointAddresses: ReadonlySet<number>;
};

export function AssemblyListingPanel({assemblyList, pc, lastExecutedPc, breakpointAddresses}: AssemblyListingPanelProps) {
    let rows: ReactNode;
    if (assemblyList.length === 0) {
        rows = <tr><td colSpan={5}><CellContent>Nenhum programa carregado.</CellContent></td></tr>;
    } else {
        function renderInstruction(row: AssemblyListRow): React.JSX.Element {
            const className = instructionRowClassName(row, pc, lastExecutedPc, breakpointAddresses);
            const address = formatWord16(row.address);
            const words = row.words.map(formatWord16);
            const code = words.join(" ");
            const label = row.label ?? "";

            return (
                <tr key={row.address} className={className}>
                    <td className="assembly-address"><CellContent><span className="assembly-breakpoint-marker" /> {address} </CellContent></td>
                    <td className="assembly-code"><CellContent> {code} </CellContent></td>
                    <td className="assembly-label"><CellContent>{label}</CellContent></td>
                    <td className="assembly-operation"><CellContent>{row.operation}</CellContent></td>
                    <td><CellContent>{row.argumentText}</CellContent></td>
                </tr>
            );
        }

        rows = assemblyList.map(renderInstruction);
    }

    return (
        <section className="panel instruction-panel">
            <h2 className="panel-title">Instruções</h2>
            <table className="instruction-table">
                <thead>
                    <tr>
                        <th>
                            <CellContent>Endereço</CellContent>
                        </th>
                        <th>
                            <CellContent>Código</CellContent>
                        </th>
                        <th>
                            <CellContent>Label</CellContent>
                        </th>
                        <th>
                            <CellContent>Instrução</CellContent>
                        </th>
                        <th>
                            <CellContent>Argumentos</CellContent>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </section>
    );
}

function CellContent({children}: {children: ReactNode;}) {
    return <div className="instruction-cell-content">{children}</div>;
}

function isCurrent(row: AssemblyListRow, pc: number): boolean {
    return pc >= row.address && pc < row.address + row.words.length;
}

function instructionRowClassName(row: AssemblyListRow, pc: number, lastExecutedPc: number | undefined, breakpointAddresses: ReadonlySet<number>): string | undefined {
    const classNames: string[] = [];

    if (isCurrent(row, pc)) {
        classNames.push("current-instruction-row");
    } else if (lastExecutedPc !== undefined && isCurrent(row, lastExecutedPc)) {
        classNames.push("previous-instruction-row");
    }

    if (breakpointAddresses.has(row.address)) {
        classNames.push("breakpoint-instruction-row");
    }

    return classNames.length === 0 ? undefined : classNames.join(" ");
}
