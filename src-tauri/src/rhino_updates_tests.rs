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
    (Component { id: id.into(), version: format!("1.0.{revision}"), revision, url: format!("https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/rhino-updates/rhino-{id}-1.0.{revision}-{revision}.bundle.json"), urls: vec![], sha256: sha(&bytes), size: bytes.len() as u64 }, bytes)
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

const GITEE_INDEX: &str = "https://gitee.com/zibinyou/inspiration-drawer/releases/download/rhino-updates/latest.json";
const ATTACHMENT: &str = "https://gitee.com/zibinyou/inspiration-drawer/attach_files/123/download/latest.json";
const CDN: &str = "https://foruda.gitee.com/attach_file/987654321/latest.json?signature=test";
const GITHUB_INDEX: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/rhino-updates/latest.json";
const GH_CDN: &str = "https://release-assets.githubusercontent.com/github-production-release-asset/123/abc-def?test=1";

#[test]
fn release_start_is_bound_to_repo_tag_and_signed_component_filename() {
    for good in [GITEE_INDEX.to_owned(), GITHUB_INDEX.to_owned(), GITEE_INDEX.replace("gitee.com/", "gitee.com:443/")] {
        assert!(release_start(&good, INDEX_FILE).is_ok());
    }
    for bad in [ATTACHMENT.into(), CDN.into(), GH_CDN.into(), GITEE_INDEX.replace("https:", "http:"),
        GITEE_INDEX.replace("gitee.com", "localhost"), GITEE_INDEX.replace("gitee.com", "gitee.com:444"),
        GITEE_INDEX.replace("gitee.com", "u:p@gitee.com"), GITEE_INDEX.replace("gitee.com", "gitee.com.evil.test"),
        GITEE_INDEX.replace("gitee.com", "@gitee.com"), GITEE_INDEX.replace("zibinyou", "other"),
        GITEE_INDEX.replace("rhino-updates/", "latest/"), GITEE_INDEX.replace("/download/", "/download/test/../"),
        GITEE_INDEX.replace("latest.json", "%6catest.json"), format!("{GITEE_INDEX}?x=y"), format!("{GITEE_INDEX}#x")] {
        assert!(release_start(&bad, INDEX_FILE).is_err(), "accepted invalid start: {bad}");
    }
    let (component, _) = package("plugin8", 12);
    for wrong in [component.url.replace("plugin8", "plugin9"), component.url.replace("1.0.12-12", "1.0.12-13"),
                  component.url.replace("1.0.12-12", "1.0.13-12"), GITEE_INDEX.to_owned(), CDN.to_owned()] {
        let mut altered = component.clone(); altered.urls.push(wrong);
        assert!(verify_catalog(&catalog(vec![altered]), &channel()).is_err());
    }
}

fn hop(from: &str, previous: &[&str], next: &str) -> bool {
    let start = release_start(from, INDEX_FILE).unwrap();
    let chain: Vec<_> = previous.iter().map(|u| url::Url::parse(u).unwrap()).collect();
    transport::allowed_redirect(&start, INDEX_FILE, &chain, &url::Url::parse(next).unwrap())
}

#[test]
fn gitee_requires_exact_attachment_then_exact_terminal_cdn() {
    assert!(hop(GITEE_INDEX, &[GITEE_INDEX], ATTACHMENT));
    assert!(hop(GITEE_INDEX, &[GITEE_INDEX, ATTACHMENT], CDN));
    for bad in [CDN.into(), GH_CDN.into(), GITHUB_INDEX.into(), GITEE_INDEX.into(),
        ATTACHMENT.replace("zibinyou", "other"), ATTACHMENT.replace("inspiration-drawer/", "inspiration-drawer-copy/"),
        ATTACHMENT.replace("/123/", "/other/"), ATTACHMENT.replace("/123/", "//"), ATTACHMENT.replace("/123/", "/123/4/"),
        ATTACHMENT.replace("latest.json", "different.json"), ATTACHMENT.replace("/download/", "/preview/"),
        format!("{ATTACHMENT}?next=x"), format!("{ATTACHMENT}#x"), ATTACHMENT.replace("https://", "https://u:p@"),
        ATTACHMENT.replace("gitee.com/", "gitee.com:444/"), ATTACHMENT.replace("latest.json", "%2Flatest.json")] {
        assert!(!hop(GITEE_INDEX, &[GITEE_INDEX], &bad), "unexpected first hop: {bad}");
    }
    for bad in [GH_CDN.into(), ATTACHMENT.into(), GITEE_INDEX.into(), CDN.replace("https:", "http:"),
        CDN.replace("foruda.gitee.com", "other.gitee.com"), CDN.replace("foruda.gitee.com", "foruda.gitee.com.evil.test"),
        CDN.replace("foruda.gitee.com", "u:p@foruda.gitee.com"), CDN.replace("gitee.com/", "gitee.com:444/"),
        CDN.replace("attach_file/", "anything/"), CDN.replace("/987654321/", "/id/"),
        CDN.replace("latest.json", "other.bundle.json"), format!("{CDN}#x")] {
        assert!(!hop(GITEE_INDEX, &[GITEE_INDEX, ATTACHMENT], &bad), "unexpected second hop: {bad}");
    }
    assert!(!hop(GITEE_INDEX, &[GITEE_INDEX, GITHUB_INDEX], CDN));
    assert!(!hop(GITEE_INDEX, &[GITEE_INDEX, ATTACHMENT, CDN], CDN));
    assert!(!hop(GITEE_INDEX, &[GITHUB_INDEX], ATTACHMENT));
    assert!(!hop(GITEE_INDEX, &[], ATTACHMENT));
}

