// In-memory cache for API responses (cleared on app restart)

use crate::api_client::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// In-memory cache for meetings, transcripts, and summaries
/// 
/// Architecture:
/// - HashMap-based storage in RAM
/// - RwLock for concurrent read/write access
/// - No persistence (cleared on app restart)
/// - Cache invalidation on updates/deletes
#[derive(Debug, Clone)]
pub struct MemoryCache {
    meetings: Arc<RwLock<HashMap<String, Meeting>>>,
    transcripts: Arc<RwLock<HashMap<String, Transcript>>>,
    summaries: Arc<RwLock<HashMap<String, Vec<Summary>>>>, // meeting_id -> summaries
}

impl MemoryCache {
    pub fn new() -> Self {
        Self {
            meetings: Arc::new(RwLock::new(HashMap::new())),
            transcripts: Arc::new(RwLock::new(HashMap::new())),
            summaries: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    // ========================================================================
    // Meeting Cache
    // ========================================================================

    pub async fn get_meeting(&self, id: &str) -> Option<Meeting> {
        self.meetings.read().await.get(id).cloned()
    }

    pub async fn set_meeting(&self, meeting: Meeting) {
        let mut cache = self.meetings.write().await;
        cache.insert(meeting.id.clone(), meeting);
    }

    pub async fn set_meetings(&self, meetings: Vec<Meeting>) {
        let mut cache = self.meetings.write().await;
        for meeting in meetings {
            cache.insert(meeting.id.clone(), meeting);
        }
    }

    pub async fn get_all_meetings(&self) -> Vec<Meeting> {
        self.meetings.read().await.values().cloned().collect()
    }

    pub async fn remove_meeting(&self, id: &str) {
        let mut cache = self.meetings.write().await;
        cache.remove(id);
        
        // Also invalidate related transcript and summaries
        self.transcripts.write().await.remove(id);
        self.summaries.write().await.remove(id);
    }

    pub async fn clear_meetings(&self) {
        self.meetings.write().await.clear();
    }

    // ========================================================================
    // Transcript Cache
    // ========================================================================

    pub async fn get_transcript(&self, meeting_id: &str) -> Option<Transcript> {
        self.transcripts.read().await.get(meeting_id).cloned()
    }

    pub async fn set_transcript(&self, meeting_id: String, transcript: Transcript) {
        let mut cache = self.transcripts.write().await;
        cache.insert(meeting_id, transcript);
    }

    pub async fn remove_transcript(&self, meeting_id: &str) {
        self.transcripts.write().await.remove(meeting_id);
    }

    pub async fn clear_transcripts(&self) {
        self.transcripts.write().await.clear();
    }

    // ========================================================================
    // Summary Cache
    // ========================================================================

    pub async fn get_summaries(&self, meeting_id: &str) -> Option<Vec<Summary>> {
        self.summaries.read().await.get(meeting_id).cloned()
    }

    pub async fn set_summaries(&self, meeting_id: String, summaries: Vec<Summary>) {
        let mut cache = self.summaries.write().await;
        cache.insert(meeting_id, summaries);
    }

    pub async fn add_summary(&self, meeting_id: String, summary: Summary) {
        let mut cache = self.summaries.write().await;
        cache
            .entry(meeting_id)
            .or_insert_with(Vec::new)
            .push(summary);
    }

    pub async fn remove_summaries(&self, meeting_id: &str) {
        self.summaries.write().await.remove(meeting_id);
    }

    pub async fn clear_summaries(&self) {
        self.summaries.write().await.clear();
    }

    // ========================================================================
    // Bulk Operations
    // ========================================================================

    pub async fn clear_all(&self) {
        self.meetings.write().await.clear();
        self.transcripts.write().await.clear();
        self.summaries.write().await.clear();
    }

    pub async fn get_cache_stats(&self) -> CacheStats {
        CacheStats {
            meeting_count: self.meetings.read().await.len(),
            transcript_count: self.transcripts.read().await.len(),
            summary_count: self.summaries.read().await.len(),
        }
    }
}

impl Default for MemoryCache {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub meeting_count: usize,
    pub transcript_count: usize,
    pub summary_count: usize,
}
