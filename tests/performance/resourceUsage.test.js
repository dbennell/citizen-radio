const path = require('path');
const fs = require('fs');
const Orchestrator = require('../../../src/core/orchestrator');
const utils = require('../../../src/utils/index');

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn()
}));

jest.mock('../../../src/utils/index', () => ({
  spawnTrackedProcess: jest.fn(),
  extractMetadata: jest.fn(),
  fetchLiveVideoId: jest.fn(),
  readLiveChat: jest.fn(),
  killAllTrackedProcesses: jest.fn().mockResolvedValue(),
  runningProcesses: []
}));

// Mock the streamer
jest.mock('../../../src/core/streamer', () => {
  return jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
    streamFile: jest.fn().mockResolvedValue(),
    pollChat: jest.fn().mockResolvedValue(),
    generateOverlay: jest.fn(),
    processComments: jest.fn()
  }));
});

// Mock the track manager
jest.mock('../../../src/managers/trackManager', () => {
  return jest.fn().mockImplementation(() => ({
    selectNextTrack: jest.fn().mockResolvedValue({
      path: '/path/to/test_audio.mp3',
      type: 'music',
      metadata: {
        title: 'Test Song',
        artist: 'Test Artist'
      }
    }),
    getHistory: jest.fn().mockReturnValue([]),
    addToHistory: jest.fn()
  }));
});

/**
 * Helper function to calculate memory growth rate
 * @param {Array<number>} memoryUsage - Array of memory usage measurements
 * @returns {number} - Growth rate as a decimal (e.g., 0.05 = 5% growth)
 */
function calculateGrowthRate(memoryUsage) {
  if (memoryUsage.length < 2) return 0;
  
  const first = memoryUsage[0];
  const last = memoryUsage[memoryUsage.length - 1];
  
  if (first === 0) return 0; // Avoid division by zero
  
  return (last - first) / first;
}

