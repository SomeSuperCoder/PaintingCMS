## Purpose

Allows the single owner of the app to transfer ownership to another Telegram user from within the UI, with claim-on-next-open semantics and a full audit trail, so the painter can hand the app to someone else without any external admin tooling.

## ADDED Requirements

### Requirement: Only the owner can initiate a transfer
The system SHALL allow only the current owner to start an ownership transfer. Any non-owner request MUST be rejected (HTTP 403, Russian access-denied message).

#### Scenario: Owner initiates transfer
- **WHEN** the current owner requests a transfer to a target Telegram username
- **THEN** the system validates the request and starts the transfer flow

#### Scenario: Non-owner tries to initiate transfer
- **WHEN** a validated non-owner calls the transfer endpoint
- **THEN** the system responds HTTP 403 with a Russian access-denied message

### Requirement: Transfer by Telegram username
The system SHALL accept the target as a Telegram @username (with or without the leading @). The target SHALL be resolved to a Telegram user ID using the recorded users table. If the target has never opened the app, the system SHALL respond with a clear Russian message explaining that the new user must open the app first.

#### Scenario: Target is a known user
- **WHEN** the owner transfers to the @username of a user who has opened the app before
- **THEN** the system resolves the username to the recorded user ID and proceeds

#### Scenario: Target has never opened the app
- **WHEN** the owner transfers to an @username not present in the recorded users
- **THEN** the system responds with a Russian message telling the owner that the new user must open the app first before the transfer can be completed

### Requirement: Confirmation before transfer
The system SHALL require an explicit confirmation step in the UI before any transfer is applied, showing the target's name/username. The transfer MUST NOT be applied until confirmed.

#### Scenario: Owner confirms transfer
- **WHEN** the owner confirms the transfer to the target user
- **THEN** the system records the transfer and the target becomes the sole owner

#### Scenario: Owner cancels transfer
- **WHEN** the owner cancels before confirming
- **THEN** no change is made and the owner retains ownership

### Requirement: Transfer is claimed on the target's next open
The system SHALL apply the ownership change so that the target becomes owner on their next validated app open. From the moment the transfer is confirmed, the previous owner SHALL no longer have access.

#### Scenario: Transfer confirmed, previous owner opens again
- **WHEN** the transfer has been confirmed and the previous owner opens the app again
- **THEN** the previous owner receives the Russian access-denied screen and no data

#### Scenario: Target opens the app after transfer
- **WHEN** the target user opens the app after a confirmed transfer
- **THEN** the target is recognized as the sole owner and receives the full app

### Requirement: Transfer audit trail
The system SHALL record every ownership event (claim, transfer initiated, transfer confirmed) with timestamps, from-user, and target-user, and SHALL expose the history to the owner.

#### Scenario: Owner views transfer history
- **WHEN** the owner opens the ownership screen
- **THEN** the system shows the current owner and the list of past ownership events with dates

### Requirement: Transfer notification
When a transfer is confirmed, the system SHALL notify the previous owner through the Telegram bot (a Russian message that ownership has been transferred). Failure of the notification SHALL NOT block the transfer itself.

#### Scenario: Transfer completes with bot notification
- **WHEN** the transfer is confirmed
- **THEN** the bot sends a Russian notification to the previous owner's Telegram chat

#### Scenario: Bot is unavailable during transfer
- **WHEN** the transfer is confirmed but the bot cannot send the notification
- **THEN** the transfer still succeeds and the access change still applies
