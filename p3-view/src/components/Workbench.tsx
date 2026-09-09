import { EditorControls, ExecutionControls } from "./ControlPanel";
import { EditorPanel } from "./EditorPanel";
import { AssemblyListingPanel } from "./AssemblyListingPanel";
import { MainMemoryPanel } from "./MainMemoryPanel";
import { RegisterPanel } from "./RegisterPanel";
import type { useP3System } from "../useP3System";
import type { ViewMode } from "./viewMode";
import { LCDPanel } from "./LCDPanel";
import { LEDPanel } from "./LEDPanel";
import { InterruptButtonPanel } from "./InterruptButtonPanel";
import { SwitchPanel } from "./SwitchPanel";
import { DisplayPanel } from "./DisplayPanel";
import { TextWindowPanel } from "./TextWindowPanel";

type WorkbenchProps = {
    mode: ViewMode;
    p3: ReturnType<typeof useP3System>;
    memoryNavigation: {
        address: number;
    } | undefined;
    onModeChange: (mode: ViewMode) => void;
};

export function Workbench({mode, p3, memoryNavigation, onModeChange}: WorkbenchProps) {
    function loadSource(): void {
        if (p3.loadSource()) onModeChange("p3");
    }

    return (
        <>
            {mode === "editor" && (
                <main className="workbench workbench-editor">
                    <EditorPanel
                        sourceCode={p3.sourceCode}
                        breakpointLines={p3.breakpointLines}
                        isRunning={p3.isRunning}
                        onSourceCodeChange={p3.setSourceCode}
                        onToggleBreakpoint={p3.toggleBreakpoint}
                    />
                    <EditorControls
                        isRunning={p3.isRunning}
                        onLoad={loadSource}
                        onClear={p3.clearEditor}
                    />
                </main>
            )}

            {mode === "perifericos" && (
                <main className="workbench workbench-peripherals">
                    <LCDPanel lcd={p3.peripherals.lcd} />
                    <LEDPanel leds={p3.peripherals.led} />
                    <SwitchPanel
                        switches={p3.peripherals.switches}
                        onChange={p3.setSwitch}
                    />
                    <DisplayPanel display={p3.peripherals.display} />
                    <InterruptButtonPanel
                        pendingSources={p3.peripherals.pendingInterruptSources}
                        onToggle={p3.toggleInterruptButton}
                    />
                </main>
            )}

            {mode === "texto" && (
                <main className="workbench workbench-text">
                    <TextWindowPanel
                        textWindow={p3.peripherals.textWindow}
                        onToggleVirtualCharacter={p3.toggleVirtualTextCharacter}
                    />
                    <ExecutionControls
                        isRunning={p3.isRunning}
                        runIntervalMs={p3.runIntervalMs}
                        onRunIntervalChange={p3.setRunIntervalMs}
                        onStep={p3.step}
                        onRun={p3.run}
                        onPause={p3.pause}
                        onRestart={p3.restart}
                    />
                </main>
            )}

            {mode === "p3" && (
                <main className="workbench">
                    <RegisterPanel
                        snapshot={p3.snapshot}
                        interruptPending={p3.peripherals.pendingInterruptSources !== 0}
                        disabled={p3.isRunning}
                        onRegisterChange={p3.setRegister}
                        onProgramCounterChange={p3.setProgramCounter}
                        onStackPointerChange={p3.setStackPointer}
                        onFlagChange={p3.setFlag}
                    />
                    <MainMemoryPanel
                        snapshot={p3.snapshot}
                        io={p3.peripherals.io}
                        navigation={memoryNavigation}
                        editingDisabled={p3.isRunning}
                        onMemoryChange={p3.setMemoryWord}
                    />
                    <AssemblyListingPanel
                        assemblyList={p3.assemblyList}
                        pc={p3.snapshot.pc}
                        lastExecutedPc={p3.snapshot.lastExecutedPc}
                        breakpointAddresses={p3.breakpointAddresses}
                    />
                    <ExecutionControls
                        isRunning={p3.isRunning}
                        runIntervalMs={p3.runIntervalMs}
                        onRunIntervalChange={p3.setRunIntervalMs}
                        onStep={p3.step}
                        onRun={p3.run}
                        onPause={p3.pause}
                        onRestart={p3.restart}
                    />
                </main>
            )}
        </>
    );
}
