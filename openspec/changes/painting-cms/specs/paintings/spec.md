## Purpose

Lets the owner manage the list of paintings on sale: create, view, edit, and delete painting records, each with a name, multiple photos, a price in RUB/USD/EUR, and the location where it is currently being sold.

## ADDED Requirements

### Requirement: Create painting
The system SHALL allow the owner to create a painting record with: a name (required, Russian text), a price (required, integer minor units + currency RUB/USD/EUR), a location (required, selected from the location bank or created inline), and zero or more photos.

#### Scenario: Owner creates a painting
- **WHEN** the owner fills the painting form with name, price, currency, location and optional photos and saves
- **THEN** the system stores the painting and shows it in the list

#### Scenario: Create painting without name
- **WHEN** the owner tries to save a painting without a name
- **THEN** the system shows a Russian validation error and does not save

#### Scenario: Create painting without location
- **WHEN** the owner tries to save a painting without choosing a location
- **THEN** the system shows a Russian validation error and does not save

### Requirement: List paintings
The system SHALL show the owner the list of all paintings, newest first, with each entry showing at least the name, the formatted price with currency, and the location. The list SHALL be scrollable and readable on a phone.

#### Scenario: Owner opens the app
- **WHEN** the owner opens the app
- **THEN** the system shows the list of paintings with name, price, and location for each

### Requirement: View painting detail
The system SHALL show the full detail of one painting: name, all photos (viewable as a gallery), price with currency, and the location (address or URL). The location URL SHALL be shown as a link.

#### Scenario: Owner opens a painting
- **WHEN** the owner taps a painting in the list
- **THEN** the system shows the full detail with photos, price, and location

### Requirement: Edit painting
The system SHALL allow the owner to edit every field of an existing painting and save the changes.

#### Scenario: Owner edits a painting
- **WHEN** the owner changes fields of a painting and saves
- **THEN** the updated values are persisted and the list/detail reflect the changes

### Requirement: Delete painting
The system SHALL allow the owner to delete a painting after an explicit Russian confirmation dialog. Deleting SHALL also remove the painting's photos.

#### Scenario: Owner deletes a painting
- **WHEN** the owner chooses to delete a painting and confirms
- **THEN** the painting and all its photos are removed and it no longer appears in the list

#### Scenario: Owner cancels deletion
- **WHEN** the owner chooses to delete a painting but cancels the confirmation
- **THEN** the painting remains unchanged

### Requirement: Price validation
The system SHALL store prices as integer minor units (kopecks/cents) with a currency enum limited to RUB, USD, EUR. The price SHALL be non-negative and displayed in Russian locale format with the correct currency symbol.

#### Scenario: Negative price
- **WHEN** the owner tries to save a painting with a negative price
- **THEN** the system shows a Russian validation error and does not save

#### Scenario: Price display
- **WHEN** the owner views a painting priced in RUB
- **THEN** the system displays the price in Russian locale format with the ruble notation
