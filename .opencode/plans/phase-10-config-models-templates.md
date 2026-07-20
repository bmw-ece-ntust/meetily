# Phase 10 — Config + Provider Models + Templates + Language Prefs

Goal: Port settings, provider model lists, ollama, builtin_ai, templates, summary language preferences.

## Tasks
- [ ] `server/src/routes/config.rs`:
  - `GET /config/model` (← `api_get_model_config`)
  - `PUT /config/model` (← `api_save_model_config`)
  - `GET /config/model/key?provider=` (← `api_get_api_key`)
  - `GET /config/transcript` (← `api_get_transcript_config`)
  - `PUT /config/transcript` (← `api_save_transcript_config`)
  - `GET /config/transcript/key?provider=` (← `api_get_transcript_api_key`)
  - `GET/PUT /config/custom-openai` (← `api_get/save_custom_openai_config`)
  - `POST /config/custom-openai/test` (← `api_test_custom_openai_connection`)
- [ ] `server/src/providers/` — move + strip Tauri deps:
  - `ollama.rs` (← `frontend/src-tauri/src/ollama/ollama.rs`) — `get_ollama_models`, `pull_ollama_model`, `delete_ollama_model`, `get_ollama_model_context`
  - `openai.rs`, `anthropic.rs`, `groq.rs`, `openrouter.rs` — model list functions
- [ ] `server/src/routes/models.rs`:
  - `GET /models/{provider}` where provider ∈ {ollama, openai, anthropic, groq, openrouter}
  - `POST /models/ollama/{name}` (pull), `DELETE /models/ollama/{name}`
  - `GET /models/ollama/{name}/context`
  - `GET /models/builtin` (← `builtin_ai_list_models`)
  - `GET /models/builtin/{name}` (← `builtin_ai_get_model_info`)
  - `POST /models/builtin/{name}` (← `builtin_ai_download_model`)
  - `DELETE /models/builtin/{name}` (← `builtin_ai_delete_model`)
  - `POST /models/builtin/{name}/cancel` (← `builtin_ai_cancel_download`)
  - `GET /models/builtin/{name}/ready` (← `builtin_ai_is_model_ready`)
- [ ] `server/src/summary/` — move `summary_engine/` (ModelManager) + `template_commands.rs`
  - `GET /templates` (← `api_list_templates`)
  - `GET /templates/{id}` (← `api_get_template_details`)
  - `POST /templates/validate` (← `api_validate_template`)
- [ ] `server/src/routes/templates.rs`
- [ ] Language preferences endpoints (← `summary/commands.rs`):
  - `GET/PUT /meetings/{id}/summary/language`
  - `POST /summary/detect-language`
- [ ] Add SSE event channel for ollama/builtin model download progress
- [ ] Register all routes under auth layer + utoipa annotations
- [ ] `cargo check` passes

## Out of scope
- Import, retranscription, summary generation endpoints (Phases 11-12)
- Deleting Tauri/frontend (Phase 13)

## Verification
- `cargo check -p meetily-server` 0 errors
- `curl -H "Authorization: Bearer test" localhost:8080/config/model` → 200
- `curl -H "Authorization: Bearer test" localhost:8080/templates` → 200 (builtin templates)
- `curl -H "Authorization: Bearer test" localhost:8080/models/openrouter` → 200
- `/docs` shows all new endpoints
