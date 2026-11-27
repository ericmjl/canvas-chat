import { defineConfig } from 'cypress';

export default defineConfig({
    e2e: {
        // Canonical loopback origin (#293). 127.0.0.1 / 0.0.0.0 now redirect to
        // `localhost` at boot, so tests target `localhost` directly and never hit
        // that navigation mid-test. CI's `wait-on` still probes the bind address.
        baseUrl: 'http://localhost:7865',
        defaultCommandTimeout: 30000, // Increased from default 4000ms for AI tests
        viewportWidth: 1920, // Default viewport width (default: 1000)
        viewportHeight: 1080, // Default viewport height (default: 660)
    },
    video: false,
    screenshotOnRunFailure: true,
});
