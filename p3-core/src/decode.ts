import { AddressingMode, DecodedInstruction, Opcode, OperandSelector } from "./instruction";
import { signExtend } from "./word";

function decodeMode(word: number): AddressingMode {
    return ((word >>> 4) & 0b11) as AddressingMode;
}

function decodeRegModo(word: number): number {
    return word & 0xf;
}

export function decodeInstruction(word: number): DecodedInstruction {
    const opcode = ((word >>> 10) & 0x3f) as Opcode;

    switch (opcode) {
        case Opcode.NOP:
        case Opcode.ENI:
        case Opcode.DSI:
        case Opcode.STC:
        case Opcode.CLC:
        case Opcode.CMC:
        case Opcode.RET:
        case Opcode.RTI:
            return {format: "zero-op", opcode};

        case Opcode.INT:
        case Opcode.RETN:
            return {format: "zero-op-const", opcode, constant: word & 0x3ff};

        case Opcode.NEG:
        case Opcode.INC:
        case Opcode.DEC:
        case Opcode.COM:
        case Opcode.PUSH:
        case Opcode.POP:
            return {format: "one-op", opcode, m: decodeMode(word), regModo: decodeRegModo(word)};

        case Opcode.SHR:
        case Opcode.SHL:
        case Opcode.SHRA:
        case Opcode.SHLA:
        case Opcode.ROR:
        case Opcode.ROL:
        case Opcode.RORC:
        case Opcode.ROLC: {
            const rawCount = (word >>> 6) & 0xf;
            const shiftCount = rawCount === 0 ? 16 : rawCount;
            const m = decodeMode(word);
            const regModo = decodeRegModo(word);
            return {format: "one-op-const", opcode, shiftCount, m, regModo};
        }

        case Opcode.CMP:
        case Opcode.ADD:
        case Opcode.ADDC:
        case Opcode.SUB:
        case Opcode.SUBB:
        case Opcode.MUL:
        case Opcode.DIV:
        case Opcode.TEST:
        case Opcode.AND:
        case Opcode.OR:
        case Opcode.XOR:
        case Opcode.MOV:
        case Opcode.MVBH:
        case Opcode.MVBL:
        case Opcode.XCH: {
            const s = ((word >>> 9) & 1) as OperandSelector;
            const regReg = (word >>> 6) & 7;
            const m = decodeMode(word);
            const regModo = decodeRegModo(word);
            return {format: "two-op", opcode, s, regReg, m, regModo};
        }

        case Opcode.JMP:
        case Opcode.CALL:
            return {format: "jump", opcode, m: decodeMode(word), regModo: decodeRegModo(word)};

        case Opcode.JMP_COND:
        case Opcode.CALL_COND: {
            const condition = (word >>> 6) & 0xf;
            const m = decodeMode(word);
            const regModo = decodeRegModo(word);
            return {format: "cond-jump", opcode, condition, m, regModo};
        }

        case Opcode.BR:
            return {format: "branch", opcode, displacement: signExtend(word & 0x3f, 6)};

        case Opcode.BR_COND: {
            const condition = (word >>> 6) & 0xf;
            const displacementBits = word & 0x3f;
            const displacement = signExtend(displacementBits, 6);
            return {format: "cond-branch", opcode, condition, displacement};
        }

        default:
            throw new Error(`Opcode desconhecido: ${opcode}`);
    }
}
