import {
    AddressingMode,
    ConditionCode,
    MEMORY_SIZE,
    Opcode,
    toWord16,
    WORD_MASK,
} from "p3-core";
import type {
    AssembledProgram,
    AssemblyListRow,
    AssemblyResult,
    ProgramSegment,
} from "./types";

export type RecognizedAssemblyLine = readonly [
    label: string | undefined,
    operation: string,
    argumentText: string,
];

export type AssemblySymbol = {
    readonly name: string;
    readonly kind: "address" | "constant";
    readonly value: number;
};

export type AssemblySymbolTable = ReadonlyMap<string, AssemblySymbol>;

type ParsedExpression =
    | { readonly kind: "number"; readonly text: string; readonly value: number; }
    | { readonly kind: "symbol"; readonly text: string; readonly name: string; };

type ParsedOperand =
    | { readonly kind: "register"; readonly register: number; }
    | { readonly kind: "stack-pointer"; }
    | { readonly kind: "immediate"; readonly expression: ParsedExpression; }
    | { readonly kind: "register-indirect"; readonly baseRegister: number; }
    | { readonly kind: "extended"; readonly baseRegister: number; readonly displacement: ParsedExpression; };

type SourceLine = {
    readonly sourceLine: number;
    readonly label: string | undefined;
    readonly operation: string;
    readonly argumentText: string;
};

const DIRECTIVES = new Set(["ORIG", "EQU", "WORD", "STR", "TAB"]);

type InstructionFamily =
    | "zero"
    | "zero-const"
    | "one"
    | "one-const"
    | "two"
    | "jump"
    | "branch";

type InstructionSpec = {
    readonly mnemonic: string;
    readonly opcode: Opcode;
    readonly family: InstructionFamily;
    readonly conditionalOpcode?: Opcode;
};

const INSTRUCTIONS: readonly InstructionSpec[] = [
    { mnemonic: "NOP", opcode: Opcode.NOP, family: "zero" },
    { mnemonic: "ENI", opcode: Opcode.ENI, family: "zero" },
    { mnemonic: "DSI", opcode: Opcode.DSI, family: "zero" },
    { mnemonic: "STC", opcode: Opcode.STC, family: "zero" },
    { mnemonic: "CLC", opcode: Opcode.CLC, family: "zero" },
    { mnemonic: "CMC", opcode: Opcode.CMC, family: "zero" },
    { mnemonic: "RET", opcode: Opcode.RET, family: "zero" },
    { mnemonic: "RTI", opcode: Opcode.RTI, family: "zero" },

    { mnemonic: "INT", opcode: Opcode.INT, family: "zero-const" },
    { mnemonic: "RETN", opcode: Opcode.RETN, family: "zero-const" },

    { mnemonic: "NEG", opcode: Opcode.NEG, family: "one" },
    { mnemonic: "INC", opcode: Opcode.INC, family: "one" },
    { mnemonic: "DEC", opcode: Opcode.DEC, family: "one" },
    { mnemonic: "COM", opcode: Opcode.COM, family: "one" },
    { mnemonic: "PUSH", opcode: Opcode.PUSH, family: "one" },
    { mnemonic: "POP", opcode: Opcode.POP, family: "one" },

    { mnemonic: "SHR", opcode: Opcode.SHR, family: "one-const" },
    { mnemonic: "SHL", opcode: Opcode.SHL, family: "one-const" },
    { mnemonic: "SHRA", opcode: Opcode.SHRA, family: "one-const" },
    { mnemonic: "SHLA", opcode: Opcode.SHLA, family: "one-const" },
    { mnemonic: "ROR", opcode: Opcode.ROR, family: "one-const" },
    { mnemonic: "ROL", opcode: Opcode.ROL, family: "one-const" },
    { mnemonic: "RORC", opcode: Opcode.RORC, family: "one-const" },
    { mnemonic: "ROLC", opcode: Opcode.ROLC, family: "one-const" },

    { mnemonic: "CMP", opcode: Opcode.CMP, family: "two" },
    { mnemonic: "ADD", opcode: Opcode.ADD, family: "two" },
    { mnemonic: "ADDC", opcode: Opcode.ADDC, family: "two" },
    { mnemonic: "SUB", opcode: Opcode.SUB, family: "two" },
    { mnemonic: "SUBB", opcode: Opcode.SUBB, family: "two" },
    { mnemonic: "MUL", opcode: Opcode.MUL, family: "two" },
    { mnemonic: "DIV", opcode: Opcode.DIV, family: "two" },
    { mnemonic: "TEST", opcode: Opcode.TEST, family: "two" },
    { mnemonic: "AND", opcode: Opcode.AND, family: "two" },
    { mnemonic: "OR", opcode: Opcode.OR, family: "two" },
    { mnemonic: "XOR", opcode: Opcode.XOR, family: "two" },
    { mnemonic: "MOV", opcode: Opcode.MOV, family: "two" },
    { mnemonic: "MVBH", opcode: Opcode.MVBH, family: "two" },
    { mnemonic: "MVBL", opcode: Opcode.MVBL, family: "two" },
    { mnemonic: "XCH", opcode: Opcode.XCH, family: "two" },

    { mnemonic: "JMP", opcode: Opcode.JMP, family: "jump", conditionalOpcode: Opcode.JMP_COND },
    { mnemonic: "CALL", opcode: Opcode.CALL, family: "jump", conditionalOpcode: Opcode.CALL_COND },

    { mnemonic: "BR", opcode: Opcode.BR, family: "branch", conditionalOpcode: Opcode.BR_COND },
];

