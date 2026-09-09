import { describe, expect, it } from "vitest";
import { assembleSource } from "p3-system";

const ZERO_INSTRUCTIONS = [
    ["NOP", 0x0000], ["ENI", 0x0400], ["DSI", 0x0800], ["STC", 0x0c00],
    ["CLC", 0x1000], ["CMC", 0x1400], ["RET", 0x1800], ["RTI", 0x1c00],
] as const;

const UNARY_INSTRUCTIONS = [
    ["NEG", 0x4000], ["INC", 0x4400], ["DEC", 0x4800],
    ["COM", 0x4c00], ["PUSH", 0x5000], ["POP", 0x5400],
] as const;

const SHIFT_INSTRUCTIONS = [
    ["SHR", 0x6000], ["SHL", 0x6400], ["SHRA", 0x6800], ["SHLA", 0x6c00],
    ["ROR", 0x7000], ["ROL", 0x7400], ["RORC", 0x7800], ["ROLC", 0x7c00],
] as const;

const BINARY_INSTRUCTIONS = [
    ["CMP", 0x8000], ["ADD", 0x8400], ["ADDC", 0x8800], ["SUB", 0x8c00],
    ["SUBB", 0x9000], ["MUL", 0x9400], ["DIV", 0x9800], ["TEST", 0x9c00],
    ["AND", 0xa000], ["OR", 0xa400], ["XOR", 0xa800], ["MOV", 0xac00],
    ["MVBH", 0xb000], ["MVBL", 0xb400], ["XCH", 0xb800],
] as const;

const MODES = [
    {operand: "R2", bits: 0x02, extension: []},
    {operand: "M[R3]", bits: 0x13, extension: []},
    {operand: "1234h", bits: 0x20, extension: [0x1234]},
    {operand: "M[1234h]", bits: 0x30, extension: [0x1234]},
    {operand: "M[R3+20h]", bits: 0x33, extension: [0x20]},
    {operand: "M[PC+-2]", bits: 0x3f, extension: [0xfffe]},
    {operand: "M[SP+20h]", bits: 0x3e, extension: [0x20]},
];

const CONDITIONS = [
    ["Z", 0x000], ["NZ", 0x040], ["C", 0x080], ["NC", 0x0c0],
    ["N", 0x100], ["NN", 0x140], ["O", 0x180], ["NO", 0x1c0],
    ["P", 0x200], ["NP", 0x240], ["I", 0x280], ["NI", 0x2c0],
] as const;

function expectWords(source: string, expected: readonly number[]): void {
    const result = assembleSource(source);
    expect(result.program).toEqual({entryPoint: 0, segments: [{origin: 0, words: expected}]});
    expect(result.list.flatMap(row => row.words)).toEqual(expected);
}

describe("Codificação de todas as instruções", () => {
    it.each(ZERO_INSTRUCTIONS)("%s sem operandos", (name, word) => {
        expectWords(name, [word]);
    });

    it.each([["INT 0", 0x2000], ["INT 255", 0x20ff], ["RETN 0", 0x2400], ["RETN 1023", 0x27ff], ["BR -32", 0xe020], ["BR -1", 0xe03f], ["BR 0", 0xe000], ["BR 31", 0xe01f]] as const)("%s nos limites do campo constante", (source, word) => {
        expectWords(source, [word]);
    });

    describe.each(MODES)("Operando $operand", ({operand, bits, extension}) => {
        const unary = UNARY_INSTRUCTIONS.filter(([name]) => bits !== 0x20 || name === "PUSH");
        it.each(unary)("%s", (name, opcode) => {
            expectWords(`${name} ${operand}`, [opcode | bits, ...extension]);
        });

        if (bits !== 0x20) {
            for (const count of [1, 16]) {
                it.each(SHIFT_INSTRUCTIONS)(`%s com ${count} posições`, (name, opcode) => {
                    expectWords(`${name} ${operand}, ${count}`, [opcode | ((count % 16) << 6) | bits, ...extension]);
                });
            }
        }

        for (const registerFirst of [true, false]) {
            const instructions = BINARY_INSTRUCTIONS.filter(([name]) => bits !== 0x20 || (!["MUL", "DIV", "XCH"].includes(name) && registerFirst));
            const operands = registerFirst ? `R1, ${operand}` : `${operand}, R1`;
            const registerBits = bits === 0x02 && !registerFirst ? 0x0281 : (registerFirst ? 0x0240 : 0x0040) | bits;
            it.each(instructions)(`%s ${operands}`, (name, opcode) => {
                expectWords(`${name} ${operands}`, [opcode | registerBits, ...extension]);
            });
        }

        it.each([["JMP", 0xc000], ["CALL", 0xc800]] as const)("%s incondicional", (name, opcode) => {
            expectWords(`${name} ${operand}`, [opcode | bits, ...extension]);
        });

        for (const [name, opcode] of [["JMP", 0xc400], ["CALL", 0xcc00]] as const) {
            it.each(CONDITIONS)(`${name}.%s`, (condition, conditionBits) => {
                expectWords(`${name}.${condition} ${operand}`, [opcode | conditionBits | bits, ...extension]);
            });
        }
    });

    it.each(CONDITIONS)("BR.%s conserva o deslocamento com sinal", (condition, bits) => {
        expectWords(`BR.${condition} -32\nBR.${condition} 31`, [0xe420 | bits, 0xe41f | bits]);
    });

    for (let register = 0; register < 8; register++) {
        it.each(BINARY_INSTRUCTIONS)(`%s codifica R${register} nas duas posições`, (name, opcode) => {
            const other = register === 2 ? 3 : 2;
            expectWords(`${name} R${register}, R${other}\n${name} R${other}, R${register}`, [opcode | 0x0200 | (register << 6) | other, opcode | 0x0200 | (other << 6) | register]);
        });
    }

    it("MOV codifica as transferências entre SP e registos", () => {
        expectWords("MOV SP, R1\nMOV R7, SP", [0xac4e, 0xafce]);
    });
});

