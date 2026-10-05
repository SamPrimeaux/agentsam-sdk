# @inneranimalmedia/copro-project

Canonical provider-neutral CoPro project documents.

A saved CoPro project describes creative intent. It does not encode which render backend, object store, streaming provider, machine lane, or cloud vendor happens to execute the work.

Core invariants:

- schema: copro.project.v1
- one integer microsecond timebase
- clips reference assetId
- no renderer field in the saved project
- no R2/Stream/provider identity in clips
