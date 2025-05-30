/**
 * Integration tests for the segue system
 * Tests the interaction between ContentQueueManager and SegueManager
 */

const ContentQueueManager = require('../../src/managers/contentQueueManager');
const segwayManager = require('../../src/managers/segwayManager');
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

// Mock segwayManager methods to track calls
jest.mock('../../src/managers/segwayManager', () => ({
  shouldGenerateSegway: jest.fn().mockReturnValue(true),
  generateSegway: jest.fn().mockResolvedValue('This is a mock segue text'),
  prepareSegway: jest.fn().mockResolvedValue('/path/to/mock/segue.mp3'),
  removeOldSegways: jest.fn().mockResolvedValue(undefined)
}));

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
      'queue.maxSize': 10
    };
    return key.split('.').reduce((o, i) => o[i], config);
  })
}));

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

describe('Segue Integration Tests', () => {
  let contentQueueManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize ContentQueueManager with mocked dependencies
    contentQueueManager = new ContentQueueManager({
      trackManager: mockTrackManager,
      pattern: ['music', 'music', 'ad', 'music']
    });
    
    // Mock lastPlayedItem
    contentQueueManager.lastPlayedItem = {
      type: 'music',
      meta: {
        title: 'Last Played Track',
        artist: 'Last Played Artist',
        album: 'Last Played Album',
        duration: 180
      }
    };
  });
  
  // Test ID: INT-01
  test('ContentQueueManager should call SegueManager methods during prepareNextContent', async () => {
    // Initialize the queue
    await contentQueueManager.initialize();
    
    // Add a new item to trigger segue generation
    await contentQueueManager.prepareNextContent();
    
    // Verify SegueManager methods were called
    expect(segwayManager.shouldGenerateSegway).toHaveBeenCalled();
    expect(segwayManager.generateSegway).toHaveBeenCalled();
    expect(segwayManager.prepareSegway).toHaveBeenCalled();
    
    // Verify the segue was attached to the queue item
    const queueItems = contentQueueManager.getItems();
    expect(queueItems.some(item => item.segue)).toBe(true);
  });
  
  // Test ID: INT-01 (variation)
  test('ContentQueueManager should pass correct parameters to SegueManager', async () => {
    // Initialize the queue
    await contentQueueManager.initialize();
    
    // Reset mocks to track new calls
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();
    
    // Add a new item to trigger segue generation
    await contentQueueManager.prepareNextContent();
    
    // Verify parameters passed to generateSegway
    expect(segwayManager.generateSegway).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(String), title: expect.any(String) }), // prevMeta
      expect.objectContaining({ type: expect.any(String), title: expect.any(String) }), // nextMeta
      expect.any(Array), // prevTracks
      expect.any(Array)  // nextTracks
    );
    
    // Verify parameters passed to prepareSegway
    expect(segwayManager.prepareSegway).toHaveBeenCalledWith(
      'This is a mock segue text', // segwayText
      expect.any(String),           // key
      expect.any(String)            // voiceProfile
    );
  });
  
  // Test ID: INT-01 (edge case)
  test('ContentQueueManager should not generate segue when shouldGenerateSegway returns false', async () => {
    // Mock shouldGenerateSegway to return false
    segwayManager.shouldGenerateSegway.mockReturnValueOnce(false);
    
    // Initialize the queue
    await contentQueueManager.initialize();
    
    // Reset mocks to track new calls
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();
    
    // Add a new item
    await contentQueueManager.prepareNextContent();
    
    // Verify generateSegway and prepareSegway were not called
    expect(segwayManager.generateSegway).not.toHaveBeenCalled();
    expect(segwayManager.prepareSegway).not.toHaveBeenCalled();
  });
  
  // Test ID: INT-01 (duplicate prevention)
  test('ContentQueueManager should prevent duplicate segue generation', async () => {
    // Initialize the queue
    await contentQueueManager.initialize();
    
    // Reset mocks to track new calls
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();
    
    // Add a new item to trigger segue generation
    await contentQueueManager.prepareNextContent();
    
    // First call should generate a segue
    expect(segwayManager.generateSegway).toHaveBeenCalled();
    expect(segwayManager.prepareSegway).toHaveBeenCalled();
    
    // Reset mocks again
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();
    
    // Try to generate a segue for the same transition again
    await contentQueueManager.generateSegwaysForQueuePosition(1, false);
    
    // Second call should not generate a segue for the same transition
    expect(segwayManager.generateSegway).not.toHaveBeenCalled();
    expect(segwayManager.prepareSegway).not.toHaveBeenCalled();
  });
  
  // Test ID: INT-03 (partial)
  test('ContentQueueManager should generate segues for position 2 in the queue', async () => {
    // Initialize the queue with multiple items
    await contentQueueManager.initialize();
    await contentQueueManager.replenishQueue();
    
    // Reset mocks to track new calls
    segwayManager.generateSegway.mockClear();
    segwayManager.prepareSegway.mockClear();
    
    // Generate segues for position 2
    await contentQueueManager.generateSegwaysForQueuePosition(1, true);
    
    // Verify SegueManager methods were called
    expect(segwayManager.shouldGenerateSegway).toHaveBeenCalled();
    expect(segwayManager.generateSegway).toHaveBeenCalled();
    expect(segwayManager.prepareSegway).toHaveBeenCalled();
  });
  
  // Test ID: EC-02 (no last played item)
  test('ContentQueueManager should handle no last played item gracefully', async () => {
    // Remove lastPlayedItem
    contentQueueManager.lastPlayedItem = null;
    
    // Initialize the queue
    await contentQueueManager.initialize();
    
    // Add a new item to trigger segue generation
    await contentQueueManager.prepareNextContent();
    
    // Verify SegueManager methods were called
    expect(segwayManager.shouldGenerateSegway).toHaveBeenCalled();
    // The first parameter (prevMeta) should have a default type
    expect(segwayManager.generateSegway).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'start' }),
      expect.any(Object),
      expect.any(Array),
      expect.any(Array)
    );
  });
});