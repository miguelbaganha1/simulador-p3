import type { ViewMode } from "./viewMode";

type ModeBarProps = {
    mode: ViewMode;
    onModeChange: (mode: ViewMode) => void;
};
type ModeItem = {id: ViewMode; label: string;};

const modes: ModeItem[] = [
    {id: "p3", label: "P3"},
    {id: "editor", label: "Editor"},
    {id: "perifericos", label: "Periféricos"},
    {id: "texto", label: "Texto"},
];

export function ModeBar({mode, onModeChange}: ModeBarProps) {
    function renderMode(item: ModeItem): React.JSX.Element {
        function selectMode(): void {
            onModeChange(item.id);
        }

        return (
            <button
                key={item.id}
                type="button"
                className={item.id === mode ? "mode-bar-button mode-bar-button-current" : "mode-bar-button"}
                onClick={selectMode}
            >
                {item.label}
            </button>
        );
    }

    return (
        <nav className="mode-bar">
            {modes.map(renderMode)}
        </nav>
    );
}
