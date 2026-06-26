# Logging Optimizations for Audio Pipeline Performance

## Summary
This document outlines logging optimizations that reduce overhead in the audio capture and processing paths. The `perf_debug!` / `perf_trace!` macros compile to no-ops in release builds, eliminating I/O blocking on hot paths.

## Implementation

### 1. Conditional Compilation for Debug Logging
**Files:** `lib.rs`, `audio/pipeline.rs`

```rust
#[cfg(debug_assertions)]
macro_rules! perf_debug {
    ($($arg:tt)*) => { log::debug!($($arg)*) };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_debug {
    ($($arg:tt)*) => {};  // No-op in release builds
}
```

**Impact:** Zero logging overhead in production builds.

### 2. Async Logging Infrastructure
**File:** `audio/async_logger.rs`

- Non-blocking log message buffering (1000 message capacity)
- Background task processes logs asynchronously
- Automatic batching and timeout-based flushing (100ms)
- Drops messages if channel is full to avoid blocking audio threads

**Impact:** Eliminates I/O blocking by moving logging to a background thread.

### 3. Smart Batching for Frequent Operations
**File:** `audio/batch_processor.rs`

- Batches audio metrics instead of logging individual chunks
- Processes every 50 chunks or 5-second timeout
- Generates summaries: total chunks, samples, duration, average levels

**Impact:** Replaces frequent individual logs with periodic summaries.

### 4. Recording Manager Optimization
**File:** `audio/recording_manager.rs`

- Error logging frequency reduced
- Verbose state logging converted to debug level
- Stream operation logging optimized for important events only

## Usage Guidelines

### For Performance-Critical Code
```rust
use crate::{perf_debug, perf_trace};

// Use performance-optimized macros in hot paths
perf_debug!("Processing chunk {}", chunk_id);  // Zero cost in release
```

### For Error Handling
```rust
// Always use standard logging for errors (don't optimize away)
log::error!("Critical error: {}", error);

// Use batched logging for frequent warnings
if error_count % 100 == 1 {
    log::warn!("Frequent warning (showing every 100th): {}", warning);
}
```

## Development vs Production Behavior

### Development (`debug_assertions = true`)
- All `perf_debug!` macros active
- Async logger processes all messages
- Smart batching provides detailed summaries

### Production (`debug_assertions = false`)
- All `perf_debug!` macros compile to no-ops
- Only critical info/warn/error logs active
- Zero overhead from eliminated debug paths
