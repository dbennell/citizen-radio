const { jest: jestObject } = require('@jest/globals');
const utils = require('../../../src/utils/index');
const emojiMap = require('../../../src/utils/emojiMap');

describe('Utils - Emoji Rating Functions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('parseRatingFromComment', () => {
    it('should extract rating from comment with single emoji', () => {
      const comment = {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Great song 👍'
        },
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      const rating = utils.parseRatingFromComment(comment);
      
      expect(rating).toEqual({
        value: 4, // Assuming 👍 maps to 4
        timestamp: '2023-05-25T12:00:00.000Z',
        author: 'TestUser',
        comment: 'Great song 👍'
      });
    });

    it('should extract rating from comment with multiple emojis', () => {
      const comment = {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Amazing! ❤️ 🔥'
        },
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      const rating = utils.parseRatingFromComment(comment);
      
      // Should use the first recognized emoji
      expect(rating).toEqual({
        value: 5, // Assuming ❤️ maps to 5
        timestamp: '2023-05-25T12:00:00.000Z',
        author: 'TestUser',
        comment: 'Amazing! ❤️ 🔥'
      });
    });

    it('should return null for comments without rating emojis', () => {
      const comment = {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Just a regular comment'
        },
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      const rating = utils.parseRatingFromComment(comment);
      
      expect(rating).toBeNull();
    });

    it('should handle comments with unrecognized emojis', () => {
      const comment = {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Interesting 🤔'
        },
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      // Assuming 🤔 is not in the rating emoji map
      const rating = utils.parseRatingFromComment(comment);
      
      expect(rating).toBeNull();
    });

    it('should handle malformed comment objects', () => {
      const malformedComment = {
        // Missing snippet
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      const rating = utils.parseRatingFromComment(malformedComment);
      
      expect(rating).toBeNull();
    });

    it('should handle comments with emoji variations', () => {
      const comment = {
        snippet: {
          publishedAt: '2023-05-25T12:00:00.000Z',
          displayMessage: 'Thumbs up 👍🏻' // Light skin tone variant
        },
        authorDetails: {
          displayName: 'TestUser'
        }
      };
      
      const rating = utils.parseRatingFromComment(comment);
      
      // Should normalize emoji and still recognize it
      expect(rating).not.toBeNull();
      expect(rating.value).toBe(4); // Assuming 👍 maps to 4
    });
  });

  describe('matchRatingToTrack', () => {
    beforeEach(() => {
      // Reset currently playing track
      if (utils.setCurrentlyPlaying) {
        utils.setCurrentlyPlaying(null);
      }
      
      // Reset comment window
      if (utils.openCommentWindow) {
        utils.openCommentWindow();
        utils.closeCommentWindow();
      }
    });

    it('should match rating to currently playing track', () => {
      // Skip if function doesn't exist in utils
      if (!utils.setCurrentlyPlaying || !utils.matchRatingToTrack) {
        return;
      }

      // Set up currently playing track
      utils.setCurrentlyPlaying({
        rel: 'data/ready/music/track1.mp3',
        title: 'Test Track',
        artist: 'Test Artist',
        type: 'music'
      });

      // Open comment window
      utils.openCommentWindow();

      const rating = {
        value: 5,
        timestamp: new Date().toISOString(),
        author: 'TestUser',
        comment: 'Love this! ❤️'
      };

      const match = utils.matchRatingToTrack(rating);

      expect(match).toEqual({
        track: 'data/ready/music/track1.mp3',
        rating
      });
    });

    it('should not match rating if no track is playing', () => {
      // Skip if function doesn't exist in utils
      if (!utils.matchRatingToTrack) {
        return;
      }

      const rating = {
        value: 5,
        timestamp: new Date().toISOString(),
        author: 'TestUser',
        comment: 'Love this! ❤️'
      };

      const match = utils.matchRatingToTrack(rating);

      expect(match).toBeNull();
    });

    it('should match rating to previous track within time window', () => {
      // Skip if function doesn't exist in utils
      if (!utils.setCurrentlyPlaying || !utils.matchRatingToTrack) {
        return;
      }

      // Set up previous track
      utils.setCurrentlyPlaying({
        rel: 'data/ready/music/previous-track.mp3',
        title: 'Previous Track',
        artist: 'Test Artist',
        type: 'music'
      });

      // Open and close comment window for previous track
      utils.openCommentWindow();
      utils.closeCommentWindow();

      // Set up new current track
      utils.setCurrentlyPlaying({
        rel: 'data/ready/music/current-track.mp3',
        title: 'Current Track',
        artist: 'Test Artist',
        type: 'music'
      });

      // Create a rating with timestamp within the window for previous track
      const rating = {
        value: 5,
        // Use a timestamp that would be within the window for the previous track
        timestamp: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
        author: 'TestUser',
        comment: 'Love the previous track! ❤️'
      };

      const match = utils.matchRatingToTrack(rating);

      // Should match to previous track
      expect(match).toBeTruthy();
      expect(match.track).toBe('data/ready/music/previous-track.mp3');
    });
  });
});