const INSTRUCTION_SPECS: ReadonlyMap<string, InstructionSpec> = new Map(
    INSTRUCTIONS.map((spec): [string, InstructionSpec] => [spec.mnemonic, spec]),
);

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CONDITIONS: ReadonlyMap<string, ConditionCode> = new Map([
    ["Z", ConditionCode.Z], ["NZ", ConditionCode.NZ],
    ["C", ConditionCode.C], ["NC", ConditionCode.NC],
    ["N", ConditionCode.N], ["NN", ConditionCode.NN],
    ["O", ConditionCode.O], ["NO", ConditionCode.NO],
    ["P", ConditionCode.P], ["NP", ConditionCode.NP],
    ["I", ConditionCode.I], ["NI", ConditionCode.NI],
]);

const SIGNED_WORD_MIN = -0x8000;
const INT_VECTOR_MAX = 0xff;
const RETN_CONSTANT_MAX = 0x3ff;
const CONSTANT_FIELD_MASK = 0x3ff;
const SHIFT_COUNT_MIN = 1;
const SHIFT_COUNT_MAX = 16;
const BRANCH_DISPLACEMENT_MIN = -32;
const BRANCH_DISPLACEMENT_MAX = 31;
const BRANCH_DISPLACEMENT_MASK = 0x3f;

type AnalysedBody =
    | { readonly kind: "empty"; }
    | { readonly kind: "orig"; }
    | { readonly kind: "equ"; readonly value: number; }
    | { readonly kind: "word"; readonly expressions: readonly ParsedExpression[]; }
    | { readonly kind: "str"; readonly expressions: readonly ParsedExpression[]; }
    | { readonly kind: "tab"; readonly count: number; }
    | { readonly kind: "zero"; readonly opcode: Opcode; }
    | { readonly kind: "zero-const"; readonly opcode: Opcode; readonly constant: ParsedExpression; readonly max: number; }
    | { readonly kind: "one"; readonly opcode: Opcode; readonly operand: ParsedOperand; }
    | { readonly kind: "one-const"; readonly opcode: Opcode; readonly operand: ParsedOperand; readonly count: ParsedExpression; }
    | {
        readonly kind: "two";
        readonly opcode: Opcode;
        readonly registerFirst: boolean;
        readonly directRegister: number;
        readonly addressed: ParsedOperand;
    }
    | { readonly kind: "jump"; readonly opcode: Opcode; readonly conditionBits: number; readonly operand: ParsedOperand; }
    | { readonly kind: "branch"; readonly opcode: Opcode; readonly conditionBits: number; readonly target: ParsedExpression; };

type AnalysedLine = {
    readonly sourceLine: number;
    readonly address: number;
    readonly label: string | undefined;
    readonly operation: string;
    readonly argumentText: string;
    readonly body: AnalysedBody;
};

export function assembleSource(sourceCode: string): AssemblyResult {
    const lines = recognizeSourceLines(sourceCode);
    validateLabels(lines);
    const analysed = analyseSourceLines(lines);
    const symbols = collectSymbolValues(analysed);
    return emitAssemblyResult(analysed, symbols);
}

function validateLabels(lines: readonly SourceLine[]): void {
    const seenLabels = new Set<string>();
    for (const{label} of lines) {
        if (label !== undefined) checkLabel(label, seenLabels);
    }
}

function analyseSourceLines(lines: readonly SourceLine[]): AnalysedLine[] {
    const constants = resolveConstants(lines);
    const analysed: AnalysedLine[] = [];
    let locationCounter = 0;

    for (const line of lines) {
        const{operation, argumentText, label} = line;
        if (operation === "ORIG") {
            locationCounter = parseLayoutConstant(argumentText, "ORIG", constants);
            analysed.push({...line, address: locationCounter, body: {kind: "orig"}});
            continue;
        }

        const body = analyseBody(operation, argumentText, label, constants);
        const address = locationCounter;
        locationCounter = nextAddress(address, bodyWordCount(body), operation);
        analysed.push({...line, address, body});
    }

    return analysed;
}

function resolveConstants(lines: readonly SourceLine[]): AssemblySymbolTable {
    const expressions = new Map<string, ParsedExpression>();
    for (const {label, operation, argumentText} of lines) {
        if (operation !== "EQU") continue;
        if (label === undefined) {
            throw new Error("Diretiva EQU inválida: falta a label que define o símbolo.");
        }
        const expression = parseExpression(requireOneArgument(operation, argumentText)[0]);
        validateConstantExpression(operation, expression, SIGNED_WORD_MIN, WORD_MASK);
        expressions.set(label, expression);
    }

    const symbols = new Map<string, AssemblySymbol>();
    const resolving = new Set<string>();
    function resolve(name: string): number {
        const symbol = symbols.get(name);
        if (symbol !== undefined) return symbol.value;
        if (resolving.has(name)) {
            throw new Error(`Definição EQU circular: "${name}".`);
        }
        const expression = expressions.get(name);
        if (expression === undefined) {
            throw new Error(`Constante EQU indefinida "${name}".`);
        }
        resolving.add(name);
        const value = expression.kind === "number" ? expression.value : resolve(expression.name);
        resolving.delete(name);
        symbols.set(name, {name, kind: "constant", value});
        return value;
    }
    for (const name of expressions.keys()) resolve(name);
    return symbols;
}

