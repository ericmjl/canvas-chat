Feature: Skill Feature

  Scenario: Skill slash commands are registered
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then slash command "/skill" should be registered
    And slash command "/skills" should be registered
