// Job polling and SSE streaming helpers

use crate::api_client::client::ApiClient;
use crate::api_client::types::*;
use std::time::Duration;
use tokio::time::sleep;

/// Job polling helper
/// 
/// Polls GET /jobs/{job_id}/status every 3 seconds until terminal state
pub struct JobPoller {
    client: ApiClient,
    job_id: String,
    poll_interval: Duration,
}

impl JobPoller {
    pub fn new(client: ApiClient, job_id: String) -> Self {
        Self {
            client,
            job_id,
            poll_interval: Duration::from_secs(3),
        }
    }

    pub fn with_interval(mut self, interval: Duration) -> Self {
        self.poll_interval = interval;
        self
    }

    /// Poll until job reaches terminal state (completed, failed, cancelled)
    /// 
    /// Calls callback on each status update
    pub async fn poll_until_complete<F>(
        &self,
        mut on_progress: F,
    ) -> ApiResult<JobStatusResponse>
    where
        F: FnMut(&JobStatusResponse),
    {
        loop {
            let status = self.client.get_job_status(&self.job_id).await?;
            
            on_progress(&status);

            if status.state.is_terminal() {
                return Ok(status);
            }

            sleep(self.poll_interval).await;
        }
    }

    /// Poll once and return current status
    pub async fn poll_once(&self) -> ApiResult<JobStatusResponse> {
        self.client.get_job_status(&self.job_id).await
    }
}

/// SSE event stream helper (for future Phase 1+ implementation)
/// 
/// Connects to GET /jobs/{job_id}/events and streams progress events
/// This is a placeholder for Phase 2 when we implement real-time progress
pub struct JobEventStream {
    _client: ApiClient,
    _job_id: String,
}

impl JobEventStream {
    pub fn new(client: ApiClient, job_id: String) -> Self {
        Self {
            _client: client,
            _job_id: job_id,
        }
    }

    // TODO: Implement SSE streaming in Phase 2
    // pub async fn stream_events<F>(&self, on_event: F) -> ApiResult<()>
    // where
    //     F: FnMut(ProgressEvent),
    // {
    //     unimplemented!("SSE streaming will be implemented in Phase 2")
    // }
}
