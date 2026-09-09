import { useState } from "react";
import { MenuBar } from "./components/MenuBar";
import { ModeBar } from "./components/ModeBar";
import { StatusBar } from "./components/StatusBar";
import { Workbench } from "./components/Workbench";
import { useP3System } from "./useP3System";
import type { P3System } from "p3-system";
import type { ViewMode } from "./components/viewMode";

type AppProps = {
    system: P3System;
};

export function App({system}: AppProps) {
    const [mode, setMode] = useState<ViewMode>("p3");
    const [sourceFileName, setSourceFileName] = useState("programa.p3");
    const [memoryNavigation, setMemoryNavigation] = useState<{
        address: number;
    }>();
    const p3 = useP3System(system);

    function handleModeChange(nextMode: ViewMode): void {
        if (nextMode === mode) return;
        setMemoryNavigation(undefined);
        setMode(nextMode);
    }

    function navigateToMemory(address: number): void {
        setMemoryNavigation({address});
        setMode("p3");
    }

    async function handleNewFile(): Promise<void> {
        await p3.newFile();
        setSourceFileName("programa.p3");
        handleModeChange("editor");
    }

    async function handleOpenFile(file: File): Promise<void> {
        let sourceCode: string;

        try {
            sourceCode = await file.text();
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            p3.reportError(new Error(`Não foi possível ler ${file.name}: ${detail}`));
            return;
        }

        await p3.openSourceFile(sourceCode, file.name);
        setSourceFileName(p3FileName(file.name));
        handleModeChange("editor");
    }

    function handleSaveFile(): void {
        downloadSourceFile(p3.sourceCode, sourceFileName);
    }

    return (
        <div className="p3-shell">
            <MenuBar
                onNewFile={handleNewFile}
                onOpenFile={handleOpenFile}
                onSaveFile={handleSaveFile}
                interruptMask={p3.peripherals.io[0xFFFA]?.value ?? 0}
                onInterruptMaskChange={p3.setInterruptMask}
                maxSteps={p3.maxSteps}
                onMaxStepsChange={p3.setMaxSteps}
                isRunning={p3.isRunning}
            />
            <StatusBar
                snapshot={p3.snapshot}
                status={p3.status}
                onMemoryNavigate={navigateToMemory}
            />
            <Workbench
                mode={mode}
                p3={p3}
                memoryNavigation={memoryNavigation}
                onModeChange={handleModeChange}
            />
            <ModeBar mode={mode} onModeChange={handleModeChange} />
        </div>
    );
}

function p3FileName(fileName: string): string {
    const extensionStart = fileName.lastIndexOf(".");
    const baseName = extensionStart > fileName.lastIndexOf("/") + 1 ? fileName.slice(0, extensionStart) : fileName;
    return `${baseName || "programa"}.p3`;
}

function downloadSourceFile(sourceCode: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([sourceCode], {type: "text/plain;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();

    function releaseDownloadUrl(): void {
        URL.revokeObjectURL(url);
    }

    window.setTimeout(releaseDownloadUrl, 0);
}
