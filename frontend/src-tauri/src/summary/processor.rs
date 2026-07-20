// Summary processor utilities - simplified for backend API integration
// Most summary generation logic is now handled by ai-meeting-agent REST API
// This file keeps only utility functions that may be useful for client-side processing

use once_cell::sync::Lazy;
use regex::Regex;

// Compile regex once and reuse
static THINKING_TAG_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)<think(?:ing)?>.*?</think(?:ing)?>").unwrap()
});

/// Maps a BCP-47 tag to the English language name used inside LLM prompts.
///
/// LLMs respond far more reliably to "in Spanish" than to "in es". Regional
/// tags (`pt-BR`, `en_GB`) are normalised to their base language; Chinese
/// variants are disambiguated. Unknown codes return None so the caller falls
/// back to English rather than injecting a literal ISO code into the prompt.
pub fn language_name_from_code(code: &str) -> Option<&'static str> {
    let normalised = code.to_ascii_lowercase().replace('_', "-");
    let lookup: &str = match normalised.as_str() {
        "zh-cn" => "zh",
        "zh-tw" => return Some("Traditional Chinese"),
        other => other.split('-').next().unwrap_or(other),
    };
    match lookup {
        "en" => Some("English"),
        "zh" => Some("Chinese"),
        "de" => Some("German"),
        "es" => Some("Spanish"),
        "ru" => Some("Russian"),
        "ko" => Some("Korean"),
        "fr" => Some("French"),
        "ja" => Some("Japanese"),
        "pt" => Some("Portuguese"),
        "it" => Some("Italian"),
        "tr" => Some("Turkish"),
        "pl" => Some("Polish"),
        "nl" => Some("Dutch"),
        "ar" => Some("Arabic"),
        "sv" => Some("Swedish"),
        "id" => Some("Indonesian"),
        "hi" => Some("Hindi"),
        "fi" => Some("Finnish"),
        "vi" => Some("Vietnamese"),
        "he" => Some("Hebrew"),
        "uk" => Some("Ukrainian"),
        "el" => Some("Greek"),
        "ms" => Some("Malay"),
        "cs" => Some("Czech"),
        "ro" => Some("Romanian"),
        "da" => Some("Danish"),
        "hu" => Some("Hungarian"),
        "ta" => Some("Tamil"),
        "no" => Some("Norwegian"),
        "th" => Some("Thai"),
        "ur" => Some("Urdu"),
        "hr" => Some("Croatian"),
        "bg" => Some("Bulgarian"),
        "lt" => Some("Lithuanian"),
        "la" => Some("Latin"),
        "mi" => Some("Maori"),
        "ml" => Some("Malayalam"),
        "cy" => Some("Welsh"),
        "sk" => Some("Slovak"),
        "te" => Some("Telugu"),
        "fa" => Some("Persian"),
        "lv" => Some("Latvian"),
        "bn" => Some("Bengali"),
        "sr" => Some("Serbian"),
        "az" => Some("Azerbaijani"),
        "sl" => Some("Slovenian"),
        "kn" => Some("Kannada"),
        "et" => Some("Estonian"),
        "mk" => Some("Macedonian"),
        "br" => Some("Breton"),
        "eu" => Some("Basque"),
        "is" => Some("Icelandic"),
        "hy" => Some("Armenian"),
        "ne" => Some("Nepali"),
        "mn" => Some("Mongolian"),
        "bs" => Some("Bosnian"),
        "kk" => Some("Kazakh"),
        "sq" => Some("Albanian"),
        "sw" => Some("Swahili"),
        "gl" => Some("Galician"),
        "mr" => Some("Marathi"),
        "pa" => Some("Punjabi"),
        "si" => Some("Sinhala"),
        "km" => Some("Khmer"),
        "sn" => Some("Shona"),
        "yo" => Some("Yoruba"),
        "so" => Some("Somali"),
        "af" => Some("Afrikaans"),
        "oc" => Some("Occitan"),
        "ka" => Some("Georgian"),
        "be" => Some("Belarusian"),
        "tg" => Some("Tajik"),
        "sd" => Some("Sindhi"),
        "gu" => Some("Gujarati"),
        "am" => Some("Amharic"),
        "yi" => Some("Yiddish"),
        "lo" => Some("Lao"),
        "uz" => Some("Uzbek"),
        "fo" => Some("Faroese"),
        "ht" => Some("Haitian Creole"),
        "ps" => Some("Pashto"),
        "tk" => Some("Turkmen"),
        "nn" => Some("Nynorsk"),
        "mt" => Some("Maltese"),
        "sa" => Some("Sanskrit"),
        "lb" => Some("Luxembourgish"),
        "my" => Some("Myanmar"),
        "bo" => Some("Tibetan"),
        "tl" => Some("Tagalog"),
        "mg" => Some("Malagasy"),
        "as" => Some("Assamese"),
        "tt" => Some("Tatar"),
        "haw" => Some("Hawaiian"),
        "ln" => Some("Lingala"),
        "ha" => Some("Hausa"),
        "ba" => Some("Bashkir"),
        "jw" => Some("Javanese"),
        "su" => Some("Sundanese"),
        _ => None,
    }
}

/// Extracts the meeting name from the first H1 heading in markdown.
///
/// Returns None if no H1 heading is found or if the heading is empty.
pub fn extract_meeting_name_from_markdown(markdown: &str) -> Option<String> {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("# ") {
            let clean = title.trim();
            if !clean.is_empty() {
                return Some(clean.to_string());
            }
        }
    }
    None
}

/// Strips thinking tags from LLM output
pub fn strip_thinking_tags(text: &str) -> String {
    THINKING_TAG_REGEX.replace_all(text, "").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_name_from_code() {
        assert_eq!(language_name_from_code("en"), Some("English"));
        assert_eq!(language_name_from_code("en-US"), Some("English"));
        assert_eq!(language_name_from_code("zh-CN"), Some("Chinese"));
        assert_eq!(language_name_from_code("zh-TW"), Some("Traditional Chinese"));
        assert_eq!(language_name_from_code("es"), Some("Spanish"));
        assert_eq!(language_name_from_code("fr_FR"), Some("French"));
        assert_eq!(language_name_from_code("unknown"), None);
    }

    #[test]
    fn test_extract_meeting_name_from_markdown() {
        let markdown = "# Weekly Standup\n\n## Attendees\n- Alice\n- Bob";
        assert_eq!(
            extract_meeting_name_from_markdown(markdown),
            Some("Weekly Standup".to_string())
        );

        let no_heading = "Just some text\nNo heading here";
        assert_eq!(extract_meeting_name_from_markdown(no_heading), None);

        let empty_heading = "# \n\n## Section";
        assert_eq!(extract_meeting_name_from_markdown(empty_heading), None);
    }

    #[test]
    fn test_strip_thinking_tags() {
        let text = "Before <thinking>internal thoughts</thinking> after";
        assert_eq!(strip_thinking_tags(text), "Before  after");

        let no_tags = "Just regular text";
        assert_eq!(strip_thinking_tags(no_tags), "Just regular text");

        let multiple = "<think>one</think> middle <thinking>two</thinking> end";
        assert_eq!(strip_thinking_tags(multiple), " middle  end");
    }
}
