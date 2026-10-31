//! Tiny view-only sidecar. Original node recovery JSON remains authoritative.
use serde_json::Value;

pub fn valid_view(view: &Value) -> bool {
    view.get("activeCanvasId")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.is_empty() && id.len() <= 200)
        && view
            .get("scale")
            .and_then(Value::as_f64)
            .is_some_and(|value| value.is_finite() && value > 0.0 && value <= 100.0)
        && ["width", "height"].iter().all(|key| {
            view.get("size")
                .and_then(|v| v.get(key))
                .and_then(Value::as_f64)
                .is_some_and(|v| v.is_finite() && v > 0.0 && v <= 1_000_000.0)
        })
        && ["left", "top"].iter().all(|key| {
            view.get("scroll")
                .and_then(|v| v.get(key))
                .and_then(Value::as_f64)
                .is_some_and(|v| v.is_finite() && v >= 0.0)
        })
        && view
            .get("updatedAt")
            .and_then(Value::as_i64)
            .is_some_and(|value| value > 0)
        && view.get("items").is_none()
}

/// Sidecar cannot supply/delete nodes, switch canvases, or override a newer full
/// snapshot. A corrupt/missing sidecar is ignored during normal recovery.
pub fn merge_view(state: &mut Value, view: &Value) -> bool {
    if !valid_view(view)
        || !state
            .get("items")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty())
        || state.get("activeCanvasId").and_then(Value::as_str)
            != view.get("activeCanvasId").and_then(Value::as_str)
        || state.get("updatedAt").and_then(Value::as_i64).unwrap_or(0)
            > view["updatedAt"].as_i64().unwrap_or(0)
    {
        return false;
    }
    for key in ["scale", "size", "scroll", "updatedAt"] {
        state[key] = view[key].clone();
    }
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn view() -> Value {
        json!({"activeCanvasId":"canvas-a","scale":0.4,"size":{"width":4000,"height":3000},"scroll":{"left":10,"top":20},"updatedAt":200})
    }
    fn state() -> Value {
        json!({"activeCanvasId":"canvas-a","items":[{"id":"original","thumbnail":"original-user-bytes"}],"updatedAt":100})
    }
    #[test]
    fn merges_only_matching_newer_view_without_touching_original_nodes() {
        let mut state = state();
        let items = state["items"].clone();
        assert!(merge_view(&mut state, &view()));
        assert_eq!(state["items"], items);
        assert_eq!(state["scale"], 0.4);
    }
    #[test]
    fn ignores_foreign_older_missing_or_corrupt_view_state() {
        let old = state();
        for patch in [
            json!({"activeCanvasId":"other"}),
            json!({"updatedAt":50}),
            json!({"scale":-1}),
            json!({"items":[]}),
            json!({"scroll":{"left":-1,"top":0}}),
        ] {
            let mut view = view();
            for (key, value) in patch.as_object().unwrap() {
                view[key] = value.clone();
            }
            let mut candidate = old.clone();
            assert!(!merge_view(&mut candidate, &view));
            assert_eq!(candidate, old);
        }
        let mut empty = json!({"activeCanvasId":"canvas-a","items":[]});
        assert!(!merge_view(&mut empty, &view()));
        let mut legacy = json!({"items":[{"id":"legacy"}]});
        assert!(!merge_view(&mut legacy, &view()));
    }
}