function analyseBody(operation: string, argumentText: string, label: string | undefined, constants: AssemblySymbolTable): AnalysedBody {
    if (operation === "") {
        requireNoArguments(operation, argumentText);
        return {kind: "empty"};
    }

    if (DIRECTIVES.has(operation)) {
        return analyseDirective(operation, argumentText, label, constants);
    }

    const{baseOperation, condition} = splitOperation(operation);
    return analyseInstruction(operation, baseOperation, condition, argumentText);
}

function analyseDirective(operation: string, argumentText: string, label: string | undefined, constants: AssemblySymbolTable): AnalysedBody {
    switch (operation) {
        case "EQU": {
            if (label === undefined) {
                throw new Error("Diretiva EQU inválida: falta a label que define o símbolo.");
            }
            return {kind: "equ", value: requireSymbol(constants, label).value};
        }

        case "WORD": {
            const expressions = requireAtLeastOneArgument("WORD", argumentText)
                .map((arg) => parseExpression(arg));
            for (const expression of expressions) {
                validateConstantExpression("WORD", expression, SIGNED_WORD_MIN, WORD_MASK);
            }
            return {kind: "word", expressions};
        }

        case "STR":
            return {kind: "str", expressions: parseStringExpressions(argumentText)};

        case "TAB":
            return {kind: "tab", count: parseLayoutConstant(argumentText, "TAB", constants)};

        case "ORIG":
            throw new Error("ORIG deve ser tratado antes do cálculo normal de tamanho.");

        default:
            throw new Error(`Diretiva desconhecida "${operation}".`);
    }
}

function analyseInstruction(operation: string, baseOperation: string, condition: string | undefined, argumentText: string): AnalysedBody {
    const spec = requireInstructionSpec(operation, baseOperation);

    switch (spec.family) {
        case "zero":
            requireNoArguments(operation, argumentText);
            return {kind: "zero", opcode: spec.opcode};

        case "zero-const": {
            const constant = parseExpression(requireOneArgument(operation, argumentText)[0]);
            const max = baseOperation === "INT" ? INT_VECTOR_MAX : RETN_CONSTANT_MAX;
            validateConstantExpression(operation, constant, 0, max);
            return {kind: "zero-const", opcode: spec.opcode, constant, max};
        }

        case "one": {
            const operand = parseOperand(operation, requireOneArgument(operation, argumentText)[0]);
            if (baseOperation !== "PUSH") {
                requireWritableOperand(operation, operand);
            }
            return {kind: "one", opcode: spec.opcode, operand};
        }

        case "one-const": {
            const[operandText, constantText] = requireTwoArguments(operation, argumentText);
            const operand = parseOperand(operation, operandText);
            const count = parseExpression(constantText);
            requireWritableOperand(operation, operand);
            validateConstantExpression(operation, count, SHIFT_COUNT_MIN, SHIFT_COUNT_MAX);
            return {kind: "one-const", opcode: spec.opcode, operand, count};
        }

        case "two": {
            const[firstText, secondText] = requireTwoArguments(operation, argumentText);
            const first = parseOperand(operation, firstText);
            const second = parseOperand(operation, secondText);
            validateTwoOperands(operation, baseOperation, first, second);
            if (first.kind === "register") {
                return {kind: "two", opcode: spec.opcode, registerFirst: true, directRegister: first.register, addressed: second};
            }
            if (second.kind === "register") {
                return {kind: "two", opcode: spec.opcode, registerFirst: false, directRegister: second.register, addressed: first};
            }
            throw new Error("Instrução de dois operandos requer um registo direto.");
        }

        case "jump": {
            const operand = parseOperand(operation, requireOneArgument(operation, argumentText)[0]);
            return {kind: "jump", ...resolveConditional(operation, spec, condition), operand};
        }

        case "branch": {
            const target = parseExpression(requireOneArgument(operation, argumentText)[0]);
            validateConstantExpression(operation, target, BRANCH_DISPLACEMENT_MIN, BRANCH_DISPLACEMENT_MAX);
            return {kind: "branch", ...resolveConditional(operation, spec, condition), target};
        }
    }
}

function bodyWordCount(body: AnalysedBody): number {
    switch (body.kind) {
        case "empty":
        case "orig":
        case "equ":
            return 0;
        case "word":
        case "str":
            return body.expressions.length;
        case "tab":
            return body.count;
        case "zero":
        case "zero-const":
        case "branch":
            return 1;
        case "one":
        case "one-const":
        case "jump":
            return 1 + (operandUsesExtensionWord(body.operand) ? 1 : 0);
        case "two":
            return 1 + (operandUsesExtensionWord(body.addressed) ? 1 : 0);
    }
}

function collectSymbolValues(lines: readonly AnalysedLine[]): AssemblySymbolTable {
    const symbols = new Map<string, AssemblySymbol>();
    for (const line of lines) {
        if (line.label === undefined) continue;
        const kind = line.body.kind === "equ" ? "constant" : "address";
        const value = line.body.kind === "equ" ? line.body.value : line.address;
        symbols.set(line.label, {name: line.label, kind, value});
    }
    return symbols;
}

