import { MEMORY_SIZE, P3State } from "p3-core";
import type {
    AssembledProgram,
    LoadedProgram,
    LoadedSegment,
    LoadProgramOptions,
    ProgramSegment,
} from "./types";

export function loadProgram(state: P3State, program: AssembledProgram, options: LoadProgramOptions = {}): LoadedProgram {
    if (program.segments.length === 0) {
        throw new Error("Um programa montado precisa de ter pelo menos um segmento.");
    }

    const loadedSegments = program.segments.map(makeLoadedSegment);
    validateNonOverlappingSegments(loadedSegments);

    const entryPoint = validateAddress("entryPoint", program.entryPoint);
    if (!loadedSegments.some(segment => entryPoint >= segment.origin && entryPoint < segment.endExclusive)) {
        throw new Error("O ponto de entrada não pertence a nenhum dos segmento.");
    }

    state.reset();

    if (options.initialSp !== undefined) {
        state.setSP(options.initialSp);
    }

    for (const segment of program.segments) {
        for (let offset = 0; offset < segment.words.length; offset++) {
            state.writeMem(segment.origin + offset, segment.words[offset]!);
        }
    }

    state.setPC(entryPoint);

    return {state, entryPoint, segments: loadedSegments};
}

function makeLoadedSegment(segment: ProgramSegment): LoadedSegment {
    const origin = validateAddress("origin", segment.origin);
    const endExclusive = origin + segment.words.length;

    if (endExclusive > MEMORY_SIZE) {
        throw new Error("Segmento ultrapassa o fim da memória.");
    }

    return {origin, wordCount: segment.words.length, endExclusive};
}

function validateAddress(name: string, value: number): number {
    if (!Number.isInteger(value) || value < 0 || value >= MEMORY_SIZE) {
        throw new Error(`${name} inválido: ${value}`);
    }

    return value;
}

function validateNonOverlappingSegments(segments: readonly LoadedSegment[]): void {
    const sorted = Array.from(segments).sort((a, b) => a.origin - b.origin);

    for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1] as LoadedSegment;
        const current = sorted[i] as LoadedSegment;

        if (current.origin < previous.endExclusive) {
            throw new Error("Segmentos de programa sobrepostos.");
        }
    }
}
