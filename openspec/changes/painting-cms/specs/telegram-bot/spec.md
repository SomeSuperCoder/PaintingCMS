## Purpose

Provides the minimal Telegram bot experience around the Mini App: a Russian `/start` welcome with a button to open the app, and a notification to the previous owner when ownership is transferred. The core CRUD app must never depend on the bot being online.

## ADDED Requirements

### Requirement: Russian /start welcome with app button
The bot SHALL respond to the `/start` command with a short Russian welcome message and a button that opens the Mini App.

#### Scenario: User presses /start
- **WHEN** a user starts the bot
- **THEN** the bot replies in Russian with a welcome and a button to open the app

### Requirement: Ownership transfer notification
When an ownership transfer is confirmed, the bot SHALL send a Russian message to the previous owner's Telegram chat notifying them that ownership was transferred.

#### Scenario: Previous owner is notified
- **WHEN** a transfer is confirmed
- **THEN** the previous owner receives a Russian notification about the transfer

### Requirement: Bot outage does not block the app
The app's CRUD, auth, and transfer-claim flows SHALL work even when the bot process is down or unreachable. Bot failures MUST NOT cause the web app to fail.

#### Scenario: Bot is down, app still works
- **WHEN** the bot is not running
- **THEN** the owner can still open the app and perform all CRUD operations

#### Scenario: Bot is down during transfer
- **WHEN** a transfer is confirmed while the bot is down
- **THEN** the transfer still applies and the notification is skipped without failing the request
