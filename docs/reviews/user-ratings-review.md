# User Ratings System Review and Recommendations

## Overview
This document provides a review of the current user ratings system in CitizenRadio and offers recommendations for addressing the issues identified in the system.

## Current Implementation

### Storage Mechanism
1. **Dual Storage System**:
   - `ratings.json`: A single file that stores ratings for all tracks
   - `feedback/` folder: Contains individual JSON files for each track (one file per track)

2. **MP3 Metadata Integration**:
   - Ratings and sentiment analysis can be stored in MP3 file metadata
   - Uses custom ID3 tags to store rating, rating count, sentiment, and last updated timestamp

### Rating Collection Process
1. Comments are collected from YouTube chat during track playback
2. Emoji reactions are parsed into numerical ratings (1-5 stars)
3. Ratings are stored in both `ratings.json` and individual feedback files
4. No mechanism to trigger rating calculation at `maxFeedbackPerTrack` threshold
5. No mechanism to clear processed ratings from `ratings.json`

### Comment Display
1. Comments are displayed in the stream overlay during playback
2. Noteworthy comments are stored in memory by the engagement monitor
3. Comments are not cleared when changing tracks
4. The engagement monitor has a configurable maximum number of stored comments

## Issues Identified

1. **Redundant Storage**:
   - Ratings are stored in both `ratings.json` and individual feedback files
   - This creates data duplication and potential inconsistencies

2. **Missing Threshold Trigger**:
   - The `maxFeedbackPerTrack` setting (25) exists in configuration but is not used in code
   - No mechanism to trigger rating calculation and sentiment analysis at this threshold

3. **Unlimited Growth of `ratings.json`**:
   - No mechanism to clear processed ratings from `ratings.json` after they've been stored in MP3 metadata
   - This could lead to the file growing indefinitely

4. **Improper Merging of Ratings**:
   - When updating MP3 metadata, new ratings should be merged with existing ones
   - Current implementation overwrites existing metadata rather than merging

5. **Comment Display Issues**:
   - Comments are not properly cleared when changing tracks
   - The engagement monitor doesn't reset its in-memory comments when tracks change

## Recommendations

### 1. Consolidate Rating Storage
- Use only `ratings.json` as the primary storage for ratings
- Remove the per-track feedback files in the `feedback/` folder
- Update all code that references the feedback files to use `ratings.json` instead

### 2. Implement Threshold Trigger
- Modify `addFeedback` in `ratingsManager.js` to check if the feedback count has reached `maxFeedbackPerTrack`
- When threshold is reached, trigger rating calculation and sentiment analysis
- Update MP3 metadata with the calculated values
- Clear the processed ratings from `ratings.json`

### 3. Implement Rating Clearing
- After processing ratings at the threshold, clear them from `ratings.json`
- Keep only a small number of recent ratings for display purposes
- This prevents unlimited growth of the ratings file

### 4. Implement Proper Merging
- When updating MP3 metadata, read existing values first
- Calculate weighted average of existing and new ratings
- Store the merged values back to the MP3 file

### 5. Fix Comment Display
- Modify `orchestrator.js` to call `resetComments()` on the engagement monitor when changing tracks
- Ensure the overlay is updated to clear comments when a new track starts
- Add configuration option to control comment persistence between tracks

## Implementation Plan

1. **Phase 1: Consolidate Storage**
   - Modify `ratingsManager.js` to use only `ratings.json`
   - Update all references to feedback files

2. **Phase 2: Implement Threshold Processing**
   - Add threshold check to `addFeedback`
   - Implement rating calculation and sentiment analysis trigger
   - Add clearing mechanism for processed ratings

3. **Phase 3: Fix Merging**
   - Implement proper merging of ratings with existing MP3 metadata
   - Test with various scenarios to ensure correct averaging

4. **Phase 4: Fix Comment Display**
   - Add reset call to `orchestrator.js` when changing tracks
   - Update overlay rendering to handle comment clearing
   - Add configuration options for comment persistence

## Conclusion
The current user ratings system has several issues that need to be addressed to improve its functionality and sustainability. By implementing the recommendations outlined in this document, we can create a more efficient and reliable ratings system that properly handles feedback processing and display.