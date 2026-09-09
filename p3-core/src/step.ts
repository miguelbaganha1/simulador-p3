import type {
    ZeroOperandInstruction,
    ConstantInstruction,
    OneOperandInstruction,
    ShiftRotateInstruction,
    TwoOperandInstruction,
    JumpInstruction,
    ConditionalJumpInstruction,
    BranchInstruction,
    ConditionalBranchInstruction,
} from "./instruction";
import { evaluateCondition } from "./condition";
import { decodeInstruction } from "./decode";
import {
    AddressingMode,
    addressingModeUsesExtensionWord,
    type DecodedInstruction,
    FlagBit,
    Opcode,
    type ShiftRotateOpcode,
} from "./instruction";
import { type Operand, operandFromEncoding, readOperandValue, writeOperandValue } from "./operand";
import { P3State, STACK_POINTER_REGISTER } from "./state";
import { INTERRUPT_VECTOR_BASE, toSignedWord16, toWord16 } from "./word";
import type { InstructionEffects } from "./effects";

const WORD_SIGN_BIT = 0x8000;
const WORD_CARRY_BIT = 0x10000;

export function step(state: P3State): InstructionEffects {
    if (state.halted) {
        return {registers: [], memoryAddresses: [], changedFlags: []};
    }

    state.beginInstructionEffects();

    try {
        const word = state.fetchWord(state.getPC());
        state.setPC(state.getPC() + 1);

        const instr = decodeInstruction(word);
        execute(state, instr);

        state.instructionCount++;

        checkInterrupt(state);

        return state.endInstructionEffects();
    } catch (error) {
        state.cancelInstructionEffects();
        throw error;
    }
}

function execute(state: P3State, instr: DecodedInstruction): void {
    switch (instr.format) {
        case "zero-op":
            return executeZeroOp(state, instr);
        case "zero-op-const":
            return executeZeroOpConst(state, instr);
        case "one-op":
            return executeOneOp(state, instr);
        case "one-op-const":
            return executeOneOpConst(state, instr);
        case "two-op":
            return executeTwoOp(state, instr);
        case "jump":
            return executeJump(state, instr);
        case "cond-jump":
            return executeCondJump(state, instr);
        case "branch":
            return executeBranch(state, instr);
        case "cond-branch":
            return executeCondBranch(state, instr);
    }
}

function executeZeroOp(state: P3State, instr: ZeroOperandInstruction): void {
    switch (instr.opcode) {
        case Opcode.NOP:
            return;
        case Opcode.ENI:
            state.setFlag(FlagBit.E, true);
            return;
        case Opcode.DSI:
            state.setFlag(FlagBit.E, false);
            return;
        case Opcode.STC:
            state.setFlag(FlagBit.C, true);
            return;
        case Opcode.CLC:
            state.setFlag(FlagBit.C, false);
            return;
        case Opcode.CMC:
            state.setFlag(FlagBit.C, !state.getFlag(FlagBit.C));
            return;
        case Opcode.RET:
            state.setPC(popWord(state));
            return;
        case Opcode.RTI:
            state.setPC(popWord(state));
            state.setRE(popWord(state));
            return;
    }
}

function enterInterrupt(state: P3State, vector: number): void {
    if (!Number.isInteger(vector) || vector < 0 || vector > 255) {
        throw new Error(`Vetor de interrupção inválido: ${vector}`);
    }
    pushWord(state, state.getRE());
    pushWord(state, state.getPC());
    state.setRE(0);
    state.setPC(state.readData(INTERRUPT_VECTOR_BASE + vector));

}

function checkInterrupt(state: P3State): void {
    if (!state.getFlag(FlagBit.E)) return;
    const vector = state.bus.getInterrupt();
    if (vector === undefined) return;
    enterInterrupt(state, vector);
}

function executeZeroOpConst(state: P3State, instr: ConstantInstruction): void {
    switch (instr.opcode) {
        case Opcode.RETN:
            state.setPC(popWord(state));
            state.setSP(state.getSP() + instr.constant);
            return;
        case Opcode.INT:
            enterInterrupt(state, instr.constant);
            return;
    }
}

