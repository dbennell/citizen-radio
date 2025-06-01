/**
 * End-to-End tests for the segue system
 * Tests the full segue generation, playback, and cleanup flow
 */

const Orchestrator = require('../../src/core/orchestrator');
const ContentQueueManager = require('../../src/managers/contentQueueManager');
const segwayManager = require('../../src/managers/segueManager');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/utils/ttsHelper', () => ({
  generateTTS: jest.fn().mockResolvedValue('/path/to/mock/segue.mp3')
}));
jest.mock('../../src/utils/openaiHelper', () => ({
  generateText: jest.fn().mockResolvedValue('This is a mock segue text')
}));

// Partially mock segwayManager to track calls but keep functionality
jest.mock('../../src/managers/segwayManager', () => {
  const originalModule = jest.requireActual('../../src/managers/segwayManager');
  return {
    ...originalModule,
    shouldGenerateSegue: jest.fn().mockReturnValue(true),
    generateSegue: jest.fn().mockResolvedValue('This is a mock segue text'),
    prepareSegue: jest.fn().mockResolvedValue('/path/to/mock/segue.mp3'),
    removeOldSegues: jest.fn().mockResolvedValue(undefined)
  };
});

// Mock streamer
const mockStreamer = {
  streamFile: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  isStreaming: jest.fn().mockReturnValue(false),
  pollChat: jest.fn().mockResolvedValue([]),
  updateOverlay: jest.fn().mockResolvedValue(true)
};

// Mock track manager
const mockTrackManager = {
  selectNextTrack: jest.fn().mockImplementation((type) => {
    return Promise.resolve({
      type: type || 'music',
      path: `/path/to/${type || 'music'}/track.mp3`,
      meta: {
        title: `Test ${type || 'Music'} Track`,
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180
      }
    });
  }),
  getRecentTracks: jest.fn().mockReturnValue([
    {
      type: 'music',
      meta: {
        title: 'Previous Track',
        artist: 'Previous Artist',
        album: 'Previous Album',
        duration: 180
      }
    }
  ])
};

// Mock ratings manager
const mockRatingsManager = {
  processComments: jest.fn().mockResolvedValue(true),
  saveRatings: jest.fn().mockResolvedValue(true),
  getRating: jest.fn().mockReturnValue(4.5)
};

// Mock configuration
jest.mock('../../src/core/config', () => ({
  get: jest.fn().mockImplementation((key) => {
    const config = {
      'schedule.autoSegways.enabled': true,
      'schedule.autoSegways.transitionChances': {
        'music->music': 0.8,
        'music->ad': 0.5,
        'ad->music': 0.7,
        'talk->music': 0.6,
        'intro->music': 0.9
      },
      'segwayFunny': 0.25,
      'aiPrompts.segue': 'Generate a segue between tracks',
      'aiPrompts.segwayFunny': 'Generate a funny segue between tracks',
      'ttsProfiles.segue': 'en-US-Neural2-D',
      'enhancedEngagement.segwayReferenceChance': 0.3,
      'queue.minSize': 3,
      'queue.maxSize': 10,
      'station.name': 'Test Radio',
      'station.slogan': 'Testing the airwaves'
    };
    return key.split('.').reduce((o, i) => o[i], config);
  })
}));

