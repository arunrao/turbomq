# Changelog

All notable changes to TurboMQ will be documented in this file.

## [1.4.0] - 2025-04-25

### Added
- Job scheduling feature with support for one-time and recurring jobs
- Cron expression support for defining recurring job patterns
- New `ScheduledJob` model in Prisma schema
- Scheduler service that runs periodically to check for jobs to execute
- Comprehensive API for managing scheduled jobs
- Enhanced statistics API for both regular and scheduled jobs
- New documentation with examples for scheduled jobs

### Changed
- All scheduling operations use UTC time for consistency
- Updated database schema with dedicated `ScheduledJob` model
- Improved Queue class with scheduler integration

## [1.3.5] - 2025-04-24

### Fixed
- ESM compatibility issues with proper `.js` extensions in imports
- Improved database adapter shutdown process
- Enhanced foreign key constraint handling in PostgreSQL adapter
- Fixed test suite to properly clean up resources

## [1.3.4] - Previous Release

Initial changelog entry. For previous changes, please refer to the commit history.