function executeOneOp(state: P3State, instr: OneOperandInstruction): void {
    const operand = readInstructionOperand(state, instr.m, instr.regModo);
    if (instr.opcode === Opcode.PUSH) {
        pushWord(state, readOperandValue(state, operand));
        return;
    }
    if (instr.opcode === Opcode.POP) {
        if (operand.kind === "immediate") {
            writeOperandValue(state, operand, 0);
            return;
        }
        writeOperandValue(state, operand, popWord(state));
        return;
    }

    const value = readOperandValue(state, operand);
    let result: number;
    switch (instr.opcode) {
        case Opcode.NEG:
            result = subtractAndUpdateFlags(state, 0, value, 0);
            break;
        case Opcode.INC:
            result = addAndUpdateFlags(state, value, 1, 0);
            break;
        case Opcode.DEC:
            result = subtractAndUpdateFlags(state, value, 1, 0);
            break;
        case Opcode.COM:
            result = toWord16(~value);
            setZN(state, result);
            break;
    }
    writeOperandValue(state, operand, result);
}

function executeOneOpConst(state: P3State, instr: ShiftRotateInstruction): void {
    const operand = readInstructionOperand(state, instr.m, instr.regModo);
    const value = readOperandValue(state, operand);
    const result = shiftOrRotateAndUpdateFlags(state, instr.opcode, value, instr.shiftCount);
    writeOperandValue(state, operand, result);
}

function executeTwoOp(state: P3State, instr: TwoOperandInstruction): void {
    const{first, second} = prepareTwoOperands(state, instr);
    const opcode = instr.opcode;

    switch (opcode) {
        case Opcode.MOV:
            requireWritable(first, "MOV");
            writeOperandValue(state, first, readOperandValue(state, second));
            return;
        case Opcode.MVBH:
        case Opcode.MVBL: {
            requireWritable(first, Opcode[opcode]);
            const target = readOperandValue(state, first);
            const source = readOperandValue(state, second);
            const mask = opcode === Opcode.MVBH ? 0xff00 : 0x00ff;
            const preservedBits = target & ~mask;
            const copiedBits = source & mask;
            const result = preservedBits | copiedBits;
            writeOperandValue(state, first, result);
            return;
        }
        case Opcode.XCH: {
            requireWritable(first, "XCH");
            requireWritable(second, "XCH");
            const left = readOperandValue(state, first);
            const right = readOperandValue(state, second);
            writeOperandValue(state, first, right);
            writeOperandValue(state, second, left);
            return;
        }
        case Opcode.ADD:
        case Opcode.ADDC:
        case Opcode.SUB:
        case Opcode.SUBB:
        case Opcode.CMP: {
            if (opcode !== Opcode.CMP) requireWritable(first, Opcode[opcode]);
            const left = readOperandValue(state, first);
            const right = readOperandValue(state, second);
            let result: number;
            switch (opcode) {
                case Opcode.ADD:
                    result = addAndUpdateFlags(state, left, right, 0);
                    break;
                case Opcode.ADDC:
                    result = addAndUpdateFlags(state, left, right, carryBit(state));
                    break;
                case Opcode.SUBB:
                    result = subtractAndUpdateFlags(state, left, right, borrowBit(state));
                    break;
                default:
                    result = subtractAndUpdateFlags(state, left, right, 0);
            }
            if (opcode !== Opcode.CMP) writeOperandValue(state, first, result);
            return;
        }
        case Opcode.AND:
        case Opcode.OR:
        case Opcode.XOR:
        case Opcode.TEST: {
            if (opcode !== Opcode.TEST) requireWritable(first, Opcode[opcode]);
            const left = readOperandValue(state, first);
            const right = readOperandValue(state, second);
            let result: number;
            switch (opcode) {
                case Opcode.OR:
                    result = left | right;
                    break;
                case Opcode.XOR:
                    result = left ^ right;
                    break;
                default:
                    result = left & right;
            }
            result = toWord16(result);
            setZN(state, result);
            if (opcode !== Opcode.TEST) writeOperandValue(state, first, result);
            return;
        }
        case Opcode.MUL:
            return executeMultiply(state, first, second);
        case Opcode.DIV:
            return executeDivide(state, first, second);
    }
}

