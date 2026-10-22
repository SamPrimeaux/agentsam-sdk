import asyncio
import os
from pathlib import Path
import unittest
from agentsam_sdk import AgentSamClient, AsyncAgentSamClient, Choose, SamClientError

ROOT=Path(__file__).resolve().parents[2]

class PublicClientContractTests(unittest.TestCase):
    def setUp(self):
        self.sam=AgentSamClient(cwd=ROOT)
    def test_sync_artifact_and_status(self):
        self.assertTrue(self.sam.status('artifact.render')['bound'])
        result=self.sam.invoke('artifact.render', {'title':'Python delivered','summary':'Real HTML and Markdown'})
        self.assertTrue(result['ok'])
        self.assertIn('<!doctype html>',result['data']['files']['report.html'])
        self.assertIn('# Python delivered',result['data']['files']['report.md'])
    def test_decide_from_facts(self):
        result=self.sam.decide(state={'facts':{'choose.intent':'inspect'}},
            questions={'intent':Choose(['inspect','publish'])})
        self.assertEqual(result['answers']['intent']['value'],'inspect')
    def test_dangerous_operations_fail_closed(self):
        discovered=self.sam.discover()
        self.assertTrue(any(x['id']=='terminal.exec' for x in discovered['operations']))
        self.assertEqual(self.sam.status('terminal.exec')['readiness'],'needs_approval')
        for op in ('terminal.exec','agentsam_d1_write'):
            result = self.sam.invoke(op, {})
            self.assertFalse(result['ok'])
            self.assertIn(result['error']['code'], ('sam_write_flag_required', 'sam_d1_write_adapter_not_configured'))
        with self.assertRaises(SamClientError):
            self.sam.invoke('cms.page.publish', {})
        with self.assertRaises(SamClientError):
            self.sam.invoke('repository.inspect', {'root':'/tmp'})
        with self.assertRaises(SamClientError):
            self.sam.run(goal='Invent unfinished operations')
    def test_async_operations(self):
        async def flow():
            async with AsyncAgentSamClient(cwd=ROOT) as sam:
                value=await sam.invoke('artifact.render',{'title':'Async','summary':'Portable'})
                self.assertTrue(value['ok'])
                status=await sam.status('artifact.render')
                self.assertEqual(status['readiness'],'available')
                with self.assertRaises(SamClientError):
                    await sam.run(goal='unsupported')
        asyncio.run(flow())

if __name__=='__main__':
    unittest.main()

class ACPContractTests(unittest.TestCase):
    def test_python_run_reuses_existing_authority(self):
        from http.server import HTTPServer, BaseHTTPRequestHandler
        from threading import Thread
        import json
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                assert self.path == '/v1/runs'
                assert request['objective'] == 'Check readiness'
                assert self.headers.get('Authorization')=='Bearer fixture-authorized'
                data={'id':'run-persisted','status':'queued'}
                self.send_response(200);self.end_headers();self.wfile.write(json.dumps(data).encode())
            def do_GET(self):
                assert self.path.startswith('/v1/runs/run-persisted')
                data=({'id':'run-persisted','status':'completed'} if '/events' not in self.path else
                    [{'seq':1,'eventType':'validated'}])
                self.send_response(200);self.end_headers();self.wfile.write(json.dumps(data).encode())
        server=HTTPServer(('127.0.0.1',0),Handler)
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            sam=AgentSamClient(cwd=ROOT,control_plane_url=f'http://127.0.0.1:{server.server_port}',
                control_plane_token='fixture-authorized')
            run=sam.run(goal='Check readiness',operations=['repository.inspect'])
            self.assertEqual(run.id,'run-persisted')
            self.assertEqual(run.wait(attempts=1)['status'],'completed')
            self.assertEqual(run.events()[0]['eventType'],'validated')
            async def flow():
                asam=AsyncAgentSamClient(cwd=ROOT,control_plane_url=f'http://127.0.0.1:{server.server_port}',
                    control_plane_token='fixture-authorized')
                handle=await asam.run(goal='Check readiness')
                self.assertEqual((await handle.wait(attempts=1))['status'],'completed')
            asyncio.run(flow())
        finally:
            server.shutdown();server.server_close();thread.join()
