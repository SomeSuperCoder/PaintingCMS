## Purpose

Provides a persistent bank of sales locations — offline (address) or online (website URL) — that the owner manages and reuses across paintings, with the ability to select an existing location or add a new one right on the painting creation/editing screen.

## ADDED Requirements

### Requirement: Create location
The system SHALL allow the owner to create a location of one of two kinds: offline (a street address, required) or online (a website URL, required and validated as a valid http/https URL).

#### Scenario: Owner creates an offline location
- **WHEN** the owner adds a location of kind offline with an address
- **THEN** the system stores the location and it becomes available for selection

#### Scenario: Owner creates an online location
- **WHEN** the owner adds a location of kind online with a valid URL
- **THEN** the system stores the location and it becomes available for selection

#### Scenario: Invalid URL
- **WHEN** the owner tries to save an online location with a URL that is not a valid http/https URL
- **THEN** the system shows a Russian validation error and does not save

### Requirement: List locations
The system SHALL show the owner the list of all locations, clearly labeled as offline or online, with the address or URL shown in Russian locale formatting.

#### Scenario: Owner opens the locations screen
- **WHEN** the owner opens the locations management screen
- **THEN** the system shows all locations with their kind and value

### Requirement: Edit location
The system SHALL allow the owner to edit the kind and value of an existing location.

#### Scenario: Owner edits a location
- **WHEN** the owner changes an existing location and saves
- **THEN** the updated location is persisted and reflected everywhere it is used

### Requirement: Delete location
The system SHALL allow the owner to delete a location after an explicit Russian confirmation dialog. If the location is currently used by one or more paintings, the system SHALL warn the owner and require the owner to reassign those paintings before deletion, or cancel.

#### Scenario: Delete unused location
- **WHEN** the owner deletes a location that no painting uses and confirms
- **THEN** the location is removed from the bank

#### Scenario: Delete location in use
- **WHEN** the owner tries to delete a location that one or more paintings use
- **THEN** the system shows a Russian message listing the affected paintings and blocks deletion until those paintings are reassigned or the deletion is cancelled

### Requirement: Select-or-add inline on the painting form
On the painting create/edit screen the system SHALL offer the owner two options for the location field: pick an existing location from the bank, or add a new location inline (with the same kind/value validation as the locations screen). The inline-created location SHALL be saved to the bank and applied to the painting in the same save.

#### Scenario: Owner picks an existing location
- **WHEN** the owner opens the painting form and selects an existing location from the list
- **THEN** the painting is saved with that location

#### Scenario: Owner adds a new location inline
- **WHEN** the owner chooses "add new location" on the painting form, enters an address or URL, and saves the painting
- **THEN** the new location is persisted to the bank and assigned to the painting