#[test]
fn github_mirror_keeps_its_own_terminal_cdn() {
    for host in ["release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"] {
        assert!(hop(GITHUB_INDEX, &[GITHUB_INDEX], &GH_CDN.replace("release-assets.githubusercontent.com", host)));
    }
    assert!(!hop(GITHUB_INDEX, &[GITHUB_INDEX], ATTACHMENT));
    assert!(!hop(GITHUB_INDEX, &[GITHUB_INDEX], CDN));
    assert!(!hop(GITHUB_INDEX, &[GITHUB_INDEX, GH_CDN], GH_CDN));
    assert!(!hop(GITHUB_INDEX, &[GITHUB_INDEX], &GH_CDN.replace("github-production-release-asset", "other")));
}

#[test]
fn refused_or_corrupt_mirror_falls_back_but_never_accepts_unverified_bytes() {
    let (mut c, bytes) = package("runtime", 1);
    let gitee = c.url.replace("github.com/jiuqu1122-ops", "gitee.com/zibinyou");
    c.urls = vec![gitee.clone()]; // canonical GitHub URL is the final fallback
    for refused in [true, false] {
        let mut sources = Vec::new();
        let verified = download_component_with(&c, |source, file, limit| {
            sources.push(source.to_owned());
            assert_eq!(file, c.filename()); assert_eq!(limit, c.size);
            if source == gitee && refused { Err("Untrusted Rhino update redirect".into()) }
            else if source == gitee { Ok(Some(vec![0; bytes.len()])) }
            else { Ok(Some(bytes.clone())) }
        }).unwrap();
        assert_eq!(sources, [gitee.clone(), c.url.clone()]); assert_eq!(verified, bytes);
    }
    assert!(download_component_with(&c, |_, _, _| Ok(Some(vec![0; bytes.len()]))).is_err());
}

#[test]
#[ignore = "Opt-in anonymous production GETs; baseline expects published plugin8/9 36.15 r12"]
fn live_gitee_signed_36_15_readback() {
    // No mirror substitution, cache writes, plugin registration, or installation.
    let channel = config().unwrap();
    assert!(channel.endpoints.iter().any(|s| s == GITEE_INDEX));
    let envelope = download(GITEE_INDEX, INDEX_FILE, MAX_CATALOG).unwrap().expect("missing public fixed index");
    let verified = verify_catalog(&envelope, &channel).unwrap();
    println!("Rhino signed index: {} bytes SHA256 {}", envelope.len(), sha(&envelope));
    for id in ["runtime", "plugin8", "plugin9"] {
        let c = verified.components.iter().find(|c| c.id == id).expect("missing signed component");
        if id != "runtime" { assert_eq!((c.version.as_str(), c.revision), ("0.1.0-beta.36.15", 12), "live baseline changed for {id}"); }
        let bytes = download_component_with(c, |source, file, limit| {
            // A passing run must use Gitee for each artifact, not succeed via GitHub fallback.
            assert!(source.starts_with("https://gitee.com/"), "Gitee was not the successful component source");
            download(source, file, limit)
        }).unwrap();
        println!("{id} {} r{}: {} bytes SHA256 {}", c.version, c.revision, bytes.len(), sha(&bytes));
    }
}