function emitAssemblyResult(analysedCode: AnalysedLine[], symbolTable: AssemblySymbolTable): AssemblyResult {
    const segments: ProgramSegment[] = [];
    const list: AssemblyListRow[] = [];
    let currentSegment: { origin: number; words: number[]; } | undefined;
    let pendingListingLabel: string | undefined;

    for (const line of analysedCode) {
        if (line.body.kind === "empty" && line.label !== undefined) {
            pendingListingLabel = line.label;
            continue;
        }

        if (line.body.kind === "orig") {
            if (currentSegment !== undefined && currentSegment.words.length > 0) {
                segments.push(currentSegment);
            }
            currentSegment = {origin: line.address, words: []};
            pendingListingLabel = undefined;
            continue;
        }

        const words = emitLineWords(line, symbolTable);
        if (words.length === 0) {
            pendingListingLabel = undefined;
            continue;
        }

        list.push(makeListRow(line, words, pendingListingLabel));
        pendingListingLabel = undefined;

        if (currentSegment === undefined) {
            currentSegment = {origin: line.address, words: []};
        }

        currentSegment.words.push(...words);
    }

    if (currentSegment !== undefined && currentSegment.words.length > 0) {
        segments.push(currentSegment);
    }

    if (segments.length === 0) {
        throw new Error("O assembler não emitiu nenhum segmento.");
    }

    return {program: {entryPoint: segments[0]?.origin ?? 0, segments}, list};
}

function makeListRow(line: AnalysedLine, words: readonly number[], pendingListingLabel: string | undefined): AssemblyListRow {
    const row: AssemblyListRow = {sourceLine: line.sourceLine, address: line.address, words, operation: line.operation, argumentText: line.argumentText};

    const label = line.label ?? pendingListingLabel;
    if (label !== undefined) {
        row.label = label;
    }

    return row;
}

function emitLineWords(line: AnalysedLine, symbolTable: AssemblySymbolTable): number[] {
    const body = line.body;

    switch (body.kind) {
        case "empty":
        case "orig":
        case "equ":
            return [];

        case "word":
        case "str":
            return body.expressions.map((expression) => emitWordExpression(expression, symbolTable));

        case "tab":
            return Array.from({length: body.count}, () => 0);

        case "zero":
            return [encodeOpcodeWord(body.opcode)];

        case "zero-const": {
            const constant = evaluateConstantInRange(line.operation, body.constant, symbolTable, 0, body.max);
            return [encodeOpcodeWord(body.opcode, constant & CONSTANT_FIELD_MASK)];
        }

        case "one": {
            const encoded = encodeOperand(body.operand, symbolTable);
            const modeBits = encoded.mode << 4;
            const lowBits = modeBits | encoded.regModo;
            const word = encodeOpcodeWord(body.opcode, lowBits);
            return withOptionalExtension(word, encoded.extensionWord);
        }

        case "one-const": {
            const encoded = encodeOperand(body.operand, symbolTable);
            const countValue = evaluateConstantInRange(line.operation, body.count, symbolTable, SHIFT_COUNT_MIN, SHIFT_COUNT_MAX);
            const count = encodeShiftCount(countValue);
            const countBits = count << 6;
            const modeBits = encoded.mode << 4;
            const lowBits = countBits | modeBits | encoded.regModo;
            const word = encodeOpcodeWord(body.opcode, lowBits);
            return withOptionalExtension(word, encoded.extensionWord);
        }

        case "two": {
            const encoded = encodeOperand(body.addressed, symbolTable);
            const registerFirstBit = body.registerFirst ? 1 : 0;
            const selectorBits = registerFirstBit << 9;
            const registerBits = body.directRegister << 6;
            const modeBits = encoded.mode << 4;
            const lowBits = selectorBits | registerBits | modeBits | encoded.regModo;
            const word = encodeOpcodeWord(body.opcode, lowBits);
            return withOptionalExtension(word, encoded.extensionWord);
        }

        case "jump": {
            const encoded = encodeOperand(body.operand, symbolTable);

            const modeBits = encoded.mode << 4;
            const lowBits = body.conditionBits | modeBits | encoded.regModo;
            const word = encodeOpcodeWord(body.opcode, lowBits);
            return withOptionalExtension(word, encoded.extensionWord);
        }

        case "branch": {
            const displacement = evaluateBranchDisplacement(line, body.target, symbolTable);

            const displacementBits = displacement & BRANCH_DISPLACEMENT_MASK;
            const lowBits = body.conditionBits | displacementBits;
            const word = encodeOpcodeWord(body.opcode, lowBits);
            return [word];
        }
    }
}

function resolveConditional(operation: string, spec: InstructionSpec, condition: string | undefined): { opcode: Opcode; conditionBits: number; } {
    if (condition === undefined) {
        return {opcode: spec.opcode, conditionBits: 0};
    }

    return {opcode: requireConditionalOpcode(operation, spec), conditionBits: requireCondition(condition) << 6};
}

type EncodedOperand = {
    readonly mode: AddressingMode;
    readonly regModo: number;
    readonly extensionWord?: number;
};

function encodeOperand(operand: ParsedOperand, symbolTable: AssemblySymbolTable): EncodedOperand {
    switch (operand.kind) {
        case "register":
            return {mode: AddressingMode.Register, regModo: operand.register};
        case "stack-pointer":
            return {mode: AddressingMode.Register, regModo: 14};
        case "register-indirect":
            return {mode: AddressingMode.RegisterIndirect, regModo: operand.baseRegister};
        case "immediate":
            return {mode: AddressingMode.Immediate, regModo: 0, extensionWord: emitWordExpression(operand.expression, symbolTable)};
        case "extended":
            return {mode: AddressingMode.Extended, regModo: operand.baseRegister, extensionWord: emitWordExpression(operand.displacement, symbolTable)};
    }
}

