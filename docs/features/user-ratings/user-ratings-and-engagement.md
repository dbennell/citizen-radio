# User Ratings and Engagement System

## 1. Feature Overview

**Feature Name:** User Ratings and Engagement System

**Summary:** A comprehensive system that captures, processes, and utilizes user feedback from live chat to enhance the radio experience. The system collects rating emojis and comments, displays them in the stream overlay, updates MP3 metadata with aggregated ratings, and enables DJs to reference listener feedback during segways.

**Priority:** High

**Target Release:** v1.4.0

## 2. Business Context

**Objective:** Create a more interactive and responsive radio experience by acknowledging listener feedback in real-time and using it to influence content selection and presentation.

**User Stories:**
- "As a listener, I want my ratings and comments to be visible in the stream so I can feel like an active participant."
- "As a listener, I want my feedback to influence future content selection so the station plays more of what I enjoy."
- "As a listener, I want the DJ to acknowledge my comments so I feel heard and valued."
- "As a station operator, I want to collect and analyze listener feedback to improve the station's content."

**Success Metrics:**
- Increased listener participation in chat
- Higher retention of listeners during broadcasts
- More positive sentiment in listener feedback
- Improved content selection based on listener preferences
- Increased social sharing of broadcast moments

## 3. System Architecture

### 3.1 Component Overview

The User Ratings and Engagement System consists of five main components:

1. **Ratings Manager** (`ratingsManager.js`): Core component that handles collection, storage, and processing of user ratings from chat messages.
2. **Overlay Manager** (`overlayManager.js`): Manages the visual overlay with track information and user comments.
3. **Engagement Monitor** (`engagementMonitor.js`): Tracks noteworthy comments for potential reference in segways.
4. **Sentiment Analyzer** (`sentimentAnalyzer.js`): Performs sentiment analysis on user comments.
5. **Orchestrator** (`orchestrator.js`): Coordinates the playback loop and integrates the feedback components.

### 3.2 Data Storage

The system uses several data stores, each with a specific purpose:

1. **chat.log**: JSON array of recent chat messages from the stream.
   - Purpose: Provides a historical record of chat interactions for analysis and debugging.
   - Lifecycle: Automatically pruned to keep only the most recent 1,000 messages to prevent unbounded growth.
   - Archiving: For long streams (e.g., week-long), an archiving mechanism will be implemented to periodically move older messages to date-stamped archive files.

2. **feedback.log**: Temporary storage for feedback until enough entries are collected.
   - Purpose: Acts as a buffer to prevent frequent MP3 metadata updates, which could be resource-intensive.
   - Lifecycle: Entries are removed after being processed and applied to MP3 metadata.
   - Relationship: Purely temporary; no long-term storage implications.

3. **ratings.json**: Persistent storage of ratings data.
   - Purpose: Provides quick access to ratings without parsing MP3 files.
   - Relationship with MP3 Metadata: Serves as a cache and fallback when MP3 metadata is unavailable.
   - Usage: Primary source when metadata integration is disabled; fallback source when enabled.

4. **MP3 Metadata**: Each audio file stores its own rating and sentiment data.
   - Purpose: Embeds ratings directly in audio files for portability and persistence.
   - Primary Source: When metadata integration is enabled, this is the authoritative source for ratings.
   - Advantage: Ratings travel with the files if they're moved or shared.

5. **processed_message_ids.json**: Tracks which chat messages have been processed.
   - Purpose: Prevents duplicate processing of messages, especially after restarts.
   - Optimization: Limited to the most recent 10,000 IDs to prevent unbounded growth.
   - Lifecycle: Cleared at the end of each track to prevent unnecessary accumulation.

### 3.3 Data Flow

1. **Chat Collection**:
   - YouTube chat messages are fetched via API
   - New messages are appended to chat.log
   - Message IDs are tracked to prevent duplicate processing

2. **Rating Extraction**:
   - Messages are scanned for rating emojis
   - Ratings are associated with the currently playing track
   - Ratings are stored in ratings.json and feedback.log

3. **Feedback Processing**:
   - When enough feedback is collected for a track, it's processed in batch
   - Average rating is calculated and sentiment analysis is performed
   - MP3 metadata is updated with the new rating and sentiment
   - Processed feedback is removed from feedback.log

4. **Engagement Monitoring**:
   - Noteworthy comments are identified based on keywords and ratings
   - High-value comments are stored for potential reference in segways
   - Comments expire after a configurable time period

5. **Visual Display**:
   - Recent comments with ratings are displayed in the stream overlay
   - Track information and average rating are shown during playback

