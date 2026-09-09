import { useRef } from "react";

type EditorPanelProps = {
    sourceCode: string;
    breakpointLines: ReadonlySet<number>;
    isRunning: boolean;
    onSourceCodeChange: (sourceCode: string) => void;
    onToggleBreakpoint: (sourceLine: number) => void;
};

export function EditorPanel({sourceCode, breakpointLines, isRunning, onSourceCodeChange, onToggleBreakpoint}: EditorPanelProps) {
    const gutterRef = useRef<HTMLDivElement>(null);
    const lineCount = sourceCode.split(/\r\n|\n|\r/).length;

    function renderBreakpoint(_: unknown, index: number): React.JSX.Element {
        const sourceLine = index + 1;
        const className = breakpointLines.has(sourceLine) ? "editor-breakpoint editor-breakpoint-active" : "editor-breakpoint";

        function toggleBreakpoint(): void {
            onToggleBreakpoint(sourceLine);
        }

        return (
            <button
                key={sourceLine}
                type="button"
                className={className}
                disabled={isRunning}
                onClick={toggleBreakpoint}
            />
        );
    }

    function changeSourceCode(event: React.ChangeEvent<HTMLTextAreaElement>): void {
        onSourceCodeChange(event.target.value);
    }

    function synchronizeScroll(event: React.UIEvent<HTMLTextAreaElement>): void {
        if (gutterRef.current !== null) {
            gutterRef.current.scrollTop = event.currentTarget.scrollTop;
        }
    }

    return (
        <section className="panel editor-panel">
            <h2 className="panel-title">Editor de Assembly</h2>
            <div className="editor-field">
                <div className="editor-breakpoint-gutter" ref={gutterRef}>
                    {Array.from({length: lineCount}, renderBreakpoint)}
                </div>
                <textarea
                    className="editor-textarea"
                    value={sourceCode}
                    readOnly={isRunning}
                    wrap="off"
                    onChange={changeSourceCode}
                    onScroll={synchronizeScroll}
                    spellCheck={false}
                />
            </div>
        </section>
    );
}
