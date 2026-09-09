export enum FlagBit {
    O = 0,
    N = 1,
    C = 2,
    Z = 3,
    E = 4,
}

export enum AddressingMode {
    Register = 0b00,
    RegisterIndirect = 0b01,
    Immediate = 0b10,
    Extended = 0b11,
}

export enum ConditionCode {
    Z = 0b0000,
    NZ = 0b0001,
    C = 0b0010,
    NC = 0b0011,
    N = 0b0100,
    NN = 0b0101,
    O = 0b0110,
    NO = 0b0111,
    P = 0b1000,
    NP = 0b1001,
    I = 0b1010,
    NI = 0b1011,
}

export enum Opcode {
    NOP = 0b000000,
    ENI = 0b000001,
    DSI = 0b000010,
    STC = 0b000011,
    CLC = 0b000100,
    CMC = 0b000101,
    RET = 0b000110,
    RTI = 0b000111,
    INT = 0b001000,
    RETN = 0b001001,

    NEG = 0b010000,
    INC = 0b010001,
    DEC = 0b010010,
    COM = 0b010011,
    PUSH = 0b010100,
    POP = 0b010101,

    SHR = 0b011000,
    SHL = 0b011001,
    SHRA = 0b011010,
    SHLA = 0b011011,
    ROR = 0b011100,
    ROL = 0b011101,
    RORC = 0b011110,
    ROLC = 0b011111,

    CMP = 0b100000,
    ADD = 0b100001,
    ADDC = 0b100010,
    SUB = 0b100011,
    SUBB = 0b100100,
    MUL = 0b100101,
    DIV = 0b100110,
    TEST = 0b100111,
    AND = 0b101000,
    OR = 0b101001,
    XOR = 0b101010,
    MOV = 0b101011,
    MVBH = 0b101100,
    MVBL = 0b101101,
    XCH = 0b101110,

    JMP = 0b110000,
    JMP_COND = 0b110001,
    CALL = 0b110010,
    CALL_COND = 0b110011,
    BR = 0b111000,
    BR_COND = 0b111001,
}

export type OperandSelector = 0 | 1;

export type ShiftRotateOpcode =
    | Opcode.SHR
    | Opcode.SHL
    | Opcode.SHRA
    | Opcode.SHLA
    | Opcode.ROR
    | Opcode.ROL
    | Opcode.RORC
    | Opcode.ROLC;

export type ZeroOperandInstruction = {
    format: "zero-op";
    opcode:
    | Opcode.NOP
    | Opcode.ENI
    | Opcode.DSI
    | Opcode.STC
    | Opcode.CLC
    | Opcode.CMC
    | Opcode.RET
    | Opcode.RTI;
};

export type ConstantInstruction = {
    format: "zero-op-const";
    opcode: Opcode.INT | Opcode.RETN;
    constant: number;
};

export type OneOperandInstruction = {
    format: "one-op";
    opcode:
    | Opcode.NEG
    | Opcode.INC
    | Opcode.DEC
    | Opcode.COM
    | Opcode.PUSH
    | Opcode.POP;
    m: AddressingMode;
    regModo: number;
};

export type ShiftRotateInstruction = {
    format: "one-op-const";
    opcode: ShiftRotateOpcode;
    shiftCount: number;
    m: AddressingMode;
    regModo: number;
};

export type TwoOperandInstruction = {
    format: "two-op";
    opcode:
    | Opcode.CMP
    | Opcode.ADD
    | Opcode.ADDC
    | Opcode.SUB
    | Opcode.SUBB
    | Opcode.MUL
    | Opcode.DIV
    | Opcode.TEST
    | Opcode.AND
    | Opcode.OR
    | Opcode.XOR
    | Opcode.MOV
    | Opcode.MVBH
    | Opcode.MVBL
    | Opcode.XCH;
    s: OperandSelector;
    regReg: number;
    m: AddressingMode;
    regModo: number;
};

export type JumpInstruction = {
    format: "jump";
    opcode: Opcode.JMP | Opcode.CALL;
    m: AddressingMode;
    regModo: number;
};

export type ConditionalJumpInstruction = {
    format: "cond-jump";
    opcode: Opcode.JMP_COND | Opcode.CALL_COND;
    condition: ConditionCode;
    m: AddressingMode;
    regModo: number;
};

export type BranchInstruction = {
    format: "branch";
    opcode: Opcode.BR;
    displacement: number;
};

export type ConditionalBranchInstruction = {
    format: "cond-branch";
    opcode: Opcode.BR_COND;
    condition: ConditionCode;
    displacement: number;
};

export type DecodedInstruction =
    | ZeroOperandInstruction
    | ConstantInstruction
    | OneOperandInstruction
    | ShiftRotateInstruction
    | TwoOperandInstruction
    | JumpInstruction
    | ConditionalJumpInstruction
    | BranchInstruction
    | ConditionalBranchInstruction;

export type DecodedInstructionFormat = DecodedInstruction["format"];

export type Decoded<TFormat extends DecodedInstructionFormat> =
    Extract<DecodedInstruction, { format: TFormat; }>;

export function addressingModeUsesExtensionWord(mode: AddressingMode): boolean {
    return mode === AddressingMode.Immediate || mode === AddressingMode.Extended;
}
