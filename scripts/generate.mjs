import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const input = resolve(packageRoot, argumentValue('--input') ?? 'openapi/openhandle.json');

const document = JSON.parse(readFileSync(input, 'utf8'));
const operations = operationDefinitions(document);

const schemaAST = await openapiTS(document, {
    alphabetize: true,
    silent: true,
});
const schema = `${generatedHeader()}${astToString(schemaAST)}`;
const manifest = `${generatedHeader()}import type { OperationDefinition } from '../types.js';

export const operations = ${JSON.stringify(operations, null, 4)} as const satisfies readonly OperationDefinition[];
`;
const resources = generateResources(operations, document);
const publicTypes = generatePublicTypes(operations, document);

writeGenerated('src/generated/schema.ts', schema);
writeGenerated('src/generated/operations.ts', manifest);
writeGenerated('src/generated/resources.ts', resources);
writeGenerated('src/generated/public-types.ts', publicTypes);

function operationDefinitions(openapi) {
    const result = [];
    for (const [apiPath, pathItem] of Object.entries(openapi.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
                continue;
            }
            const sdk = operation['x-openhandle-sdk'];
            if (!sdk || typeof sdk.path !== 'string' || !Array.isArray(sdk.scope)) {
                throw new Error(`${method.toUpperCase()} ${apiPath} has no valid x-openhandle-sdk mapping.`);
            }
            result.push({
                apiPath,
                method,
                operation: sdk.operation,
                paginated: sdk.paginated === true,
                path: sdk.path,
                scope: sdk.scope,
            });
        }
    }
    result.sort((left, right) => left.path.localeCompare(right.path));
    return result;
}

function generateResources(definitions, openapi) {
    const root = treeNode([]);
    for (const definition of definitions) {
        let node = root;
        for (const scope of definition.scope) {
            let child = node.children.get(scope.name);
            if (!child) {
                child = treeNode([...node.path, scope.name], scope);
                node.children.set(scope.name, child);
            }
            node = child;
        }
        node.operations.set(definition.operation, definition);
    }

    const interfaces = [];
    collectInterfaces(root, interfaces, openapi);
    return `${generatedHeader()}import type {
    FetchOptions,
    OperationOptions,
    OperationPage,
    OperationResponse,
    ProfileReference,
    ResourceReference,
} from '../types.js';

${interfaces.join('\n\n')}
`;
}

function generatePublicTypes(definitions, openapi) {
    const aliases = [];
    const names = new Set();
    for (const schemaName of Object.keys(openapi.components?.schemas ?? {}).sort()) {
        const name = pascalCase(schemaName);
        addAlias(names, name);
        aliases.push(
            `/** Camel-cased ${schemaName} model used by SDK responses. */\nexport type ${name} = Camelize<components['schemas'][${JSON.stringify(schemaName)}]>;`,
        );
    }
    for (const operation of definitions) {
        const base = operationTypeBase(operation);
        const path = JSON.stringify(operation.apiPath);
        const method = JSON.stringify(operation.method);
        const operationPath = operation.path;
        if (operation.operation !== 'fetch') {
            const optionsName = `${base}Options`;
            addAlias(names, optionsName);
            aliases.push(`/** Options accepted by ${operationPath}. */\nexport type ${optionsName} = OperationOptions<${path}, ${method}>;`);
        }

        const resultName = `${base}${operation.paginated ? 'Page' : 'Response'}`;
        const resultType = operation.paginated ? 'OperationPage' : 'OperationResponse';
        addAlias(names, resultName);
        aliases.push(`/** Typed result returned by ${operationPath}. */\nexport type ${resultName} = ${resultType}<${path}, ${method}>;`);
    }
    return `${generatedHeader()}import type { Camelize, OperationOptions, OperationPage, OperationResponse } from '../types.js';
import type { components } from './schema.js';

${aliases.join('\n\n')}
`;
}

function operationTypeBase(operation) {
    const scope = operation.scope.map(segment => pascalCase(segment.name)).join('');
    const terminal = operation.operation === 'search' ? 'Search' : operation.operation === 'fetch' ? 'Fetch' : '';
    return `${scope}${terminal}` || pascalCase(operation.operation);
}

function addAlias(names, name) {
    if (names.has(name)) {
        throw new Error(`Generated public type alias ${name} is not unique.`);
    }
    names.add(name);
}

function treeNode(path, scope) {
    return { children: new Map(), operations: new Map(), path, scope };
}

