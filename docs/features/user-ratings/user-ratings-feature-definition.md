# 🔖 User Ratings System

## 1. Feature Overview
**Feature Name:** Enhanced User Ratings System

**Summary:** A comprehensive system that captures, displays, and analyzes listener feedback on tracks in real-time through stream chat, enabling data-driven content curation and increased audience engagement.

**Priority:** High

**Target Release:** v1.3.0

## 2. Business Context
**Objective:** Create a seamless feedback loop between listeners and the station that influences content selection while providing real-time engagement and long-term content quality improvement.

**User Story:** 
> "As a radio station listener, I want to rate tracks in real-time and see other listeners' ratings so that I can engage with the community and influence the station's content."

**Success Metrics:**
- Increased listener engagement measured by number of ratings submitted
- Improved content quality measured by average track ratings over time
- Higher listener retention during streams with rating functionality enabled

## 3. Requirements
**Functional Requirements:**
- [ ] Capture user ratings from stream chat comments in real-time
- [ ] Display recent ratings on the stream video overlay
- [ ] Log all ratings for future analysis and review
- [ ] Generate and maintain analysis files of top/bottom rated tracks by content type
- [ ] Support rating persistence through multiple storage mechanisms
- [ ] Enable filtering and action-taking based on rating analytics

**Non-Functional Requirements:**
- [ ] Real-time processing of stream chat with minimal latency (<2 seconds)
- [ ] Scalable storage solution that can handle unlimited ratings
- [ ] Fault-tolerant system that preserves ratings during system failures
- [ ] Resource-efficient implementation with minimal impact on stream performance

**Acceptance Criteria:**
- [ ] Stream overlay displays up to 8 most recent ratings from the last 2 minutes
- [ ] Each displayed rating shows username, rating value, and timestamp
- [ ] All ratings are logged to persistent storage for later analysis
- [ ] System generates updated top 10 and bottom 10 lists for each content type (music/dj/podcast/ads)
- [ ] Rating information can be exported to MP3 metadata for long-term storage
- [ ] System handles high volumes of simultaneous ratings without performance degradation

## 4. Technical Specification
**Dependencies:**
- YouTube Data API for accessing stream chat
- Existing `trackManager.js` for content selection integration
- Existing `promptProcessor.js` for DJ response generation
- Stream overlay system for displaying ratings
- MP3 metadata manipulation libraries

**Architecture Impact:**
- New `ratingManager.js` module to handle rating capture, storage, and analysis
- Modified stream overlay to display real-time ratings
- Enhanced track selection logic to incorporate rating data
- New analytics module for generating top/bottom lists by content type

**Data Model Changes:**
- Enhanced ratings.json structure to include:
  - Track metadata (type, artist, title)
  - Individual ratings with user information
  - Aggregated statistics
  - Timestamp information
- New analysis.json file for storing pre-computed analytics:
  - Top/bottom 10 tracks by type
  - Rating trends over time
  - User engagement metrics

**API Changes:**
- New internal methods for rating capture, storage, and retrieval
- New endpoints for accessing rating analytics
- Enhanced track selection API to incorporate rating weights

## 5. Implementation Plan
**High-Level Approach:**
- Enhance the existing rating system with real-time display capabilities
- Implement sustainable storage solutions with multiple persistence options
- Create analytics engine for generating actionable insights from ratings
- Integrate with stream overlay for real-time display

**Key Components:**
- **Enhanced RatingManager**: Captures, processes, and stores ratings from stream chat
- **Rating Overlay System**: Displays recent ratings on the stream video
- **Rating Analytics Engine**: Generates top/bottom lists and other insights
- **Storage Manager**: Handles multiple persistence mechanisms including file-based and MP3 metadata
- **Action Recommendation System**: Suggests tracks to remove or promote based on ratings

