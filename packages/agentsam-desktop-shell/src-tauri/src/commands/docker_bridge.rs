//! Docker contexts allow local socket and configured SSH/TLS engines.
//! Privileged calls remain in the native host, never browser JavaScript.
use serde::Deserialize;
use serde_json::{json,Value};
use sha2::{Sha256,Digest};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{process::{Command,Stdio},io::Write};

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct DockerRequest {
  action:String,context:Option<String>,container:Option<String>,endpoint:Option<String>,
  root:Option<String>,path:Option<String>,destination:Option<String>,
  content:Option<String>,expected_version:Option<String>,approved:Option<bool>,
}
fn name(v:Option<&str>)->Result<String,String>{
  let s=v.unwrap_or("");
  if s.is_empty()||s.len()>128||!s.bytes().all(|c|c.is_ascii_alphanumeric()||b"_.-".contains(&c)){return Err("docker_identifier_invalid".into());}
  Ok(s.into())
}
fn root(v:Option<&str>)->Result<String,String>{
  let s=v.unwrap_or("").trim_end_matches('/');
  if s.is_empty()||s=="/"||s.len()>500||!s.starts_with('/')||s.contains('\\')||
    s.split('/').any(|x|x=="."||x=="..")||s.chars().any(char::is_control){return Err("docker_root_invalid".into());}
  Ok(s.into())
}
fn rel(v:Option<&str>,dot:bool)->Result<String,String>{
  let s=v.unwrap_or("");
  if dot&&(s.is_empty()||s=="."){return Ok(".".into());}
  if s.is_empty()||s.len()>500||s.starts_with('/')||s.contains('\\')||
    s.split('/').any(|x|x.is_empty()||x=="."||x=="..")||s.chars().any(char::is_control){return Err("docker_relative_path_invalid".into());}
  Ok(s.into())
}
fn hash(b:&[u8])->String{format!("sha256:{:x}",Sha256::digest(b))}
fn executable()->std::path::PathBuf{
  for p in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()){
    let x=p.join(if cfg!(windows){"docker.exe"}else{"docker"});
    if x.is_file(){return x;}
  }
  for s in ["/usr/local/bin/docker","/opt/homebrew/bin/docker","/Applications/Docker.app/Contents/Resources/bin/docker"]{
    if std::path::Path::new(s).is_file(){return s.into();}
  }
  "docker".into()
}
fn docker(argv:&[&str],input:Option<&[u8]>)->Result<Vec<u8>,String>{
  let mut c=Command::new(executable());
  c.args(argv).env("DOCKER_CLIENT_TIMEOUT","15").env("GIT_TERMINAL_PROMPT","0")
    .stdin(if input.is_some(){Stdio::piped()}else{Stdio::null()})
    .stdout(Stdio::piped()).stderr(Stdio::piped());
  let mut p=c.spawn().map_err(|_|"docker_cli_unavailable".to_string())?;
  if let Some(b)=input{p.stdin.take().ok_or("docker_stdin_unavailable")?.write_all(b).map_err(|_|"docker_stdin_failed".to_string())?;}
  let output=p.wait_with_output().map_err(|_|"docker_command_failed".to_string())?;
  if !output.status.success(){return Err(format!("docker_failed:{}",String::from_utf8_lossy(&output.stderr).chars().take(180).collect::<String>()));}
  if output.stdout.len()>16*1024*1024+65536{return Err("docker_result_too_large".into());}
  Ok(output.stdout)
}
fn lines(buf:&[u8])->Result<Vec<Value>,String>{
  let s=std::str::from_utf8(buf).map_err(|_|"docker_invalid_utf8")?;
  if s.lines().count()>3000{return Err("docker_list_limit_exceeded".into());}
  s.lines().filter(|s|!s.is_empty()).map(|line|serde_json::from_str(line).map_err(|_|"docker_invalid_json".into())).collect()
}
fn inside(ctx:&str,id:&str,script:&str,root:&str,path:&str,
  rest:&[&str],input:Option<&[u8]>)->Result<Vec<u8>,String>{
  let mut args=vec!["--context",ctx,"exec"];
  if input.is_some(){args.push("-i");}
  args.extend(["--",id,"sh","-c",script,"agentsam",root,path]);args.extend(rest);
  docker(&args,input)
}
const GUARD:&str=r#"set -eu
cd "$1"
root=$(pwd -P)
f="$2"
parent=$(dirname "$f")
name=$(basename "$f")
cd "$parent"
physical=$(pwd -P)
case "$physical" in "$root"|"$root"/*) ;; *) exit 75;; esac
[ ! -L "$name" ] || exit 76
"#;
fn run(r:DockerRequest)->Result<Value,String>{
  if r.action=="contexts"{
    let rows=lines(&docker(&["context","ls","--format","{{json .}}"],None)?)?;
    let contexts=rows.iter().map(|c|json!({"name":c.get("Name"),"current":c.get("Current"),"description":c.get("Description")})).collect::<Vec<_>>();
    return Ok(json!({"ok":true,"contexts":contexts}));
  }
  if r.action=="createContext" {
    if r.approved!=Some(true){return Err("docker_approval_required".into());}
    let context=name(r.context.as_deref())?;
    let endpoint=r.endpoint.as_deref().ok_or("docker_ssh_endpoint_required")?;
    if !endpoint.starts_with("ssh://")||endpoint.len()>240||!endpoint.contains('@')||
      !endpoint["ssh://".len()..].bytes().all(|b|b.is_ascii_alphanumeric()||b"@._-:".contains(&b)) {
      return Err("docker_ssh_endpoint_invalid".into());
    }
    docker(&["context","create",&context,"--docker",&format!("host={}",endpoint)],None)?;
    return Ok(json!({"ok":true,"context":context}));
  }
  let ctx=name(r.context.as_deref())?;
  if r.action=="health"{
    let b=docker(&["--context",&ctx,"version","--format","{{json .}}"],None)?;
    return Ok(json!({"ok":true,"engine":serde_json::from_slice::<Value>(&b).map_err(|_|"docker_version_invalid")?}));
  }
  if r.action=="containers"{
    return Ok(json!({"ok":true,"containers":lines(&docker(&["--context",&ctx,"ps","-a","--format","{{json .}}"],None)?)?}));
  }
  if r.action=="images"{
    return Ok(json!({"ok":true,"images":lines(&docker(&["--context",&ctx,"images","--format","{{json .}}"],None)?)?}));
  }
  let id=name(r.container.as_deref())?;
  if r.action=="logs"{
    let b=docker(&["--context",&ctx,"logs","--tail","250","--",&id],None)?;
    return Ok(json!({"ok":true,"logs":String::from_utf8_lossy(&b)}));
  }
  if ["start","stop","restart"].contains(&r.action.as_str()){
    if r.approved!=Some(true){return Err("docker_approval_required".into());}
    docker(&["--context",&ctx,r.action.as_str(),"--",&id],None)?;
    return Ok(json!({"ok":true,"container":id}));
  }
  let base=root(r.root.as_deref())?;
  let path=rel(r.path.as_deref(),r.action=="list")?;
  match r.action.as_str(){
    "list"=>{
      let script=r#"set -eu
cd "$1"
root=$(pwd -P)
cd "$2"
physical=$(pwd -P)
case "$physical" in "$root"|"$root"/*) ;; *) exit 75;; esac
find . -mindepth 1 -maxdepth 6 -type d -print | sed 's/^/d /'
find . -mindepth 1 -maxdepth 6 -type f -print | sed 's/^/f /'
"#;
      let b=inside(&ctx,&id,script,&base,&path,&[],None)?;
      let txt=std::str::from_utf8(&b).map_err(|_|"docker_invalid_listing")?;
      if txt.lines().count()>3000{return Err("docker_listing_limit".into());}
      let entries=txt.lines().filter_map(|line|{
        if line.chars().any(char::is_control){return None;}
        let (kind,item)=line.split_once(' ')?;
        let item=item.trim_start_matches("./");
        Some(json!({"path":if path=="."{item.to_string()}else{format!("{}/{}",path,item)},
          "kind":if kind=="d"{"folder"}else{"file"}}))
      }).collect::<Vec<_>>();
      Ok(json!({"ok":true,"entries":entries}))
    },
    "read"|"preview"=>{
      let script=format!("{}[ -f \"$name\" ] || exit 77\ncat \"$name\"\n",GUARD);
      let b=inside(&ctx,&id,&script,&base,&path,&[],None)?;
      let limit=if r.action=="read"{2*1024*1024}else{16*1024*1024};
      if b.len()>limit{return Err("docker_file_too_large".into());}
      let version=hash(&b);
      if r.action=="preview"{return Ok(json!({"ok":true,"path":path,"version":version,"contentBase64":STANDARD.encode(b)}));}
      let content=String::from_utf8(b).map_err(|_|"docker_binary_preview_required")?;
      Ok(json!({"ok":true,"path":path,"version":version,"content":content}))
    },
    "create"|"write"=>{
      if r.approved!=Some(true){return Err("docker_approval_required".into());}
      let content=r.content.as_deref().ok_or("docker_content_required")?;
      if content.len()>2*1024*1024{return Err("docker_content_too_large".into());}
      let expected=if r.action=="create"{"missing"}else{r.expected_version.as_deref().ok_or("docker_version_required")?};
      if expected!="missing"&&!(expected.len()==71&&expected.starts_with("sha256:")&&expected[7..].bytes().all(|b|b.is_ascii_hexdigit())){return Err("docker_version_invalid".into());}
      let script=format!(r#"{}
lock=".agentsam-lock-$name"
mkdir "$lock" 2>/dev/null || exit 78
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
actual=missing
if [ -f "$name" ]; then actual="sha256:$(sha256sum "$name" | cut -d ' ' -f1)"; fi
[ "$actual" = "$3" ] || exit 79
tmp=".agentsam-write-$$-$name"
trap 'rm -f "$tmp"; rmdir "$lock" 2>/dev/null || true' EXIT
cat > "$tmp"
mv "$tmp" "$name"
"#,GUARD);
      inside(&ctx,&id,&script,&base,&path,&[expected],Some(content.as_bytes()))?;
      Ok(json!({"ok":true,"path":path,"version":hash(content.as_bytes())}))
    },
    "mkdir"|"rename"|"delete"=>{
      if r.approved!=Some(true){return Err("docker_approval_required".into());}
      let extra=if r.action=="delete"{vec![r.expected_version.as_deref().ok_or("docker_version_required")?]}
        else if r.action=="rename"{vec![r.destination.as_deref().ok_or("docker_destination_required")?]}
        else{vec![]};
      if r.action=="rename"{
        let dest=rel(Some(extra[0]),false)?;
        if dest.contains('/') {return Err("docker_rename_same_directory_only".into());}
      }
      let script=match r.action.as_str(){
        "mkdir"=>format!("{}[ ! -e \"$name\" ] || exit 80\nmkdir \"$name\"\n",GUARD),
        "rename"=>format!("{}[ -f \"$name\" ] || exit 77\n[ ! -e \"$3\" ] || exit 80\nmv \"$name\" \"$3\"\n",GUARD),
        _=>format!("{}[ -f \"$name\" ] || exit 77\nactual=\"sha256:$(sha256sum \"$name\" | cut -d ' ' -f1)\"\n[ \"$actual\" = \"$3\" ] || exit 79\nrm \"$name\"\n",GUARD),
      };
      inside(&ctx,&id,&script,&base,&path,&extra,None)?;
      Ok(json!({"ok":true,"path":path}))
    },
    _=>Err("docker_action_not_allowed".into())
  }
}
#[tauri::command]
pub async fn docker_bridge(request:DockerRequest)->Result<Value,String>{
  tauri::async_runtime::spawn_blocking(move||run(request)).await.map_err(|_|"docker_bridge_failed".to_string())?
}
#[cfg(test)]
mod tests{
  use super::*;
  #[test]fn protects_paths(){
    assert!(root(Some("/app")).is_ok());
    assert!(root(Some("/")).is_err());
    assert!(root(Some("/app/../etc")).is_err());
    assert!(rel(Some("../secret"),false).is_err());
    assert!(rel(Some("src/index.ts"),false).is_ok());
    assert!(name(Some("ssh://bad")).is_err());
  }
}
