# Citizen Radio - Updated Test Plan

## Introduction

This document updates the existing test plan for the Citizen Radio project, addressing specific concerns about testing a service designed to run indefinitely and validating streaming functionality. The goal is to establish a robust testing framework that ensures reliability, performance, and maintainability while accommodating the unique characteristics of a 24/7 streaming service.

## 1. Testing a Long-Running Service

### 1.1 Using Uptime Controls for Testing

The Citizen Radio service is designed to run indefinitely (24/7), which presents challenges for automated testing. To address this, we can leverage the existing `uptimeHours` configuration parameter:

#### Test Cases:
- **Short-Duration Tests:** Set `uptimeHours` to small values (e.g., 0.1 hours = 6 minutes) to allow tests to complete in a reasonable time
- **Uptime Mode Testing:**
  - Test `uptimeMode: "cycle"` to ensure the service stops after completing the current cycle when uptime is reached
  - Test `uptimeMode: "track"` to ensure the service stops after the current track when uptime is reached
- **Graceful Shutdown:** Verify that resources are properly cleaned up when the service stops due to reaching uptime limit

#### Implementation Example:
```javascript
describe('Orchestrator Uptime Control', () => {
  it('should stop after specified uptime in cycle mode', async () => {
    // Configure service with short uptime
    const config = { 
      uptimeHours: 0.01, // 36 seconds
      uptimeMode: 'cycle'
    };
    
    const startTime = Date.now();
    await startService(config);
    const endTime = Date.now();
    
    // Verify service stopped within reasonable time
    const duration = (endTime - startTime) / 1000;
    expect(duration).toBeGreaterThanOrEqual(36);
    expect(duration).toBeLessThan(60); // Allow some buffer
  });
});
```

### 1.2 Component-Level Testing

Instead of always testing the entire service, break down functionality into testable components:

#### Test Cases:
- **Isolated Component Tests:** Test individual components (orchestrator, streamer, etc.) in isolation
- **Mock Dependencies:** Use mocks for external dependencies (FFmpeg, YouTube API, etc.)
- **State Verification:** Verify component state transitions without running the full service

## 2. FFmpeg Stream Validation

### 2.1 Stream Output Validation

While it's challenging to validate the actual YouTube stream, we can validate the FFmpeg output:

#### Test Cases:
- **Stream Format Validation:** Verify that FFmpeg produces output in the expected format (s16le, 44100Hz, 2 channels)
- **Stream Continuity:** Verify that the stream doesn't have unexpected gaps or interruptions
- **Error Handling:** Verify that errors in the FFmpeg process are properly handled and reported

#### Implementation Approach:
```javascript
describe('FFmpeg Streaming', () => {
  it('should produce valid audio output', async () => {
    // Create a writable stream to capture FFmpeg output
    const outputStream = new MemoryStream();
    
    // Configure streamer to write to our test stream instead of YouTube
    const streamer = new Streamer({ outputStream });
    
    // Stream a test file
    await streamer.streamFile('tests/fixtures/test_audio.mp3');
    
    // Analyze the captured output
    const output = outputStream.getContents();
    
    // Verify format (using audio analysis library)
    const format = analyzeAudioFormat(output);
    expect(format.sampleRate).toBe(44100);
    expect(format.channels).toBe(2);
    expect(format.encoding).toBe('s16le');
    
    // Verify continuity (no significant gaps)
    const gaps = detectGaps(output);
    expect(gaps.length).toBe(0);
  });
});
```

### 2.2 FFmpeg Process Monitoring

Monitor the FFmpeg process itself to validate proper operation:

#### Test Cases:
- **Process Creation:** Verify that FFmpeg processes are created with the correct parameters
- **Process Lifecycle:** Verify that FFmpeg processes start and stop as expected
- **Resource Usage:** Monitor CPU and memory usage to detect resource leaks or performance issues

#### Implementation Example:
```javascript
describe('FFmpeg Process Management', () => {
  it('should create FFmpeg process with correct parameters', () => {
    const streamer = new Streamer();
    const spy = jest.spyOn(childProcess, 'spawn');
    
    streamer.streamFile('tests/fixtures/test_audio.mp3');
    
    expect(spy).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-i', 'tests/fixtures/test_audio.mp3',
        '-f', 's16le',
        '-ar', '44100',
        '-ac', '2'
      ]),
      expect.anything()
    );
  });
});
```

## 3. End-to-End Testing Strategies

### 3.1 Limited-Duration E2E Tests

Run complete end-to-end tests with limited duration:

#### Test Cases:
- **Startup Sequence:** Verify that the service starts up correctly and begins streaming
- **Content Cycle:** Verify that the service cycles through content types as expected
- **Shutdown Sequence:** Verify that the service shuts down gracefully when uptime is reached

