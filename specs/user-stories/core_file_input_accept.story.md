# File Upload Input

## Scenario: File upload input supports expected types

- Given I open Canvas Chat
- When I wait for the app to initialize
- Then the file upload input should accept ".pdf"
- And the file upload input should accept "image/*"
- And the file upload input should accept ".csv"
- And the file upload input should accept ".pptx"
