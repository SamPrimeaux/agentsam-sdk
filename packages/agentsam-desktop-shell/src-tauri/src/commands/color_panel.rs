//! Native color picker for per-session terminal appearance.
//!
//! macOS owns one shared `NSColorPanel`. The frontend decides *which* terminal
//! session is targeted (it owns the session store) and passes that id here; this
//! module only retargets the panel and relays live changes back as
//! `agentsam://native-color` events addressed to the originating window. Other
//! platforms report `native_color_panel_supported = false` and the frontend falls
//! back to its in-app picker, which uses the same appearance operations.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const COLOR_EVENT: &str = "agentsam://native-color";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeColorPayload {
    pub v: u8,
    pub window: String,
    pub session_id: String,
    pub hex: String,
}

pub fn emit_color(app: &AppHandle, window: &str, session_id: &str, hex: String) {
    let payload = NativeColorPayload {
        v: 1,
        window: window.to_owned(),
        session_id: session_id.to_owned(),
        hex,
    };
    // Broadcast + window label: see menu.rs for why this is not `emit_to`.
    if let Err(error) = app.emit(COLOR_EVENT, payload) {
        eprintln!("native color relay failed: {error}");
    }
}

pub fn parse_hex(value: &str) -> Option<(f64, f64, f64)> {
    let raw = value.trim().trim_start_matches('#');
    if raw.len() != 6 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let channel = |range: std::ops::Range<usize>| -> f64 {
        u8::from_str_radix(&raw[range], 16).unwrap_or(0) as f64 / 255.0
    };
    Some((channel(0..2), channel(2..4), channel(4..6)))
}

pub fn to_hex(red: f64, green: f64, blue: f64) -> String {
    let byte = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", byte(red), byte(green), byte(blue))
}

