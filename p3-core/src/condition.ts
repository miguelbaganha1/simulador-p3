import { P3State } from "./state";
import { ConditionCode, FlagBit } from "./instruction";

export function evaluateCondition(state: P3State, code: ConditionCode): boolean {
    const z = state.getFlag(FlagBit.Z);
    const n = state.getFlag(FlagBit.N);
    const c = state.getFlag(FlagBit.C);
    const o = state.getFlag(FlagBit.O);


    switch (code) {
        case ConditionCode.Z:
            return z;
        case ConditionCode.NZ:
            return !z;
        case ConditionCode.C:
            return c;
        case ConditionCode.NC:
            return !c;
        case ConditionCode.N:
            return n;
        case ConditionCode.NN:
            return !n;
        case ConditionCode.O:
            return o;
        case ConditionCode.NO:
            return !o;
        case ConditionCode.P:
            return !z && !n;
        case ConditionCode.NP:
            return z || n;
        case ConditionCode.I:
            return state.bus.pendingInterrupt();
        case ConditionCode.NI:
            return !state.bus.pendingInterrupt();
        default:
            throw new Error(`Código desconhecido: ${code}`);
    }
}
