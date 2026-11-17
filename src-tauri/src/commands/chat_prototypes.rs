//! Writes genuine Sketch document archives for direct Figma import. No plugin,
//! script, remote client, user-controlled filesystem path or fake .fig format.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashSet, fs::{self, File}, io::Write, path::Path};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};
const SOURCE_LIMIT: usize = 2_000_000;
const ARCHIVE_SOURCE_LIMIT: usize = 12_000_000;
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrototypeRequest { conversation_id: String, prototype_json: String, sketch_json: String }
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SketchParts { document: Value, meta: Value, user: Value, pages: Vec<SketchPage>, images: Vec<SketchImage>, warnings: Vec<String> }
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SketchPage { id: String, content: Value }
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SketchImage { name: String, data: String }
fn safe_name(value: &str, fallback: &str) -> String {
    let name: String = value.chars().filter(|character| !character.is_control())
        .map(|character| if "<>:\"/\\|?*".contains(character) { '_' } else { character }).take(80).collect();
    let name = name.trim().trim_matches('.');
    if name.is_empty() { fallback.into() } else { name.into() }
}
fn valid_uuid(value: &str) -> bool {
    value.len() == 36 && value.bytes().enumerate().all(|(i,b)| if [8,13,18,23].contains(&i) { b==b'-' } else { b.is_ascii_digit() || (b'A'..=b'F').contains(&b) })
}
fn validate_objects(value: &Value, ids: &mut HashSet<String>, image_refs: &mut HashSet<String>, flow_refs: &mut Vec<String>, count: &mut usize, depth: usize) -> Result<(), String> {
    if depth > 64 { return Err("Sketch 文档层级过深".into()); }
    match value {
        Value::Object(object) => {
            *count += 1; if *count > 250_000 { return Err("Sketch 导出对象过多，请拆分设计".into()); }
            if let Some(id)=object.get("do_objectID") {
                let id=id.as_str().ok_or("Sketch 图层 ID 必须为字符串")?;
                if !valid_uuid(id) || !ids.insert(id.into()) { return Err("Sketch 图层 ID 无效或重复".into()); }
            }
            if object.get("_class").and_then(Value::as_str) == Some("MSJSONFileReference") && object.get("_ref_class").and_then(Value::as_str) == Some("MSImageData") {
                image_refs.insert(object.get("_ref").and_then(Value::as_str).ok_or("图片引用无效")?.into());
            }
            if object.get("_class").and_then(Value::as_str) == Some("MSImmutableFlowConnection") {
                flow_refs.push(object.get("destinationArtboardID").and_then(Value::as_str).ok_or("跳转目标无效")?.into());
            }
            for child in object.values() { validate_objects(child,ids,image_refs,flow_refs,count,depth+1)?; }
        },
        Value::Array(items) => for item in items { validate_objects(item,ids,image_refs,flow_refs,count,depth+1)?; },
        _ => (),
    }
    Ok(())
}
fn validate_request(request: &PrototypeRequest) -> Result<(Value, SketchParts, Vec<Vec<u8>>), String> {
    if request.prototype_json.len() > SOURCE_LIMIT || request.sketch_json.len() > ARCHIVE_SOURCE_LIMIT { return Err("原型或 Sketch 导出数据过大，请拆分设计".into()); }
    let doc:Value=serde_json::from_str(&request.prototype_json).map_err(|_|"原型 JSON 格式错误")?;
    if doc["schemaVersion"]!=1 || doc["name"].as_str().is_none_or(|v|v.trim().is_empty()) || doc["id"].as_str().is_none_or(|v|v.is_empty()) { return Err("原型需要 schemaVersion=1、id 和名称".into()); }
    let screens=doc["screens"].as_array().filter(|v|!v.is_empty()&&v.len()<=24).ok_or("原型需要 1～24 个页面")?;
    let nodes=doc["nodes"].as_array().filter(|v|!v.is_empty()&&v.len()<=2000).ok_or("原型需要 1～2000 个节点")?;
    if doc["interactions"].as_array().is_none_or(|v|v.len()>2000) { return Err("原型交互格式错误或过多".into()); }
    let mut source_ids=HashSet::new();
    for item in screens.iter().chain(nodes.iter()) {
        let id=item["id"].as_str().ok_or("原型节点缺少 ID")?;
        if id.len()>80 || !id.as_bytes().first().is_some_and(u8::is_ascii_alphabetic) || !id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-') || !source_ids.insert(id) { return Err("原型节点 ID 无效或重复".into()); }
        for key in ["width","height"] { if item[key].as_f64().is_none_or(|v|!(1.0..=8192.0).contains(&v)) { return Err("原型尺寸无效".into()); } }
    }
    if !screens.iter().any(|s|s["id"]==doc["startScreenId"]&&s["overlay"]!=true) { return Err("原型起始页面无效".into()); }
    for node in nodes { if !node["parentId"].as_str().is_some_and(|id|source_ids.contains(id)) { return Err("原型父节点不存在".into()); } }
    let parts:SketchParts=serde_json::from_str(&request.sketch_json).map_err(|_|"Sketch 文档结构无效，请重新导出")?;
    if parts.document["_class"]!="document" || parts.pages.is_empty() || parts.pages.len()>3 || parts.images.len()>2000
        || parts.meta["version"]!=121 || parts.meta["compatibilityVersion"]!=99 || !parts.meta["pagesAndArtboards"].is_object() || !parts.user["document"].is_object() {
        return Err("Sketch 文档头、版本或页面结构无效".into());
    }
    let refs=parts.document["pages"].as_array().ok_or("Sketch 缺少页面引用")?;
    if refs.len()!=parts.pages.len() { return Err("Sketch 页面引用数量不匹配".into()); }
    let mut page_ids=HashSet::new();let mut artboards=HashSet::new();
    for (page,reference) in parts.pages.iter().zip(refs) {
        if !valid_uuid(&page.id) || !page_ids.insert(&page.id) || page.content["_class"]!="page" || page.content["do_objectID"]!=page.id
            || reference["_ref"]!=format!("pages/{}",page.id) || reference["_class"]!="MSJSONFileReference" || reference["_ref_class"]!="MSImmutablePage" {
            return Err("Sketch 页面引用或页面 ID 不匹配".into());
        }
        let layers=page.content["layers"].as_array().ok_or("Sketch 页面没有图层数组")?;
        if layers.len()>2000 { return Err("Sketch 画板过多".into()); }
        for layer in layers { if layer["_class"]!="artboard" { return Err("Sketch 顶层需要画板".into()); } artboards.insert(layer["do_objectID"].as_str().ok_or("画板缺少 ID")?.to_string()); }
    }
    let mut ids=HashSet::new();let mut image_refs=HashSet::new();let mut flow_refs=Vec::new();let mut count=0;
    validate_objects(&parts.document,&mut ids,&mut image_refs,&mut flow_refs,&mut count,0)?;
    for page in &parts.pages { validate_objects(&page.content,&mut ids,&mut image_refs,&mut flow_refs,&mut count,0)?; }
    if flow_refs.iter().any(|id|id!="back"&&id!="automatic"&&!artboards.contains(id)) { return Err("Sketch 跳转引用了不存在的画板".into()); }
    let mut names=HashSet::new();let mut images=Vec::new();let mut total_image_bytes=0;
    for image in &parts.images {
        let filename=image.name.strip_prefix("images/").ok_or("Sketch 图片路径无效")?;
        let (image_id,extension)=filename.rsplit_once('.').ok_or("Sketch 图片名无效")?;
        if !valid_uuid(image_id) || !["png","jpg"].contains(&extension) || !names.insert(image.name.clone()) { return Err("Sketch 图片路径不安全或重复".into()); }
        let bytes=STANDARD.decode(&image.data).map_err(|_|"Sketch 图片 Base64 无效")?;
        if (extension=="png"&&!bytes.starts_with(b"\x89PNG\r\n\x1a\n")) || (extension=="jpg"&&!bytes.starts_with(&[0xff,0xd8,0xff])) { return Err("Sketch 图片内容与类型不匹配".into()); }
        total_image_bytes+=bytes.len();if total_image_bytes>4_000_000 { return Err("Sketch 图片数据过大".into()); } images.push(bytes);
    }
    if image_refs!=names { return Err("Sketch 图片引用或内嵌素材不完整".into()); }
    Ok((doc,parts,images))
}
fn write_sketch(path: &Path, parts: &SketchParts, images: &[Vec<u8>]) -> Result<(), String> {
    let file=File::options().write(true).create_new(true).open(path).map_err(|e|format!("创建设计文件失败：{e}"))?;
    let result=(||{
        let mut zip=ZipWriter::new(file);let options=SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let mut json_entry=|name:&str,value:&Value|->Result<(),String>{
            zip.start_file(name,options).map_err(|e|e.to_string())?;
            serde_json::to_writer(&mut zip,value).map_err(|e|e.to_string())
        };
        json_entry("document.json",&parts.document)?;json_entry("meta.json",&parts.meta)?;json_entry("user.json",&parts.user)?;
        for page in &parts.pages { json_entry(&format!("pages/{}.json",page.id),&page.content)?; }
        for (image,bytes) in parts.images.iter().zip(images) {
            zip.start_file(&image.name,options).map_err(|e|e.to_string())?;zip.write_all(bytes).map_err(|e|e.to_string())?;
        }
        zip.finish().map_err(|e|e.to_string())?;Ok(())
    })();
    if result.is_err(){let _=fs::remove_file(path);}result
}
#[tauri::command]
pub async fn chat_create_prototype(app_handle: tauri::AppHandle, request: PrototypeRequest) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||{
        let(doc,parts,images)=validate_request(&request)?;
        let directory=super::chat_files::generated_root(&app_handle)?.join(safe_name(&request.conversation_id,"conversation"));
        fs::create_dir_all(&directory).map_err(|e|format!("创建设计文件目录失败：{e}"))?;
        let id=format!("prototype-{}-{:08x}",chrono::Utc::now().timestamp_millis(),rand::random::<u32>());
        let name=format!("{}.sketch",safe_name(doc["name"].as_str().unwrap(),"交互原型"));let path=directory.join(format!("{id}-{name}"));
        write_sketch(&path,&parts,&images)?;let size=fs::metadata(&path).map_err(|e|e.to_string())?.len();
        Ok(json!({"files":[{"id":id,"name":name,"path":path.to_string_lossy(),"format":"sketch","mimeType":"application/octet-stream","size":size}],
            "prototype":{"id":doc["id"],"name":doc["name"],"screens":doc["screens"].as_array().unwrap().len(),"nodes":doc["nodes"].as_array().unwrap().len(),"interactions":doc["interactions"].as_array().unwrap().len()},
            "warnings":parts.warnings.into_iter().take(8).map(|w|w.chars().take(500).collect::<String>()).collect::<Vec<_>>() }))
    }).await.map_err(|e|format!("设计文件导出失败：{e}"))?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input_with_parts() -> (PrototypeRequest, Value) {
        let page_id="A1234567-1234-1234-1234-123456789ABC";
        let doc=json!({"schemaVersion":1,"id":"test","name":"合成设计","startScreenId":"home","screens":[{"id":"home","width":390,"height":844}],"nodes":[{"id":"title","parentId":"home","kind":"text","width":200,"height":40,"text":"合成"}],"interactions":[]});
        let parts=json!({"document":{"_class":"document","do_objectID":"B1234567-1234-1234-1234-123456789ABC","pages":[{"_class":"MSJSONFileReference","_ref_class":"MSImmutablePage","_ref":format!("pages/{page_id}")}]},
            "meta":{"version":121,"compatibilityVersion":99,"pagesAndArtboards":{}},"user":{"document":{}},
            "pages":[{"id":page_id,"content":{"_class":"page","do_objectID":page_id,"layers":[{"_class":"artboard","do_objectID":"C1234567-1234-1234-1234-123456789ABC","layers":[]}]}}],"images":[],"warnings":[]});
        (PrototypeRequest{conversation_id:"synthetic".into(),prototype_json:doc.to_string(),sketch_json:parts.to_string()},parts)
    }
    #[test]
    fn validates_page_references_and_safe_fixed_archive_paths() {
        let(input,mut parts)=input_with_parts();assert!(validate_request(&input).is_ok());
        parts["document"]["pages"][0]["_ref"]=json!("../secret");
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).unwrap_err().contains("页面引用"));
        let(input,mut parts)=input_with_parts();parts["pages"][0]["id"]=json!("../../outside");
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).is_err());
    }
    #[test]
    fn validates_image_paths_binary_types_and_references() {
        let(input,mut parts)=input_with_parts();parts["images"]=json!([{"name":"images/../../outside.png","data":"eA=="}]);
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).unwrap_err().contains("路径"));
        let(input,mut parts)=input_with_parts();parts["images"]=json!([{"name":"images/D1234567-1234-1234-1234-123456789ABC.png","data":"eA=="}]);
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).unwrap_err().contains("类型不匹配"));
        let(input,mut parts)=input_with_parts();parts["images"]=json!([{"name":"images/D1234567-1234-1234-1234-123456789ABC.png","data":STANDARD.encode(b"\x89PNG\r\n\x1a\nsynthetic")}]);
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).unwrap_err().contains("素材不完整"));
    }
    #[test]
    fn rejects_missing_flow_targets_and_duplicate_page_uuids() {
        let(input,mut parts)=input_with_parts();parts["pages"][0]["content"]["layers"][0]["flow"]=json!({"_class":"MSImmutableFlowConnection","destinationArtboardID":"D1234567-1234-1234-1234-123456789ABC"});
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).unwrap_err().contains("不存在的画板"));
        let(input,mut parts)=input_with_parts();let page=parts["pages"][0].clone();parts["pages"].as_array_mut().unwrap().push(page);let reference=parts["document"]["pages"][0].clone();parts["document"]["pages"].as_array_mut().unwrap().push(reference);
        assert!(validate_request(&PrototypeRequest{sketch_json:parts.to_string(),..input}).is_err());
    }
    #[test]
    fn actual_container_uses_sketch_entries_and_never_overwrites_an_existing_file() {
        let(input,_)=input_with_parts();let(_,parts,images)=validate_request(&input).unwrap();
        let path=std::env::temp_dir().join(format!("drawer-design-{}.sketch",rand::random::<u64>()));
        write_sketch(&path,&parts,&images).unwrap();let original=fs::read(&path).unwrap();
        assert!(write_sketch(&path,&parts,&images).is_err());assert_eq!(fs::read(&path).unwrap(),original);
        let mut archive=zip::ZipArchive::new(File::open(&path).unwrap()).unwrap();assert_eq!(archive.len(),4);assert!(archive.by_name("document.json").is_ok());assert!(archive.by_name("manifest.json").is_err());drop(archive);fs::remove_file(path).unwrap();
    }
    #[test]
    fn fixed_paths_and_duplicate_ids_are_rejected() {
        assert!(valid_uuid("A1234567-1234-1234-1234-123456789ABC"));assert!(!valid_uuid("../manifest.json"));
        let mut ids=HashSet::new();let mut images=HashSet::new();let mut flows=Vec::new();let mut count=0;
        let v=json!({"do_objectID":"A1234567-1234-1234-1234-123456789ABC","layers":[{"do_objectID":"A1234567-1234-1234-1234-123456789ABC"}]});
        assert!(validate_objects(&v,&mut ids,&mut images,&mut flows,&mut count,0).is_err());
        assert_eq!(safe_name("../../不能覆盖:旧文件","prototype"),"_.._不能覆盖_旧文件");
    }
    #[test]
    fn rejects_invalid_and_oversized_input_before_writing() {
        let input=PrototypeRequest{conversation_id:"synthetic".into(),prototype_json:"{}".into(),sketch_json:"{}".into()};assert!(validate_request(&input).is_err());
        let input=PrototypeRequest{prototype_json:"x".repeat(SOURCE_LIMIT+1),..input};assert!(validate_request(&input).unwrap_err().contains("过大"));
    }
    #[test]
    fn synthetic_fixture_export_through_real_sketch_writer_when_requested() {
        let Some(directory)=std::env::var_os("DRAWER_PROTOTYPE_FIXTURE_DIR") else{return};let directory=std::path::PathBuf::from(directory);assert!(directory.is_absolute());
        let request=PrototypeRequest{conversation_id:"synthetic".into(),prototype_json:fs::read_to_string(directory.join("prototype.json")).unwrap(),sketch_json:fs::read_to_string(directory.join("sketch-parts.json")).unwrap()};
        let(_,parts,images)=validate_request(&request).unwrap();let path=directory.join(format!("prototype-sample-{}.sketch",chrono::Utc::now().timestamp_millis()));
        write_sketch(&path,&parts,&images).unwrap();println!("SKETCH_FIXTURE {}",path.display());
        let mut archive=zip::ZipArchive::new(File::open(&path).unwrap()).unwrap();assert!(archive.by_name("document.json").is_ok());assert!(archive.by_name("manifest.json").is_err());
        assert!(write_sketch(&path,&parts,&images).is_err());
    }
}
