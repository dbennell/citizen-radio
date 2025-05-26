# User Ratings System Review and Implementation Guide

## Overview
This document provides a comprehensive review of the user ratings system in CitizenRadio and offers clear implementation guidelines to address identified issues and align with the intended behavior.

## Rating System Process Flow

### 1. Comment Collection and Processing
- Comments are collected from YouTube chat during track playback at intervals defined by `commentCheckInterval`
- Comments are checked for recognized emojis that represent ratings (1-5 stars)
- Valid ratings are added to:
  - Live display overlay shown over the current track image
  - The `ratings.json` file for the corresponding track

### 2. Track Completion
- When a track finishes playing, the in-memory list of comments is cleared for the next track
- The comment window is closed, preventing further comments from being associated with the completed track

### 3. Threshold Processing
- When the number of feedback items stored in `ratings.json` for a given track reaches or exceeds the `updateThreshold`:
  - Calculate an average score from all feedback items for that track
  - Process all items to generate a sentiment analysis
  - Merge the calculated score with the metadata in the MP3 file:
    - Take the score in the MP3 file and the calculated score
    - Average the two together and store the result back in the file
    - Add the current sentiment to the list of feedback comments to get a new sentiment statement
  - Clear out all feedback items for that track in `ratings.json` (keeping a small number for display purposes)

### 4. Metadata Integration
- The `fallbackToFile` setting determines the source of truth for displayed ratings:
  - When `true`: If MP3 metadata is unavailable, fall back to using ratings from `ratings.json`
  - When `false`: Always use the MP3 metadata for displayed ratings, ignoring `ratings.json`

## Configuration Settings Explained

### `metadataIntegration` Settings
- `enabled`: Enables/disables the entire metadata integration feature
- `updateThreshold`: The number of feedback items required before processing and updating MP3 metadata (recommended: 5)
- `maxFeedbackPerTrack`: The maximum number of feedback items to store in `ratings.json` before forcing an update (recommended: 25)
- `sentimentAnalysis`: Enables/disables sentiment analysis of feedback comments
- `fallbackToFile`: When true, allows falling back to `ratings.json` if MP3 metadata is unavailable

### `ratingSystem` Settings
- `enabled`: Enables/disables the entire rating system
- `defaultRating`: Default rating value for tracks without ratings (1-5)
- `minTickets`/`maxTickets`: Range for the number of "tickets" a track gets in the selection algorithm based on rating
- `ratingPersistence`: Enables/disables saving ratings to disk
- `displayOnStream`: Enables/disables showing ratings on the stream overlay
- `streamDelay`: Delay in seconds to account for stream latency when matching comments to tracks
- `commentCheckInterval`: How often (in seconds) to check for new comments from the stream chat

## Implementation Issues and Solutions

### Issue 1: Confusion Between `updateThreshold` and `maxFeedbackPerTrack`
- **Problem**: These settings have been used inconsistently, causing confusion.
- **Solution**: 
  - `updateThreshold`: The minimum number of ratings required to trigger metadata update
  - `maxFeedbackPerTrack`: The maximum number of ratings to store before forcing an update
  - In practice, when feedback count reaches `updateThreshold`, process ratings and update metadata
  - If feedback count reaches `maxFeedbackPerTrack` without being processed, force an update

### Issue 2: Improper Use of `fallbackToFile`
- **Problem**: The purpose of `fallbackToFile` is unclear in the current implementation.
- **Solution**: 
  - When displaying ratings (in overlay, track selection, etc.), always use MP3 metadata first
  - Only if `fallbackToFile` is true AND MP3 metadata is unavailable, use ratings from `ratings.json`
  - This ensures MP3 files remain the source of truth for ratings

### Issue 3: Improper Merging of Ratings
- **Problem**: New ratings should be merged with existing MP3 metadata, not overwrite it.
- **Solution**:
  - When updating MP3 metadata, read existing rating and count
  - Calculate weighted average of existing and new ratings
  - Update MP3 metadata with the merged values
  - This preserves historical ratings while gradually evolving the score over time

### Issue 4: Unlimited Growth of `ratings.json`
- **Problem**: Processed ratings are not cleared from `ratings.json`.
- **Solution**:
  - After processing ratings at the threshold, clear them from `ratings.json`
  - Keep only a small number of recent ratings for display purposes
  - This prevents unlimited growth of the ratings file

## Implementation Checklist

1. **Update `ratingsManager.js`**:
   - Modify to check for `updateThreshold` instead of `maxFeedbackPerTrack` when deciding to process ratings
   - Ensure proper merging of ratings with existing MP3 metadata
   - Implement clearing of processed ratings from `ratings.json`

2. **Update `feedbackManager.js`**:
   - Clarify the implementation of `getRatingWithFallback` to respect the `fallbackToFile` setting
   - Ensure proper merging of ratings with existing MP3 metadata

3. **Update Documentation**:
   - Update feature definition documents to clarify the process flow
   - Ensure configuration settings are clearly explained

## Conclusion
By implementing these changes, the user ratings system will function as intended, with clear separation of concerns between temporary feedback storage and long-term rating persistence in MP3 metadata. The system will properly merge new ratings with existing ones, ensuring a gradual evolution of track ratings over time while maintaining efficient storage.