function emitWordExpression(expression: ParsedExpression, symbolTable: AssemblySymbolTable): number {
    const value = evaluateExpression(expression, symbolTable);

    if (value < SIGNED_WORD_MIN || value > WORD_MASK) {
        throw new Error(`Valor "${expression.text}" fora do intervalo de 16 bits (-32768 a 65535).`);
    }

    return toWord16(value);
}

function evaluateExpression(expression: ParsedExpression, symbolTable: AssemblySymbolTable): number {
    if (expression.kind === "number") return expression.value;

    return requireSymbol(symbolTable, expression.name).value;
}

function evaluateConstantInRange(operation: string, expression: ParsedExpression, symbolTable: AssemblySymbolTable, min: number, max: number): number {
    const value = evaluateExpression(expression, symbolTable);

    if (value < min || value > max) {
        throw new Error(`Argumento inválido em "${operation}": "${expression.text}" está fora do intervalo permitido.`);
    }

    return value;
}

function evaluateBranchDisplacement(line: AnalysedLine, target: ParsedExpression, symbolTable: AssemblySymbolTable): number {
    if (target.kind === "number") return target.value;

    const symbol = requireSymbol(symbolTable, target.name);
    const displacement = symbol.kind === "constant" ? symbol.value : symbol.value - (line.address + 1);

    if (displacement < BRANCH_DISPLACEMENT_MIN || displacement > BRANCH_DISPLACEMENT_MAX) {
        throw new Error(`Argumento inválido em "${line.operation}": símbolo "${target.name}" está fora do alcance do salto relativo.`);
    }

    return displacement;
}

function requireSymbol(symbolTable: AssemblySymbolTable, name: string): AssemblySymbol {
    const symbol = symbolTable.get(name);
    if (symbol === undefined) {
        throw new Error(`Símbolo indefinido "${name}".`);
    }

    return symbol;
}

function parseStringExpressions(argumentText: string): readonly ParsedExpression[] {
    const expressions: ParsedExpression[] = [];
    for (const arg of requireAtLeastOneArgument("STR", argumentText)) {
        const quote = arg[0];
        if (quote !== "'" && quote !== '"') {
            const expression = parseExpression(arg);
            validateConstantExpression("STR", expression, SIGNED_WORD_MIN, WORD_MASK);
            expressions.push(expression);
            continue;
        }
        if (arg.length < 2 || arg.at(-1) !== quote || arg.slice(1, -1).includes(quote)) {
            throw new Error('Argumentos inválidos em "STR": texto entre aspas inválido.');
        }
        for (const char of arg.slice(1, -1)) {
            const value = char.codePointAt(0)!;
            if (value > 0xff) {
                throw new Error(`Carácter fora do intervalo de 8 bits em "STR": "${char}".`);
            }
            expressions.push({kind: "number", text: char, value});
        }
    }
    return expressions;
}

function withOptionalExtension(word: number, extensionWord: number | undefined): number[] {
    if (extensionWord === undefined) return [word];
    return [word, extensionWord];
}

function encodeOpcodeWord(opcode: Opcode, lowBits = 0): number {
    return toWord16((opcode << 10) | lowBits);
}

function encodeShiftCount(count: number): number {
    return count === SHIFT_COUNT_MAX ? 0 : count;
}

function requireInstructionSpec(operation: string, baseOperation: string): InstructionSpec {
    const spec = INSTRUCTION_SPECS.get(baseOperation);
    if (spec === undefined) {
        throw new Error(`Operação desconhecida "${operation}".`);
    }

    return spec;
}

function requireConditionalOpcode(operation: string, spec: InstructionSpec): Opcode {
    if (spec.conditionalOpcode === undefined) {
        throw new Error(`Opcode condicional desconhecido para "${operation}".`);
    }

    return spec.conditionalOpcode;
}

function requireCondition(condition: string): ConditionCode {
    const code = CONDITIONS.get(condition);
    if (code === undefined) {
        throw new Error(`Condição desconhecida "${condition}".`);
    }

    return code;
}

function recognizeAssemblyLine(originalText: string, sourceLine: number): SourceLine | undefined {
    const text = stripComment(originalText).trim();

    if (text.length === 0) {
        return undefined;
    }

    const operationMatch = findOperation(text);

    if (operationMatch === undefined) {
        return {sourceLine, label: parseLabel(text), operation: "", argumentText: ""};
    }

    const labelText = text.slice(0, operationMatch.start).trim();
    const argumentText = text.slice(operationMatch.end).trimStart();
    const label = labelText.length === 0 ? undefined : parseLabel(labelText);

    return {sourceLine, label, operation: normalizeOperation(operationMatch.word), argumentText};
}

function recognizeSourceLines(sourceCode: string): SourceLine[] {
    const recognized: SourceLine[] = [];
    const sourceLines = sourceCode.split(/\r\n|\n|\r/);
    for (let index = 0; index < sourceLines.length; index++) {
        const line = recognizeAssemblyLine(sourceLines[index]!, index + 1);
        if (line === undefined) continue;
        recognized.push(line);
    }
    return recognized;
}

function findOperation(text: string): { word: string; start: number; end: number; } | undefined {
    const wordPattern = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(text)) !== null) {
        const word = match[0];

        if (isOperation(word)) {
            return {word, start: match.index, end: match.index + word.length};
        }
    }

    return undefined;
}

function parseLabel(text: string): string {
    return text.endsWith(":") ? text.slice(0, -1) : text;
}

