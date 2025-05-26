# 🔖 Enhanced Engagement System

## 1. Feature Overview
**Feature Name:** Enhanced Engagement System

**Summary:** A lightweight system that monitors live chat for noteworthy comments and ratings, stores them in memory, and enables DJs to reference this feedback during segways, creating a more interactive and responsive radio experience.

**Priority:** Medium

**Target Release:** v1.3.3

## 2. Business Context
**Objective:** Increase listener engagement by acknowledging their feedback in real-time and creating a more interactive experience that makes listeners feel heard and valued.

**User Story:** 
> "As a radio listener, I want my comments and ratings to be acknowledged during broadcasts so that I feel like an active participant rather than a passive consumer."

**Success Metrics:**
- Increased listener participation in chat
- Higher retention of listeners during broadcasts
- More positive sentiment in listener feedback
- Increased social sharing of broadcast moments

## 3. Requirements
**Functional Requirements:**
- [ ] Monitor live chat feed for significant comments and ratings
- [ ] Store the last 3 noteworthy comments in memory
- [ ] Reference these comments during segways between tracks
- [ ] Make all engagement parameters configurable in the default config file
- [ ] Prioritize comments based on engagement value and sentiment

**Non-Functional Requirements:**
- [ ] Minimal memory usage for storing comments
- [ ] No external database dependencies
- [ ] Real-time processing of chat messages
- [ ] Configurable thresholds for comment significance

**Acceptance Criteria:**
- [ ] System correctly identifies and stores noteworthy comments
- [ ] DJ segways include references to listener feedback when appropriate
- [ ] All parameters are configurable through the default config file
- [ ] System handles edge cases (no noteworthy comments, inappropriate content)
- [ ] Performance impact is negligible

## 4. Technical Specification
**Dependencies:**
- Existing `ratingsManager.js` for accessing rating data
- Existing chat monitoring functionality
- Existing segway generation system
- Node.js in-memory data structures

**Architecture Impact:**
- New `engagementMonitor.js` module to track noteworthy comments
- Enhanced integration with segway generation
- Updates to configuration structure

**Data Model Changes:**
- In-memory data structure for noteworthy comments:
  ```javascript
  const noteworthyComments = [
    {
      author: "Username",
      comment: "This track is amazing! Best one today!",
      rating: 5,
      timestamp: "ISO-8601 timestamp",
      significance: 0.85, // 0-1 scale of comment significance
      referenced: false // Whether this has been used in a segway
    },
    // Up to 3 items total
  ];
  ```
- Configuration additions to default.json:
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
    "segwayReferenceChance": 0.7
  }
  ```

**API Changes:**
- New methods in engagementMonitor.js:
  - `processComment(comment)`: Evaluate a comment for noteworthiness
  - `getNoteworthyComments()`: Get the current list of noteworthy comments
  - `markCommentReferenced(commentId)`: Mark a comment as used in a segway
  - `calculateSignificance(comment)`: Calculate a comment's significance score
- Enhanced methods in promptProcessor.js:
  - `generateSegway(currentTrack, nextTrack, noteworthyComments)`: Generate segway with listener feedback

## 5. Implementation Plan
**High-Level Approach:**
- Implement in-memory storage for noteworthy comments
- Create algorithms for determining comment significance
- Enhance segway generation to incorporate listener feedback
- Add configuration options to default.json

**Key Components:**
- **Engagement Monitor**: Tracks and evaluates chat messages
  - Processes incoming chat messages in real-time
  - Calculates significance scores based on content and ratings
  - Maintains a sorted list of the most noteworthy recent comments
  - Expires old comments based on configurable timeframe
- **Segway Enhancer**: Incorporates feedback into transitions
  - Selects appropriate comments to reference in segways
  - Formats listener feedback for natural inclusion in DJ speech
  - Varies reference frequency to maintain freshness
- **Configuration Manager**: Handles engagement settings
  - Provides default values for all parameters
  - Allows customization of significance thresholds and weights
  - Controls feature behavior through configuration

**Implementation Phases:**
1. Develop comment monitoring and significance calculation
   - Implement in-memory storage structure
   - Create significance scoring algorithm
   - Build comment selection and expiration logic
2. Enhance segway generation
   - Modify prompt templates to include listener feedback
   - Implement natural language formatting for comments
   - Create variation in reference frequency and style
3. Add configuration options
   - Update default.json with engagement settings
   - Implement configuration loading and validation
   - Create documentation for customization options

## 6. Testing Strategy
**Unit Tests:**
- [ ] Comment significance calculation
- [ ] Noteworthy comment selection algorithm
- [ ] Comment expiration logic
- [ ] Configuration loading and validation

**Integration Tests:**
- [ ] End-to-end flow from chat message to segway reference
- [ ] Interaction with ratings manager
- [ ] Segway generation with comment incorporation
- [ ] Configuration application

**End-to-End Tests:**
- [ ] Complete listener feedback acknowledgment workflow
- [ ] Variation in segway references
- [ ] Performance under various chat activity levels

**Performance Tests:**
- [ ] Memory usage with continuous operation
- [ ] Processing time for high-volume chat
- [ ] Impact on segway generation time

## 7. Documentation Updates
**User Documentation:**
- [ ] Guide on how listener feedback is acknowledged
- [ ] Explanation of what makes comments noteworthy
- [ ] Instructions for configuring the engagement system

**Developer Documentation:**
- [ ] API documentation for engagement monitoring
- [ ] Configuration options and their effects
- [ ] Integration guide for other system components
- [ ] Algorithm description for significance calculation

## 8. Rollout Plan
**Deployment Strategy:**
- Initial deployment with basic comment monitoring
- Phased addition of segway integration
- Final addition of advanced significance calculation

**Monitoring Plan:**
- Track comment selection frequency
- Monitor memory usage
- Measure impact on segway generation time
- Track listener engagement metrics before and after

**Rollback Plan:**
- Disable enhanced engagement via configuration
- Revert to previous version of segway generation
- Preserve engagement monitoring for future use

## 9. Risks and Mitigations
**Identified Risks:**
- **Inappropriate Content**: Implement keyword filtering and significance penalties for problematic content
- **Memory Leaks**: Use fixed-size data structures and regular cleanup operations
- **Repetitive References**: Track referenced comments and ensure variety in acknowledgments
- **Performance Impact**: Optimize significance calculation and perform in background when possible
- **Low-Quality Segways**: Start with conservative integration and increase based on quality assessment