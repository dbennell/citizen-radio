#!/usr/bin/env node

/**
 * Streaming Operations Test Runner
 * 
 * This script runs all the tests implemented for the streaming operations
 * test plan and generates a coverage report.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  testPatterns: [
    // Unit tests
    'tests/unit/utils/youtube.test.js',
    'tests/unit/utils/emojiRating.test.js',
    'tests/unit/utils/fileUtils.test.js',
    'tests/unit/managers/ratingsManager.test.js',
    
    // Integration tests
    'tests/integration/components/ratings-flow.test.js',
    
    // E2E tests
    'tests/e2e/youtube-ratings-flow.test.js'
  ],
  coverageDir: 'coverage',
  reportDir: 'reports',
  jestConfig: 'jest.config.js'
};

// Ensure report directory exists
if (!fs.existsSync(config.reportDir)) {
  fs.mkdirSync(config.reportDir, { recursive: true });
}

// Function to run tests and generate coverage report
function runTests() {
  console.log('🚀 Running Streaming Operations Tests...');
  
  try {
    // Build the Jest command
    const testPatterns = config.testPatterns.join(' ');
    const command = `npx jest --config=${config.jestConfig} --coverage --coverageDirectory=${config.coverageDir} ${testPatterns}`;
    
    // Run the tests
    console.log(`\nExecuting: ${command}\n`);
    execSync(command, { stdio: 'inherit' });
    
    // Generate a summary report
    generateSummaryReport();
    
    console.log('\n✅ All tests completed successfully!');
    console.log(`📊 Coverage report available in ${config.coverageDir}`);
    console.log(`📝 Summary report available in ${config.reportDir}/summary.md`);
  } catch (error) {
    console.error('\n❌ Tests failed with error:', error.message);
    process.exit(1);
  }
}

// Function to generate a summary report
function generateSummaryReport() {
  console.log('\n📝 Generating summary report...');
  
  try {
    // Read the coverage summary
    const coverageSummaryPath = path.join(config.coverageDir, 'coverage-summary.json');
    if (!fs.existsSync(coverageSummaryPath)) {
      console.warn('⚠️ Coverage summary not found. Skipping summary report generation.');
      return;
    }
    
    const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
    
    // Generate markdown report
    let report = `# Streaming Operations Test Results\n\n`;
    report += `*Generated on ${new Date().toISOString()}*\n\n`;
    
    report += `## Test Coverage Summary\n\n`;
    report += `| Category | Files | Statements | Branches | Functions | Lines |\n`;
    report += `|----------|-------|------------|----------|-----------|-------|\n`;
    
    // Add total coverage
    const total = coverageSummary.total;
    report += `| **Total** | ${total.files} | ${total.statements.pct}% | ${total.branches.pct}% | ${total.functions.pct}% | ${total.lines.pct}% |\n`;
    
    // Add coverage by component
    report += `\n## Coverage by Component\n\n`;
    
    // Group files by component
    const components = {
      'YouTube Integration': [/youtube/, /emojiRating/],
      'User Feedback Processing': [/ratingsManager/, /analyticsEngine/],
      'File Logging System': [/fileUtils/]
    };
    
    for (const [component, patterns] of Object.entries(components)) {
      report += `### ${component}\n\n`;
      report += `| File | Statements | Branches | Functions | Lines |\n`;
      report += `|------|------------|----------|-----------|-------|\n`;
      
      let componentFiles = 0;
      let componentStatements = { covered: 0, total: 0 };
      let componentBranches = { covered: 0, total: 0 };
      let componentFunctions = { covered: 0, total: 0 };
      let componentLines = { covered: 0, total: 0 };
      
      // Find files matching the patterns
      for (const filePath in coverageSummary) {
        if (filePath === 'total') continue;
        
        const matchesComponent = patterns.some(pattern => pattern.test(filePath));
        if (matchesComponent) {
          const file = coverageSummary[filePath];
          report += `| ${path.basename(filePath)} | ${file.statements.pct}% | ${file.branches.pct}% | ${file.functions.pct}% | ${file.lines.pct}% |\n`;
          
          componentFiles++;
          componentStatements.covered += file.statements.covered;
          componentStatements.total += file.statements.total;
          componentBranches.covered += file.branches.covered;
          componentBranches.total += file.branches.total;
          componentFunctions.covered += file.functions.covered;
          componentFunctions.total += file.functions.total;
          componentLines.covered += file.lines.covered;
          componentLines.total += file.lines.total;
        }
      }
      
      // Calculate component percentages
      const statementsPct = componentStatements.total > 0 
        ? Math.round((componentStatements.covered / componentStatements.total) * 100) 
        : 0;
      const branchesPct = componentBranches.total > 0 
        ? Math.round((componentBranches.covered / componentBranches.total) * 100) 
        : 0;
      const functionsPct = componentFunctions.total > 0 
        ? Math.round((componentFunctions.covered / componentFunctions.total) * 100) 
        : 0;
      const linesPct = componentLines.total > 0 
        ? Math.round((componentLines.covered / componentLines.total) * 100) 
        : 0;
      
      report += `| **Component Total** | ${statementsPct}% | ${branchesPct}% | ${functionsPct}% | ${linesPct}% |\n\n`;
    }
    
    // Add test execution summary
    report += `## Test Execution Summary\n\n`;
    report += `The following test files were executed:\n\n`;
    
    for (const testPattern of config.testPatterns) {
      report += `- ${testPattern}\n`;
    }
    
    // Write the report
    const reportPath = path.join(config.reportDir, 'summary.md');
    fs.writeFileSync(reportPath, report);
    
    console.log(`Summary report written to ${reportPath}`);
  } catch (error) {
    console.error('Error generating summary report:', error);
  }
}

// Run the tests
runTests();