function checkLabel(label: string, seenLabels: Set<string>): string {
    if (label.length === 0) {
        throw new Error("Label inválida: o nome não pode estar vazio.");
    }

    if (/\s/.test(label)) {
        throw new Error(`Label inválida "${label}": o nome não pode conter espaços.`);
    }

    if (label.includes(":")) {
        throw new Error(`Label inválida "${label}": o símbolo ":" só pode aparecer no fim da label.`);
    }

    if (!isValidIdentifier(label)) {
        throw new Error(`Label inválida "${label}": o nome deve começar por letra ou "_" e conter apenas letras, dígitos ou "_".`);
    }

    if (isReservedIdentifier(label)) {
        throw new Error(`Label inválida "${label}": o nome não pode ser uma palavra reservada.`);
    }

    if (seenLabels.has(label)) {
        throw new Error(`Label duplicada: "${label}".`);
    }

    seenLabels.add(label);
    return label;
}

function splitOperation(operation: string): {
    baseOperation: string;
    condition: string | undefined;
} {
    const parts = operation.split(".");

    if (parts.length > 2 || parts.some((part) => part.length === 0)) {
        throw new Error(`Operação inválida "${operation}".`);
    }

    const[baseOperation, condition] = parts as [string, string | undefined];

    if (condition === undefined) {
        return {baseOperation, condition: undefined};
    }

    if (INSTRUCTION_SPECS.get(baseOperation)?.conditionalOpcode === undefined) {
        throw new Error(`Operação inválida "${operation}": só BR, JMP e CALL é que aceitam sufixo condicional.`);
    }

    if (!CONDITIONS.has(condition)) {
        throw new Error(`Operação inválida "${operation}": condição desconhecida "${condition}".`);
    }

    return {baseOperation, condition};
}

function requireNoArguments(operation: string, argumentText: string): void {
    if (argumentText.trim().length !== 0) {
        throw new Error(`Argumentos inválidos em "${operation}": esta linha não aceita argumentos.`);
    }
}

function requireOneArgument(operation: string, argumentText: string): [string] {
    return requireArgumentCount(operation, argumentText, 1) as [string];
}

function requireTwoArguments(operation: string, argumentText: string): [string, string] {
    return requireArgumentCount(operation, argumentText, 2) as [string, string];
}

function requireArgumentCount(operation: string, argumentText: string, expectedCount: number): string[] {
    const args = splitArguments(argumentText);

    if (args.length !== expectedCount) {
        throw new Error(`Argumentos inválidos em "${operation}": esperados ${expectedCount}, recebidos ${args.length}.`);
    }

    return args;
}

function requireAtLeastOneArgument(operation: string, argumentText: string): string[] {
    const args = splitArguments(argumentText);

    if (args.length === 0) {
        throw new Error(`Argumentos inválidos em "${operation}": esperado pelo menos 1 argumento.`);
    }

    return args;
}

