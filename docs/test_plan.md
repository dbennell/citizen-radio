# Citizen Radio - Test Plan

## Introduction

This document outlines a comprehensive testing strategy for the Citizen Radio project. The goal is to establish a robust testing framework that ensures reliability, performance, and maintainability as the system evolves. This test plan addresses various levels of testing, from unit tests to end-to-end system tests, and includes strategies for handling edge cases and performance concerns.

## 1. Unit Testing

### 1.1 Core Components

#### Config Module (`config.js`)
- **Test Cases:**
  - Configuration loading from station.json
  - Environment variable overrides
  - Default values when configuration is missing
  - Path resolution for directories
  - CLI argument parsing and overrides

#### Orchestrator (`orchestrator.js`)
- **Test Cases:**
  - Playback loop scheduling
  - Track selection logic
  - Segway generation triggers
  - Uptime enforcement
  - YouTube video ID fetching and caching
  - Overlay generation with various metadata

#### Streamer (`streamer.js`)
- **Test Cases:**
  - FFmpeg process creation and management
  - Audio streaming pipeline setup
  - YouTube streaming initialization
  - Local playback functionality
  - Error handling during streaming
  - Resource cleanup on shutdown

#### Ratings Manager (`ratingsManager.js`)
- **Test Cases:**
  - Rating persistence (save/load)
  - Comment window management
  - Rating extraction from comments
  - Rating calculation and aggregation
  - Track matching logic
  - Ticket allocation based on ratings

#### Track Manager (`trackManager.js`)
- **Test Cases:**
  - Track selection algorithms
  - Metadata extraction
  - History-aware selection
  - Weighted selection based on ratings

#### Prompt Processor (`promptProcessor.js`)
- **Test Cases:**
  - AI prompt generation
  - Context handling for segways
  - Voice selection logic
  - Text processing and formatting

### 1.2 Utility Functions

#### Utils (`utils.js`)
- **Test Cases:**
  - Process tracking and management
  - YouTube API interactions
  - Metadata extraction from audio files
  - Error handling and retries
  - Live chat fetching and parsing

## 2. Integration Testing

### 2.1 Component Interactions

#### Content Generation Pipeline
- **Test Cases:**
  - Track selection → Segway generation → Voice synthesis
  - Metadata extraction → Overlay generation
  - Rating collection → Rating persistence → Track selection influence

#### Streaming Pipeline
- **Test Cases:**
  - Audio processing → FFmpeg encoding → YouTube streaming
  - Overlay generation → Video integration
  - Live chat monitoring → Comment processing → Rating updates

### 2.2 External API Integration

#### YouTube API
- **Test Cases:**
  - Authentication and authorization
  - Live stream creation and management
  - Chat monitoring and comment retrieval
  - Error handling and rate limiting
  - Reconnection after network issues

#### OpenAI API (for content generation)
- **Test Cases:**
  - API authentication
  - Prompt submission and response handling
  - Error recovery and fallbacks
  - Rate limit handling

#### Google TTS API
- **Test Cases:**
  - Voice selection and synthesis
  - Audio format handling
  - Error recovery and fallbacks

## 3. End-to-End Testing

### 3.1 Full System Tests

#### Complete Broadcast Cycle
- **Test Cases:**
  - Station startup → Content selection → Streaming → Shutdown
  - Multiple content types in sequence (music, DJ, ads, etc.)
  - Rating collection during broadcast
  - Influence of ratings on subsequent content selection

#### Long-Running Stability
- **Test Cases:**
  - 24-hour continuous operation
  - Resource usage over time
  - Error recovery during extended operation
  - Content variety and non-repetition

### 3.2 User Interaction Scenarios

#### Listener Rating Flow
- **Test Cases:**
  - Comment submission → Rating extraction → Rating storage
  - Rating influence on future content selection
  - DJ commentary on highly-rated tracks

## 4. Performance Testing

### 4.1 Resource Utilization

