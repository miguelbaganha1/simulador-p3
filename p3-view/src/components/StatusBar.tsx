import { formatWord16 } from "../format";
import type { P3UiStatus } from "../useP3System";
import type { MachineSnapshot } from "p3-system";

type StatusBarProps = {
    snapshot: MachineSnapshot;
    status: P3UiStatus;
    onMemoryNavigate: (address: number) => void;
};

export function StatusBar({snapshot, status, onMemoryNavigate}: StatusBarProps) {
    function navigateToProgramCounter(): void {
        onMemoryNavigate(snapshot.pc);
    }

    function navigateToStackPointer(): void {
        onMemoryNavigate(snapshot.sp);
    }

    return (
        <div className="status-bar">
            <span>Instruções <strong>{snapshot.instructionCount}</strong></span>
            <span>Estado <strong>{formatStatus(status)}</strong></span>
            <button
                type="button"
                className="status-memory-button"
                onClick={navigateToProgramCounter}
            >
                PC <strong>{formatWord16(snapshot.pc)}h</strong>
            </button>
            <button
                type="button"
                className="status-memory-button"
                onClick={navigateToStackPointer}
            >
                SP <strong>{formatWord16(snapshot.sp)}h</strong>
            </button>
            <span>RE <strong>{formatWord16(snapshot.re)}h</strong></span>
            <span className="status-message">{status.message}</span>
        </div>
    );
}

function formatStatus(status: P3UiStatus): string {
    switch (status.kind) {
        case "idle":
            return "Sem programa";
        case "ready":
            return "Pronto";
        case "loaded":
            return "Carregado";
        case "running":
            return "A executar";
        case "stopped":
            return "Parado";
        case "error":
            return "Erro";
    }
}