function splitArguments(argumentText: string): string[] {
    const text = argumentText.trim();
    if (text.length === 0) return [];

    const args: string[] = [];
    let current = "";
    let quote: string | undefined;

    for (const char of text) {
        if (quote !== undefined) {
            if (char === quote) quote = undefined;
            current += char;
            continue;
        }

        if (char === "'" || char === '"') {
            quote = char;
            current += char;
            continue;
        }

        if (char === ",") {
            args.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (quote !== undefined) {
        throw new Error("Argumentos inválidos: string sem aspas de fecho.");
    }

    args.push(current.trim());

    if (args.some((arg) => arg.length === 0)) {
        throw new Error("Argumentos inválidos: vírgula sem argumento.");
    }

    return args;
}

function parseOperand(operation: string, operandText: string): ParsedOperand {
    const text = operandText.trim();

    if (text.length === 0) {
        throw new Error(`Operando inválido em "${operation}": operando vazio.`);
    }

    const register = parseRegister(text);
    if (register !== undefined) {
        return {kind: "register", register};
    }

    if (/^R\d+$/i.test(text)) {
        throw new Error(`Operando inválido em "${operation}": registo inválido "${text}".`);
    }

    if (/^SP$/i.test(text)) {
        if (operation !== "MOV") {
            throw new Error(`Operando inválido em "${operation}": o registo SP só pode ser usado em "MOV SP, Rx" ou "MOV Rx, SP".`);
        }
        return {kind: "stack-pointer"};
    }

    if (/^M\[/i.test(text) || text.includes("[") || text.includes("]")) {
        return parseMemoryOperand(operation, text);
    }

    return {kind: "immediate", expression: parseExpression(text)};
}

function parseMemoryOperand(operation: string, text: string): ParsedOperand {
    const memoryMatch = /^M\[(.*)\]$/i.exec(text);

    if (memoryMatch === null) {
        throw new Error(`Operando inválido em "${operation}": sintaxe de memória inválida "${text}".`);
    }

    const inner = memoryMatch[1]?.trim() ?? "";
    if (inner.length === 0) {
        throw new Error(`Operando inválido em "${operation}": endereço de memória vazio.`);
    }

    const indirectRegister = parseRegister(inner);
    if (indirectRegister !== undefined) {
        return {kind: "register-indirect", baseRegister: indirectRegister};
    }

    if (/^R\d+$/i.test(inner)) {
        throw new Error(`Operando inválido em "${operation}": registo inválido "${inner}".`);
    }

    const parts = inner.split("+").map((part) => part.trim());
    if (parts.length > 2 || parts.some((part) => part.length === 0)) {
        throw new Error(`Operando inválido em "${operation}": expressão de memória inválida "${text}".`);
    }

    if (parts.length === 1) {
        return {kind: "extended", baseRegister: 0, displacement: parseExpression(parts[0] as string)};
    }

    const[baseText, expressionText] = parts as [string, string];
    const base = parseMemoryBase(baseText);
    const invalidRightBase = parseMemoryBase(expressionText);

    if (base !== undefined && invalidRightBase !== undefined) {
        throw new Error(`Operando inválido em "${operation}": só pode existir um termo base em "${text}".`);
    }

    if (base === undefined) {
        throw new Error(`Operando inválido em "${operation}": o modo indexado/relativo/baseado deve usar a forma base+W em "${text}".`);
    }

    const expression = parseExpression(expressionText);

    return {kind: "extended", baseRegister: base, displacement: expression};
}

function parseMemoryBase(text: string): number | undefined {
    const register = parseRegister(text);
    if (register !== undefined) return register;

    const normalized = text.toUpperCase();
    if (normalized === "PC") return 15;
    if (normalized === "SP") return 14;

    return undefined;
}

function parseRegister(text: string): number | undefined {
    const match = /^R(\d+)$/i.exec(text.trim());
    if (match === null) return undefined;

    const register = Number.parseInt(match[1] as string, 10);
    return register >= 0 && register <= 7 ? register : undefined;
}

function operandUsesExtensionWord(operand: ParsedOperand): boolean {
    return operand.kind === "immediate" || operand.kind === "extended";
}

function requireWritableOperand(operation: string, operand: ParsedOperand): void {
    if (operand.kind === "immediate") {
        throw new Error(`Argumentos inválidos em "${operation}": o destino não pode ser imediato.`);
    }
}

function validateTwoOperands(operation: string, baseOperation: string, first: ParsedOperand, second: ParsedOperand): void {
    if (operandUsesExtensionWord(first) && operandUsesExtensionWord(second)) {
        throw new Error(`Argumentos inválidos em "${operation}": a instrução só pode usar uma palavra W.`);
    }

    if (first.kind !== "register" && second.kind !== "register") {
        throw new Error(`Argumentos inválidos em "${operation}": uma instrução de dois operandos precisa de pelo menos um registo direto.`);
    }

    requireWritableOperand(operation, first);

    const rejectsImmediate = ["XCH", "MUL", "DIV"].includes(baseOperation);
    const hasImmediate = first.kind === "immediate" || second.kind === "immediate";
    if (rejectsImmediate && hasImmediate) {
        throw new Error(`Argumentos inválidos em "${operation}": esta instrução não aceita operandos imediatos.`);
    }

    const requiresDifferentRegisters = ["MUL", "DIV"].includes(baseOperation);
    const bothRegisters = first.kind === "register" && second.kind === "register";
    const sameRegister = bothRegisters && first.register === second.register;
    if (requiresDifferentRegisters && sameRegister) {
        throw new Error(`Argumentos inválidos em "${operation}": os dois operandos não podem ser o mesmo registo.`);
    }
}

function parseLayoutConstant(argumentText: string, operation: string, symbolTable: AssemblySymbolTable): number {
    const[arg] = requireOneArgument(operation, argumentText);
    return evaluateConstantInRange(operation, parseExpression(arg), symbolTable, 0, WORD_MASK);
}

function parseExpression(text: string): ParsedExpression {
    const normalized = text.trim();

    if (normalized.length === 0) {
        throw new Error("Expressão inválida: expressão vazia.");
    }

    const numericValue = tryParseNumericLiteral(normalized);
    if (numericValue !== undefined) {
        return {kind: "number", text: normalized, value: numericValue};
    }

    if (isValidIdentifier(normalized)) {
        return {kind: "symbol", text: normalized, name: normalized};
    }

    throw new Error(`Expressão inválida "${text}".`);
}

function tryParseNumericLiteral(text: string): number | undefined {
    const normalized = text.trim();
    const character = /^'(.)'$/u.exec(normalized);
    if (character !== null) {
        const value = character[1]!.codePointAt(0)!;
        return value <= 0xff ? value : undefined;
    }
    const sign = normalized.startsWith("-") ? -1 : 1;
    const unsigned = normalized.startsWith("-") || normalized.startsWith("+") ? normalized.slice(1) : normalized;

    if (unsigned.length === 0) return undefined;

    if (/^[01]+b$/i.test(unsigned)) {
        return sign * Number.parseInt(unsigned.slice(0, -1), 2);
    }

    if (/^[0-7]+o$/i.test(unsigned)) {
        return sign * Number.parseInt(unsigned.slice(0, -1), 8);
    }

    if (/^[0-9]+d?$/i.test(unsigned)) {
        return sign * Number.parseInt(unsigned, 10);
    }

    if (/^[0-9A-F]+h$/i.test(unsigned)) {
        return sign * Number.parseInt(unsigned.slice(0, -1), 16);
    }

    return undefined;
}

function validateConstantExpression(operation: string, expression: ParsedExpression, min: number, max: number): void {
    if (expression.kind !== "number") return;

    if (expression.value < min || expression.value > max) {
        throw new Error(`Argumento inválido em "${operation}": "${expression.text}" está fora do intervalo permitido.`);
    }
}

function isValidIdentifier(text: string): boolean {
    return IDENTIFIER_PATTERN.test(text);
}

function isReservedIdentifier(text: string): boolean {
    const normalized = normalizeOperation(text);

    return isOperation(normalized) ||
        /^R(?:[0-9]|1[0-5])$/i.test(normalized) ||
        normalized === "PC" ||
        normalized === "SP";
}

function nextAddress(currentAddress: number, wordCount: number, operation: string): number {
    if (wordCount < 0) {
        throw new Error(`Tamanho inválido para "${operation}".`);
    }

    const next = currentAddress + wordCount;

    if (next > MEMORY_SIZE) {
        throw new Error(`Endereço inválido em "${operation}": a linha ultrapassa o espaço de endereçamento.`);
    }

    return toWord16(next);
}

function stripComment(line: string): string {
    let quote: string | undefined;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quote !== undefined) {
            if (char === quote) quote = undefined;
        } else if (char === "'" || char === '"') {
            quote = char;
        } else if (char === ";") {
            return line.slice(0, index);
        }
    }
    return line;
}

function isOperation(word: string): boolean {
    const operation = normalizeOperation(word);
    const baseOperation = operation.split(".", 1)[0] ?? operation;

    return DIRECTIVES.has(operation) || INSTRUCTION_SPECS.has(baseOperation);
}

function normalizeOperation(word: string): string {
    return word.toUpperCase();
}

export function assemble(sourceCode: string): AssembledProgram {
    return assembleSource(sourceCode).program;
}

export function recognizeAssemblyLines(sourceCode: string): RecognizedAssemblyLine[] {
    return recognizeSourceLines(sourceCode).map(({label, operation, argumentText}) => [label, operation, argumentText]);
}

export function checkLabels(lines: RecognizedAssemblyLine[]): RecognizedAssemblyLine[] {
    const sourceLines = lines.map(([label, operation, argumentText], index) => {
        const sourceLine = index + 1;
        return {sourceLine, label, operation, argumentText};
    });
    validateLabels(sourceLines);
    return lines.map(([label, operation, argumentText]) => [label, operation, argumentText]);
}

type LegacyAnalysedLine = Omit<AnalysedLine, "body"> & {
    readonly wordCount: number;
    readonly body: ReturnType<typeof legacyBody>;
};

export function analyseLines(lines: RecognizedAssemblyLine[], sourceLines: readonly number[] = []): LegacyAnalysedLine[] {
    const recognized = lines.map(([label, operation, argumentText], index) => {
        const sourceLine = sourceLines[index] ?? index + 1;
        return {sourceLine, label, operation, argumentText};
    });
    const analysed = analyseSourceLines(recognized);
    return analysed.map(line => ({...line, wordCount: bodyWordCount(line.body), body: legacyBody(line)}));
}

export function buildSymbolTable(lines: LegacyAnalysedLine[]): AssemblySymbolTable {
    const symbols = new Map<string, AssemblySymbol>();
    for (const line of lines) {
        if (line.label === undefined) continue;
        const isConstant = line.body.kind === "equ";
        const kind = isConstant ? "constant" : "address";
        const value = isConstant ? line.body.value : line.address;
        symbols.set(line.label, {name: line.label, kind, value});
    }
    return symbols;
}

function legacyOperand(operand: ParsedOperand, operandText: string) {
    const text = operandText.trim();
    switch (operand.kind) {
        case "register": return {kind: "register", text, register: operand.register} as const;
        case "stack-pointer": return {kind: "special-register", text, register: 14} as const;
        case "immediate": return {kind: "immediate", text, expression: operand.expression} as const;
        case "register-indirect":
            return {kind: "memory", text, mode: "register-indirect", baseRegister: operand.baseRegister} as const;
        case "extended": {
            const parts = text.slice(2, -1).split("+");
            if (parts.length === 1) {
                return {kind: "memory", text, mode: "direct", expression: operand.displacement} as const;
            }
            if (operand.baseRegister === 15 || operand.baseRegister === 14) {
                return {kind: "memory", text, mode: operand.baseRegister === 15 ? "relative" : "based", expression: operand.displacement} as const;
            }
            return {kind: "memory", text, mode: "indexed", baseRegister: operand.baseRegister, expression: operand.displacement} as const;
        }
    }
}

function legacyBody(line: AnalysedLine) {
    const body = line.body;
    const[operation, condition] = line.operation.split(".");
    const spec = INSTRUCTION_SPECS.get(operation!)!;
    switch (body.kind) {
        case "zero": return {kind: body.kind, spec};
        case "zero-const": return {kind: body.kind, spec, constant: body.constant, max: body.max};
        case "one": return {kind: body.kind, spec, operand: legacyOperand(body.operand, line.argumentText)};
        case "one-const": {
            const args = splitArguments(line.argumentText);
            const operandText = args[0]!;
            const operand = legacyOperand(body.operand, operandText);
            return {kind: body.kind, spec, operand, count: body.count};
        }
        case "two": {
            const[firstText, secondText] = splitArguments(line.argumentText);
            const direct: ParsedOperand = {kind: "register", register: body.directRegister};
            const firstOperand = body.registerFirst ? direct : body.addressed;
            const first = legacyOperand(firstOperand, firstText!);
            const secondOperand = body.registerFirst ? body.addressed : direct;
            const second = legacyOperand(secondOperand, secondText!);
            return {kind: body.kind, spec, first, second};
        }
        case "jump": return {kind: body.kind, spec, condition, operand: legacyOperand(body.operand, line.argumentText)};
        case "branch": return {kind: body.kind, spec, condition, target: body.target};
        default: return body;
    }
}
