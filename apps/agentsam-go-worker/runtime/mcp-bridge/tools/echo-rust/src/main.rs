use std::io::{self, BufRead, Write};
use serde_json::{json, Value};

fn main() {
    let stdin = io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line).ok();

    let parsed: Result<Value, _> = serde_json::from_str(&line);
    let out = match parsed {
        Ok(v) => {
            let text = v["arguments"]["text"].as_str().unwrap_or("").to_string();
            json!({ "ok": true, "result": { "text": text, "via": "rust" } })
        }
        Err(e) => json!({ "ok": false, "error": format!("bad json: {}", e) }),
    };

    let stdout = io::stdout();
    let mut handle = stdout.lock();
    writeln!(handle, "{}", out.to_string()).ok();
}