function executeJump(state: P3State, instr: JumpInstruction): void {
    switch (instr.opcode) {
        case Opcode.JMP:
            state.setPC(readControlTarget(state, instr.m, instr.regModo));
            return;
        case Opcode.CALL: {
            const target = readControlTarget(state, instr.m, instr.regModo);
            pushWord(state, state.getPC());
            state.setPC(target);
            return;
        }
    }
}

function executeCondJump(state: P3State, instr: ConditionalJumpInstruction): void {
    const operand = readInstructionOperand(state, instr.m, instr.regModo);

    if (!evaluateCondition(state, instr.condition)) {
        return;
    }

    switch (instr.opcode) {
        case Opcode.JMP_COND:
            state.setPC(readOperandValue(state, operand));
            return;
        case Opcode.CALL_COND: {
            const target = readOperandValue(state, operand);
            pushWord(state, state.getPC());
            state.setPC(target);
            return;
        }
    }
}

function executeBranch(state: P3State, instr: BranchInstruction): void {
    state.setPC(state.getPC() + instr.displacement);
}

function executeCondBranch(state: P3State, instr: ConditionalBranchInstruction): void {
    if (evaluateCondition(state, instr.condition)) {
        state.setPC(state.getPC() + instr.displacement);
    }
}

function readExtensionWord(state: P3State): number {
    const value = state.fetchWord(state.getPC());
    state.setPC(state.getPC() + 1);
    return value;
}

function readExtensionIfNeeded(state: P3State, mode: AddressingMode): number | undefined {
    if (!addressingModeUsesExtensionWord(mode)) return undefined;
    return readExtensionWord(state);
}

function readControlTarget(state: P3State, mode: AddressingMode, regModo: number): number {
    return readOperandValue(state, readInstructionOperand(state, mode, regModo));
}

function pushWord(state: P3State, value: number): void {
    state.writeData(state.getSP(), value);
    state.setSP(state.getSP() - 1);
}

function popWord(state: P3State): number {
    state.setSP(state.getSP() + 1);
    return state.readData(state.getSP());
}

function readInstructionOperand(state: P3State, mode: AddressingMode, addressRegister: number): Operand {
    return operandFromEncoding(state, mode, addressRegister, readExtensionIfNeeded(state, mode));
}

function prepareTwoOperands(state: P3State, instr: TwoOperandInstruction): { first: Operand; second: Operand; } {
    let addressed: Operand;
    if (instr.opcode === Opcode.MOV && instr.m === AddressingMode.Register && instr.regModo === STACK_POINTER_REGISTER) {
        addressed = {kind: "stack-pointer"};
    } else {
        addressed = readInstructionOperand(state, instr.m, instr.regModo);
    }
    const direct: Operand = {kind: "register", index: instr.regReg};
    return instr.s === 0 ? {first: addressed, second: direct} : {first: direct, second: addressed};
}

function carryBit(state: P3State): 0 | 1 {
    return state.getFlag(FlagBit.C) ? 1 : 0;
}

function borrowBit(state: P3State): 0 | 1 {
    return state.getFlag(FlagBit.C) ? 0 : 1;
}

function setZN(state: P3State, result: number): void {
    const word = toWord16(result);

    state.setFlag(FlagBit.Z, word === 0);
    state.setFlag(FlagBit.N, (word & WORD_SIGN_BIT) !== 0);
}

function addAndUpdateFlags(state: P3State, left: number, right: number, carryIn: 0 | 1): number {
    const raw = left + right + carryIn;
    const result = toWord16(raw);

    setZN(state, result);
    state.setFlag(FlagBit.C, (raw & WORD_CARRY_BIT) !== 0);
    const sameOperandSigns = (~(left ^ right) & WORD_SIGN_BIT) !== 0;
    const resultSignChanged = ((left ^ result) & WORD_SIGN_BIT) !== 0;
    const overflow = sameOperandSigns && resultSignChanged;
    state.setFlag(FlagBit.O, overflow);

    return result;
}

function subtractAndUpdateFlags(state: P3State, left: number, right: number, borrowIn: 0 | 1): number {
    const subtrahend = right + borrowIn;
    const raw = left - subtrahend;
    const result = toWord16(raw);

    setZN(state, result);
    state.setFlag(FlagBit.C, raw >= 0);
    const differentOperandSigns = ((left ^ right) & WORD_SIGN_BIT) !== 0;
    const resultSignChanged = ((left ^ result) & WORD_SIGN_BIT) !== 0;
    const overflow = differentOperandSigns && resultSignChanged;
    state.setFlag(FlagBit.O, overflow);

    return result;
}

