//! Opt-in native acceptance driver for packaged builds.
//!
//! macOS grants no accessibility access to automation, so menu items cannot be
//! clicked from a script. When `AGENTSAM_NATIVE_SELFTEST` is set, the shell
//! dispatches the listed steps through the *same* `handle_menu_event` path a real
//! menu click uses, after the window has had time to mount. Without the variable
//! this module does nothing.
//!
//!   AGENTSAM_NATIVE_SELFTEST="shell.new_tab,wait:1500,color:#123456"
//!
//! Steps: `<menu id>` | `wait:<ms>` | `color:#rrggbb` (a user edit in the native
//! color panel, delivered through the panel's own target/action).
use tauri::AppHandle;

pub const ENV: &str = "AGENTSAM_NATIVE_SELFTEST";

/// Frontend acknowledgement for the self-test: logs what the webview actually did
/// with a native event. No-op unless the self-test variable is set.
#[tauri::command]
pub fn native_selftest_ack(note: String) {
    if std::env::var_os(ENV).is_some() {
        eprintln!("[native-selftest] frontend: {note}");
    }
}
const BOOT_DELAY_MS: u64 = 9000;
const STEP_GAP_MS: u64 = 700;

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Menu(String),
    Wait(u64),
    Color(String),
}

pub fn parse(spec: &str) -> Vec<Step> {
    spec.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            if let Some(ms) = s.strip_prefix("wait:") {
                Step::Wait(ms.parse().unwrap_or(0).min(30_000))
            } else if let Some(hex) = s.strip_prefix("color:") {
                Step::Color(hex.to_owned())
            } else {
                Step::Menu(s.to_owned())
            }
        })
        .collect()
}

pub fn maybe_run(app: &AppHandle) {
    let Ok(spec) = std::env::var(ENV) else {
        return;
    };
    let steps = parse(&spec);
    if steps.is_empty() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(BOOT_DELAY_MS));
        for step in steps {
            eprintln!("[native-selftest] {step:?}");
            match step {
                Step::Menu(id) => crate::menu::handle_menu_event(&app, &id),
                Step::Wait(ms) => std::thread::sleep(std::time::Duration::from_millis(ms)),
                Step::Color(hex) => {
                    if let Err(error) = crate::commands::color_panel::simulate_user_color(&app, hex) {
                        eprintln!("[native-selftest] color failed: {error}");
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(STEP_GAP_MS));
        }
        eprintln!("[native-selftest] done");
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_menu_wait_and_color_steps() {
        assert_eq!(
            parse("shell.new_tab, wait:1500,color:#123456,,"),
            vec![
                Step::Menu("shell.new_tab".into()),
                Step::Wait(1500),
                Step::Color("#123456".into())
            ]
        );
    }
}
