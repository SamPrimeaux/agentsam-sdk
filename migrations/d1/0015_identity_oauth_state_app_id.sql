-- Optional app_id on OAuth PKCE state so post-login resumes the initiating app.

ALTER TABLE identity_oauth_states ADD COLUMN app_id TEXT;