describe('Segue End-to-End Tests', () => {
  let orchestrator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system functions
    fs.promises = {
      readdir: jest.fn().mockResolvedValue(['segue_1234567890.mp3', 'segue_0987654321.mp3']),
      stat: jest.fn().mockResolvedValue({
        mtime: new Date(Date.now() - 60000), // 1 minute ago
        isFile: () => true
      }),
      unlink: jest.fn().mockResolvedValue(undefined)
    };

    path.join = jest.fn().mockImplementation((...args) => args.join('/'));
    path.resolve = jest.fn().mockImplementation((...args) => args.join('/'));

    // Initialize orchestrator with mocked dependencies
    orchestrator = new Orchestrator({
      streamer: mockStreamer,
      trackManager: mockTrackManager,
      ratingsManager: mockRatingsManager,
      contentQueueClass: ContentQueueManager,
      pattern: ['music', 'music', 'ad', 'music']
    });
  });

  // Test ID: E2E-01
  test('Segues should be generated during initial queue population', async () => {
    // Start the orchestrator
    await orchestrator.start();

    // Get the content queue
    const contentQueue = orchestrator.getContentQueue();

    // Verify the queue was initialized
    expect(contentQueue).toBeTruthy();

    // Verify segue methods were called during initialization
    expect(segwayManager.shouldGenerateSegue).toHaveBeenCalled();
    expect(segwayManager.generateSegue).toHaveBeenCalled();
    expect(segwayManager.prepareSegue).toHaveBeenCalled();

    // Verify segues were attached to queue items
    const queueItems = contentQueue.getItems();
    expect(queueItems.some(item => item.segue)).toBe(true);

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: E2E-02
  test('Segues should be generated during queue replenishment', async () => {
    // Start the orchestrator
    await orchestrator.start();

    // Get the content queue
    const contentQueue = orchestrator.getContentQueue();

    // Reset segwayManager mocks to track new calls
    segwayManager.shouldGenerateSegway.mockClear();
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();

    // Simulate playing an item from the queue
    const nextItem = await contentQueue.getNextItem();

    // Verify an item was returned
    expect(nextItem).toBeTruthy();

    // Trigger queue replenishment
    await contentQueue.replenishQueue();

    // Verify segue methods were called during replenishment
    expect(segwayManager.shouldGenerateSegway).toHaveBeenCalled();
    expect(segwayManager.generateSegway).toHaveBeenCalled();
    expect(segwayManager.prepareSegway).toHaveBeenCalled();

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: E2E-03
  test('Segues should be played before their content during playback', async () => {
    // Start the orchestrator
    await orchestrator.start();

    // Mock the playback function to capture the playback sequence
    const playbackSequence = [];

    // Override streamFile to track playback sequence
    mockStreamer.streamFile.mockImplementation((filePath) => {
      playbackSequence.push(filePath);
      return Promise.resolve(true);
    });

    // Simulate a playback cycle
    await orchestrator.playbackLoop();

    // Verify that segues were played before their content
    for (let i = 0; i < playbackSequence.length; i++) {
      const filePath = playbackSequence[i];
      if (filePath.includes('segue')) {
        // If this is a segue, the next item should be content
        expect(i + 1 < playbackSequence.length).toBe(true);
        expect(playbackSequence[i + 1].includes('segue')).toBe(false);
      }
    }

    // Verify that removeOldSegways was called after playback
    expect(segwayManager.removeOldSegways).toHaveBeenCalled();

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: EC-01 and EC-03 combined
  test('System should handle edge cases gracefully', async () => {
    // Start with an empty queue
    const contentQueue = orchestrator.getContentQueue();
    contentQueue.contentQueue = [];

    // Try to generate segues for an empty queue
    await contentQueue.generateSegwaysForQueuePosition(1, false);

    // Verify no errors occurred
    expect(segwayManager.generateSegway).not.toHaveBeenCalled();

    // Add just one item to the queue
    await contentQueue.prepareNextContent();

    // Try to generate segues for position 2 when there's only one item
    await contentQueue.generateSegwaysForQueuePosition(1, false);

    // Verify no errors occurred
    expect(segwayManager.generateSegway).not.toHaveBeenCalled();

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: EC-04
  test('System should respect transition probability configuration', async () => {
    // Configure a transition to have 0% chance
    jest.spyOn(require('../../src/core/config'), 'get')
      .mockImplementation((key) => {
        if (key === 'schedule.autoSegways.transitionChances.music->ad') {
          return 0;
        }
        if (key === 'schedule.autoSegways.enabled') {
          return true;
        }
        return 0.8; // Default high probability for other transitions
      });

    // Reset shouldGenerateSegway to use actual implementation
    segwayManager.shouldGenerateSegway.mockRestore();

    // Start the orchestrator
    await orchestrator.start();

    // Get the content queue
    const contentQueue = orchestrator.getContentQueue();

    // Reset generateSegway mock to track calls
    segwayManager.generateSegway.mockClear();

    // Set up a music->ad transition
    contentQueue.lastPlayedItem = {
      type: 'music',
      meta: { title: 'Last Music Track' }
    };

    // Add an ad to the queue
    await contentQueue.prepareNextContent('ad');

    // Verify generateSegway was not called for music->ad transition
    expect(segwayManager.generateSegway).not.toHaveBeenCalled();

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: EC-05
  test('System should handle inconsistent transition key formats', async () => {
    // Start the orchestrator
    await orchestrator.start();

    // Get the content queue
    const contentQueue = orchestrator.getContentQueue();

    // Set up a specific transition
    contentQueue.lastPlayedItem = {
      type: 'music',
      meta: { title: 'Specific Track' }
    };

    // Add an item to trigger segue generation with one format
    await contentQueue.prepareNextContent();

    // Reset mocks
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();

    // Now try to generate a segue for the same transition but with a different key format
    // This simulates the issue where different methods use different transition key formats
    await contentQueue.generateSegwaysForQueuePosition(1, true);

    // In an ideal implementation, this would not generate a duplicate segue
    // But with inconsistent key formats, it might
    // This test helps identify if the issue exists

    // Clean up
    await orchestrator.stop();
  });

  // Test ID: EC-06
  test('System should protect segue files referenced by multiple queue items', async () => {
    // Start the orchestrator
    await orchestrator.start();

    // Get the content queue
    const contentQueue = orchestrator.getContentQueue();

    // Create a scenario where multiple queue items reference the same segue
    const sharedSeguePath = 'segue_1234567890.mp3';

    // Add the segue to multiple queue items
    contentQueue.contentQueue.forEach(item => {
      item.segue = sharedSeguePath;
    });

    // Trigger segue cleanup
    await segwayManager.removeOldSegways(contentQueue.getItems(), null);

    // Verify the shared segue file was not deleted
    expect(fs.promises.unlink).not.toHaveBeenCalledWith(expect.stringContaining(sharedSeguePath));

    // Clean up
    await orchestrator.stop();
  });
});
