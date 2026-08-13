## Purpose

Authenticates every request to the PaintingCMS backend by validating Telegram Mini App initData server-side, and enforces the single-owner whitelist: the first validated Telegram user to open the app becomes the sole owner, and every other user is denied access with a Russian message.

## ADDED Requirements

### Requirement: Every request requires validated initData
The system SHALL reject every API request that does not carry valid Telegram Mini App initData. Requests without initData or with invalid initData MUST receive an HTTP 401 response with a generic Russian error message and MUST NOT reveal any app data.

#### Scenario: Request without initData
- **WHEN** a client calls an API endpoint without initData
- **THEN** the system responds HTTP 401 with a Russian message instructing the user to reopen the app

#### Scenario: Request with forged initData
- **WHEN** a client calls an API endpoint with initData whose hash was not computed with the real bot token
- **THEN** the system responds HTTP 401 and returns no data

### Requirement: Server-side initData validation per official Telegram algorithm
The system SHALL validate initData exactly per the official Telegram algorithm: secret key = HMAC-SHA256 over the bot token keyed with the string "WebAppData"; data check string = all received fields except `hash`, sorted alphabetically as `key=<value>` joined by newlines; the request is valid iff the hex HMAC-SHA256 of the data check string keyed with the secret key equals the received `hash`. Comparison SHALL be constant-time. Malformed input (non-URL-encoded, missing `user`, invalid user JSON) MUST produce HTTP 401, never HTTP 500.

#### Scenario: Valid initData accepted
- **WHEN** a client presents initData whose hash matches the official algorithm using the real bot token
- **THEN** the system accepts the request and identifies the user by their Telegram user ID

#### Scenario: Malformed initData
- **WHEN** a client presents initData that is not URL-encoded or lacks the `user` field
- **THEN** the system responds HTTP 401 with the generic Russian error, never a 500

### Requirement: Fresh auth_date
The system SHALL reject initData whose `auth_date` is older than the configured freshness window (default 10 minutes) with HTTP 401 and a Russian "session expired, reopen the app" style message.

#### Scenario: Stale initData
- **WHEN** a client presents initData whose auth_date is older than the freshness window
- **THEN** the system responds HTTP 401 and the frontend shows a Russian prompt to reopen the app

### Requirement: First user claims ownership
The system SHALL record every validated Telegram user (user ID as a string, username, first-seen timestamp). The very first validated user to open the app SHALL become the sole owner. The claim SHALL be race-safe: exactly one owner exists at any time.

#### Scenario: First open
- **WHEN** the first-ever validated user opens the app
- **THEN** the system stores that user as the owner and serves the full app in Russian

#### Scenario: Concurrent first opens
- **WHEN** two validated users open the app for the first time simultaneously
- **THEN** exactly one of them becomes owner and the other is denied, with no owner-less or double-owner state

### Requirement: Non-owner denied access
The system SHALL deny access to every validated user who is not the current owner: all data endpoints MUST return HTTP 403 with a Russian "access denied" message. The denied user MUST never receive painting, location, or ownership data.

#### Scenario: Known non-owner opens the app
- **WHEN** a validated Telegram user who is not the owner calls any data endpoint
- **THEN** the system responds HTTP 403 with a Russian access-denied message and returns no data

### Requirement: Owner identity precision
The system SHALL store and compare Telegram user IDs as strings/bigints, never as lossy JavaScript numbers, so that no valid ID is ever truncated or mismatched.

#### Scenario: Large user ID
- **WHEN** a validated user has a Telegram ID larger than 2^53
- **THEN** the system identifies and authenticates that user correctly as owner or non-owner without precision loss