#### CPU Usage
- **Test Cases:**
  - Baseline CPU usage during idle
  - Peak CPU during FFmpeg encoding
  - CPU usage during AI content generation
  - Long-term CPU trends during continuous operation

#### Memory Usage
- **Test Cases:**
  - Memory consumption baseline
  - Memory growth over time
  - Garbage collection effectiveness
  - Memory leaks during continuous operation

#### Disk I/O
- **Test Cases:**
  - Read/write patterns during normal operation
  - File handling efficiency
  - Temporary file cleanup

### 4.2 Streaming Performance

#### Stream Quality
- **Test Cases:**
  - Audio/video synchronization
  - Stream bitrate stability
  - Buffer underrun frequency
  - Recovery from network interruptions

#### Latency
- **Test Cases:**
  - End-to-end latency from generation to broadcast
  - Comment processing delay
  - Content generation time

## 5. Edge Case Testing

### 5.1 Error Handling

#### External API Failures
- **Test Cases:**
  - YouTube API unavailability
  - OpenAI API rate limiting or errors
  - Google TTS service disruption
  - Network connectivity issues

#### Resource Constraints
- **Test Cases:**
  - Low disk space scenarios
  - High CPU load from other processes
  - Limited memory availability
  - Network bandwidth restrictions

### 5.2 Content Edge Cases

#### Metadata Variations
- **Test Cases:**
  - Missing track metadata
  - Non-standard characters in titles/artists
  - Extremely long titles or descriptions
  - Missing cover art

#### Content Availability
- **Test Cases:**
  - Empty content directories
  - Corrupted audio files
  - Unsupported file formats
  - Very short or very long audio files

## 6. Testing Tools and Infrastructure

### 6.1 Test Framework

- **Jest/Mocha:** For JavaScript unit and integration testing
- **Sinon:** For mocking external dependencies
- **Supertest:** For API testing if REST endpoints are added

### 6.2 Continuous Integration

- **GitHub Actions/Jenkins:** For automated test runs on commits
- **Test coverage reporting:** To ensure adequate code coverage
- **Linting:** To maintain code quality standards

### 6.3 Monitoring and Logging

- **Test-specific logging:** Enhanced logging during test execution
- **Performance metrics collection:** CPU, memory, and network usage
- **Test result aggregation:** Centralized reporting of test outcomes

## 7. Test Data Management

### 7.1 Test Content

- **Sample audio files:** Various formats, durations, and metadata
- **Mock YouTube comments:** For testing rating extraction
- **AI response mocks:** For testing content generation without API calls

### 7.2 Environment Configuration

- **Test-specific station.json:** Configuration for test environments
- **Mock API responses:** For testing without external dependencies
- **Network condition simulation:** For testing under various network scenarios

## 8. Testing Process

### 8.1 Development Workflow

1. **Unit tests:** Run during development for immediate feedback
2. **Integration tests:** Run before committing changes
3. **End-to-end tests:** Run nightly or before releases
4. **Performance tests:** Run weekly to track trends

### 8.2 Regression Testing

- **Automated regression suite:** Covers critical functionality
- **Smoke tests:** Quick verification of core features
- **Visual regression:** For overlay and UI components if added

## 9. Test Maintenance

### 9.1 Test Code Quality

- **Test refactoring:** Regular updates to match code changes
- **Test documentation:** Clear purpose and expectations for each test
- **Shared test utilities:** Common functions for test setup and assertions

### 9.2 Test Coverage Goals

- **Core components:** 80%+ code coverage
- **Critical paths:** 100% coverage of error handling and recovery
- **API integrations:** 100% coverage of external service interactions

## Conclusion

This test plan provides a comprehensive framework for ensuring the quality, reliability, and performance of the Citizen Radio system. By implementing these testing strategies, the project can maintain stability while continuing to evolve with new features and improvements. Regular review and updates to this test plan will be necessary as the system grows and changes.