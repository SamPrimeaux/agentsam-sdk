"""A real, bounded SAM local client: delegates to existing Node machinery.

The current Python 0.1 package is a repository/data toolkit, not a remotely
hosted universal SDK. This bridge exposes read-only deterministic capabilities
and refuses any write, D1, CMS or arbitrary terminal operation. A native ACP
client and remote per-installation identity are separately tracked work.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib import request as urllib_request, error as urllib_error
from typing import Any, Mapping

class SamClientError(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)

@dataclass(frozen=True)
class Choose:
    options: tuple[str, ...]
    instructions: str = ""
    def __init__(self, options: list[str] | tuple[str,...], instructions: str = ""):
        object.__setattr__(self, "options", tuple(options))
        object.__setattr__(self, "instructions", instructions)
    def question(self) -> dict:
        return {"type":"choose","options":list(self.options),"instructions":self.instructions,"evaluator_hint":"deterministic"}

@dataclass(frozen=True)
class Check:
    instructions: str = ""
    def question(self) -> dict:
        return {"type":"check","instructions":self.instructions,"evaluator_hint":"deterministic"}

@dataclass(frozen=True)
class Score:
    levels: tuple[str, ...]
    instructions: str = ""
    def __init__(self, levels: list[str] | tuple[str,...], instructions: str = ""):
        object.__setattr__(self, "levels", tuple(levels))
        object.__setattr__(self, "instructions", instructions)
    def question(self) -> dict:
        return {"type":"score","levels":list(self.levels),"instructions":self.instructions,"evaluator_hint":"heuristic"}

_BRIDGE_REL = Path("src/sam/bridge/stdio.mjs")
_NPM_PACKAGE = Path("node_modules/@inneranimalmedia/agentsam-sdk")


def _discover_bridge(cwd: str | Path | None) -> Path | None:
    """Find the Node bridge without configuration.

    Order: this tree's own npm/monorepo layout, then the working directory and
    its parents (a checkout, or an installed ``@inneranimalmedia/agentsam-sdk``).
    """
    roots = [Path(__file__).resolve().parents[2]]
    if cwd is not None:
        start = Path(cwd).expanduser().resolve()
        roots.extend([start, *start.parents])
    for root in roots:
        for candidate in (root / _BRIDGE_REL, root / _NPM_PACKAGE / _BRIDGE_REL):
            if candidate.is_file():
                return candidate
    return None


def _bridge_path(explicit: str | None, cwd: str | Path | None = None) -> Path:
    candidate = explicit or os.environ.get("AGENTSAM_SDK_JS_BRIDGE")
    path = Path(candidate).expanduser().resolve() if candidate else _discover_bridge(cwd)
    if path is None or not path.is_file():
        raise SamClientError("sam_bridge_not_installed")
    return path

def _binary(explicit: str | None) -> str:
    node = explicit or os.environ.get("AGENTSAM_NODE") or shutil.which("node")
    if not node:
        raise SamClientError("sam_node_not_available")
    return node

def _normalize_questions(questions: Mapping[str, Any] | list) -> dict | list:
    if isinstance(questions, Mapping):
        return {key:(val.question() if isinstance(val,(Choose,Check,Score)) else val)
            for key,val in questions.items()}
    return questions

def _decode(raw: bytes) -> Any:
    try:
        reply = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise SamClientError("sam_bridge_invalid_response") from exc
    if not isinstance(reply,dict) or not reply.get("ok"):
        raise SamClientError(str((reply.get("error") or {}).get("code","sam_bridge_failed")))
    return reply["result"]

class _ControlPlane:
    """Existing ACP HTTP endpoints, not a second agent-run database."""
    def __init__(self, url: str, token: str):
        if not url.startswith("https://") and not url.startswith("http://127.0.0.1:"):
            raise SamClientError("sam_acp_https_required")
        self.url=url.rstrip("/")
        self.token=token
    def request(self, route: str, payload: dict | None = None) -> dict:
        body=json.dumps(payload).encode() if payload is not None else None
        headers={"Accept":"application/json"}
        if body is not None: headers["Content-Type"]="application/json"
        if self.token: headers["Authorization"]="Bearer "+self.token
        req=urllib_request.Request(self.url+route,data=body,headers=headers,
            method="POST" if body is not None else "GET")
        try:
            with urllib_request.urlopen(req,timeout=20) as response:
                value=json.loads(response.read())
        except urllib_error.HTTPError as exc:
            raise SamClientError("sam_acp_http_"+str(exc.code)) from exc
        except (urllib_error.URLError, TimeoutError) as exc:
            raise SamClientError("sam_acp_unavailable") from exc
        return value
    def start(self, goal: str, **kwargs):
        return self.request("/v1/runs", {"objective":goal,
            "source_client":"agentsam-sdk-python", "surface":kwargs.get("surface","sdk"),
            "metadata":{"requested_operations":kwargs.get("operations",[]),
                "requested_deliverables":kwargs.get("deliverables"),
                "context":kwargs.get("context",{})}})
    def get(self, id: str):
        from urllib.parse import quote
        return self.request("/v1/runs/"+quote(id,safe=""))
    def events(self, id: str, after: int = -1, limit: int = 200):
        from urllib.parse import quote
        return self.request("/v1/runs/"+quote(id,safe="")+"/events?after="+str(int(after))+"&limit="+str(int(limit)))

class RunHandle:
    def __init__(self, cp: _ControlPlane, row: dict):
        self.id=row.get("id") or row.get("run_id")
        if not self.id:raise SamClientError("sam_acp_run_missing_id")
        self.status=row.get("status","unknown")
        self._control=cp
    def get(self):return self._control.get(self.id)
    def events(self, *, after: int = -1, limit: int = 200):
        return self._control.events(self.id,after,limit)
    def wait(self, *, attempts: int = 60, interval: float = 1.0):
        for index in range(attempts):
            state=self.get()
            if state.get("status") in ("completed","failed","cancelled","timed_out"):
                return {"id":self.id,"status":state["status"],"run":state,"deliverables":[],
                        "note":"ACP authority must supply real evidence and artifact references."}
            if index+1<attempts:time.sleep(interval)
        raise SamClientError("sam_run_wait_timeout")

class AsyncRunHandle:
    def __init__(self, sync: RunHandle):
        self.id=sync.id
        self.status=sync.status
        self._sync=sync
    async def get(self):return await asyncio.to_thread(self._sync.get)
    async def events(self, **kwargs):return await asyncio.to_thread(self._sync.events,**kwargs)
    async def wait(self, **kwargs):return await asyncio.to_thread(self._sync.wait,**kwargs)

class AgentSamClient:
    """Synchronous local machine client; no implicit remote credentials."""
    def __init__(self, *, cwd: str | Path = ".", node: str | None = None, bridge: str | None = None, control_plane_url: str | None = None, control_plane_token: str | None = None):
        self.cwd = str(Path(cwd).resolve())
        self.node = _binary(node)
        self.bridge = str(_bridge_path(bridge, self.cwd))
        self.control_plane = _ControlPlane(control_plane_url,control_plane_token or "") if control_plane_url else None
    def _request(self, method: str, **kwargs) -> Any:
        result = subprocess.run([self.node,self.bridge], input=json.dumps({"method":method,**kwargs}),
            text=True, capture_output=True, cwd=self.cwd, timeout=120, check=False)
        return _decode(result.stdout.encode())
    def discover(self, **query): return self._request("discover",query=query)
    def describe(self, operation_id: str): return self._request("describe",id=operation_id)
    def status(self, operation_id: str): return self._request("status",id=operation_id)
    def invoke(self, operation_id: str, input: dict | None = None):
        return self._request("invoke",id=operation_id,input=input or {})
    def decide(self, *, state: dict, questions: Mapping[str, Any] | list, **kwargs):
        return self._request("decide",input={"state":state,"questions":_normalize_questions(questions),**kwargs})
    def run(self, **kwargs):
        if not self.control_plane: raise SamClientError("sam_python_acp_run_adapter_not_configured")
        goal=kwargs.get("goal","")
        if not isinstance(goal,str) or not goal.strip(): raise SamClientError("sam_run_goal_required")
        result=self.control_plane.start(goal, **{k:v for k,v in kwargs.items() if k!="goal"})
        row=result.get("run",result)
        if not isinstance(row,dict) or not (row.get("id") or row.get("run_id")):raise SamClientError("sam_acp_run_missing_id")
        return RunHandle(self.control_plane,row)
    def events(self, run_id: str, **kwargs):
        if not self.control_plane:raise SamClientError("sam_python_acp_run_adapter_not_configured")
        return self.control_plane.events(run_id,**kwargs)
    def __enter__(self):return self
    def __exit__(self, *_):return False

class AsyncAgentSamClient(AgentSamClient):
    """Async subprocess transport to the same authorized local SAM entrypoint."""
    async def _request_async(self, method: str, **kwargs):
        proc = await asyncio.create_subprocess_exec(self.node,self.bridge,stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,cwd=self.cwd)
        try:
            out,_ = await asyncio.wait_for(proc.communicate(json.dumps({"method":method,**kwargs}).encode()),120)
        except asyncio.TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise SamClientError("sam_bridge_timeout") from exc
        return _decode(out)
    async def discover(self, **query):return await self._request_async("discover",query=query)
    async def describe(self, operation_id: str):return await self._request_async("describe",id=operation_id)
    async def status(self, operation_id: str):return await self._request_async("status",id=operation_id)
    async def invoke(self, operation_id: str, input: dict | None = None):
        return await self._request_async("invoke",id=operation_id,input=input or {})
    async def decide(self, *, state: dict, questions: Mapping[str, Any] | list, **kwargs):
        return await self._request_async("decide",input={"state":state,"questions":_normalize_questions(questions),**kwargs})
    async def run(self, **kwargs):
        handle=await asyncio.to_thread(super().run,**kwargs)
        return AsyncRunHandle(handle)
    async def events(self, run_id: str, **kwargs):
        return await asyncio.to_thread(super().events,run_id,**kwargs)
    async def __aenter__(self):return self
    async def __aexit__(self,*_):return False