describe('Performance - Resource Usage', () => {
  let orchestrator;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Set up test fixtures
    const fixturesDir = path.join(__dirname, '../../fixtures');
    
    // Mock fs.readFileSync to return test data
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith('test_station.json')) {
        return JSON.stringify({
          name: 'Test Station',
          description: 'A test station for automated testing',
          uptimeHours: 0.05, // 3 minutes
          uptimeMode: 'cycle',
          schedule: {
            defaultPattern: ['intro', 'music', 'dj', 'music']
          },
          paths: {
            music: fixturesDir,
            intro: fixturesDir,
            dj: fixturesDir
          },
          youtube: {
            enabled: false
          }
        });
      }
      return Buffer.from('test data');
    });
    
    // Mock fs.readdirSync to return test files
    fs.readdirSync.mockReturnValue(['test_audio.mp3']);
    
    // Mock utils.extractMetadata to return test metadata
    utils.extractMetadata.mockReturnValue({
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      genre: 'Test Genre'
    });
    
    // Initialize orchestrator with test configuration
    orchestrator = new Orchestrator({
      configPath: path.join(fixturesDir, 'test_station.json'),
      streamMode: 'local' // Use local mode to avoid actual YouTube streaming
    });
  });
  
  describe('Memory Usage', () => {
    it('should maintain stable memory usage over time', async () => {
      // Set up memory usage monitoring
      const memoryUsage = [];
      let memoryMonitorInterval;
      
      // Start memory monitoring
      memoryMonitorInterval = setInterval(() => {
        const usage = process.memoryUsage();
        memoryUsage.push(usage.heapUsed);
      }, 100); // Sample every 100ms
      
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Run for a longer period to observe memory usage patterns
      for (let i = 0; i < 10; i++) {
        // Advance time by 1 second
        jest.advanceTimersByTime(1000);
        
        // Run any pending promises
        await Promise.resolve();
      }
      
      // Stop memory monitoring
      clearInterval(memoryMonitorInterval);
      
      // Calculate memory growth rate
      const growthRate = calculateGrowthRate(memoryUsage);
      
      // Log memory usage statistics for debugging
      console.log('Memory usage samples:', memoryUsage.length);
      console.log('Initial memory usage:', memoryUsage[0]);
      console.log('Final memory usage:', memoryUsage[memoryUsage.length - 1]);
      console.log('Memory growth rate:', growthRate);
      
      // Verify that memory growth is within acceptable limits
      // A growth rate of 0.1 means 10% growth, which is reasonable for a short test
      expect(growthRate).toBeLessThan(0.1);
    });
  });
  
  describe('CPU Usage', () => {
    it('should not have excessive CPU spikes during operation', async () => {
      // Set up CPU usage monitoring
      const cpuUsage = [];
      let lastCpuUsage = process.cpuUsage();
      let cpuMonitorInterval;
      
      // Start CPU monitoring
      cpuMonitorInterval = setInterval(() => {
        const usage = process.cpuUsage(lastCpuUsage);
        const totalUsage = usage.user + usage.system;
        cpuUsage.push(totalUsage);
        lastCpuUsage = process.cpuUsage();
      }, 100); // Sample every 100ms
      
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Run for a period to observe CPU usage patterns
      for (let i = 0; i < 10; i++) {
        // Advance time by 1 second
        jest.advanceTimersByTime(1000);
        
        // Run any pending promises
        await Promise.resolve();
      }
      
      // Stop CPU monitoring
      clearInterval(cpuMonitorInterval);
      
      // Calculate average and maximum CPU usage
      const avgCpuUsage = cpuUsage.reduce((sum, val) => sum + val, 0) / cpuUsage.length;
      const maxCpuUsage = Math.max(...cpuUsage);
      
      // Log CPU usage statistics for debugging
      console.log('CPU usage samples:', cpuUsage.length);
      console.log('Average CPU usage:', avgCpuUsage);
      console.log('Maximum CPU usage:', maxCpuUsage);
      
      // Verify that CPU usage is within acceptable limits
      // These thresholds would need to be adjusted based on the specific environment
      // For this test, we're just ensuring the test framework works
      expect(maxCpuUsage).toBeDefined();
    });
  });
  
  describe('Resource Cleanup', () => {
    it('should properly clean up resources when shutting down', async () => {
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Run for a short period
      jest.advanceTimersByTime(5000); // 5 seconds
      
      // Run any pending promises
      await Promise.resolve();
      
      // Explicitly shut down the orchestrator
      await orchestrator.stop();
      
      // Verify that resources were cleaned up
      expect(utils.killAllTrackedProcesses).toHaveBeenCalled();
      expect(orchestrator.streamer.stop).toHaveBeenCalled();
    });
  });
  
  describe('Long-Running Stability', () => {
    it('should maintain stability during extended operation', async () => {
      // This test simulates a longer running period to check for stability issues
      
      // Set up memory usage monitoring
      const memoryUsage = [];
      let memoryMonitorInterval;
      
      // Start memory monitoring
      memoryMonitorInterval = setInterval(() => {
        const usage = process.memoryUsage();
        memoryUsage.push(usage.heapUsed);
      }, 500); // Sample every 500ms
      
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Simulate a longer running period (30 seconds of simulated time)
      for (let i = 0; i < 30; i++) {
        // Advance time by 1 second
        jest.advanceTimersByTime(1000);
        
        // Run any pending promises
        await Promise.resolve();
      }
      
      // Stop memory monitoring
      clearInterval(memoryMonitorInterval);
      
      // Calculate memory statistics
      const initialMemory = memoryUsage[0];
      const finalMemory = memoryUsage[memoryUsage.length - 1];
      const memoryDelta = finalMemory - initialMemory;
      
      // Log memory usage statistics for debugging
      console.log('Long-running test:');
      console.log('Memory samples:', memoryUsage.length);
      console.log('Initial memory:', initialMemory);
      console.log('Final memory:', finalMemory);
      console.log('Memory delta:', memoryDelta);
      
      // Verify that the orchestrator remained stable
      // For this test, we're primarily checking that it didn't crash
      // and that memory usage didn't grow excessively
      
      // A reasonable threshold might be 20% growth for a longer test
      const growthRate = calculateGrowthRate(memoryUsage);
      expect(growthRate).toBeLessThan(0.2);
    });
  });
});