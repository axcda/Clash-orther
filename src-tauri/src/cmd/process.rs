use crate::cmd::CmdResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcessItem {
    pub pid: u32,
    pub name: String,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn get_running_processes() -> CmdResult<Vec<RunningProcessItem>> {
    #[cfg(target_os = "windows")]
    {
        Ok(get_windows_running_processes())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "windows")]
fn get_windows_running_processes() -> Vec<RunningProcessItem> {
    use std::collections::HashSet;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };

    let mut result = Vec::new();
    let mut seen_names = HashSet::new();

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return result;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let pid = entry.th32ProcessID;
                if pid > 4 {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..len]);

                    if !name.is_empty() && seen_names.insert(name.to_lowercase()) {
                        let mut path: Option<String> = None;

                        let h_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                        if !h_proc.is_null() {
                            let mut buf = [0u16; 1024];
                            let mut size = buf.len() as u32;
                            if QueryFullProcessImageNameW(h_proc, 0, buf.as_mut_ptr(), &mut size) != 0 && size > 0 {
                                path = Some(String::from_utf16_lossy(&buf[..size as usize]));
                            }
                            CloseHandle(h_proc);
                        }

                        result.push(RunningProcessItem { pid, name, path });
                    }
                }

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }

    result.sort_by_key(|a| a.name.to_lowercase());
    result
}
