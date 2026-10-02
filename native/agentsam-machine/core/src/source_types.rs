//! Shared source-type taxonomy loaded from the crate-vendored source-types contract.
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

const SOURCE_TYPES_JSON: &str = include_str!("../contracts/source-types.v1.json");

#[derive(Debug, Clone, Deserialize)]
pub struct SourceTypeDef {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub extensions: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub knowledge: bool,
    #[serde(default)]
    pub ast: bool,
    #[serde(default)]
    #[allow(dead_code)]
    pub frontend: bool,
    #[serde(default)]
    pub syntax_by_extension: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct SourceTypesFile {
    types: Vec<SourceTypeDef>,
}

#[derive(Debug)]
pub struct SourceTypeIndex {
    by_extension: HashMap<String, SourceTypeDef>,
}

impl SourceTypeIndex {
    pub fn global() -> &'static Self {
        static INDEX: OnceLock<SourceTypeIndex> = OnceLock::new();
        INDEX.get_or_init(|| {
            let parsed: SourceTypesFile =
                serde_json::from_str(SOURCE_TYPES_JSON).expect("source-types.v1.json must parse");
            let mut by_extension = HashMap::new();
            for def in parsed.types {
                for ext in &def.extensions {
                    by_extension.insert(ext.to_ascii_lowercase(), def.clone());
                }
            }
            SourceTypeIndex { by_extension }
        })
    }

    pub fn for_path(&self, relative: &str) -> Option<&SourceTypeDef> {
        let lower = relative.to_ascii_lowercase();
        if lower.ends_with(".d.ts") {
            return self.by_extension.get(".ts");
        }
        let ext = lower
            .rsplit_once('.')
            .map(|(_, e)| format!(".{e}"))
            .unwrap_or_default();
        if ext.is_empty() {
            return None;
        }
        self.by_extension.get(&ext)
    }

    pub fn syntax_for(&self, relative: &str, def: &SourceTypeDef) -> Option<String> {
        let lower = relative.to_ascii_lowercase();
        let ext = lower
            .rsplit_once('.')
            .map(|(_, e)| format!(".{e}"))
            .unwrap_or_default();
        def.syntax_by_extension
            .get(&ext)
            .cloned()
            .or_else(|| Some(def.id.clone()))
    }
}
