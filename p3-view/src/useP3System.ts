import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_STEPS, FlagBit, PERIPHERALS_REFRESH_INTERVAL_MS } from "p3-system";
import type {
    AssemblyListRow,
    P3Snapshot,
    P3System,
    StopReason,
    ExecutionOptions,
} from "p3-system";
import { formatWord16 } from "./format";

export type P3UiStatus = {
    kind: "idle" | "ready" | "loaded" | "running" | "stopped" | "error";
    message: string;
};
const YIELD_EVERY_STEPS = 100;
export const RUN_INTERVAL_OPTIONS = [0, 250, 500, 1000] as const;
const DEFAULT_RUN_INTERVAL_MS: number = 500;

export function useP3System(system: P3System) {
    const sourceBindingValidRef = useRef(false);
    const [sourceCode, setSourceCodeState] = useState("");

    function createInitialSnapshot(): P3Snapshot {
        return system.captureSnapshot();
    }

    const [snapshot, setSnapshot] = useState(createInitialSnapshot);
    const [status, setStatus] = useState<P3UiStatus>({kind: "idle", message: "Sem programa carregado."});
    const [assemblyList, setAssemblyList] = useState<readonly AssemblyListRow[]>([]);

    function createBreakpointLines(): Set<number> {
        return new Set();
    }

    const [breakpointLines, setBreakpointLines] = useState<ReadonlySet<number>>(createBreakpointLines);
    const [isRunning, setIsRunning] = useState(false);
    const [maxSteps, setMaxSteps] = useState<number>(DEFAULT_MAX_STEPS);
    const [runIntervalMs, setRunIntervalMs] = useState<number>(DEFAULT_RUN_INTERVAL_MS);
    let breakpointAddresses = new Set<number>();
    if (sourceBindingValidRef.current) {
        breakpointAddresses = collectBreakpointAddresses(assemblyList, breakpointLines);
    }

    function watchTimer(): (() => void) | undefined {
        if (!snapshot.peripherals.timerRunning) return;

        const interval = window.setInterval(refreshPeripherals, PERIPHERALS_REFRESH_INTERVAL_MS);

        function stopWatchingTimer(): void {
            window.clearInterval(interval);
        }

        return stopWatchingTimer;
    }

    useEffect(watchTimer, [system, snapshot.peripherals.timerRunning]);

    function refreshSnapshot(): void {
        setSnapshot(system.captureSnapshot());
    }

    function refreshPeripherals(): void {
        const peripherals = system.capturePeripherals();

        function replacePeripherals(current: P3Snapshot): P3Snapshot {
            return {...current, peripherals};
        }

        setSnapshot(replacePeripherals);
    }

    function applyLoad(restarting = false): boolean {
        try {
            const loadedProgram = system.loadSource(sourceCode);
            setAssemblyList(system.getAssemblyList() ?? []);
            sourceBindingValidRef.current = true;
            refreshSnapshot();
            setStatus({kind: "loaded", message: restarting ? "Programa reiniciado." : `Programa carregado em ${formatWord16(loadedProgram.entryPoint)}h.`});
            return true;
        } catch (error) {
            setStatus(makeErrorStatus(error));
            setAssemblyList(system.getAssemblyList() ?? []);
            refreshSnapshot();
            return false;
        }
    }

    function loadSource(): boolean {return applyLoad();}

    function step(): void {
        try {
            const pc = system.programCounter;
            const event = system.oneStep();
            refreshSnapshot();

            if (event.didProcess) {
                setStatus({kind: system.hasLoadedProgram ? "loaded" : "ready", message: `Instrução executada em ${formatWord16(pc)}h.`});
                return;
            }

            const reason = event.stopReason;
            setStatus({kind: "stopped", message: formatStopReason(reason, system.programCounter)});
        } catch (error) {
            setStatus(makeErrorStatus(error));
            refreshSnapshot();
        }
    }

    async function run(): Promise<void> {
        if (runIntervalMs > 0) {
            function waitForInterval(signal: AbortSignal): Promise<void> {
                return waitForDelay(runIntervalMs, signal);
            }

            await performRun({message: `Execução temporizada: ${runIntervalMs} ms por instrução.`, onStep: refreshSnapshot, yieldControl: waitForInterval});
            return;
        }

        let stepsSinceYield = 0;

        async function yieldAfterSteps(signal: AbortSignal): Promise<void> {
            stepsSinceYield++;

            if (stepsSinceYield < YIELD_EVERY_STEPS) {
                return;
            }

            stepsSinceYield = 0;
            refreshSnapshot();
            await waitForDelay(0, signal);
        }

        await performRun({message: "Execução sem atraso.", yieldControl: yieldAfterSteps});
    }

    async function performRun(options: {message: string; onStep?: () => void; yieldControl: (signal: AbortSignal) => Promise<void>;}): Promise<void> {
        if (system.isRunning) return;
        setIsRunning(true);
        setStatus({kind: "running", message: options.message});

        try {
            const executionOptions: ExecutionOptions = {breakpoints: breakpointAddresses, maxSteps, yieldControl: options.yieldControl};
            if (options.onStep !== undefined) {
                executionOptions.onStep = options.onStep;
            }

            const result = await system.startExecution(executionOptions);
            refreshSnapshot();
            setStatus({kind: "stopped", message: formatStopReason(result.stopReason, system.programCounter)});
        } catch (error) {
            setStatus(makeErrorStatus(error));
            refreshSnapshot();
        } finally {
            setIsRunning(false);
        }
    }

    function pause(): void {
        if (!system.isRunning) return;
        system.pause();
        setStatus({kind: "running", message: "Pausa pedida."});
    }

    function restart(): boolean {return applyLoad(true);}

    async function newFile(): Promise<void> {
        await resetSource({sourceCode: "", message: "Sem programa carregado.", resetUserInputs: true});
        setRunIntervalMs(DEFAULT_RUN_INTERVAL_MS);
        setMaxSteps(DEFAULT_MAX_STEPS);
    }

    async function openSourceFile(nextSourceCode: string, fileName: string): Promise<void> {
        await resetSource({sourceCode: nextSourceCode, message: `Ficheiro aberto: ${fileName}.`, resetUserInputs: false});
    }

    async function resetSource(options: {sourceCode: string; message: string; resetUserInputs: boolean;}): Promise<void> {
        await system.stopExecution();

        if (options.resetUserInputs) {
            system.resetAll();
        } else {
            system.reset();
        }

        replaceSourceCode(options.sourceCode);
        setAssemblyList([]);
        refreshSnapshot();
        setStatus({kind: "idle", message: options.message});
    }

    function replaceSourceCode(nextSourceCode: string): void {
        if (system.isRunning) return;
        setSourceCodeState(nextSourceCode);
        setBreakpointLines(new Set());
        sourceBindingValidRef.current = false;
        system.clearBreakpointResume();
    }

    function toggleBreakpoint(sourceLine: number): void {
        if (system.isRunning) return;

        function updateBreakpointLines(current: ReadonlySet<number>): Set<number> {
            const next = new Set(current);

            if (next.has(sourceLine)) {
                next.delete(sourceLine);
            } else {
                next.add(sourceLine);
            }

            return next;
        }

        setBreakpointLines(updateBreakpointLines);
    }

    function reportError(error: unknown): void {
        setStatus(makeErrorStatus(error));
    }

    function clearEditor(): void {
        replaceSourceCode("");
        setStatus({kind: "idle", message: "Editor limpo."});
    }

    function toggleInterruptButton(button: number): void {
        system.toggleInterruptButton(button);
        refreshPeripherals();
    }

    function setSwitch(switchIndex: number, isUp: boolean): void {
        system.setSwitch(switchIndex, isUp);
        refreshPeripherals();
    }

    function toggleVirtualTextCharacter(value: number): void {
        system.toggleVirtualTextCharacter(value);
        refreshPeripherals();
    }

    function setRegister(index: number, value: number): void {
        function changeRegister(): void {
            system.setRegister(index, value);
        }

        applyMachineEdit(changeRegister, `R${index} alterado para ${formatWord16(value)}h.`);
    }

    function setProgramCounter(value: number): void {
        function changeProgramCounter(): void {
            system.setProgramCounter(value);
        }

        applyMachineEdit(changeProgramCounter, `PC alterado para ${formatWord16(value)}h.`);
    }

    function setStackPointer(value: number): void {
        function changeStackPointer(): void {
            system.setStackPointer(value);
        }

        applyMachineEdit(changeStackPointer, `SP alterado para ${formatWord16(value)}h.`);
    }

    function setFlag(flag: FlagBit, value: boolean): void {
        function changeFlag(): void {
            system.setFlag(flag, value);
        }

        applyMachineEdit(changeFlag, `Flag ${FlagBit[flag]} alterada para ${value ? "1" : "0"}.`);
    }

    function setMemoryWord(address: number, value: number): void {
        function changeMemoryWord(): void {
            system.setMemoryWord(address, value);
        }

        applyMachineEdit(changeMemoryWord, `Memória ${formatWord16(address)}h alterada para ${formatWord16(value)}h.`);
    }

    function setInterruptMask(value: number): void {
        function changeInterruptMask(): void {
            system.setInterruptMask(value);
        }

        applyMachineEdit(changeInterruptMask, `Máscara de interrupções alterada para ${formatWord16(value)}h.`);
    }

    function applyMachineEdit(change: () => void, message: string): void {
        try {
            change();
            refreshSnapshot();
            setStatus({kind: system.hasLoadedProgram ? "loaded" : "ready", message});
        } catch (error) {
            setStatus(makeErrorStatus(error));
        }
    }

    return {sourceCode, setSourceCode: replaceSourceCode, breakpointLines, breakpointAddresses, snapshot: snapshot.machine, peripherals: snapshot.peripherals, assemblyList, status, isRunning, maxSteps, setMaxSteps, runIntervalMs, setRunIntervalMs, loadSource, step, run, pause, restart, newFile, openSourceFile, reportError, clearEditor, toggleBreakpoint, toggleInterruptButton, setSwitch, toggleVirtualTextCharacter, setRegister, setProgramCounter, setStackPointer, setFlag, setMemoryWord, setInterruptMask};
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.resolve();
    }

    function startDelay(resolve: (value: void | PromiseLike<void>) => void): void {
        const timeoutId = window.setTimeout(finish, delayMs);

        function finish(): void {
            window.clearTimeout(timeoutId);
            signal.removeEventListener("abort", finish);
            resolve();
        }

        signal.addEventListener("abort", finish, {once: true});
    }

    return new Promise(startDelay);
}

function collectBreakpointAddresses(assemblyList: readonly AssemblyListRow[], breakpointLines: ReadonlySet<number>): Set<number> {
    const addresses = new Set<number>();

    for (const sourceLine of breakpointLines) {
        function matchesSourceLine(candidate: AssemblyListRow): boolean {
            return candidate.sourceLine >= sourceLine;
        }

        const row = assemblyList.find(matchesSourceLine);

        if (row !== undefined) {
            addresses.add(row.address);
        }
    }

    return addresses;
}

function formatStopReason(reason: StopReason, pc: number): string {
    switch (reason) {
        case "end-of-memory":
            return "Fim da memória.";
        case "breakpoint":
            return `Ponto de paragem em ${formatWord16(pc)}h.`;
        case "halted":
            return "Processador parado.";
        case "max-steps":
            return "Limite de passos atingido.";
        case "paused":
            return "Execução em pausa.";
    }
}

function makeErrorStatus(error: unknown): P3UiStatus {
    return {kind: "error", message: error instanceof Error ? error.message : String(error)};
}
