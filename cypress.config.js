const { defineConfig } = require('cypress');

module.exports = defineConfig({
    e2e: {
        baseUrl: 'http://127.0.0.1:7865',
        defaultCommandTimeout: 30000, // Increased from default 4000ms for AI tests
        viewportWidth: 1920, // Default viewport width (default: 1000)
        viewportHeight: 1080, // Default viewport height (default: 660)
    },
    video: false,
    screenshotOnRunFailure: true,
});