describe("Directivas, constantes e símbolos", () => {
    it.each([["1111111111111111b", 0xffff], ["177777o", 0xffff], ["65535d", 0xffff], ["65535", 0xffff], ["FFFFh", 0xffff], ["-1000000000000000b", 0x8000], ["-100000o", 0x8000], ["-32768d", 0x8000], ["-8000h", 0x8000], ["'a'", 0x61], ["';'", 0x3b], ["','", 0x2c]] as const)("aceita a constante %s", (literal, word) => {
        expectWords(`MOV R1, ${literal}`, [0xae60, word]);
    });

    it("resolve EQU encadeados e futuros em ORIG, TAB, STR e WORD", () => {
        const result = assembleSource("BASE EQU DESTINO\nTAMANHO EQU 2\nORIG BASE\nDados TAB TAMANHO\nTexto STR 'a,;', 0, TAMANHO\nWORD Dados, Texto\nDESTINO EQU 100h");
        expect(result.program).toEqual({entryPoint: 0x100, segments: [{origin: 0x100, words: [0, 0, 0x61, 0x2c, 0x3b, 0, 2, 0x100, 0x102]}]});
        expect(result.list.map(row => row.address)).toEqual([0x100, 0x102, 0x107]);
    });

    it("concatena strings e conserva vírgulas, plicas e ponto e vírgula", () => {
        expectWords(`STR 'a,;', "b'", '"', 0 ; comentário`, [0x61, 0x2c, 0x3b, 0x62, 0x27, 0x22, 0]);
    });

    it("distingue uma constante EQU de uma etiqueta em BR", () => {
        const result = assembleSource("OFFSET EQU -1\nORIG 100h\ninicio BR OFFSET\nBR inicio");
        expect(result.program.segments).toEqual([{origin: 0x100, words: [0xe03f, 0xe03e]}]);
    });

    it("resolve etiquetas futuras e preserva a origem e as linhas da listagem", () => {
        const result = assembleSource("; início\nORIG 100h\nJMP fim\n\nfim: NOP\nORIG 200h\nWORD fim");
        expect(result.program).toEqual({entryPoint: 0x100, segments: [{origin: 0x100, words: [0xc020, 0x102, 0]}, {origin: 0x200, words: [0x102]}]});
        expect(result.list.map(row => [row.sourceLine, row.address, row.words])).toEqual([[3, 0x100, [0xc020, 0x102]], [5, 0x102, [0]], [7, 0x200, [0x102]]]);
    });

    it("aceita a última palavra da memória", () => {
        expect(assembleSource("ORIG FFFFh\nWORD 1234h").program.segments).toEqual([{origin: 0xffff, words: [0x1234]}]);
    });

    it("aceita mnemónicas em minúsculas e diferentes finais de linha", () => {
        expectWords("mov r1, 1\r\nadd r1, 2\rnop", [0xae60, 1, 0x8660, 2, 0]);
    });
});

describe("Rejeição de programas inválidos", () => {
    it.each(["", "NOP R1", "INT -1", "INT 256", "RETN -1", "RETN 1024", "BR -33", "BR 32", "BR.Z 32", "JMP", "JMP.X 1", "ADD.Z R1, R2", "MOV R8, R1", "MOV R1, R8", "MOV PC, R1", "ADD SP, R1", "MOV SP, 1", "MOV M[1], M[2]", "MOV R1, M[2+R3]", "MOV R1, M[R8]", "MOV R1, M[R1+]", "MOV R1, 10000h", "MOV R1, -8001h", "MOV R1, 102b", "MOV R1, 8o", "MOV R1, 'ab'", "MOV R1, ausente", "ORIG -1\nNOP", "ORIG 10000h\nNOP", "ORIG FFFFh\nMOV R1, 1", "TAB -1", "TAB 10000h", "STR 'sem fim", "STR 'a',", "STR '€'", "EQU 1\nNOP", "A EQU B\nB EQU A\nNOP", "A EQU ausente\nNOP", "A EQU 1\nA EQU 2\nNOP", "a NOP\na NOP", "9invalida NOP", "JMP longe\nBR longe\nTAB 40\nlonge NOP"])("rejeita %s", source => {
        expect(() => assembleSource(source)).toThrow();
    });

    it.each(UNARY_INSTRUCTIONS.filter(([name]) => name !== "PUSH"))("%s rejeita destino imediato", name => {
        expect(() => assembleSource(`${name} 1`)).toThrow();
    });

    it.each(SHIFT_INSTRUCTIONS)("%s rejeita contagens inválidas e destino imediato", name => {
        for (const operands of ["R1, 0", "R1, 17", "R1, -1", "1, 2"]) {
            expect(() => assembleSource(`${name} ${operands}`)).toThrow();
        }
    });

    it.each(BINARY_INSTRUCTIONS)("%s rejeita imediato no primeiro operando", name => {
        expect(() => assembleSource(`${name} 1, R1`)).toThrow();
    });

    it.each(["MUL", "DIV"])("%s rejeita o mesmo registo nas duas posições", name => {
        expect(() => assembleSource(`${name} R1, R1`)).toThrow(/mesmo registo/);
    });

    it.each(["MUL", "DIV", "XCH"])("%s rejeita imediato no segundo operando", name => {
        expect(() => assembleSource(`${name} R1, 1`)).toThrow();
    });
});
