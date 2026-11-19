# @inneranimalmedia/copro-provider-contracts

Provider-neutral capability declarations for MovieMode/CoPro.

**This is a vocabulary and authorization boundary, not a list of shipped editing tools.** A capability name may be supported only when an installed adapter explicitly declares it and passes host authorization. The editor's native project commands remain responsible for trims, cuts, transforms, transitions, keyframes, timeline changes and undo/redo.

Current vocabulary groups:

| Group | Operation examples |
| --- | --- |
| Media | `media.store`, `media.stream`, `media.transcribe`, `media.embed`, `media.convert`, `media.inspect`, `media.search` |
| Visuals | `image.generate`, `image.edit`, `image.upscale` |
| Audio | `audio.synthesize`, `audio.denoise`, `audio.separate`, `audio.mix`, `audio.master` |
| Speech | `voice.synthesize`, `voice.direct`, `speech.align` |
| Captions | `captions.generate`, `captions.translate` |
| Video | `video.generate`, `video.analyze`, `video.stabilize`, `video.interpolate`, `video.upscale` |
| Scene and export | `scene.render`, `scene.capture`, `render.image`, `render.audio`, `render.video` |

Every adapter provides `id`, a declared subset of `capabilities`, `invoke`, and optionally `health`. Unknown or unbound capabilities fail, rather than being routed to a default model. A successful adapter invocation alone is not a complete cinematic deliverable: verify the source asset, revision, consent/license scope, output file and timeline consistency separately.

Voice generation and other provider-backed functions require explicit installed credentials, permissions and per-account boundaries. Never ship universal vendor credentials, raw source-media downloads or synthetic voice impersonation as a silent default.

Run `npm --prefix packages/copro-provider-contracts test` for capability-contract tests.
