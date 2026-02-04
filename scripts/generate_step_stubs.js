#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
    CucumberExpression,
    ParameterTypeRegistry,
    defineDefaultParameterTypes,
} from '@cucumber/cucumber-expressions';

const STEP_DIR = path.resolve('cypress/e2e/step_definitions');
const FEATURE_GLOB_ROOT = path.resolve('cypress/e2e');
const STUB_FILE = path.join(STEP_DIR, 'missing-steps.generated.ts');

const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'];

function listFiles(dir, extSet) {
    const results = [];
    const stack = [dir];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || !fs.existsSync(current)) {
            continue;
        }
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (extSet.has(path.extname(entry.name))) {
                results.push(fullPath);
            }
        }
    }

    return results.sort();
}

function extractStepsFromFeatures(featureFiles) {
    const steps = [];
    for (const file of featureFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            const match = line.match(/^\s*(Given|When|Then|And|But)\s+(.+)$/i);
            if (!match) {
                continue;
            }
            const keyword = STEP_KEYWORDS.find(
                (prefix) => prefix.toLowerCase() === match[1].toLowerCase()
            );
            steps.push({ keyword, text: match[2].trim(), source: file });
        }
    }
    return steps;
}

function parseStepDefinitions(stepFiles) {
    const definitions = [];
    const stepPattern = /(Given|When|Then|And|But|defineStep)\s*\(\s*([^,]+),/g;

    for (const file of stepFiles) {
        const content = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = stepPattern.exec(content))) {
            const rawArg = match[2].trim();
            const parsed = parseStepArg(rawArg);
            if (!parsed) {
                continue;
            }
            definitions.push({ file, ...parsed });
        }
    }

    return definitions;
}

function parseStepArg(rawArg) {
    if (rawArg.startsWith('/') && rawArg.lastIndexOf('/') > 0) {
        const lastSlash = rawArg.lastIndexOf('/');
        const pattern = rawArg.slice(1, lastSlash);
        const flags = rawArg.slice(lastSlash + 1);
        return { type: 'regex', value: new RegExp(pattern, flags) };
    }

    const stringMatch = rawArg.match(/^(['"`])([\s\S]*)\1$/);
    if (stringMatch) {
        return { type: 'expression', value: stringMatch[2] };
    }

    return null;
}

function stepMatches(definition, stepText, registry) {
    if (definition.type === 'regex') {
        return definition.value.test(stepText);
    }

    try {
        const expression = new CucumberExpression(definition.value, registry);
        return expression.match(stepText) !== null;
    } catch (error) {
        return false;
    }
}

function renderStubFile(missingSteps) {
    const lines = [];
    lines.push('/// <reference types="cypress" />');
    lines.push('');
    lines.push("import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';");
    lines.push('');
    lines.push('// AUTO-GENERATED. Do not commit. Implement missing steps in real step definition files.');
    lines.push('');

    for (const step of missingSteps) {
        const keyword = step.keyword === 'When' ? 'When' : step.keyword === 'Then' ? 'Then' : 'Given';
        lines.push(`${keyword}('${escapeStepText(step.text)}', () => {`);
        lines.push(`    throw new Error('Missing step: ${escapeStepText(step.text)}');`);
        lines.push('});');
        lines.push('');
    }

    return lines.join('\n').trimEnd() + '\n';
}

function escapeStepText(text) {
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function main() {
    if (!fs.existsSync(STEP_DIR)) {
        fs.mkdirSync(STEP_DIR, { recursive: true });
    }

    const featureFiles = listFiles(FEATURE_GLOB_ROOT, new Set(['.feature']));
    const stepFiles = listFiles(STEP_DIR, new Set(['.js', '.ts'])).filter(
        (file) => path.resolve(file) !== path.resolve(STUB_FILE)
    );

    const steps = extractStepsFromFeatures(featureFiles);
    const definitions = parseStepDefinitions(stepFiles);

    const registry = new ParameterTypeRegistry();
    defineDefaultParameterTypes(registry);

    const missingSteps = [];

    for (const step of steps) {
        const hasMatch = definitions.some((definition) => stepMatches(definition, step.text, registry));
        if (!hasMatch) {
            missingSteps.push(step);
        }
    }

    if (missingSteps.length > 0) {
        const stubContent = renderStubFile(missingSteps);
        fs.writeFileSync(STUB_FILE, stubContent, 'utf8');
        console.error(`Missing ${missingSteps.length} step definition(s).`);
        for (const step of missingSteps) {
            console.error(`- ${step.keyword} ${step.text} (${path.relative(process.cwd(), step.source)})`);
        }
        process.exit(1);
    }

    if (fs.existsSync(STUB_FILE)) {
        fs.unlinkSync(STUB_FILE);
    }
}

try {
    main();
} catch (error) {
    console.error('[generate_step_stubs] Failed:', error);
    process.exit(1);
}
