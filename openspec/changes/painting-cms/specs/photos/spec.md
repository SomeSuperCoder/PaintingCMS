## Purpose

Handles the multiple photos attached to a painting: validated upload, self-hosted storage, auth-guarded streaming, and lifecycle cleanup, so the painter can show her paintings with simple and safe photo management on a phone.

## ADDED Requirements

### Requirement: Upload multiple photos to a painting
The system SHALL allow the owner to attach zero or more photos to a painting, including during creation and later on edit. The UI SHALL support picking multiple photos from the phone at once and SHALL show previews of the chosen photos.

#### Scenario: Owner adds photos to a painting
- **WHEN** the owner picks multiple photos and saves the painting
- **THEN** the system stores each photo and the painting detail shows them all

#### Scenario: Owner adds photos to an existing painting
- **WHEN** the owner edits a painting and adds more photos
- **THEN** the new photos are appended to the painting's gallery

### Requirement: Photo validation
The system SHALL validate every uploaded photo: allowed image MIME types only, a per-file size cap (default 10 MB), and a per-painting count cap (default 10). Violations SHALL produce a Russian error message and the offending file SHALL NOT be stored.

#### Scenario: Wrong file type
- **WHEN** the owner tries to upload a non-image file
- **THEN** the system rejects it with a Russian error message

#### Scenario: Oversized photo
- **WHEN** the owner tries to upload a photo larger than the size cap
- **THEN** the system rejects it with a Russian error message

### Requirement: Auth-guarded photo streaming
The system SHALL serve photo files only through an authenticated endpoint: a request without valid initData or from a non-owner MUST be rejected (HTTP 401/403). Served photos SHALL carry immutable cache headers.

#### Scenario: Owner views photos
- **WHEN** the owner opens a painting detail
- **THEN** the photos load through the authenticated endpoint and display correctly

#### Scenario: Non-owner requests a photo
- **WHEN** a request for a photo arrives without valid owner auth
- **THEN** the system rejects it and serves no image bytes

### Requirement: Delete photo
The system SHALL allow the owner to remove individual photos from a painting.

#### Scenario: Owner removes a photo
- **WHEN** the owner removes a photo from a painting and saves
- **THEN** the photo is deleted from storage and no longer appears in the gallery

### Requirement: Photo cleanup on painting delete
When a painting is deleted, the system SHALL delete all of its photos from storage.

#### Scenario: Painting deletion removes photos
- **WHEN** the owner deletes a painting with photos
- **THEN** all photo files of that painting are removed from storage

### Requirement: Photo order
The system SHALL preserve the owner's chosen order of photos in the painting gallery.

#### Scenario: Gallery order preserved
- **WHEN** the owner uploads photos in a sequence
- **THEN** the gallery shows them in that sequence
