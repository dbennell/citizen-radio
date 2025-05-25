# Testing Approach for Citizen Radio

This document outlines the testing approach for the Citizen Radio project, including the separation of basic tests and advanced API tests.

## Test Structure

The tests are organized into the following directories:

- `tests/unit`: Unit tests for individual components
- `tests/integration`: Integration tests for component interactions
  - `tests/integration/components`: Tests for component integrations
  - `tests/integration/api`: Tests for API integrations
- `tests/e2e`: End-to-end tests for complete workflows
- `tests/performance`: Performance tests
- `tests/fixtures`: Test fixtures and data

## Basic Tests vs Advanced API Tests

### Basic Tests

Basic tests focus on verifying that the system can start a stream and play audio and video without errors. These tests are designed to run quickly and reliably, without requiring external API credentials or services.

Basic tests include:
- Unit tests for individual components
- Integration tests for component interactions
- Tests that mock external API calls

To run the basic tests:

```bash
npm run test:basic
```

### Advanced API Tests

Advanced API tests verify that the system can interact with external APIs (OpenAI, Google Cloud TTS, YouTube) and handle API errors and rate limits. These tests require valid API credentials to be set in the environment.

Advanced API tests include:
- Tests for OpenAI API integration
- Tests for Google Cloud TTS API integration
- Tests for YouTube API integration

To run the advanced API tests:

```bash
npm run test:api
```

## Test Configuration

### Environment Variables

The following environment variables are required for the advanced API tests:

- `OPENAI_API_KEY`: OpenAI API key
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google Cloud credentials file
- `YOUTUBE_API_KEY`: YouTube API key
- `YOUTUBE_CLIENT_ID`: YouTube OAuth client ID
- `YOUTUBE_CLIENT_SECRET`: YouTube OAuth client secret
- `YOUTUBE_VIDEO_ID`: (Optional) YouTube video ID for testing

### Conditional Testing

The advanced API tests are designed to be skipped if the required credentials are not available. This allows the basic tests to run without requiring external API credentials.

## Test Scripts

The following test scripts are available:

- `npm test`: Run all tests
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage
- `npm run test:unit`: Run only unit tests
- `npm run test:integration`: Run only integration tests
- `npm run test:e2e`: Run only end-to-end tests
- `npm run test:performance`: Run only performance tests
- `npm run test:api`: Run only API tests
- `npm run test:basic`: Run only basic tests

## Test Implementation

### OpenAI API Tests

The OpenAI API tests verify that the system can:
- Connect to the OpenAI API and get a response
- Handle API rate limits gracefully
- Generate podcast content through podcastGenerator
- Elaborate DJ content through promptProcessor

### Google Cloud TTS API Tests

The Google Cloud TTS API tests verify that the system can:
- Connect to the Google Cloud TTS API and synthesize speech
- List available voices
- Assign voices to speakers through voiceManager
- Synthesize speech through audioSynthesizer
- Handle API errors gracefully

### YouTube API Tests

The YouTube API tests verify that the system can:
- Connect to the YouTube API and get video details
- Fetch live video ID through utils
- Read live chat messages through utils
- Process ratings from live chat
- Handle YouTube streaming setup
- Handle API errors gracefully

## Best Practices

1. **Mock external dependencies**: In basic tests, mock external dependencies to avoid relying on external services.
2. **Use conditional testing**: Skip tests that require external credentials if those credentials are not available.
3. **Handle API errors gracefully**: Ensure that the system can handle API errors and rate limits.
4. **Clean up after tests**: Clean up any resources created during tests, such as temporary files.
5. **Use appropriate timeouts**: Increase timeouts for API calls to account for network latency.