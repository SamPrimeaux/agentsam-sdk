# Communications

Email (agentsam_send_email and the full official Gmail MCP surface), iMessage (send/approval), and app push notifications.

**21 tools** in this domain.

## `comms.email` (1)

- **`agentsam_send_email`** (Send Email) — Send transactional email via Resend. From address resolves from workspace_settings. Handles single send or batch loop. Requires approval. _never used_

## `comms.imessage` (3)

- **`agentsam_imessage_approval_status`** (iMessage approval status) — Read an iMessage approval row by token or id (pending / approved / denied / expired) plus linked agentsam_approval_queue status when present. _never used_
- **`agentsam_imessage_request_approval`** (iMessage request approval) — Text the operator a yes/no approval over iMessage and return a token. Reply `approve <token>` or `no <token>` on the Mac. Also writes agentsam_approval_queue so an in-app card stays in sync. Status via agentsam_imessage_approval_status.
- **`agentsam_imessage_send`** (iMessage send) — Queue an iMessage to the operator. The Mac Messages.app daemon sends it; this Worker never talks to BlueBubbles. Optional `to` is an iMessage handle (phone or email). If omitted, uses the daemon-registered self handle. _never used_

## `comms.push` (1)

- **`agentsam_notify`** (App Push Notify) — Send an in-app + PWA web push notification to the authenticated user. Not email — use agentsam_send_email for Resend. _never used_

## `gmail` (4)

- **`gmail_get_message`** (Gmail Get Message) — Fetch a single Gmail message by id with full body text (user OAuth). Use after gmail_list_inbox when triaging — distinguishes setup-in-progress vs confirmed. _never used_
- **`gmail_list_inbox`** (Gmail List Inbox) — List recent inbox messages for the signed-in user Gmail account(s). Requires google_gmail OAuth.
- **`gmail_modify_message`** (Gmail Modify Message) — Modify Gmail labels (read/star/archive/trash) for a message id on the user connected account. _never used_
- **`gmail_send`** (Gmail Send) — Send email via the user connected Gmail account (google_gmail OAuth). _risk: high, never used_

## `gmail.official` (12)

- **`agentsam_gmail_mcp_apply_sensitive_message_label`** (Gmail Apply Sensitive Message Label) — Adds a sensitive label (Trash or Spam) to a specific message. Use to trash or mark a message as spam; find the message ID via search_threads or get_thread first. _risk: high, never used_
- **`agentsam_gmail_mcp_apply_sensitive_thread_label`** (Gmail Apply Sensitive Thread Label) — Adds a sensitive label (Trash or Spam) to an entire thread, affecting all current and future messages in it. _risk: high, never used_
- **`agentsam_gmail_mcp_create_draft`** (Gmail Create Draft) — Creates a new draft email. Takes recipients, subject, body; returns the draft ID. Pass replyToMessageId to reply to an existing message. Attachments not supported yet. _risk: high, never used_
- **`agentsam_gmail_mcp_create_label`** (Gmail Create Label) — Creates a new label, supports nested labels via forward slash (e.g. `Projects/Alpha/Sprint-1`); parent labels auto-created if missing. _risk: high, never used_
- **`agentsam_gmail_mcp_get_thread`** (Gmail Get Thread) — Retrieves a thread and its messages. `message_format` controls detail: FULL_CONTENT (default), MINIMAL (subject+snippet only), or METADATA_ONLY. _never used_
- **`agentsam_gmail_mcp_label_message`** (Gmail Label Message) — Adds one or more labels to a message. Find message ID via search_threads/get_thread; find label ID via list_labels. _never used_
- **`agentsam_gmail_mcp_label_thread`** (Gmail Label Thread) — Adds labels to an entire thread (current + future messages). Same ID-discovery pattern as label_message. _never used_
- **`agentsam_gmail_mcp_list_drafts`** (Gmail List Drafts) — Lists draft emails, filterable by query, paginated via page_token. `view` controls response detail (DRAFT_VIEW_METADATA_ONLY, etc). _never used_
- **`agentsam_gmail_mcp_list_labels`** (Gmail List Labels) — Lists user-defined labels (system labels like INBOX/TRASH/SPAM/STARRED use well-known IDs instead). Call before label_thread/label_message. _never used_
- **`agentsam_gmail_mcp_search_threads`** (Gmail Search Threads) — Lists threads matching a query string, paginated. `view` controls detail level in returned messages (THREAD_VIEW_MINIMAL default). _never used_
- **`agentsam_gmail_mcp_unlabel_message`** (Gmail Unlabel Message) — Removes one or more labels from a message. _never used_
- **`agentsam_gmail_mcp_unlabel_thread`** (Gmail Unlabel Thread) — Removes labels from an entire thread. _never used_