#[tauri::command]
pub fn native_color_panel_supported() -> bool {
    cfg!(target_os = "macos")
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{emit_color, parse_hex, to_hex};
    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSColor, NSColorPanel, NSColorSpace};
    use objc2_foundation::{NSObject, NSObjectProtocol, NSString};
    use std::cell::RefCell;
    use std::sync::Mutex;
    use tauri::AppHandle;

    struct Target {
        app: AppHandle,
        window: String,
        session_id: String,
    }

    // Written on the main thread when the panel is (re)targeted and read by the
    // AppKit action callback, which also runs on the main thread.
    static TARGET: Mutex<Option<Target>> = Mutex::new(None);

    thread_local! {
        static RECEIVER: RefCell<Option<Retained<ColorReceiver>>> = const { RefCell::new(None) };
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "AgentSamColorReceiver"]
        struct ColorReceiver;

        unsafe impl NSObjectProtocol for ColorReceiver {}

        impl ColorReceiver {
            #[unsafe(method(agentsamColorChanged:))]
            fn color_changed(&self, sender: &NSColorPanel) {
                let color = sender.color();
                let Some(srgb) = color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace()) else {
                    return;
                };
                let hex = to_hex(srgb.redComponent(), srgb.greenComponent(), srgb.blueComponent());
                if let Ok(guard) = TARGET.lock() {
                    if let Some(target) = guard.as_ref() {
                        emit_color(&target.app, &target.window, &target.session_id, hex);
                    }
                }
            }
        }
    );

    impl ColorReceiver {
        fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let this = mtm.alloc::<Self>().set_ivars(());
            unsafe { msg_send![super(this), init] }
        }
    }

    pub fn open(
        app: &AppHandle,
        window: String,
        session_id: String,
        title: String,
        hex: String,
    ) -> Result<(), String> {
        let (red, green, blue) = parse_hex(&hex).ok_or("color_invalid")?;
        let mtm = MainThreadMarker::new().ok_or("color_panel_requires_main_thread")?;
        *TARGET.lock().map_err(|_| "color_target_locked")? = Some(Target {
            app: app.clone(),
            window,
            session_id,
        });
        RECEIVER.with(|slot| {
            let mut slot = slot.borrow_mut();
            let receiver = slot.get_or_insert_with(|| ColorReceiver::new(mtm));
            let panel = NSColorPanel::sharedColorPanel(mtm);
            // Retargeting must not echo the seed color back as a user edit.
            unsafe {
                panel.setTarget(None);
                panel.setAction(None);
            }
            panel.setContinuous(true);
            panel.setShowsAlpha(false);
            panel.setColor(&NSColor::colorWithSRGBRed_green_blue_alpha(red, green, blue, 1.0));
            panel.setTitle(&NSString::from_str(&title));
            unsafe {
                panel.setTarget(Some(receiver));
                panel.setAction(Some(sel!(agentsamColorChanged:)));
            }
            panel.makeKeyAndOrderFront(None);
        });
        Ok(())
    }

    /// A user edit as AppKit delivers it: set the panel color, then run the panel's
    /// target/action. Used only by the opt-in self-test (selftest.rs).
    pub fn simulate_user_color(hex: &str) -> Result<(), String> {
        let (red, green, blue) = parse_hex(hex).ok_or("color_invalid")?;
        let mtm = MainThreadMarker::new().ok_or("color_panel_requires_main_thread")?;
        if !NSColorPanel::sharedColorPanelExists(mtm) {
            return Err("color_panel_not_open".into());
        }
        let panel = NSColorPanel::sharedColorPanel(mtm);
        panel.setColor(&NSColor::colorWithSRGBRed_green_blue_alpha(red, green, blue, 1.0));
        RECEIVER.with(|slot| {
            let slot = slot.borrow();
            let receiver = slot.as_ref().ok_or("color_receiver_missing")?;
            let _: () = unsafe { msg_send![&**receiver, agentsamColorChanged: &*panel] };
            Ok(())
        })
    }

    pub fn close() {
        if let Some(mtm) = MainThreadMarker::new() {
            if NSColorPanel::sharedColorPanelExists(mtm) {
                let panel = NSColorPanel::sharedColorPanel(mtm);
                unsafe {
                    panel.setTarget(None);
                    panel.setAction(None);
                }
                panel.orderOut(None);
            }
        }
        if let Ok(mut guard) = TARGET.lock() {
            *guard = None;
        }
    }
}

/// Retarget and show the native macOS color panel for one terminal session.
#[tauri::command]
pub fn native_color_panel_open(
    app: AppHandle,
    window: tauri::WebviewWindow,
    session_id: String,
    title: String,
    hex: String,
) -> Result<(), String> {
    if session_id.is_empty() || session_id.len() > 128 || title.len() > 200 {
        return Err("color_panel_args_invalid".into());
    }
    #[cfg(target_os = "macos")]
    {
        let label = window.label().to_owned();
        let handle = app.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(mac::open(&handle, label, session_id, title, hex));
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|_| "color_panel_dispatch_failed".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, window, session_id, title, hex);
        Err("native_color_panel_unsupported".into())
    }
}

/// Self-test only (see selftest.rs): deliver a user color edit through the panel action.
pub fn simulate_user_color(app: &AppHandle, hex: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(mac::simulate_user_color(&hex));
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|_| "color_panel_dispatch_failed".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, hex);
        Err("native_color_panel_unsupported".into())
    }
}

#[tauri::command]
pub fn native_color_panel_close(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(mac::close).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip_is_stable() {
        let (r, g, b) = parse_hex("#0d0900").expect("valid hex");
        assert_eq!(to_hex(r, g, b), "#0d0900");
        assert_eq!(to_hex(1.0, 0.0, 0.5), "#ff0080");
    }

    #[test]
    fn rejects_non_hex_values() {
        assert!(parse_hex("#12").is_none());
        assert!(parse_hex("red").is_none());
        assert!(parse_hex("#gggggg").is_none());
    }
}
