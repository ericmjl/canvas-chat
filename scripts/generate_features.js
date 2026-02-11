#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const STORY_DIR = path.resolve('specs/user-stories');
const FEATURE_DIR = path.resolve('cypress/e2e/features');

const STEP_PREFIXES = ['Given', 'When', 'Then', 'And', 'But'];

function extractTitle(lines, fallback) {
    const titleLine = lines.find((line) => /^#\s+/.test(line));
    if (titleLine) {
        return titleLine.replace(/^#\s+/, '').trim();
    }
    return fallback;
}

function extractScenarios(lines) {
    const scenarios = [];
    let current = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const scenarioMatch = line.match(/^#{2,3}\s+Scenario:\s*(.+)$/i);
        if (scenarioMatch) {
            if (current) {
                scenarios.push(current);
            }
            current = { title: scenarioMatch[1].trim(), steps: [] };
            continue;
        }

        const stepMatch = line.match(/^(?:[-*]\s+)?(Given|When|Then|And|But)\s+(.+)$/i);
        if (stepMatch) {
            if (!current) {
                current = { title: 'Scenario', steps: [] };
            }
            const keyword = STEP_PREFIXES.find(
                (prefix) => prefix.toLowerCase() === stepMatch[1].toLowerCase()
            );
            current.steps.push(`${keyword} ${stepMatch[2].trim()}`);
        }
    }

    if (current) {
        scenarios.push(current);
    }

    return scenarios;
}

function renderFeature(title, scenarios, sourceName) {
    const lines = [];
    lines.push(`Feature: ${title}`);
    lines.push('');

    if (scenarios.length === 0) {
        lines.push(`  Scenario: ${sourceName}`);
        lines.push('    Given I open Canvas Chat');
        return lines.join('\n');
    }

    for (const scenario of scenarios) {
        lines.push(`  Scenario: ${scenario.title}`);
        for (const step of scenario.steps) {
            lines.push(`    ${step}`);
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function generate() {
    if (!fs.existsSync(STORY_DIR)) {
        return;
    }

    ensureDir(FEATURE_DIR);

    const storyFiles = fs
        .readdirSync(STORY_DIR)
        .filter((file) => file.endsWith('.story.md'))
        .sort();

    for (const file of storyFiles) {
        const storyPath = path.join(STORY_DIR, file);
        const content = fs.readFileSync(storyPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const title = extractTitle(lines, path.basename(file, '.story.md'));
        const scenarios = extractScenarios(lines);
        const featureContent = renderFeature(title, scenarios, path.basename(file, '.story.md'));
        const featurePath = path.join(FEATURE_DIR, `${path.basename(file, '.story.md')}.feature`);
        fs.writeFileSync(featurePath, `${featureContent}\n`, 'utf8');
    }
}

try {
    generate();
} catch (error) {
    console.error('[generate_features] Failed:', error);
    process.exit(1);
}