function collectInterfaces(node, output, openapi) {
    const name = node.path.length === 0 ? 'GeneratedClient' : `${node.path.map(pascalCase).join('')}Resource`;
    const members = [];
    for (const [childName, child] of [...node.children].sort(([left], [right]) => left.localeCompare(right))) {
        const childType = `${child.path.map(pascalCase).join('')}Resource`;
        if (child.scope?.parameter) {
            const reference = child.scope.reference === 'profile' ? 'ProfileReference' : 'ResourceReference';
            members.push(`${selectorDocumentation(child.scope)}\n    readonly ${propertyName(childName)}: (reference: ${reference}) => ${childType};`);
        } else {
            members.push(`    readonly ${propertyName(childName)}: ${childType};`);
        }
    }
    for (const [operationName, operation] of [...node.operations].sort(([left], [right]) => left.localeCompare(right))) {
        members.push(operationMember(operationName, operation, openapi));
    }
    output.push(`export interface ${name} {\n${members.join('\n')}\n}`);
    for (const child of node.children.values()) {
        collectInterfaces(child, output, openapi);
    }
}

function operationMember(name, operation, openapi) {
    const path = JSON.stringify(operation.apiPath);
    const method = JSON.stringify(operation.method);
    const response = operation.paginated ? `OperationPage<${path}, ${method}>` : `OperationResponse<${path}, ${method}>`;
    const openapiOperation = openapi.paths[operation.apiPath][operation.method];
    const documentation = operationDocumentation(operation, openapiOperation);
    if (operation.operation === 'fetch') {
        return `${documentation}\n    readonly fetch: (url: string, options?: FetchOptions) => Promise<${response}>;`;
    }
    const required = operationRequiresOptions(openapiOperation);
    return `${documentation}\n    readonly ${propertyName(name)}: (options${required ? '' : '?'}: OperationOptions<${path}, ${method}>) => Promise<${response}>;`;
}

function selectorDocumentation(scope) {
    const reference = scope.reference ?? scope.name;
    const forms =
        reference === 'profile' ? 'a username shorthand or an explicit ID or URL reference' : 'a supported string shorthand or an explicit ID or URL reference';
    return jsdoc([`Select the ${reference} resource using ${forms}.`, '', 'Resource selection is synchronous and does not perform a request.']);
}

function operationDocumentation(operation, openapiOperation) {
    const lines = [openapiOperation.summary ?? operation.path];
    if (openapiOperation.description) {
        lines.push('', openapiOperation.description);
    }
    const example = operationExample(operation, openapiOperation);
    if (example) {
        lines.push('', '@example', example);
    }
    const operationID = openapiOperation['x-openhandle-operation'];
    if (typeof operationID === 'string') {
        lines.push('', `@see https://openhandle.dev/docs/api-reference/${operationID.replaceAll('.', '-')}`);
    }
    return jsdoc(lines);
}

function operationExample(operation, openapiOperation) {
    if (operation.operation === 'fetch') {
        return `await openhandle.fetch('https://www.instagram.com/openai/', { freshness: '24h' });`;
    }
    const example = openapiOperation['x-openhandle-test-data']?.example ?? {};
    let call = 'await openhandle';
    for (const scope of operation.scope) {
        call += `.${scope.name}`;
        if (scope.parameter) {
            call += `(${JSON.stringify(example[scope.parameter] ?? `<${scope.parameter}>`)})`;
        }
    }
    call += `.${operation.operation}`;

    const options = [];
    for (const parameter of openapiOperation.parameters ?? []) {
        if (parameter.in !== 'query' || (parameter.required !== true && parameter.name !== 'freshness')) {
            continue;
        }
        const value = parameter.example ?? parameter.schema?.default ?? example[parameter.name] ?? `<${parameter.name}>`;
        options.push(`${camelCase(parameter.name)}: ${JSON.stringify(value)}`);
    }
    return `${call}(${options.length > 0 ? `{ ${options.join(', ')} }` : ''});`;
}

function jsdoc(lines) {
    return `    /**\n${lines.map(line => `     *${line ? ` ${escapeComment(line)}` : ''}`).join('\n')}\n     */`;
}

function escapeComment(value) {
    return String(value).replaceAll('*/', '*\\/');
}

function operationRequiresOptions(operation) {
    return (operation.parameters ?? []).some(parameter => parameter.in === 'query' && parameter.required === true);
}

function pascalCase(value) {
    const initialisms = {
        id: 'ID',
        oembed: 'OEmbed',
        qrCode: 'QRCode',
        tiktok: 'TikTok',
        url: 'URL',
    };
    if (initialisms[value]) {
        return initialisms[value];
    }
    return value.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, _separator, letter) => letter.toUpperCase()).replace(/^./, letter => letter.toUpperCase());
}

function propertyName(value) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

function camelCase(value) {
    return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function generatedHeader() {
    return '// Generated by scripts/generate.mjs. Do not edit.\n\n';
}

function writeGenerated(relativePath, contents) {
    const target = resolve(packageRoot, relativePath);
    if (check) {
        let current = '';
        try {
            current = readFileSync(target, 'utf8');
        } catch {
            throw new Error(`${relativePath} is missing. Run pnpm generate.`);
        }
        if (current !== contents) {
            throw new Error(`${relativePath} is stale. Run pnpm generate.`);
        }
        return;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
}

function argumentValue(name) {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a path.`);
    }
    return value;
}
