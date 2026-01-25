const { defineConfig } = require('cypress');

module.exports = defineConfig({
    e2e: {
        baseUrl: 'http://127.0.0.1:7865',
    },
    video: false,
    screenshotOnRunFailure: true,
});
