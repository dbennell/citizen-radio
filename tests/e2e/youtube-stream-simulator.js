/**
 * YouTube Live Stream Simulator
 * 
 * This module provides a mock YouTube API server that simulates a live stream
 * with chat messages. It can be used for end-to-end testing of the YouTube
 * integration without making actual API calls.
 */

const http = require('http');
const url = require('url');
const querystring = require('querystring');

class YouTubeStreamSimulator {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8089,
      videoId: options.videoId || 'test-video-id',
      liveChatId: options.liveChatId || 'test-live-chat-id',
      rateLimitThreshold: options.rateLimitThreshold || 10,
      errorRate: options.errorRate || 0.05, // 5% chance of error
      ...options
    };
    
    this.server = null;
    this.requestCount = 0;
    this.chatMessages = [];
    this.nextPageToken = null;
    this.isLive = true;
  }

  /**
   * Start the mock server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.server) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve) => {
      this.server = http.createServer(this.handleRequest.bind(this));
      this.server.listen(this.options.port, () => {
        console.log(`YouTube Stream Simulator running on port ${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the mock server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('YouTube Stream Simulator stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   */
  handleRequest(req, res) {
    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname;
    
    // Increment request counter for rate limiting simulation
    this.requestCount++;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          code: 500,
          message: 'Internal server error',
          errors: [{ message: 'Simulated random error' }]
        }
      }));
      return;
    }
    
    // Simulate rate limiting
    if (this.requestCount > this.options.rateLimitThreshold) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          code: 429,
          message: 'Rate limit exceeded',
          errors: [{ message: 'Quota exceeded for quota metric \'Queries\'' }]
        }
      }));
      return;
    }
    
    // Handle different API endpoints
    if (pathname === '/youtube/v3/videos') {
      this.handleVideosRequest(req, res);
    } else if (pathname === '/youtube/v3/liveChatMessages') {
      this.handleLiveChatMessagesRequest(req, res);
    } else if (pathname === '/youtube/v3/liveBroadcasts') {
      this.handleLiveBroadcastsRequest(req, res);
    } else if (pathname === '/youtube/v3/search') {
      this.handleSearchRequest(req, res);
    } else if (pathname === '/simulator/control') {
      this.handleControlRequest(req, res, parsedUrl);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handle requests to the videos endpoint
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   */
  handleVideosRequest(req, res) {
    const query = url.parse(req.url, true).query;
    
    if (query.id === this.options.videoId) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'youtube#videoListResponse',
        items: [{
          id: this.options.videoId,
          snippet: {
            title: 'Test Live Stream',
            description: 'This is a simulated live stream for testing',
            publishedAt: new Date().toISOString()
          },
          liveStreamingDetails: {
            activeLiveChatId: this.isLive ? this.options.liveChatId : null,
            concurrentViewers: '42',
            actualStartTime: new Date(Date.now() - 3600000).toISOString() // Started 1 hour ago
          }
        }]
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'youtube#videoListResponse',
        items: []
      }));
    }
  }

  /**
   * Handle requests to the liveChatMessages endpoint
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   */
  handleLiveChatMessagesRequest(req, res) {
    const query = url.parse(req.url, true).query;
    
    if (query.liveChatId === this.options.liveChatId) {
      // Generate a new page token for pagination
      const newPageToken = `page-token-${Date.now()}`;
      
      // Get messages since the last request
      const messages = this.chatMessages.slice();
      this.chatMessages = []; // Clear the queue
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'youtube#liveChatMessageListResponse',
        nextPageToken: newPageToken,
        pollingIntervalMillis: 5000,
        pageInfo: {
          totalResults: messages.length,
          resultsPerPage: messages.length
        },
        items: messages
      }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          code: 400,
          message: 'Invalid live chat ID',
          errors: [{ message: 'The specified live chat is not active' }]
        }
      }));
    }
  }

  /**
   * Handle requests to the liveBroadcasts endpoint
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   */
  handleLiveBroadcastsRequest(req, res) {
    if (this.isLive) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'youtube#liveBroadcastListResponse',
        items: [{
          id: this.options.videoId,
          snippet: {
            title: 'Test Live Stream',
            description: 'This is a simulated live stream for testing',
            publishedAt: new Date().toISOString()
          },
          status: {
            lifeCycleStatus: 'live'
          }
        }]
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'youtube#liveBroadcastListResponse',
        items: []
      }));
    }
  }

  /**
   * Handle requests to the search endpoint
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   */
  handleSearchRequest(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      kind: 'youtube#searchListResponse',
      items: [{
        id: {
          kind: 'youtube#video',
          videoId: this.options.videoId
        },
        snippet: {
          title: 'Test Live Stream',
          description: 'This is a simulated live stream for testing',
          publishedAt: new Date().toISOString()
        }
      }]
    }));
  }

  /**
   * Handle control requests to the simulator
   * @param {http.IncomingMessage} req - The request object
   * @param {http.ServerResponse} res - The response object
   * @param {url.UrlWithParsedQuery} parsedUrl - The parsed URL
   */
  handleControlRequest(req, res, parsedUrl) {
    const query = querystring.parse(parsedUrl.query);
    const action = query.action;
    
    if (action === 'addMessage') {
      this.addChatMessage(query.message, query.author);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Chat message added' }));
    } else if (action === 'setLiveStatus') {
      this.isLive = query.status === 'true';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Live status set to ${this.isLive}` }));
    } else if (action === 'resetRateLimit') {
      this.requestCount = 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Rate limit counter reset' }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid action' }));
    }
  }

  /**
   * Add a chat message to the simulator
   * @param {string} message - The message text
   * @param {string} author - The author name
   */
  addChatMessage(message, author = 'TestUser') {
    const id = `message-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const publishedAt = new Date().toISOString();
    
    this.chatMessages.push({
      kind: 'youtube#liveChatMessage',
      id,
      snippet: {
        type: 'textMessageEvent',
        liveChatId: this.options.liveChatId,
        authorChannelId: `channel-${author}`,
        publishedAt,
        hasDisplayContent: true,
        displayMessage: message
      },
      authorDetails: {
        channelId: `channel-${author}`,
        displayName: author,
        isChatOwner: false,
        isChatSponsor: false,
        isChatModerator: false
      }
    });
  }

  /**
   * Add multiple chat messages with ratings
   * @param {number} count - Number of messages to add
   */
  addRatingMessages(count = 5) {
    const emojis = ['👍', '❤️', '😍', '👎', '😐'];
    const authors = ['User1', 'User2', 'User3', 'User4', 'User5'];
    const messages = [
      'Great song',
      'Love this track',
      'Not my favorite',
      'Amazing music',
      'Meh, it\'s okay'
    ];
    
    for (let i = 0; i < count; i++) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const author = authors[Math.floor(Math.random() * authors.length)];
      const messageBase = messages[Math.floor(Math.random() * messages.length)];
      const message = `${messageBase} ${emoji}`;
      
      this.addChatMessage(message, author);
    }
  }
}

module.exports = YouTubeStreamSimulator;