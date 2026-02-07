# External Plugin Failures

## Scenario: Broken external plugin entries are reported as failed
- Given I stub external plugins list with a broken plugin
- And I open Canvas Chat
- When I wait for the app to initialize
- And I reload external plugins for testing
- Then external plugins should include failed id "broken-plugin"