## 4. Component Details

### 4.1 Ratings Manager

**Purpose:** Handles all aspects of user feedback and ratings.

**Key Responsibilities:**
- Capturing chat logs from YouTube
- Filtering for rating emojis
- Associating ratings with the correct track
- Storing ratings in ratings.json
- Temporarily storing feedback in feedback.log
- Processing feedback and updating MP3 metadata

**Key Methods:**
- `pollForComments()`: Fetches and processes new chat messages
- `parseRatingFromComment()`: Extracts rating emojis from comments
- `matchRatingToTrack()`: Associates ratings with the correct track
- `updateTrackRating()`: Updates the rating for a track
- `processFeedbackAndUpdateMetadata()`: Processes feedback and updates MP3 metadata

### 4.2 Overlay Manager

**Purpose:** Manages the visual overlay with track information and user comments.

**Key Responsibilities:**
- Rendering track information (title, artist, cover art)
- Displaying user comments with rating emojis
- Updating the overlay in real-time during playback

**Key Methods:**
- `updateOverlay()`: Updates the overlay with new track information and comments
- `renderTextWithEmojiImages()`: Renders text with emoji images

### 4.3 Engagement Monitor

**Purpose:** Tracks noteworthy comments for potential reference in segways.

**Key Responsibilities:**
- Evaluating comments for significance
- Storing high-value comments in memory
- Providing comments for segway generation

**Key Methods:**
- `processComment()`: Evaluates a comment for noteworthiness
- `calculateSignificance()`: Calculates a comment's significance score
- `getCommentForSegway()`: Gets a comment to reference in a segway

### 4.4 Sentiment Analyzer

**Purpose:** Performs sentiment analysis on user comments.

**Key Responsibilities:**
- Analyzing sentiment in comments
- Generating human-readable sentiment summaries
- Identifying themes in feedback

**Key Methods:**
- `analyzeSentiment()`: Analyzes sentiment in a collection of comments
- `generateSummary()`: Generates a human-readable summary of sentiment analysis

## 5. Configuration Options

The User Ratings and Engagement System is highly configurable through the station.json file:

### 5.1 Rating System Configuration

```json
"ratingSystem": {
  "enabled": true,
  "streamDelay": 60,
  "postTrackWindow": 30,
  "commentCheckInterval": 5,
  "defaultRating": 3,
  "minTickets": 1,
  "maxTickets": 5
}
```

### 5.2 Metadata Integration Configuration

```json
"metadataIntegration": {
  "enabled": true,
  "updateThreshold": 5,
  "maxFeedbackPerTrack": 25,
  "fallbackToFile": true
}
```

### 5.3 Enhanced Engagement Configuration

```json
"enhancedEngagement": {
  "enabled": true,
  "maxStoredComments": 3,
  "commentExpirationMinutes": 30,
  "minSignificanceThreshold": 0.6,
  "keywordWeights": {
    "love": 0.8,
    "amazing": 0.7,
    "awesome": 0.7,
    "favorite": 0.9,
    "terrible": 0.8,
    "worst": 0.8
  },
  "ratingWeight": 0.5,
  "segwayReferenceChance": 0.7,
  "useLLMSentimentAnalysis": true
}
```

The `useLLMSentimentAnalysis` option enables advanced sentiment analysis using OpenAI's LLM. When enabled, the system will use the LLM to analyze feedback comments, which is particularly effective for emoji-heavy, slang, and meme-filled comments that traditional keyword-based analysis might miss. The LLM provides more nuanced and human-like sentiment summaries that capture the essence of listener feedback.

## 6. Current Issues and Limitations

### 6.1 Performance Issues

- **Frequent File I/O Operations**: Multiple writes to disk during streaming impact performance.
- **In-Memory Data Structures**: Unbounded growth of processed message IDs.
- **Inefficient Text Processing**: Complex text and emoji processing in the overlay manager.
- **Recursive setTimeout**: Potential memory leaks in the feedback polling mechanism.

### 6.2 Code Quality Issues

- **Large, Monolithic Files**: ratingsManager.js is over 1000 lines and handles too many responsibilities.
- **Duplicate Code**: Similar functionality implemented in multiple places.
- **Inconsistent Error Handling**: Some errors are logged but not properly handled.
- **Limited Modularity**: Tight coupling between components makes testing and maintenance difficult.

### 6.3 Robustness Issues

- **Limited Error Recovery**: Some error scenarios could lead to system instability.
- **Race Conditions**: Potential race conditions in file operations.
- **Memory Management**: No clear strategy for managing memory usage over long periods.
- **Resource Leaks**: Potential for resource leaks in long-running processes.

