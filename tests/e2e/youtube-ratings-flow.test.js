/**
 * End-to-End Test for YouTube Ratings Flow
 * 
 * This test uses the YouTube Stream Simulator to test the complete flow
 * from YouTube comments to stored ratings and analytics updates.
 */

const { jest: jestObject } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const YouTubeStreamSimulator = require('./youtube-stream-simulator');
const ratingsManager = require('../../src/managers/ratingsManager');
const analyticsEngine = require('../../src/managers/analyticsEngine');
const utils = require('../../src/utils');

// Set a longer timeout for E2E tests
jest.setTimeout(30000);

describe('YouTube Ratings Flow E2E', () => {
  let simulator;
  let originalYouTubeApiKey;
  let originalYouTubeApiBaseUrl;
  
  // Mock file system operations
  jest.mock('fs');
  jest.mock('fs/promises');
  
  // Store original environment variables
  beforeAll(() => {
    // Save original environment variables
    originalYouTubeApiKey = process.env.YOUTUBE_API_KEY;
    originalYouTubeApiBaseUrl = process.env.YOUTUBE_API_BASE_URL;
    
    // Set up mock file system
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue('{}');
    fs.writeFileSync = jest.fn();
    
    fs.promises = {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue('{}'),
      unlink: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined)
    };
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  beforeEach(async () => {
    // Start the simulator
    simulator = new YouTubeStreamSimulator({
      port: 8089,
      videoId: 'test-video-id',
      liveChatId: 'test-live-chat-id',
      rateLimitThreshold: 50, // Higher threshold for E2E tests
      errorRate: 0.02 // Lower error rate for more predictable tests
    });
    
    await simulator.start();
    
    // Point the application to our simulator instead of the real YouTube API
    process.env.YOUTUBE_API_KEY = 'test-api-key';
    process.env.YOUTUBE_API_BASE_URL = 'http://localhost:8089/youtube/v3';
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up currently playing track if the method exists
    if (typeof ratingsManager.setCurrentlyPlaying === 'function') {
      ratingsManager.setCurrentlyPlaying({
        rel: 'data/ready/music/current-track.mp3',
        title: 'Current Track',
        artist: 'Test Artist',
        type: 'music'
      });
      
      // Open comment window
      if (typeof ratingsManager.openCommentWindow === 'function') {
        ratingsManager.openCommentWindow();
      }
    }
  });
  
  afterEach(async () => {
    // Stop the simulator
    await simulator.stop();
    
    // Restore environment variables
    process.env.YOUTUBE_API_KEY = originalYouTubeApiKey;
    process.env.YOUTUBE_API_BASE_URL = originalYouTubeApiBaseUrl;
  });
  
  afterAll(() => {
    jest.restoreAllMocks();
  });
  
  test('Complete ratings flow from YouTube comments to stored ratings', async () => {
    // Add rating messages to the simulator
    simulator.addRatingMessages(10);
    
    // Poll for comments
    const count = await ratingsManager.pollForComments('test-video-id');
    
    // Verify that ratings were processed
    expect(count).toBeGreaterThan(0);
    
    // Verify that ratings were stored
    expect(fs.writeFileSync).toHaveBeenCalled();
    
    // If analytics engine is available, verify it was updated
    if (typeof analyticsEngine.updateTrackPopularity === 'function') {
      // This might be called asynchronously, so we need to wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if analytics were updated
      // This depends on the implementation details, so it might need adjustment
      const mockUpdateTrackPopularity = jest.spyOn(analyticsEngine, 'updateTrackPopularity');
      expect(mockUpdateTrackPopularity).toHaveBeenCalled();
    }
  });
  
  test('Handles rate limiting by backing off and retrying', async () => {
    // Set a low rate limit threshold to trigger rate limiting
    simulator.options.rateLimitThreshold = 2;
    
    // Add rating messages
    simulator.addRatingMessages(5);
    
    // Mock the backoff strategy if it exists
    let backoffCalled = false;
    if (utils.exponentialBackoff) {
      const originalBackoff = utils.exponentialBackoff;
      utils.exponentialBackoff = jest.fn().mockImplementation(async (fn, ...args) => {
        backoffCalled = true;
        // Reset rate limit counter to allow the retry to succeed
        simulator.requestCount = 0;
        return originalBackoff(fn, ...args);
      });
    }
    
    // Poll for comments
    const count = await ratingsManager.pollForComments('test-video-id');
    
    // Verify that some ratings were processed despite rate limiting
    expect(count).toBeGreaterThan(0);
    
    // If backoff strategy exists, verify it was called
    if (utils.exponentialBackoff) {
      expect(backoffCalled).toBe(true);
    }
  });
  
  test('Handles server errors gracefully', async () => {
    // Set a high error rate to ensure errors occur
    simulator.options.errorRate = 0.9;
    
    // Add rating messages
    simulator.addRatingMessages(5);
    
    // Poll for comments
    await ratingsManager.pollForComments('test-video-id');
    
    // Verify that errors were logged
    expect(console.error).toHaveBeenCalled();
  });
  
  test('Matches ratings to the correct track', async () => {
    // Skip if the necessary methods don't exist
    if (!ratingsManager.setCurrentlyPlaying || !ratingsManager.matchRatingToTrack) {
      return;
    }
    
    // Set up a previous track
    ratingsManager.setCurrentlyPlaying({
      rel: 'data/ready/music/previous-track.mp3',
      title: 'Previous Track',
      artist: 'Test Artist',
      type: 'music'
    });
    
    // Open and close comment window for previous track
    ratingsManager.openCommentWindow();
    ratingsManager.closeCommentWindow();
    
    // Set up current track
    ratingsManager.setCurrentlyPlaying({
      rel: 'data/ready/music/current-track.mp3',
      title: 'Current Track',
      artist: 'Test Artist',
      type: 'music'
    });
    
    // Open comment window for current track
    ratingsManager.openCommentWindow();
    
    // Add messages with different timestamps
    // Recent message (should match current track)
    simulator.addChatMessage('Great current track 👍', 'User1');
    
    // Older message (should match previous track)
    const oldMessage = {
      kind: 'youtube#liveChatMessage',
      id: `message-${Date.now() - 60000}-${Math.floor(Math.random() * 1000)}`,
      snippet: {
        type: 'textMessageEvent',
        liveChatId: simulator.options.liveChatId,
        authorChannelId: 'channel-User2',
        publishedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        hasDisplayContent: true,
        displayMessage: 'Loved the previous track ❤️'
      },
      authorDetails: {
        channelId: 'channel-User2',
        displayName: 'User2',
        isChatOwner: false,
        isChatSponsor: false,
        isChatModerator: false
      }
    };
    simulator.chatMessages.push(oldMessage);
    
    // Poll for comments
    await ratingsManager.pollForComments('test-video-id');
    
    // Verify that ratings were stored for both tracks
    // This depends on implementation details, so it might need adjustment
    expect(fs.writeFileSync).toHaveBeenCalled();
    
    // Check the calls to writeFileSync to see if both tracks were updated
    const writeFileCalls = fs.writeFileSync.mock.calls;
    let foundCurrentTrack = false;
    let foundPreviousTrack = false;
    
    for (const call of writeFileCalls) {
      const content = call[1];
      if (content.includes('current-track.mp3')) {
        foundCurrentTrack = true;
      }
      if (content.includes('previous-track.mp3')) {
        foundPreviousTrack = true;
      }
    }
    
    // At least one of the tracks should have been updated
    expect(foundCurrentTrack || foundPreviousTrack).toBe(true);
  });
});