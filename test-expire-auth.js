/**
 * Test helper: Force-expire Copilot auth for testing the expiry flow
 *
 * Run this in the browser console to simulate expired auth:
 *
 * 1. Copy this entire file content
 * 2. Paste into browser console
 * 3. Run: forceExpireCopilotAuth()
 * 4. Refresh the page
 *
 * You should see the auth modal appear immediately on page load.
 */

function forceExpireCopilotAuth() {
    const authKey = 'copilot_auth';
    const authStr = localStorage.getItem(authKey);

    if (!authStr) {
        console.log('[Test] No Copilot auth found in localStorage');
        return;
    }

    const auth = JSON.parse(authStr);
    console.log('[Test] Current auth:', auth);

    // Set expiresAt to 1 hour ago
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    auth.expiresAt = oneHourAgo;

    localStorage.setItem(authKey, JSON.stringify(auth));
    console.log('[Test] Auth expired! New expiresAt:', oneHourAgo);
    console.log('[Test] Now refresh the page to see the modal');
}

// Also provide a restore function
function restoreCopilotAuth() {
    const authKey = 'copilot_auth';
    const authStr = localStorage.getItem(authKey);

    if (!authStr) {
        console.log('[Test] No Copilot auth found in localStorage');
        return;
    }

    const auth = JSON.parse(authStr);

    // Set expiresAt to 10 minutes from now
    const tenMinutesFromNow = Math.floor(Date.now() / 1000) + 600;
    auth.expiresAt = tenMinutesFromNow;

    localStorage.setItem(authKey, JSON.stringify(auth));
    console.log('[Test] Auth restored! New expiresAt:', tenMinutesFromNow);
}

console.log('[Test Helper] Functions loaded:');
console.log('  - forceExpireCopilotAuth() - Set auth to expired');
console.log('  - restoreCopilotAuth() - Restore valid auth');
