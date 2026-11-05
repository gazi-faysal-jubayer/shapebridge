// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Files the OS asked us to open before the page was ready to listen for them.
struct Pending(Mutex<Vec<String>>);

/// File paths from a command line (skipping the program name and flags), made absolute against `cwd`.
fn file_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a).to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
fn pending_paths(state: tauri::State<Pending>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Reads a STEP/IGES/BREP file with the native OpenCascade sidecar (`shapebridge-occt`, shipped next to this
/// executable) and returns it as binary glTF. OCCT is LGPL, so it runs as a separate process, which also keeps
/// a crash on a bad file out of the app.
#[tauri::command]
async fn native_import(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let sidecar = exe.with_file_name(format!("shapebridge-occt{}", std::env::consts::EXE_SUFFIX));
        let out = std::env::temp_dir().join(format!("shapebridge-{}-{}.glb", std::process::id(), unique()));
        let mut cmd = std::process::Command::new(&sidecar);
        cmd.arg(&path).arg(&out);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up
        }
        let run = cmd.output().map_err(|e| format!("could not start {}: {e}", sidecar.display()))?;
        let glb = std::fs::read(&out);
        let _ = std::fs::remove_file(&out);
        if !run.status.success() {
            return Err(String::from_utf8_lossy(&run.stderr).lines().filter(|l| l.starts_with("error")).collect::<Vec<_>>().join("; "));
        }
        glb.map(tauri::ipc::Response::new).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A per-call number so concurrent imports never share a temp file.
fn unique() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    N.fetch_add(1, Ordering::Relaxed)
}

fn main() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let app = tauri::Builder::default()
        // a second launch (double-clicking another file) hands its files to the running window
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let paths = file_args(argv, Path::new(&cwd));
            if !paths.is_empty() {
                let _ = app.emit("open-paths", paths);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Pending(Mutex::new(file_args(std::env::args(), &cwd))))
        .invoke_handler(tauri::generate_handler![pending_paths, native_import])
        .build(tauri::generate_context!())
        .expect("error while building ShapeBridge");

    app.run(|_app, _event| {
        // macOS delivers "Open with" and double-clicked files as an event, not as arguments
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            // queue for a page that is still loading, and tell a page that is already listening
            _app.state::<Pending>().0.lock().unwrap().extend(paths.clone());
            let _ = _app.emit("open-paths", paths);
        }
    });
}
