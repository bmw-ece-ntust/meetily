//! Google Calendar read access: find the event matching a meeting and
//! extract attendee emails.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventAttendee {
    pub email: String,
    pub display_name: Option<String>,
    pub organizer: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventMatch {
    pub id: String,
    pub title: String,
    pub start: Option<String>,
    pub end: Option<String>,
    pub attendees: Vec<CalendarEventAttendee>,
}

#[derive(Debug, Deserialize)]
struct EventsResponse {
    items: Option<Vec<EventItem>>,
}

#[derive(Debug, Deserialize)]
struct EventItem {
    id: Option<String>,
    summary: Option<String>,
    start: Option<EventTime>,
    end: Option<EventTime>,
    attendees: Option<Vec<AttendeeItem>>,
    organizer: Option<OrganizerItem>,
}

#[derive(Debug, Deserialize)]
struct EventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AttendeeItem {
    email: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "self")]
    is_self: Option<bool>,
    resource: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct OrganizerItem {
    email: Option<String>,
}

/// Finds the primary-calendar event overlapping the meeting time window
/// and returns it with its attendee list. `self_email` is dropped from the
/// attendees so the sender doesn't mail themselves.
pub async fn find_event_for_meeting(
    access_token: &str,
    meeting_start: DateTime<Utc>,
    meeting_duration_seconds: Option<u64>,
    self_email: Option<&str>,
) -> Result<Option<CalendarEventMatch>, String> {
    let duration = Duration::seconds(meeting_duration_seconds.unwrap_or(3600) as i64);
    let window_start = meeting_start - Duration::minutes(15);
    let window_end = meeting_start + duration + Duration::minutes(15);

    let http = reqwest::Client::new();
    let resp = http
        .get(EVENTS_URL)
        .bearer_auth(access_token)
        .query(&[
            ("timeMin", window_start.to_rfc3339()),
            ("timeMax", window_end.to_rfc3339()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
            ("maxResults", "20".to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Calendar request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Google Calendar API error: {body}"));
    }

    let events: EventsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse calendar response: {e}"))?;

    let items = events.items.unwrap_or_default();
    // Prefer the event whose start is closest to the meeting start.
    let best = items
        .into_iter()
        .min_by_key(|item| {
            item.start
                .as_ref()
                .and_then(|s| s.date_time.as_deref())
                .and_then(|dt| DateTime::parse_from_rfc3339(dt).ok())
                .map(|dt| (dt.with_timezone(&Utc) - meeting_start).num_seconds().abs())
                .unwrap_or(i64::MAX)
        });

    Ok(best.map(|item| {
        let organizer_email = item.organizer.as_ref().and_then(|o| o.email.clone());
        let self_lower = self_email.map(|s| s.to_lowercase());

        let mut seen = std::collections::HashSet::new();
        let attendees = item
            .attendees
            .unwrap_or_default()
            .into_iter()
            .filter(|a| a.resource != Some(true))
            .filter(|a| a.is_self != Some(true))
            .filter_map(|a| {
                let email = a.email?.trim().to_string();
                if email.is_empty() {
                    return None;
                }
                let lower = email.to_lowercase();
                if self_lower.as_deref() == Some(lower.as_str()) {
                    return None;
                }
                if !seen.insert(lower) {
                    return None;
                }
                let is_organizer = organizer_email
                    .as_ref()
                    .map(|o| o.eq_ignore_ascii_case(&email))
                    .unwrap_or(false);
                Some(CalendarEventAttendee {
                    email,
                    display_name: a.display_name,
                    organizer: is_organizer,
                })
            })
            .collect();

        CalendarEventMatch {
            id: item.id.unwrap_or_default(),
            title: item.summary.unwrap_or_else(|| "(No title)".to_string()),
            start: item.start.and_then(|t| t.date_time.or(t.date)),
            end: item.end.and_then(|t| t.date_time.or(t.date)),
            attendees,
        }
    }))
}