function setMulDivFlags(state: P3State, zero: boolean, overflow = false): void {
    state.setFlag(FlagBit.Z, zero);
    state.setFlag(FlagBit.C, false);
    state.setFlag(FlagBit.N, false);
    state.setFlag(FlagBit.O, overflow);
}

function requireWritable(operand: Operand, opcode: string): void {
    if (operand.kind === "immediate") {
        throw new Error(`${opcode} requer operando de destino onde se possa escrever.`);
    }
}

function executeMultiply(state: P3State, first: Operand, second: Operand): void {
    requireWritable(first, "MUL");
    requireWritable(second, "MUL");

    const product = readOperandValue(state, first) * readOperandValue(state, second);
    const highPart = Math.floor(product / 0x10000);
    const highWord = toWord16(highPart);
    writeOperandValue(state, first, highWord);
    writeOperandValue(state, second, toWord16(product));

    setMulDivFlags(state, product === 0);
}

function executeDivide(state: P3State, first: Operand, second: Operand): void {
    requireWritable(first, "DIV");
    requireWritable(second, "DIV");

    const dividend = readOperandValue(state, first);
    const divisor = readOperandValue(state, second);

    if (divisor === 0) {
        setMulDivFlags(state, false, true);
        return;
    }

    const quotient = toWord16(Math.floor(dividend / divisor));
    writeOperandValue(state, first, quotient);
    writeOperandValue(state, second, toWord16(dividend % divisor));

    setMulDivFlags(state, quotient === 0);
}

function shiftOrRotateAndUpdateFlags(state: P3State, opcode: ShiftRotateOpcode, value: number, count: number): number {
    switch (opcode) {
        case Opcode.SHR: {
            const shifted = value >>> count;
            const result = toWord16(shifted);
            const carryPosition = count - 1;
            const carryOut = (value >>> carryPosition) & 1;
            return finishShift(state, result, carryOut);
        }
        case Opcode.SHL: {
            const shifted = value << count;
            const result = toWord16(shifted);
            const carryPosition = 16 - count;
            const carryOut = (value >>> carryPosition) & 1;
            return finishShift(state, result, carryOut);
        }
        case Opcode.SHRA: {
            const signedValue = toSignedWord16(value);
            const shifted = signedValue >> count;
            const word = toWord16(shifted);
            const carryPosition = count - 1;
            const carryOut = (value >>> carryPosition) & 1;
            const result = finishShift(state, word, carryOut);
            state.setFlag(FlagBit.O, false);
            return result;
        }
        case Opcode.SHLA: {
            const shifted = value << count;
            const word = toWord16(shifted);
            const carryPosition = 16 - count;
            const carryOut = (value >>> carryPosition) & 1;
            const result = finishShift(state, word, carryOut);
            const full = toSignedWord16(value) * 2 ** count;
            state.setFlag(FlagBit.O, full < -0x8000 || full > 0x7fff);
            return result;
        }
        case Opcode.ROR:
            return rotate(state, value, count, "right", false);
        case Opcode.ROL:
            return rotate(state, value, count, "left", false);
        case Opcode.RORC:
            return rotate(state, value, count, "right", true);
        case Opcode.ROLC:
            return rotate(state, value, count, "left", true);
    }
}

function finishShift(state: P3State, result: number, carryOut: number): number {
    setZN(state, result);
    state.setFlag(FlagBit.C, carryOut === 1);
    return result;
}

function rotate(state: P3State, value: number, count: number, direction: "left" | "right", throughCarry: boolean): number {
    let bits = toWord16(value);
    let carry = throughCarry && state.getFlag(FlagBit.C) ? 1 : 0;

    for (let i = 0; i < count; i++) {
        if (direction === "right") {
            const out = bits & 1;
            const inBit = throughCarry ? carry : out;
            bits = (bits >>> 1) | (inBit << 15);
            carry = out;
        } else {
            const out = (bits >>> 15) & 1;
            const inBit = throughCarry ? carry : out;
            bits = toWord16((bits << 1) | inBit);
            carry = out;
        }
    }

    return finishShift(state, toWord16(bits), carry);
}
