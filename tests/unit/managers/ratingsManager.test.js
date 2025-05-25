const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/utils', () => ({
  readLiveChat: jest.fn()
}));
jest.mock('../../../src/core/config', () => ({
  STATION_CONFIG: {
    ratingSystem: {
      enabled: true,
      streamDelay: 60,
      defaultRating: 3,
      minTickets: 1,
      maxTickets: 5
    }
  }
}));

// Import mocked dependencies
const utils = require('../../../src/utils');

// Import the module under test
const ratingsManager = require('../../../src/managers/ratingsManager');

describe('Ratings Manager', () => {
  // Mock console methods
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  // Sample data
  const sampleRatings = {
    'data/ready/music/track1.mp3': {
      averageRating: 4.5,
      ratingCount: 2,
      lastUpdated: '2023-05-25T12:00:00.000Z',
      ratings: [
        {
          value: 4,
          timestamp: '2023-05-25T11:59:00.000Z',
          author: 'User1',
          comment: 'Great song 👍'
        },
        {
          value: 5,
          timestamp: '2023-05-25T12:00:00.000Z',
          author: 'User2',
          comment: 'Love this! ❤️'
        }
      ]
    }
  };

  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    
    // Mock fs
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(sampleRatings));
    fs.writeFileSync.mockImplementation(() => {});
    
    // Mock utils
    utils.readLiveChat.mockResolvedValue([]);
    
    // Reset date
    jest.spyOn(global, 'Date').mockImplementation(() => ({
      toISOString: () => '2023-05-25T12:00:00.000Z',
      getTime: () => 1684929600000 // 2023-05-25T12:00:00.000Z
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should load ratings from file', () => {
    const ratings = ratingsManager.loadRatings();
    
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('data/ratings.json'));
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('data/ratings.json'), 'utf8');
    expect(ratings).toEqual(sampleRatings);
  });

  test('should handle errors when loading ratings', () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error('Read error');
    });
    
    const ratings = ratingsManager.loadRatings();
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Error loading ratings:',
      expect.any(Error)
    );
    expect(ratings).toEqual({});
  });

  test('should save ratings to file', () => {
    const success = ratingsManager.saveRatings(sampleRatings);
    
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('data/ratings.json'),
      JSON.stringify(sampleRatings, null, 2)
    );
    expect(success).toBe(true);
  });

  test('should handle errors when saving ratings', () => {
    fs.writeFileSync.mockImplementation(() => {
      throw new Error('Write error');
    });
    
    const success = ratingsManager.saveRatings(sampleRatings);
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Error saving ratings:',
      expect.any(Error)
    );
    expect(success).toBe(false);
  });

  test('should parse rating from comment with emoji', () => {
    const comment = {
      snippet: {
        publishedAt: '2023-05-25T12:00:00.000Z',
        displayMessage: 'Great song 👍'
      },
      authorDetails: {
        displayName: 'TestUser'
      }
    };
    
    const rating = ratingsManager.parseRatingFromComment(comment);
    
    expect(rating).toEqual({
      value: 4,
      timestamp: '2023-05-25T12:00:00.000Z',
      author: 'TestUser',
      comment: 'Great song 👍'
    });
  });

  test('should return null for comments without rating emoji', () => {
    const comment = {
      snippet: {
        publishedAt: '2023-05-25T12:00:00.000Z',
        displayMessage: 'Great song without emoji'
      },
      authorDetails: {
        displayName: 'TestUser'
      }
    };
    
    const rating = ratingsManager.parseRatingFromComment(comment);
    
    expect(rating).toBeNull();
  });

  test('should match rating to currently playing track', () => {
    // Set up currently playing track
    ratingsManager.setCurrentlyPlaying({
      rel: 'data/ready/music/track1.mp3',
      title: 'Test Track',
      artist: 'Test Artist',
      type: 'music'
    });
    
    // Open comment window
    ratingsManager.openCommentWindow();
    
    const rating = {
      value: 5,
      timestamp: '2023-05-25T12:00:00.000Z',
      author: 'TestUser',
      comment: 'Love this! ❤️'
    };
    
    const match = ratingsManager.matchRatingToTrack(rating);
    
    expect(match).toEqual({
      track: 'data/ready/music/track1.mp3',
      rating
    });
  });

  test('should not match rating if no track is playing', () => {
    // Reset currently playing track
    ratingsManager.setCurrentlyPlaying(null);
    
    const rating = {
      value: 5,
      timestamp: '2023-05-25T12:00:00.000Z',
      author: 'TestUser',
      comment: 'Love this! ❤️'
    };
    
    const match = ratingsManager.matchRatingToTrack(rating);
    
    expect(match).toBeNull();
  });

  test('should update track rating', () => {
    const trackPath = 'data/ready/music/new-track.mp3';
    const ratingData = {
      value: 5,
      timestamp: '2023-05-25T12:00:00.000Z',
      author: 'TestUser',
      comment: 'Love this! ❤️'
    };
    
    ratingsManager.updateTrackRating(trackPath, ratingData);
    
    // Check that saveRatings was called with updated ratings
    expect(fs.writeFileSync).toHaveBeenCalled();
    const savedRatings = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(savedRatings[trackPath]).toBeDefined();
    expect(savedRatings[trackPath].averageRating).toBe(5);
    expect(savedRatings[trackPath].ratingCount).toBe(1);
    expect(savedRatings[trackPath].ratings).toContainEqual(ratingData);
  });

  test('should update existing track rating', () => {
    const trackPath = 'data/ready/music/track1.mp3';
    const ratingData = {
      value: 3,
      timestamp: '2023-05-25T12:01:00.000Z',
      author: 'TestUser3',
      comment: 'It\'s okay 🫳'
    };
    
    ratingsManager.updateTrackRating(trackPath, ratingData);
    
    // Check that saveRatings was called with updated ratings
    expect(fs.writeFileSync).toHaveBeenCalled();
    const savedRatings = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(savedRatings[trackPath].averageRating).toBe(4); // (4 + 5 + 3) / 3 = 4
    expect(savedRatings[trackPath].ratingCount).toBe(3);
    expect(savedRatings[trackPath].ratings).toHaveLength(3);
    expect(savedRatings[trackPath].ratings).toContainEqual(ratingData);
  });

  test('should calculate tickets based on rating', () => {
    expect(ratingsManager.getTicketsForTrack(1)).toBe(1);
    expect(ratingsManager.getTicketsForTrack(3)).toBe(3);
    expect(ratingsManager.getTicketsForTrack(5)).toBe(5);
    expect(ratingsManager.getTicketsForTrack(0)).toBe(1); // Min tickets
    expect(ratingsManager.getTicketsForTrack(10)).toBe(5); // Max tickets
    expect(ratingsManager.getTicketsForTrack(null)).toBe(3); // Default rating
  });

  test('should open and close comment window', () => {
    const startTime = ratingsManager.openCommentWindow();
    expect(startTime).toBe('2023-05-25T12:00:00.000Z');
    
    const endTime = ratingsManager.closeCommentWindow();
    expect(endTime).toBe('2023-05-25T12:00:00.000Z');
  });

  test('should poll for comments and update ratings', async () => {
    // Set up currently playing track
    ratingsManager.setCurrentlyPlaying({
      rel: 'data/ready/music/track1.mp3',
      title: 'Test Track',
      artist: 'Test Artist',
      type: 'music'
    });
    
    // Open and close comment window
    ratingsManager.openCommentWindow();
    ratingsManager.closeCommentWindow();
    
    // Mock chat messages
    utils.readLiveChat.mockResolvedValue([
      {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Great song 👍'
        },
        authorDetails: {
          displayName: 'TestUser1'
        }
      },
      {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Love this! ❤️'
        },
        authorDetails: {
          displayName: 'TestUser2'
        }
      },
      {
        snippet: {
          publishedAt: '2023-05-25T11:59:00.000Z', // Outside window
          displayMessage: 'Previous song 👎'
        },
        authorDetails: {
          displayName: 'TestUser3'
        }
      }
    ]);
    
    const count = await ratingsManager.pollForComments('test-video-id');
    
    expect(count).toBe(2); // Two valid ratings processed
    expect(utils.readLiveChat).toHaveBeenCalledWith('test-video-id');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('should get rating for track', () => {
    const rating = ratingsManager.getRatingForTrack('data/ready/music/track1.mp3');
    expect(rating).toBe(4.5);
    
    const nonExistentRating = ratingsManager.getRatingForTrack('data/ready/music/non-existent.mp3');
    expect(nonExistentRating).toBeNull();
  });
});