## Purpose

Guarantees the app is 100% in Russian, mobile-first, and built for a user with low vision and low comfort with complex interfaces: large type, high contrast, large touch targets, flat navigation, and clear confirmations.

## ADDED Requirements

### Requirement: 100% Russian user-facing text
Every user-facing string in the app — buttons, labels, messages, errors, confirmations, empty states, bot messages — SHALL be in Russian. There SHALL be no untranslated English strings visible to the user.

#### Scenario: All screens in Russian
- **WHEN** the owner navigates the whole app
- **THEN** every visible label, button, message, and error is in Russian

#### Scenario: Validation errors in Russian
- **WHEN** the owner submits invalid data
- **THEN** the error message shown is in clear, plain Russian

### Requirement: Mobile-first layout
The app SHALL be designed and tested primarily for phone-sized screens inside Telegram, with a layout that fits a narrow viewport without horizontal scrolling. Desktop rendering SHALL remain usable.

#### Scenario: Phone viewport
- **WHEN** the app is opened on a phone in Telegram
- **THEN** all screens fit the narrow viewport with no horizontal scrolling and usable touch targets

### Requirement: Large base font and touch targets
The system SHALL use a large base font size (at least 18px) for all body text and SHALL provide touch targets of at least 48x48px for all interactive controls.

#### Scenario: Readable text
- **WHEN** the owner reads any screen
- **THEN** body text is at least 18px and comfortably readable

#### Scenario: Big touch targets
- **WHEN** the owner taps any button or link
- **THEN** the tap target is at least 48x48px and easy to hit

### Requirement: High contrast
The UI SHALL meet WCAG AA contrast ratios (at least 4.5:1 for normal text) between text and background.

#### Scenario: Contrast check
- **WHEN** any screen is rendered
- **THEN** text meets WCAG AA contrast against its background

### Requirement: Flat navigation
The app SHALL keep navigation flat and linear: the owner should reach any screen from the main list or a single clearly-labeled back path, with no deep hierarchies or hidden menus.

#### Scenario: Simple navigation
- **WHEN** the owner moves between screens
- **THEN** every screen is reachable with at most one or two clearly labeled taps from the main list

### Requirement: Confirmation dialogs for destructive actions
Every destructive action (delete painting, delete location, transfer ownership) SHALL require an explicit Russian confirmation dialog stating what will happen, with clearly labeled confirm and cancel buttons.

#### Scenario: Deletion requires confirmation
- **WHEN** the owner taps delete
- **THEN** a Russian confirmation dialog appears before anything is deleted

### Requirement: Visible focus and keyboard operability
All interactive elements SHALL have a clearly visible focus state, and the app SHALL be operable by keyboard where the platform allows.

#### Scenario: Focus visibility
- **WHEN** the owner tabs through the app
- **THEN** the focused element is clearly highlighted

### Requirement: Human-readable Russian error handling
On any failure (network, auth, validation, server), the app SHALL show a plain Russian message the user can understand and act on, never a raw technical error, stack trace, or English exception.

#### Scenario: Server error
- **WHEN** a request fails
- **THEN** the user sees a plain Russian message with a sensible next action
