import { RUN_INTERVAL_OPTIONS } from "../useP3System";

type EditorControlsProps = {
    isRunning: boolean;
    onLoad: () => void;
    onClear: () => void;
};

export function EditorControls({isRunning, onLoad, onClear}: EditorControlsProps) {
    return (
        <section className="panel control-panel">
            <h2 className="panel-title">Comandos</h2>
            <div className="control-panel-body">
                <div className="control-bar">
                    <button type="button" className="control-bar-button" disabled={isRunning} onClick={onLoad}>Carregar</button>
                    <button type="button" className="control-bar-button" disabled={isRunning} onClick={onClear}>Limpar</button>
                </div>
            </div>
        </section>
    );
}

type ExecutionControlsProps = {
    isRunning: boolean;
    runIntervalMs: number;
    onRunIntervalChange: (intervalMs: number) => void;
    onStep: () => void;
    onRun: () => Promise<void>;
    onPause: () => void;
    onRestart: () => void;
};

export function ExecutionControls({isRunning, runIntervalMs, onRunIntervalChange, onStep, onRun, onPause, onRestart}: ExecutionControlsProps) {
    function changeRunInterval(event: React.ChangeEvent<HTMLSelectElement>): void {
        onRunIntervalChange(Number(event.target.value));
    }

    function renderRunInterval(interval: number): React.JSX.Element {
        return (
            <option key={interval} value={interval}>
                {formatRunInterval(interval)}
            </option>
        );
    }

    return (
        <section className="panel control-panel">
            <h2 className="panel-title">Comandos</h2>
            <div className="control-panel-body">
                <div className="control-bar">
                    <button
                        type="button"
                        className="control-bar-button"
                        disabled={isRunning}
                        onClick={onStep}
                    >
                        Instrução
                    </button>

                    <div
                        className={isRunning ? "run-control run-control-disabled" : "run-control"}
                    >
                        <button
                            type="button"
                            className="run-button"
                            disabled={isRunning}
                            onClick={onRun}
                        >
                            Corre
                        </button>
                        <select
                            className="run-interval-select"
                            value={runIntervalMs}
                            disabled={isRunning}
                            onChange={changeRunInterval}
                        >
                            {RUN_INTERVAL_OPTIONS.map(renderRunInterval)}
                        </select>
                    </div>

                    <button
                        type="button"
                        className="control-bar-button"
                        disabled={!isRunning}
                        onClick={onPause}
                    >
                        Pausar
                    </button>
                    <button
                        type="button"
                        className="control-bar-button"
                        disabled={isRunning}
                        onClick={onRestart}
                    >
                        Reinicia
                    </button>

                </div>
            </div>
        </section>
    );
}

function formatRunInterval(intervalMs: number): string {
    if (intervalMs === 0) return "0 s";
    if (intervalMs < 1000) return `${intervalMs} ms`;
    return `${String(intervalMs / 1000).replace(".", ",")} s`;
}
