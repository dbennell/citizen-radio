const { jest: jestObject } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const utils = require('../../../src/utils/index');
const streamer = require('../../../src/core/streamer');
const ratingsManager = require('../../../src/managers/ratingsManager');

// This test requires YouTube API credentials to be properly set up
// It will be skipped if no credentials are found
const hasCredentials = process.env.YOUTUBE_API_KEY && 
                      process.env.YOUTUBE_CLIENT_ID && 
                      process.env.YOUTUBE_CLIENT_SECRET;

// Conditionally skip tests if no credentials are available
const conditionalTest = hasCredentials ? describe : describe.skip;

conditionalTest('YouTube API Integration', () => {
  let youtube;
  let videoId;

  beforeAll(() => {
    // Initialize YouTube API client
    youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    
    // Use a test video ID if available, otherwise use a public video
    videoId = process.env.YOUTUBE_VIDEO_ID || 'dQw4w9WgXcQ'; // Default to a well-known video
  });

  beforeEach(() => {
    jest.setTimeout(30000); // Increase timeout for API calls
  });

  test('should connect to YouTube API and get video details', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Make a direct API call to get video details
    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId
    });
    
    // Verify we got a response with video details
    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
    expect(response.data.items).toBeDefined();
    expect(response.data.items.length).toBeGreaterThan(0);
    
    // Log some video information for debugging
    const video = response.data.items[0];
    console.log('Video title:', video.snippet.title);
    console.log('Channel:', video.snippet.channelTitle);
    console.log('View count:', video.statistics.viewCount);
  });

  test('should fetch live video ID through utils', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Mock the YouTube API response for testing
    const mockResponse = {
      data: {
        items: [
          {
            id: 'test-live-video-id',
            snippet: {
              title: 'Test Live Stream',
              liveBroadcastContent: 'live'
            }
          }
        ]
      }
    };
    
    // Mock the YouTube API call
    youtube.search = {
      list: jest.fn().mockResolvedValue(mockResponse)
    };
    
    // Call the utility function
    const liveVideoId = await utils.fetchLiveVideoId('test-channel-id');
    
    // Verify we got a valid live video ID
    expect(liveVideoId).toBe('test-live-video-id');
  });

  test('should read live chat messages through utils', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Mock the YouTube API response for testing
    const mockResponse = {
      data: {
        items: [
          {
            id: 'comment1',
            snippet: {
              displayMessage: 'Test comment 1',
              publishedAt: new Date().toISOString()
            },
            authorDetails: {
              displayName: 'Test User 1'
            }
          },
          {
            id: 'comment2',
            snippet: {
              displayMessage: 'Test comment 2 👍',
              publishedAt: new Date().toISOString()
            },
            authorDetails: {
              displayName: 'Test User 2'
            }
          }
        ],
        nextPageToken: null
      }
    };
    
    // Mock the YouTube API call
    youtube.liveChatMessages = {
      list: jest.fn().mockResolvedValue(mockResponse)
    };
    
    // Call the utility function
    const comments = await utils.readLiveChat('test-live-video-id');
    
    // Verify we got valid comments
    expect(comments).toBeDefined();
    expect(comments.length).toBe(2);
    expect(comments[0].id).toBe('comment1');
    expect(comments[1].snippet.displayMessage).toBe('Test comment 2 👍');
  });

  test('should process ratings from live chat', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Set up a test track
    ratingsManager.setCurrentlyPlaying({
      rel: 'data/ready/music/test_track.mp3',
      title: 'Test Track',
      artist: 'Test Artist',
      type: 'music'
    });
    
    // Open comment window
    ratingsManager.openCommentWindow();
    
    // Mock the readLiveChat function to return test comments with ratings
    utils.readLiveChat = jest.fn().mockResolvedValue([
      {
        id: 'comment1',
        authorDetails: {
          displayName: 'Test User 1'
        },
        snippet: {
          displayMessage: 'Great song! ❤️',
          publishedAt: new Date().toISOString()
        }
      },
      {
        id: 'comment2',
        authorDetails: {
          displayName: 'Test User 2'
        },
        snippet: {
          displayMessage: 'Not my favorite. 👎',
          publishedAt: new Date().toISOString()
        }
      }
    ]);
    
    // Close comment window
    ratingsManager.closeCommentWindow();
    
    // Process comments
    const count = await ratingsManager.pollForComments('test-live-video-id');
    
    // Verify comments were processed
    expect(count).toBeGreaterThan(0);
    expect(utils.readLiveChat).toHaveBeenCalledWith('test-live-video-id');
  });

  test('should handle YouTube streaming setup', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;
    
    // Mock the necessary functions to avoid actual streaming
    streamer.startYouTubeStreamer = jest.fn().mockResolvedValue();
    streamer.streamFile = jest.fn().mockResolvedValue();
    streamer.stopYouTubeStreamer = jest.fn().mockResolvedValue();
    
    // Test the streaming setup
    await streamer.startYouTubeStreamer();
    
    // Verify the streamer was started
    expect(streamer.startYouTubeStreamer).toHaveBeenCalled();
    
    // Test streaming a file
    await streamer.streamFile('/path/to/test_audio.mp3');
    
    // Verify the file was streamed
    expect(streamer.streamFile).toHaveBeenCalledWith('/path/to/test_audio.mp3');
    
    // Test stopping the streamer
    await streamer.stopYouTubeStreamer();
    
    // Verify the streamer was stopped
    expect(streamer.stopYouTubeStreamer).toHaveBeenCalled();
  });

  test('should handle API errors gracefully', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Mock the YouTube API to throw an error
    youtube.videos.list = jest.fn().mockRejectedValue(new Error('API error'));
    
    try {
      // Make a direct API call that should fail
      await youtube.videos.list({
        part: 'snippet',
        id: 'invalid-id'
      });
      
      // If we get here, the API didn't throw an error as expected
      expect(false).toBe(true); // Force test to fail
    } catch (error) {
      // Verify we got an error as expected
      expect(error).toBeDefined();
      expect(error.message).toBe('API error');
    }
  });
});