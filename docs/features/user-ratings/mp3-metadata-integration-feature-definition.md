# 🔖 MP3 Metadata Integration and Sustainable Storage

## 1. Feature Overview
**Feature Name:** MP3 Metadata Integration and Sustainable Storage

**Summary:** A simple yet effective system for storing track ratings and user sentiment in MP3 metadata and feedback files, providing redundant storage and enabling portable ratings that persist with the audio files themselves.

**Priority:** Medium

**Target Release:** v1.3.2

## 2. Business Context
**Objective:** Create a sustainable storage solution for track ratings and user sentiment that preserves this valuable data long-term while keeping implementation simple and avoiding external database dependencies.

**User Story:** 
> "As a radio station operator, I want ratings and sentiment data to be stored directly with my music files so that this information persists even when files are moved or the system is reinstalled."

**Success Metrics:**
- Successful storage and retrieval of ratings from MP3 metadata
- Accurate sentiment summaries derived from user comments
- Efficient storage of feedback with minimal disk space usage
- Reliable fallback mechanism when metadata is unavailable

## 3. Requirements
**Functional Requirements:**
- [ ] Store medium and long-term ratings in MP3 file metadata
- [ ] Maintain a feedback.json file for each track with the last 128 comments
- [ ] Calculate and store user sentiment summaries based on comments
- [ ] Update MP3 metadata when sufficient new feedback is collected
- [ ] Implement a fallback display mechanism when metadata is unavailable
- [ ] Merge new ratings with existing metadata when updating

**Non-Functional Requirements:**
- [ ] Minimal disk space usage for feedback storage
- [ ] No external database dependencies
- [ ] Efficient read/write operations for metadata
- [ ] Backward compatibility with existing rating system

**Acceptance Criteria:**
- [ ] Ratings are successfully stored in and retrieved from MP3 metadata
- [ ] Each track has its own feedback.json file limited to 128 recent comments
- [ ] System correctly calculates new ratings and sentiment when feedback threshold is reached
- [ ] Display system correctly falls back to feedback.json when metadata is unavailable
- [ ] Ratings persist when files are moved within the system

## 4. Technical Specification
**Dependencies:**
- Existing `ratingsManager.js` for accessing rating data
- Node-ID3 library for MP3 metadata manipulation
- Node.js file system API for feedback file management
- Existing ratings.json storage for backward compatibility

**Architecture Impact:**
- Enhanced `ratingsManager.js` with metadata read/write capabilities
- New `feedbackManager.js` module to handle per-track feedback files
- New `sentimentAnalyzer.js` module for basic sentiment analysis

**Data Model Changes:**
- New per-track feedback.json file structure:
  ```json
  {
    "trackPath": "path/to/track.mp3",
    "lastUpdated": "ISO-8601 timestamp",
    "currentRating": 4.2,
    "sentimentSummary": "Mostly positive with praise for the beat and lyrics",
    "feedbackCount": 128,
    "feedback": [
      {
        "author": "User123",
        "comment": "Love this track! Great beat!",
        "rating": 5,
        "timestamp": "ISO-8601 timestamp"
      },
      ...
    ]
  }
  ```
- MP3 metadata structure (using ID3v2 tags):
  - TXXX:RATING - Custom frame for numerical rating (e.g., "4.2")
  - TXXX:RATING_COUNT - Custom frame for number of ratings (e.g., "128")
  - TXXX:SENTIMENT - Custom frame for sentiment summary text
  - TXXX:LAST_UPDATED - Custom frame for timestamp of last update

**API Changes:**
- New methods in ratingsManager.js:
  - `readRatingFromMetadata(trackPath)`: Extract rating data from MP3 metadata
  - `writeRatingToMetadata(trackPath, ratingData)`: Store rating data in MP3 metadata
  - `getRatingWithFallback(trackPath)`: Get rating from metadata or feedback.json
- New methods in feedbackManager.js:
  - `addFeedback(trackPath, feedbackData)`: Add new feedback to track's feedback.json
  - `getFeedback(trackPath)`: Get feedback for a specific track
  - `processFeedbackThreshold(trackPath)`: Calculate new rating when threshold reached
- New methods in sentimentAnalyzer.js:
  - `analyzeSentiment(comments)`: Generate sentiment summary from comments

## 5. Implementation Plan
**High-Level Approach:**
- Implement feedback.json file management for each track
- Create MP3 metadata read/write functionality
- Develop simple sentiment analysis for comment summarization
- Implement fallback mechanism for rating display

**Key Components:**
- **Feedback Manager**: Handles per-track feedback storage
  - Creates and maintains feedback.json files
  - Limits storage to 128 most recent comments
  - Triggers rating recalculation when threshold reached
- **Metadata Handler**: Manages MP3 metadata operations
  - Reads and writes custom rating tags
  - Ensures data consistency between feedback and metadata
  - Handles edge cases like missing or corrupt metadata
- **Sentiment Analyzer**: Processes comments for sentiment
  - Performs basic keyword analysis for sentiment
  - Generates human-readable sentiment summaries
  - Identifies common themes in feedback

**Implementation Phases:**
1. Develop feedback file management system
   - Implement per-track feedback.json creation and updates
   - Create comment storage with 128-item limit
   - Build rating recalculation logic
2. Implement MP3 metadata integration
   - Add metadata read/write functionality
   - Create merging logic for existing metadata
   - Develop fallback mechanism
3. Create sentiment analysis component
   - Implement basic keyword-based sentiment analysis
   - Build summary generation functionality
   - Integrate with feedback processing

## 6. Testing Strategy
**Unit Tests:**
- [ ] Feedback file creation and management
- [ ] MP3 metadata read/write operations
- [ ] Sentiment analysis accuracy
- [ ] Rating calculation from feedback

**Integration Tests:**
- [ ] End-to-end flow from comments to feedback to metadata
- [ ] Fallback mechanism when metadata is unavailable
- [ ] Threshold-based processing and updates
- [ ] File system operations for feedback persistence

**End-to-End Tests:**
- [ ] Complete feedback collection and processing workflow
- [ ] Rating display with various data availability scenarios
- [ ] File movement and metadata persistence

**Performance Tests:**
- [ ] Metadata read/write performance with large files
- [ ] Feedback processing time with many comments
- [ ] Disk space usage with multiple tracks

## 7. Documentation Updates
**User Documentation:**
- [ ] Guide on how ratings are stored and displayed
- [ ] Explanation of sentiment summaries and their meaning
- [ ] Instructions for manually updating metadata

**Developer Documentation:**
- [ ] API documentation for feedback and metadata modules
- [ ] Data format specifications for feedback.json
- [ ] MP3 metadata tag specifications
- [ ] Integration guide for other system components

## 8. Rollout Plan
**Deployment Strategy:**
- Initial deployment with feedback file functionality
- Phased addition of metadata integration
- Final addition of sentiment analysis

**Monitoring Plan:**
- Track feedback file sizes and growth
- Monitor metadata read/write operations
- Measure sentiment analysis accuracy
- Track fallback mechanism usage

**Rollback Plan:**
- Disable metadata integration via configuration
- Revert to previous version of affected modules
- Preserve collected feedback data

## 9. Risks and Mitigations
**Identified Risks:**
- **Metadata Corruption**: Implement safe read/write operations with validation and backup
- **Disk Space Growth**: Use fixed-size feedback storage with oldest-item removal
- **Sentiment Analysis Accuracy**: Start with simple keyword-based approach and improve iteratively
- **Performance Impact**: Optimize metadata operations and perform updates in background
- **File Movement Issues**: Use relative paths where possible and implement path resolution logic