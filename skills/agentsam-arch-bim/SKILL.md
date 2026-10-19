---
name: agentsam-arch-bim
description: Model typed building objects and validate IFC data requirements
user-invocable: true
---

# Semantic BIM and IFC

**Architectural Intelligence v0.1.0 (2026-10-19).**

## Operating protocol
Use version-pinned IFC schema and buildingSMART IDS requirement profiles. Record IFC object GUID, placement, spatial containment, material and type relationships. Reopen exported IFC and reconcile entity IDs, measured bounding boxes, walls, openings and floors. IDS data checks are not building-code certification.

## Evidence and safety
Prefer deterministic measurement and source documents over model recollection. Distinguish verified_reference, calculated_from_inputs, measured_in_artifact, proposed, unresolved and requires_professional_review. Confirm editions, applicability, units, dimensional conditions, source rights and professional review. Only use advertised and actually verified tools. Scope-specific authority precedes general web sources.

## Sources
- https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/index.html
- https://github.com/buildingSMART/IDS/releases/tag/v1.0.0
- https://docs.ifcopenshell.org/ifcopenshell-python.html
