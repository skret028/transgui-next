//! Being the system's handler for magnet links and `.torrent` files.
//!
//! The original declares both in its `Info.plist` and lets macOS decide; its
//! "Handle … by %s" checkboxes are a Windows-registry thing (`{$ifdef
//! mswindows}` guards that whole block). The bundle here declares the same two,
//! and this module is the piece macOS has no equivalent for: asking
//! LaunchServices to hand the scheme and the file type to this app, and asking
//! it back so the setting can be shown as it really is.
//!
//! Nothing here invents a preference: it changes the system's own default
//! handler, which the user can also set in Finder, and it reads that rather
//! than caching what this app last wrote — so a change made elsewhere shows up.

/// What the app can be the handler for, and whether it currently is.
///
/// `supported` is false where this is not implemented, so the UI can say
/// nothing rather than show a switch that cannot move.
#[derive(serde::Serialize)]
pub struct HandlerState {
    pub supported: bool,
    pub torrent: bool,
    pub magnet: bool,
}

#[cfg(target_os = "macos")]
mod mac {
    use super::HandlerState;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    /// `kLSRolesAll`: match every role, so the answer is about the app rather
    /// than about whether it opens the type as a viewer or as an editor.
    const LS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultHandlerForURLScheme(scheme: CFStringRef, handler: CFStringRef) -> i32;
        fn LSCopyDefaultHandlerForURLScheme(scheme: CFStringRef) -> CFStringRef;

        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler: CFStringRef,
        ) -> i32;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
        ) -> CFStringRef;

        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforming_to: CFStringRef,
        ) -> CFStringRef;

        /// A CFStringRef constant naming the "filename extension" tag class.
        static kUTTagClassFilenameExtension: CFStringRef;
    }

    /// The UTI macOS uses for `.torrent` files.
    ///
    /// Asked of the system rather than hardcoded: on a Mac with no client
    /// installed that declares the type, `.torrent` has only a dynamic UTI,
    /// derived from the extension, and an invented identifier would set a
    /// handler nobody consults.
    fn torrent_uti() -> Option<String> {
        let class = unsafe { kUTTagClassFilenameExtension };
        let ext = CFString::new("torrent");
        let uti = unsafe {
            UTTypeCreatePreferredIdentifierForTag(
                class,
                ext.as_concrete_TypeRef(),
                std::ptr::null(),
            )
        };
        if uti.is_null() {
            return None;
        }
        Some(unsafe { CFString::wrap_under_create_rule(uti) }.to_string())
    }

    /// The owning reference the `Copy`-named functions hand back.
    fn taken(ptr: CFStringRef) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        Some(unsafe { CFString::wrap_under_create_rule(ptr) }.to_string())
    }

    pub fn is_url_scheme_handler(scheme: &str, bundle_id: &str) -> bool {
        let scheme_cf = CFString::new(scheme);
        let current = unsafe { LSCopyDefaultHandlerForURLScheme(scheme_cf.as_concrete_TypeRef()) };
        taken(current).is_some_and(|s| s == bundle_id)
    }

    pub fn is_content_type_handler(bundle_id: &str) -> bool {
        let Some(uti) = torrent_uti() else {
            return false;
        };
        let uti_cf = CFString::new(&uti);
        let current = unsafe {
            LSCopyDefaultRoleHandlerForContentType(uti_cf.as_concrete_TypeRef(), LS_ROLES_ALL)
        };
        taken(current).is_some_and(|s| s == bundle_id)
    }

    pub fn state(bundle_id: &str) -> HandlerState {
        HandlerState {
            supported: true,
            torrent: is_content_type_handler(bundle_id),
            magnet: is_url_scheme_handler("magnet", bundle_id),
        }
    }

    pub fn set(bundle_id: &str, kind: &str, on: bool) -> Result<(), String> {
        let mine = CFString::new(bundle_id);
        if !on {
            // Handing a scheme or a file type to *nobody* is not something
            // macOS offers: once a handler is set, one app always has it. Being
            // told that is better than a switch that silently does nothing.
            return Err("系统不允许取消，只能改成别的应用".into());
        }
        let status = match kind {
            "magnet" => {
                let scheme = CFString::new("magnet");
                unsafe {
                    LSSetDefaultHandlerForURLScheme(
                        scheme.as_concrete_TypeRef(),
                        mine.as_concrete_TypeRef(),
                    )
                }
            }
            "torrent" => {
                let Some(uti) = torrent_uti() else {
                    return Err("系统没有为 .torrent 给出文件类型".into());
                };
                let uti_cf = CFString::new(&uti);
                unsafe {
                    LSSetDefaultRoleHandlerForContentType(
                        uti_cf.as_concrete_TypeRef(),
                        LS_ROLES_ALL,
                        mine.as_concrete_TypeRef(),
                    )
                }
            }
            other => return Err(format!("未知的类型：{other}")),
        };
        if status != 0 {
            return Err(format!("LaunchServices 拒绝了：OSStatus {status}"));
        }
        Ok(())
    }
}

/// Everything the app can be the handler for, as the system sees it now.
#[tauri::command]
pub fn rpc_handler_state(app: tauri::AppHandle) -> HandlerState {
    #[cfg(target_os = "macos")]
    {
        mac::state(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        HandlerState {
            supported: false,
            torrent: false,
            magnet: false,
        }
    }
}

/// Take over handling for one of the two, or explain why that cannot be done.
#[tauri::command]
pub fn rpc_set_handler(app: tauri::AppHandle, kind: String, on: bool) -> Result<HandlerState, String> {
    #[cfg(target_os = "macos")]
    {
        mac::set(&app.config().identifier, &kind, on)?;
        Ok(mac::state(&app.config().identifier))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, kind, on);
        Err("这个平台由安装程序负责文件关联".into())
    }
}
