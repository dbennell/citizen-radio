const { pickNextTrack, performWeightedSelection } = require('../src/managers/trackManager');
const { getLastPlays } = require('../src/managers/playLogManager');
const { STATION_CONFIG } = require('../src/core/config');

console.log('Testing track selection with frequency bias...');
console.log('Current configuration:');
console.log(`- Track history size: ${STATION_CONFIG.trackHistory?.historySize || 16}`);
console.log(`- Frequency weight: ${STATION_CONFIG.trackHistory?.weights?.frequency || 0.5}`);
console.log(`- Default rating: ${STATION_CONFIG.ratingSystem?.defaultRating || 3}`);
console.log(`- Min tickets: ${STATION_CONFIG.ratingSystem?.minTickets || 1}`);
console.log(`- Max tickets: ${STATION_CONFIG.ratingSystem?.maxTickets || 5}`);

// Create mock candidates with different play counts
const mockCandidates = [
  { fp: '/path/to/track1.mp3', rel: 'music/track1.mp3', count: 0 },  // Never played
  { fp: '/path/to/track2.mp3', rel: 'music/track2.mp3', count: 1 },  // Played once
  { fp: '/path/to/track3.mp3', rel: 'music/track3.mp3', count: 3 },  // Played 3 times
  { fp: '/path/to/track4.mp3', rel: 'music/track4.mp3', count: 5 },  // Played 5 times
  { fp: '/path/to/track5.mp3', rel: 'music/track5.mp3', count: 10 }, // Played 10 times
];

// Test the weighted selection
async function testWeightedSelection() {
  console.log('\nTesting weighted selection with frequency bias:');

  // First, log the ticket calculations for each track
  console.log('\nTicket calculations for each track:');
  for (const candidate of mockCandidates) {
    // Calculate tickets manually to verify
    const rating = 3; // Default rating
    let baseTickets = Math.max(1, rating);
    const playCount = candidate.count || 0;
    const frequencyWeight = 0.5; // Default weight

    // Calculate progressive penalty
    let tickets = baseTickets;
    if (playCount > 0 && frequencyWeight > 0) {
      const progressivePenalty = Math.pow(playCount, 2) * frequencyWeight;
      // Use a formula that approaches but never reaches zero as play count increases
      tickets = tickets / (1 + progressivePenalty);
      // Ensure a minimum of 0.01 tickets
      tickets = Math.max(0.01, tickets);
    }

    console.log(`Track: ${candidate.rel}, Play count: ${playCount}, Base tickets: ${baseTickets}, Final tickets: ${tickets.toFixed(2)}`);
  }

  // Run multiple selections to see the distribution
  const selections = {};
  const iterations = 1000;

  for (let i = 0; i < iterations; i++) {
    const selected = await performWeightedSelection(mockCandidates);
    if (selected) {
      const trackName = selected.rel;
      selections[trackName] = (selections[trackName] || 0) + 1;
    }
  }

  // Display results
  console.log(`\nSelection results after ${iterations} iterations:`);
  for (const trackName in selections) {
    const percentage = ((selections[trackName] / iterations) * 100).toFixed(2);
    console.log(`- ${trackName}: ${selections[trackName]} selections (${percentage}%)`);
  }

  // Check if tracks with higher play counts were selected less frequently
  const tracksByPlayCount = Object.keys(selections).sort((a, b) => {
    const trackA = mockCandidates.find(c => c.rel === a);
    const trackB = mockCandidates.find(c => c.rel === b);
    return trackA.count - trackB.count;
  });

  console.log('\nVerifying frequency bias:');
  for (let i = 0; i < tracksByPlayCount.length - 1; i++) {
    const currentTrack = tracksByPlayCount[i];
    const nextTrack = tracksByPlayCount[i + 1];
    const currentCount = mockCandidates.find(c => c.rel === currentTrack).count;
    const nextCount = mockCandidates.find(c => c.rel === nextTrack).count;

    if (selections[currentTrack] <= selections[nextTrack]) {
      console.log(`❌ ISSUE: Track with play count ${currentCount} (${currentTrack}) was selected ${selections[currentTrack]} times, but track with higher play count ${nextCount} (${nextTrack}) was selected ${selections[nextTrack]} times`);
    } else {
      console.log(`✅ Track with play count ${currentCount} (${currentTrack}) was selected more often (${selections[currentTrack]} times) than track with play count ${nextCount} (${nextTrack}) (${selections[nextTrack]} times)`);
    }
  }

  // Check recent play history
  console.log('\nChecking recent play history:');
  const playLog = getLastPlays(20);
  console.log(`Recent play history (last ${playLog.length} tracks):`);
  playLog.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.relPath || 'unknown'} (${entry.type || 'unknown'})`);
  });
}

// Run the test
testWeightedSelection().catch(err => {
  console.error('Error during test:', err);
});