#### Implementation Approach:
```javascript
describe('End-to-End Service', () => {
  it('should complete a full content cycle', async () => {
    // Configure service with short uptime and a simple content pattern
    const config = {
      uptimeHours: 0.05, // 3 minutes
      uptimeMode: 'cycle',
      schedule: {
        defaultPattern: ['intro', 'music', 'dj', 'music']
      }
    };
    
    // Start service with logging capture
    const logs = [];
    const logCapture = (msg) => logs.push(msg);
    await startService(config, logCapture);
    
    // Verify content cycle from logs
    expect(logs.some(log => log.includes('Playing intro'))).toBe(true);
    expect(logs.some(log => log.includes('Playing music'))).toBe(true);
    expect(logs.some(log => log.includes('Playing dj'))).toBe(true);
    expect(logs.some(log => log.includes('Uptime reached: ending cycle'))).toBe(true);
  });
});
```

### 3.2 Stream Output Capture and Analysis

Capture and analyze the actual stream output:

#### Test Cases:
- **Output File Generation:** Configure the service to save the stream output to a file
- **Output Analysis:** Analyze the output file to verify audio quality, format, and content
- **Metadata Verification:** Verify that stream metadata (title, artist, etc.) is correctly included

#### Implementation Example:
```javascript
describe('Stream Output Analysis', () => {
  it('should generate valid stream output', async () => {
    // Configure service to save output to file
    const outputFile = 'tests/output/test_stream.raw';
    const config = {
      uptimeHours: 0.02,
      uptimeMode: 'cycle',
      outputFile
    };
    
    await startService(config);
    
    // Verify output file exists and has content
    expect(fs.existsSync(outputFile)).toBe(true);
    const stats = fs.statSync(outputFile);
    expect(stats.size).toBeGreaterThan(0);
    
    // Analyze output (using audio analysis tools)
    const analysis = analyzeAudio(outputFile);
    expect(analysis.format).toBe('s16le');
    expect(analysis.duration).toBeGreaterThan(0);
    expect(analysis.hasAudio).toBe(true);
  });
});
```

## 4. Mock-Based Testing

### 4.1 YouTube API Mocking

Mock the YouTube API to test streaming without actually streaming to YouTube:

#### Test Cases:
- **Stream Initialization:** Verify that the service correctly initializes the YouTube stream
- **Metadata Updates:** Verify that stream metadata is updated correctly
- **Error Handling:** Verify that YouTube API errors are handled properly

#### Implementation Example:
```javascript
describe('YouTube API Integration', () => {
  beforeEach(() => {
    // Mock YouTube API
    jest.mock('../../src/utils/youtube', () => ({
      initializeStream: jest.fn().mockResolvedValue('mock-stream-id'),
      updateMetadata: jest.fn().mockResolvedValue(true)
    }));
  });
  
  it('should initialize YouTube stream', async () => {
    const youtube = require('../../src/utils/youtube');
    const streamer = new Streamer({ streamMode: 'youtube' });
    
    await streamer.start();
    
    expect(youtube.initializeStream).toHaveBeenCalled();
  });
});
```

### 4.2 FFmpeg Mocking

Mock FFmpeg to test streaming logic without spawning actual FFmpeg processes:

#### Test Cases:
- **Command Construction:** Verify that FFmpeg commands are constructed correctly
- **Process Management:** Verify that FFmpeg processes are managed correctly
- **Error Handling:** Verify that FFmpeg errors are handled properly

## 5. Performance Testing

### 5.1 Resource Usage Monitoring

Monitor resource usage during operation:

#### Test Cases:
- **Memory Usage:** Monitor memory usage over time to detect leaks
- **CPU Usage:** Monitor CPU usage to identify performance bottlenecks
- **Disk I/O:** Monitor disk I/O to identify potential I/O bottlenecks

#### Implementation Approach:
```javascript
describe('Resource Usage', () => {
  it('should maintain stable memory usage', async () => {
    const config = {
      uptimeHours: 0.1 // 6 minutes
    };
    
    const memoryUsage = [];
    const memoryMonitor = setInterval(() => {
      memoryUsage.push(process.memoryUsage().heapUsed);
    }, 1000);
    
    await startService(config);
    clearInterval(memoryMonitor);
    
    // Analyze memory usage pattern
    const memoryGrowth = calculateGrowthRate(memoryUsage);
    expect(memoryGrowth).toBeLessThan(0.05); // Less than 5% growth rate
  });
});
```

## 6. Continuous Integration Integration

### 6.1 CI Pipeline Configuration

Configure CI pipeline to run tests with appropriate timeouts and resource limits:

#### Implementation:
- Set appropriate timeouts for tests that involve waiting for uptime
- Configure resource limits to prevent tests from consuming excessive resources
- Use parallelization to run tests concurrently where possible

### 6.2 Test Result Reporting

Implement comprehensive test result reporting:

#### Implementation:
- Generate detailed test reports with timing information
- Capture and report resource usage metrics
- Implement alerting for test failures

## Conclusion

This updated test plan addresses the specific concerns about testing a service designed to run indefinitely and validating streaming functionality. By leveraging the existing `uptimeHours` parameter, implementing component-level testing, and using various techniques to validate FFmpeg streams, we can achieve comprehensive test coverage without requiring the service to run indefinitely or stream to actual YouTube servers.

The plan provides a practical approach to testing that balances thoroughness with practicality, ensuring that the Citizen Radio service can be effectively tested in automated environments while maintaining its 24/7 operational capability in production.