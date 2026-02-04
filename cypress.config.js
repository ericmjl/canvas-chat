import { defineConfig } from 'cypress';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';

export default defineConfig({
    e2e: {
        baseUrl: 'http://127.0.0.1:7865',
        defaultCommandTimeout: 30000, // Increased from default 4000ms for AI tests
        viewportWidth: 1920, // Default viewport width (default: 1000)
        viewportHeight: 1080, // Default viewport height (default: 660)
        specPattern: ['cypress/e2e/**/*.cy.js', 'cypress/e2e/**/*.feature'],
        env: {
            stepDefinitions: ['cypress/e2e/step_definitions/**/*.{js,mjs,ts,tsx}'],
        },
        async setupNodeEvents(on, config) {
            await addCucumberPreprocessorPlugin(on, config);
            on(
                'file:preprocessor',
                createBundler({
                    plugins: [createEsbuildPlugin(config)],
                })
            );
            return config;
        },
    },
    video: false,
    screenshotOnRunFailure: true,
});
