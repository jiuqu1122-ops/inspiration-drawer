use super::*;
use ed25519_dalek::{Signer, SigningKey};

fn channel() -> Channel {
    Channel { schema: 1, channel: "rhino-v1".into(), public_key: STANDARD.encode(SigningKey::from_bytes(&[42; 32]).verifying_key().as_bytes()), endpoints: vec![] }
}
fn temp() -> PathBuf {
    let root = std::env::temp_dir().join(format!("rhino-component-update-{}-{:016x}", std::process::id(), rand::random::<u64>()));
    fs::create_dir(&root).unwrap(); root
}
fn package(id: &str, revision: u64) -> (Component, Vec<u8>) {
    let files = if id == "runtime" {
        BTreeMap::from([("runtime.js".to_string(), STANDARD.encode(format!("export const apiVersion=1; export const revision={revision};")))])
    } else {
        PLUGIN_FILES.iter().map(|name| (name.to_string(), STANDARD.encode(match *name {
            "InspirationDrawer.Rhino.rhp" => b"MZfixture".to_vec(),
            "InspirationDrawer.Rhino.runtimeconfig.json" => format!(r#"{{"runtimeOptions":{{"tfm":"{}"}}}}"#, if id == "plugin8" { "net7.0" } else { "net8.0" }).into_bytes(),
            _ => b"fixture".to_vec(),
        }))).collect()
    };
    let bytes = serde_json::to_vec(&serde_json::json!({"schema":1,"id":id,"files":files})).unwrap();
    (Component { id: id.into(), version: format!("1.0.{revision}"), revision, url: format!("https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/rhino-updates/{id}-{revision}.json"), urls: vec![], sha256: sha(&bytes), size: bytes.len() as u64 }, bytes)
}
fn envelope(value: serde_json::Value) -> Vec<u8> {
    let signed = serde_json::to_vec(&value).unwrap();
    serde_json::to_vec(&serde_json::json!({"signed": STANDARD.encode(&signed), "signature": STANDARD.encode(SigningKey::from_bytes(&[42; 32]).sign(&signed).to_bytes())})).unwrap()
}
fn catalog(components: Vec<Component>) -> Vec<u8> { envelope(serde_json::json!({"schema":1,"channel":"rhino-v1","hostApi":1,"components":components})) }

#[test]
fn signatures_and_host_compatibility_are_required_before_download() {
    let (component, _) = package("runtime", 1);
    let valid = catalog(vec![component.clone()]);
    assert!(verify_catalog(&valid, &channel()).is_ok());
    let mut wrong_key = channel(); wrong_key.public_key = STANDARD.encode([13; 32]);
    assert!(verify_catalog(&valid, &wrong_key).is_err());
    for value in [
        serde_json::json!({"schema":1,"channel":"other","hostApi":1,"components":[component]}),
        serde_json::json!({"schema":1,"channel":"rhino-v1","hostApi":2,"components":[component]}),
        serde_json::json!({"schema":1,"channel":"rhino-v1","hostApi":1,"components":[component,component]}),
    ] { assert!(verify_catalog(&envelope(value), &channel()).is_err()); }
    assert!(apply_catalog(&temp(), &catalog(vec![]), &channel(), |_| panic!("invalid catalog must not download")).is_err());
}

#[test]
fn runtime_and_native_plugin_are_selected_independently_and_latest_is_untouched() {
    let root = temp(); let (runtime, runtime_bytes) = package("runtime", 1); let (plugin, plugin_bytes) = package("plugin9", 1);
    let first = catalog(vec![runtime.clone(), plugin.clone()]);
    assert_eq!(apply_catalog(&root, &first, &channel(), |c| Ok(if c.id == "runtime" { runtime_bytes.clone() } else { plugin_bytes.clone() })).unwrap(), vec!["runtime", "plugin9"]);
    let before = fs::read(root.join("state.json")).unwrap();
    assert!(apply_catalog(&root, &first, &channel(), |_| panic!("latest must not download again")).unwrap().is_empty());
    assert_eq!(fs::read(root.join("state.json")).unwrap(), before);
    let (next, next_bytes) = package("runtime", 2);
    apply_catalog(&root, &catalog(vec![next]), &channel(), |_| Ok(next_bytes.clone())).unwrap();
    let state = read_state(&root).unwrap();
    assert_eq!(selected(&root, &state.current["runtime"], &channel()).unwrap().0.revision, 2);
    assert_eq!(selected(&root, &state.current["plugin9"], &channel()).unwrap().0.revision, 1);
}

#[test]
fn incomplete_download_never_activates_half_a_release() {
    let root = temp(); let (first, first_bytes) = package("runtime", 1);
    apply_catalog(&root, &catalog(vec![first]), &channel(), |_| Ok(first_bytes.clone())).unwrap();
    let before = fs::read(root.join("state.json")).unwrap();
    let (runtime, runtime_bytes) = package("runtime", 2); let (plugin, _) = package("plugin8", 2);
    assert!(apply_catalog(&root, &catalog(vec![runtime, plugin]), &channel(), |c| if c.id == "runtime" { Ok(runtime_bytes.clone()) } else { Err("connection lost".into()) }).is_err());
    assert_eq!(fs::read(root.join("state.json")).unwrap(), before);
}

#[test]
fn altered_payloads_paths_and_wrong_rhino_runtime_are_rejected() {
    let (mut component, bytes) = package("runtime", 1);
    assert!(decode_bundle(b"changed", &component).is_err());
    let invalid = serde_json::to_vec(&serde_json::json!({"schema":1,"id":"runtime","files":{"../runtime.js":STANDARD.encode("x")}})).unwrap();
    component.sha256 = sha(&invalid); component.size = invalid.len() as u64;
    assert!(decode_bundle(&invalid, &component).is_err());
    let (mut wrong_plugin, plugin_bytes) = package("plugin8", 1); wrong_plugin.id = "plugin9".into();
    let mut body: serde_json::Value = serde_json::from_slice(&plugin_bytes).unwrap(); body["id"] = "plugin9".into();
    let wrong_bytes = serde_json::to_vec(&body).unwrap(); wrong_plugin.sha256 = sha(&wrong_bytes); wrong_plugin.size = wrong_bytes.len() as u64;
    assert!(decode_bundle(&wrong_bytes, &wrong_plugin).is_err());
    assert!(!bytes.is_empty());
    for url in ["http://github.com/jiuqu1122-ops/inspiration-drawer/releases/x", "https://127.0.0.1/x", "https://github.com/other/repository/releases/x", "https://github.com@evil.test/x"] { assert!(trusted_url(url).is_err()); }
}

#[test]
fn every_load_rechecks_extracted_code_and_rollback_remains_available() {
    let root = temp(); let (component, bytes) = package("runtime", 1);
    apply_catalog(&root, &catalog(vec![component.clone()]), &channel(), |_| Ok(bytes.clone())).unwrap();
    fs::write(root.join("components").join(component.sha256).join("runtime.js"), b"tampered").unwrap();
    assert!(selected(&root, &read_state(&root).unwrap().current["runtime"], &channel()).is_err());
    let status = status_at(&root, &channel()).unwrap();
    assert!(status.can_rollback); assert!(status.components[0].error.is_some());
    rollback_at(&root, &channel()).unwrap();
    assert!(read_state(&root).unwrap().current.is_empty());
}

#[test]
fn explicit_rollback_is_not_undone_by_the_next_automatic_check() {
    let root = temp();
    let (first, first_bytes) = package("runtime", 1); let first_catalog = catalog(vec![first]);
    apply_catalog(&root, &first_catalog, &channel(), |_| Ok(first_bytes.clone())).unwrap();
    let (next, next_bytes) = package("runtime", 2); let next_catalog = catalog(vec![next]);
    apply_catalog(&root, &next_catalog, &channel(), |_| Ok(next_bytes.clone())).unwrap();
    rollback_at(&root, &channel()).unwrap();
    assert_eq!(selected(&root, &read_state(&root).unwrap().current["runtime"], &channel()).unwrap().0.revision, 1);
    assert!(apply_catalog(&root, &next_catalog, &channel(), |_| panic!("rolled-back release must stay held")).unwrap().is_empty());
    let (newer, newer_bytes) = package("runtime", 3);
    apply_catalog(&root, &catalog(vec![newer]), &channel(), |_| Ok(newer_bytes.clone())).unwrap();
    assert_eq!(selected(&root, &read_state(&root).unwrap().current["runtime"], &channel()).unwrap().0.revision, 3);
}
