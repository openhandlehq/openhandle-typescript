import { readFileSync, writeFileSync } from 'node:fs';
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

writeGenerated('src/generated/schema.ts', schema);
writeGenerated('src/generated/operations.ts', manifest);
writeGenerated('src/generated/resources.ts', resources);

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
            members.push(`    readonly ${propertyName(childName)}: (reference: ${reference}) => ${childType};`);
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
    if (operation.operation === 'fetch') {
        return `    readonly fetch: (url: string, options?: FetchOptions) => Promise<${response}>;`;
    }
    const required = operationRequiresOptions(openapi.paths[operation.apiPath][operation.method]);
    return `    readonly ${propertyName(name)}: (options${required ? '' : '?'}: OperationOptions<${path}, ${method}>) => Promise<${response}>;`;
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
