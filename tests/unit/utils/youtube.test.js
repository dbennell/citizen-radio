const { google } = require('googleapis');
const utils = require('../../../src/utils/index');

// Mock the google API
jest.mock('googleapis', () => ({
  google: {
    youtube: jest.fn().mockReturnValue({
      liveBroadcasts: {
        list: jest.fn()
      },
      search: {
        list: jest.fn()
      },
      videos: {
        list: jest.fn()
      },
      liveChatMessages: {
        list: jest.fn()
      }
    })
  }
}));

// Mock environment variables
const originalEnv = process.env;

describe('Utils - YouTube API Functions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset environment variables
    process.env = { ...originalEnv };
    process.env.YOUTUBE_API_KEY = 'test-api-key';

    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    // Restore environment variables
    process.env = originalEnv;
  });

  describe('fetchLiveVideoId', () => {
    it('should return null if YouTube API key is not set', async () => {
      // Remove API key
      delete process.env.YOUTUBE_API_KEY;

      const result = await utils.fetchLiveVideoId();

      expect(result).toBeNull();
      expect(google.youtube).not.toHaveBeenCalled();
    });

    it('should return active broadcast ID if one is found', async () => {
      // Mock liveBroadcasts.list to return an active broadcast
      const mockResponse = {
        data: {
          items: [
            {
              id: 'test-video-id',
              snippet: {
                title: 'Test Broadcast'
              }
            }
          ]
        }
      };

      google.youtube().liveBroadcasts.list.mockResolvedValue(mockResponse);

      const result = await utils.fetchLiveVideoId();

      expect(result).toBe('test-video-id');
      expect(google.youtube().liveBroadcasts.list).toHaveBeenCalledWith({
        part: 'id,snippet',
        broadcastStatus: 'active',
        broadcastType: 'all'
      });
    });

    it('should fall back to search API if no active broadcasts are found', async () => {
      // Mock liveBroadcasts.list to return no items
      google.youtube().liveBroadcasts.list.mockResolvedValue({
        data: { items: [] }
      });

      // Mock search.list to return a recent stream
      const mockSearchResponse = {
        data: {
          items: [
            {
              id: { videoId: 'recent-video-id' },
              snippet: {
                title: 'Recent Broadcast'
              }
            }
          ]
        }
      };

      google.youtube().search.list.mockResolvedValue(mockSearchResponse);

      const result = await utils.fetchLiveVideoId();

      expect(result).toBe('recent-video-id');
      expect(google.youtube().search.list).toHaveBeenCalled();
    });

    it('should handle errors from liveBroadcasts.list', async () => {
      // Mock liveBroadcasts.list to throw an error
      google.youtube().liveBroadcasts.list.mockRejectedValue(
        new Error('Login Required')
      );

      // Mock search.list to return no items
      google.youtube().search.list.mockResolvedValue({
        data: { items: [] }
      });

      const result = await utils.fetchLiveVideoId();

      expect(result).toBeNull();
      expect(google.youtube().search.list).toHaveBeenCalled();
    });

    it('should handle errors from search.list', async () => {
      // Mock liveBroadcasts.list to return no items
      google.youtube().liveBroadcasts.list.mockResolvedValue({
        data: { items: [] }
      });

      // Mock search.list to throw an error
      google.youtube().search.list.mockRejectedValue(
        new Error('API Error')
      );

      const result = await utils.fetchLiveVideoId();

      expect(result).toBeNull();
    });
  });

  describe('readLiveChat', () => {
    it('should return empty array if YouTube API key is not set', async () => {
      // Remove API key
      delete process.env.YOUTUBE_API_KEY;

      const result = await utils.readLiveChat('test-video-id');

      expect(result).toEqual([]);
      expect(google.youtube).not.toHaveBeenCalled();
    });

    it('should return empty array if no videoId is provided', async () => {
      const result = await utils.readLiveChat();

      expect(result).toEqual([]);
      expect(google.youtube).not.toHaveBeenCalled();
    });

    it('should fetch and return live chat messages', async () => {
      // Mock videos.list to return a live chat ID
      const mockVideosResponse = {
        data: {
          items: [
            {
              liveStreamingDetails: {
                activeLiveChatId: 'test-chat-id'
              }
            }
          ]
        }
      };

      google.youtube().videos.list.mockResolvedValue(mockVideosResponse);

      // Mock liveChatMessages.list to return messages
      const mockMessages = [
        {
          id: 'message1',
          snippet: {
            displayMessage: 'Test message 1'
          },
          authorDetails: {
            displayName: 'Test User 1'
          }
        },
        {
          id: 'message2',
          snippet: {
            displayMessage: 'Test message 2'
          },
          authorDetails: {
            displayName: 'Test User 2'
          }
        }
      ];

      const mockChatResponse = {
        data: {
          items: mockMessages
        }
      };

      google.youtube().liveChatMessages.list.mockResolvedValue(mockChatResponse);

      const result = await utils.readLiveChat('test-video-id');

      expect(result).toEqual(mockMessages);
      expect(google.youtube().videos.list).toHaveBeenCalledWith({
        part: 'liveStreamingDetails',
        id: 'test-video-id'
      });
      expect(google.youtube().liveChatMessages.list).toHaveBeenCalledWith({
        part: 'snippet',
        liveChatId: 'test-chat-id',
        maxResults: 50
      });
    });

    it('should return empty array if no live chat ID is found', async () => {
      // Mock videos.list to return no live chat ID
      const mockVideosResponse = {
        data: {
          items: [
            {
              liveStreamingDetails: {}
            }
          ]
        }
      };

      google.youtube().videos.list.mockResolvedValue(mockVideosResponse);

      const result = await utils.readLiveChat('test-video-id');

      expect(result).toEqual([]);
      expect(google.youtube().liveChatMessages.list).not.toHaveBeenCalled();
    });

    it('should handle errors from liveChatMessages.list', async () => {
      // Mock videos.list to return a live chat ID
      const mockVideosResponse = {
        data: {
          items: [
            {
              liveStreamingDetails: {
                activeLiveChatId: 'test-chat-id'
              }
            }
          ]
        }
      };

      google.youtube().videos.list.mockResolvedValue(mockVideosResponse);

      // Mock liveChatMessages.list to throw an error
      google.youtube().liveChatMessages.list.mockRejectedValue(
        new Error('API Error')
      );

      const result = await utils.readLiveChat('test-video-id');

      expect(result).toEqual([]);
    });
  });
});