**Implementation Phases:**
1. Enhance rating capture from stream chat with improved parsing and user identification
2. Implement real-time overlay display of recent ratings
3. Develop sustainable storage solution with file rotation and archiving
4. Create analytics engine for generating top/bottom lists by content type
5. Implement MP3 metadata storage capability
6. Develop action recommendation system based on rating analytics

## 6. Testing Strategy
**Unit Tests:**
- [ ] Rating parsing from different chat formats
- [ ] Rating storage and retrieval functions
- [ ] Analytics calculation algorithms
- [ ] MP3 metadata read/write operations

**Integration Tests:**
- [ ] End-to-end flow from chat comment to stored rating
- [ ] Overlay display update with new ratings
- [ ] Track selection influenced by ratings
- [ ] Analytics generation and storage

**End-to-End Tests:**
- [ ] Complete listener feedback cycle from rating submission to content selection
- [ ] Performance under high volume of simultaneous ratings
- [ ] Long-term storage and retrieval of historical ratings

**Performance Tests:**
- [ ] Stream chat processing under high load
- [ ] Storage system performance with large rating datasets
- [ ] Overlay rendering with frequent updates
- [ ] Analytics generation with extensive rating history

## 7. Documentation Updates
**User Documentation:**
- [ ] Guide for listeners on how to submit ratings via chat
- [ ] Explanation of rating display on stream overlay
- [ ] Description of how ratings influence content selection

**Developer Documentation:**
- [ ] API documentation for the enhanced rating system
- [ ] Storage format specifications
- [ ] Analytics calculation methodologies
- [ ] Integration points with other system components

## 8. Rollout Plan
**Deployment Strategy:**
- Phased rollout starting with rating capture and storage
- Add overlay display in second phase
- Introduce analytics and action recommendations in final phase
- Use feature flags to enable/disable components independently

**Monitoring Plan:**
- Track rating submission volume and processing times
- Monitor storage growth and performance
- Measure impact on stream performance
- Track user engagement metrics before and after feature release

**Rollback Plan:**
- Disable feature flags for individual components
- Revert to previous version of affected modules
- Preserve collected ratings data for future use

## 9. Risks and Mitigations
**Identified Risks:**
- **Storage Growth**: Implement file rotation, archiving, and compression strategies
- **API Rate Limits**: Use caching and batched processing for YouTube API calls
- **Spam/Abuse**: Implement rate limiting and filtering for user submissions
- **Performance Impact**: Optimize processing and use background workers for intensive operations
- **Data Loss**: Implement redundant storage and regular backups

## 10. Sustainability Considerations
**Long-term Storage Strategy:**
- Implement rolling file system with archiving for older ratings
- Compress and archive ratings by time period (monthly/yearly)
- Store aggregate statistics permanently while sampling individual ratings
- Use MP3 metadata as secondary long-term storage for track-specific ratings

**MP3 Metadata Integration:**
- Store average rating and rating count in ID3v2 tags
- Use custom tags for detailed rating information
- Implement bidirectional sync between ratings database and MP3 metadata
- Provide tools for bulk metadata updates and reconciliation

## 11. Analytics and Action Driving
**Automated Analysis:**
- Generate daily updated lists of top/bottom 10 tracks by content type
- Calculate rating trends over time for content categories
- Identify outlier tracks (significantly above/below average)
- Track user engagement patterns and correlations with content

**Action Recommendations:**
- Flag tracks below threshold rating for review/removal
- Highlight top-rated tracks for increased play frequency
- Generate reports for content acquisition guidance
- Provide DJ with real-time feedback on audience reception

## 12. Real-time Engagement Ideas
**Enhanced Interaction:**
- DJ acknowledgment of ratings in real-time
- "Rating challenges" for specific tracks or time periods
- Milestone celebrations for highly-rated tracks
- Listener leaderboards for most active raters
- Rating-triggered special events or content
- Collaborative rating goals with rewards upon reaching thresholds
- Time-limited voting windows for special content selection