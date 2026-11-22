---
"@inneranimalmedia/agentsam-sdk": minor
---

Add the `agentsam.bim.model.v1` contract (`@inneranimalmedia/agentsam-contracts/bim-model`) and an IfcOpenShell `inspect` operation on the CAD service (`/v1/ifc/execute`) that reads an IFC into that model: spatial tree, element types, materials and layer sets, property sets, SI-converted quantities, the wall to opening to door chain and spaces, keyed by GlobalId. Includes an acceptance proof that checks the output against raw STEP entity counts and the TypeScript contract.
