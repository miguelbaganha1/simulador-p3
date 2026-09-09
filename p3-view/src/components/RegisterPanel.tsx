import { FlagBit, STACK_POINTER_REGISTER, PROGRAM_COUNTER_REGISTER, type MachineSnapshot } from "p3-system";
import { EditableWord } from "./EditableWord";

type RegisterRow = {
    name: string;
    value: number;
    editable: boolean;
    onChange: (value: number) => void;
    wasAccessed: boolean;
};

type RegisterPanelProps = {
    snapshot: MachineSnapshot;
    interruptPending: boolean;
    disabled: boolean;
    onRegisterChange: (index: number, value: number) => void;
    onProgramCounterChange: (value: number) => void;
    onStackPointerChange: (value: number) => void;
    onFlagChange: (flag: FlagBit, value: boolean) => void;
};

export function RegisterPanel({snapshot, interruptPending, disabled, onRegisterChange, onProgramCounterChange, onStackPointerChange, onFlagChange}: RegisterPanelProps) {
    const accessedRegisters = snapshot.lastStepEffects.accessedRegisters;

    function makeRegisterRow(value: number, index: number): RegisterRow {
        const name = `R${index}`;
        const editable = index !== 0;

        function changeRegister(nextValue: number): void {
            onRegisterChange(index, nextValue);
        }

        const wasAccessed = accessedRegisters.includes(index);
        return {name, value, editable, onChange: changeRegister, wasAccessed};
    }

    const registers = snapshot.registers.map(makeRegisterRow);
    const pcWasAccessed = accessedRegisters.includes(PROGRAM_COUNTER_REGISTER);
    const pc = {name: "PC", value: snapshot.pc, editable: true, onChange: onProgramCounterChange, wasAccessed: pcWasAccessed};
    const spWasAccessed = accessedRegisters.includes(STACK_POINTER_REGISTER);
    const sp = {name: "SP", value: snapshot.sp, editable: true, onChange: onStackPointerChange, wasAccessed: spWasAccessed};
    registers.push(pc, sp);
    const flags = [FlagBit.E, FlagBit.Z, FlagBit.C, FlagBit.O, FlagBit.N];

    function renderRegister({name, value, editable, onChange, wasAccessed}: RegisterRow): React.JSX.Element {
        return (
            <tr key={name}>
                <th>{name}</th>
                <td>
                    <EditableWord
                        value={value}
                        className={wasAccessed ? "cell instruction-effect-cell" : "cell"}
                        disabled={disabled || !editable}
                        onChange={onChange}
                    />
                </td>
            </tr>
        );
    }

    function renderFlagHeader(bit: FlagBit): React.JSX.Element {
        return (
            <th key={bit}>
                {FlagBit[bit]}
            </th>
        );
    }

    function renderFlag(bit: FlagBit): React.JSX.Element {
        const active = (snapshot.re & (1 << bit)) !== 0;

        function toggleFlag(): void {
            onFlagChange(bit, !active);
        }

        function activateFlag(event: React.MouseEvent<HTMLButtonElement>): void {
            if (event.detail === 0) toggleFlag();
        }

        return (
            <td key={bit}>
                <button
                    type="button"
                    className={snapshot.lastStepEffects.changedFlags.includes(bit) ? "cell instruction-effect-cell" : "cell"}
                    disabled={disabled}
                    title="Duplo clique, Enter ou Espaço para alterar."
                    onClick={activateFlag}
                    onDoubleClick={toggleFlag}
                >
                    {active ? "1" : "0"}
                </button>
            </td>
        );
    }

    return (
        <section className="panel register-panel">
            <section className="register-section">
                <h2 className="panel-title">Registos</h2>

                <table className="register-table">
                    <tbody>
                        {registers.map(renderRegister)}
                    </tbody>
                </table>
            </section>

            <section className="flag-section">
                <h2 className="panel-title">Flags</h2>

                <table className="flag-row">
                    <thead>
                        <tr>
                            {flags.map(renderFlagHeader)}
                            <th>I</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            {flags.map(renderFlag)}
                            <td>
                                <button type="button" className="cell" disabled>
                                    {interruptPending ? "1" : "0"}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </section>
    );
}
