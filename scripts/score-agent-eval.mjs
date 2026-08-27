import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const answerDirectory = resolve(process.cwd(), process.argv[2] ?? 'evals/reference');
const tasks = JSON.parse(readFileSync(resolve(packageRoot, 'evals/tasks.json'), 'utf8'));

let compileScore = 0;
let semanticScore = 0;

for (const task of tasks) {
    const answer = resolve(answerDirectory, `${task.id}.ts`);
    if (!existsSync(answer)) {
        console.log(`${task.id}: compile=fail semantic=fail (missing file)`);
        continue;
    }

    const source = readFileSync(answer, 'utf8');
    const diagnostics = compile(answer);
    const compiles = diagnostics.length === 0;
    const required = task.required.every(marker => source.includes(marker));
    const forbidden = (task.forbidden ?? []).every(marker => !source.includes(marker));
    const usesPublicPackage = source.includes("from '@openhandle/sdk'") && !source.includes('/src/') && !source.includes('/dist/');
    const semantic = required && forbidden && usesPublicPackage;

    if (compiles) compileScore++;
    if (semantic) semanticScore++;
    console.log(`${task.id}: compile=${compiles ? 'pass' : 'fail'} semantic=${semantic ? 'pass' : 'fail'}`);
    for (const diagnostic of diagnostics) {
        console.log(`  ${formatDiagnostic(diagnostic)}`);
    }
}

console.log(`Agent SDK eval: compile ${compileScore}/${tasks.length}, semantic ${semanticScore}/${tasks.length}`);
if (compileScore !== tasks.length || semanticScore !== tasks.length) {
    process.exitCode = 1;
}

function compile(file) {
    const program = ts.createProgram([file], {
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
    });
    return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostic(diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start === undefined) {
        return message;
    }
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}