### 6.4 Maintainability Issues

- **Limited Documentation**: Some complex algorithms lack detailed documentation.
- **Configuration Sprawl**: Configuration options spread across multiple files.
- **Testing Gaps**: Limited automated testing for critical components.
- **Dependency Management**: External dependencies not clearly isolated.

## 7. Implementation Plan

### 7.1 Phase 1: Performance Optimization (High Priority)

1. **Optimize File I/O Operations**
   - Implement buffering for log writes
   - Use write streams instead of synchronous operations
   - Batch updates to ratings.json
   - Implement file rotation and archiving for chat.log
   - Create a mechanism to periodically archive old chat messages to date-stamped files
   - Add configuration options for retention periods and archive frequency

2. **Improve Memory Management**
   - Add size limits to processedMessageIds Set
   - Implement LRU cache for emoji images
   - Add periodic cleanup for in-memory data structures

3. **Fix Recursive setTimeout**
   - Replace with proper interval management
   - Implement cleanup on shutdown
   - Add error handling with backoff strategy

4. **Address Race Conditions**
   - Use atomic file operations for critical updates
   - Implement proper locking for shared resources
   - Use temporary files and atomic renames

### 7.2 Phase 2: Code Reorganization (Medium Priority)

1. **Modularize Ratings Manager**
   - Create ratingCollector.js for chat processing
   - Create ratingStorage.js for data persistence
   - Create metadataUpdater.js for MP3 updates
   - Create ratingAnalytics.js for statistics

2. **Implement Error Recovery**
   - Add retry mechanisms with exponential backoff
   - Implement circuit breakers for external services
   - Create self-healing routines for common failures

3. **Enhance Resource Management**
   - Add explicit cleanup for all resources
   - Implement resource pooling where appropriate
   - Add monitoring for resource usage

4. **Optimize Text and Emoji Processing**
   - Preload and cache emoji images
   - Implement more efficient text parsing
   - Consider canvas caching for repeated elements

### 7.3 Phase 3: Long-term Maintainability (Lower Priority)

1. **Implement Service Layer**
   - Define clear interfaces for each service
   - Implement dependency injection
   - Use service registry pattern

2. **Improve Documentation**
   - Add JSDoc comments for all public methods
   - Create architecture diagrams
   - Document performance characteristics

3. **Consolidate Configuration**
   - Create unified configuration schema
   - Implement validation for all options
   - Document all configuration options

4. **Enhance Testing**
   - Implement unit tests for core components
   - Add integration tests for interactions
   - Create performance tests for critical paths

## 8. Future Enhancements

1. **Advanced Sentiment Analysis** ✓
   - ✓ Integrate with OpenAI's LLM for sophisticated sentiment analysis
   - ✓ Support emoji-based sentiment analysis and slang/meme interpretation
   - Implement multi-language support
   - Enhance sentiment analysis with additional context from previous tracks

2. **User Preference Tracking**
   - Track individual user preferences over time
   - Personalize content based on user ratings
   - Implement user-specific engagement strategies

3. **Interactive Engagement Features**
   - Add polls and voting mechanisms
   - Implement listener request system
   - Create special events based on engagement metrics

4. **Analytics Dashboard**
   - Create a web dashboard for engagement metrics
   - Visualize rating trends over time
   - Provide insights for content selection

5. **Sustainable Storage Solution**
   - Implement database storage for high-volume deployments
     - Use SQLite for local deployments or PostgreSQL for distributed setups
     - Create proper schema with indexes for efficient queries
     - Implement connection pooling and query optimization
   - Add comprehensive data lifecycle management
     - Implement automated pruning based on configurable retention policies
     - Create tiered storage with hot/warm/cold zones based on data age
     - Develop compression strategies for archived data
   - Build advanced data analysis capabilities
     - Create aggregation and reporting tools for historical trends
     - Implement data export functionality for external analysis
     - Develop visualization tools for engagement metrics

## 9. Conclusion

The User Ratings and Engagement System is a critical component of CitizenRadio that enables interactive and responsive broadcasting. By implementing the improvements outlined in this document, the system will become more robust, performant, and maintainable, capable of supporting 24/7 streaming for extended periods.

The phased implementation approach allows for immediate improvements to performance and stability while setting the foundation for long-term maintainability and feature expansion. Each phase builds upon the previous one, creating a path toward a fully optimized system that enhances the listener experience and provides valuable feedback for content creators.
