import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Allow stdout/stderr to be displayed during tests
    silent: false,
    
    // Ensure output is not captured/buffered
    outputFile: undefined,
    
    // Enable real-time output
    reporters: ['verbose'],
    
    // Keep the existing timeout settings
    testTimeout: 0,
    hookTimeout: 0,
    
    // Environment configuration to ensure proper stdout handling
    environment: 'node',
    
    // Ensure console methods work as expected
    globals: false,
    
    // Allow process.stdout.write to work properly
    pool: 'forks', // Use separate processes for better stdout handling
  },
}) 