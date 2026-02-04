Feature: Sessions Modal

  Scenario: Sessions modal opens and closes
    Given I open Canvas Chat
    When I wait for the app to initialize
    When I open the "Sessions" modal
    Then the "Sessions" modal should be visible
    When I close the "Sessions" modal
    Then the "Sessions" modal should be hidden
