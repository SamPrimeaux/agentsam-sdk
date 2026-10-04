# CoPro UI Quality Gate

CoPro is judged as a creator application, not as an infrastructure demonstration.

## Reference standard

The interaction-density target is the quality creators expect from leading mobile editors such as CapCut, without copying another product's visual identity.

The product should combine:

- serious touch-first editing;
- immediate visual feedback;
- restrained modern styling;
- fast access to common tools;
- strong mobile ergonomics;
- responsive desktop expansion;
- AgentSam assistance without chatbot-first UX.

## Required creator journey

A first-time tester on an iPhone-sized viewport must be able to:

1. open Projects;
2. search/filter projects;
3. create a blank project or import a real local media file;
4. enter the editor;
5. see media in the preview;
6. scrub the timeline;
7. select and drag a clip;
8. trim either edge;
9. split at the playhead;
10. duplicate/delete;
11. undo/redo;
12. open contextual bottom-sheet tools;
13. adjust at least local speed/volume control state;
14. open Export;
15. exercise a visible Preparing -> Rendering -> Encoding -> Finalizing -> Complete job flow;
16. leave the editor and return to Projects.

## Interaction law

Infrastructure stays below the surface.

Normal creator UI must not expose:

- R2 bucket names;
- Worker/service-binding choices;
- PTYs;
- VM lanes;
- raw provider resource IDs;
- render-process implementation details.

## Visible-control law

No dead buttons.

Each visible control must:

- perform a real local action;
- open a functioning local surface;
- or be disabled with a human-readable capability explanation.

Future-provider TODO buttons are not acceptable.

## Mobile requirements

- safe-area-aware top and bottom chrome;
- dynamic viewport units;
- touch targets sized for fingers;
- horizontal timeline scroll;
- pointer/touch clip drag;
- visible trim handles;
- bottom sheets instead of navigation away from the editor;
- no hover-only operation;
- portrait and landscape compatibility;
- software-keyboard-safe sheets;
- editor remains useful without AgentSam.

## Desktop requirements

Desktop uses the same project/editor state and command engine.

It may expand into:

- left creator/media rail;
- larger canvas;
- right inspector;
- full-width timeline;
- optional AgentSam/Work panel.

Do not fork a separate desktop editor.

## Visual anti-patterns

Reject:

- developer-dashboard styling;
- giant SaaS cards everywhere;
- excessive nested panels;
- AI-gradient decoration;
- terminal-first UX;
- chatbot-first UX;
- tiny desktop controls squeezed onto mobile;
- visible implementation jargon.

## Mechanical validation

Every UI batch must at minimum run:

- copro-ui build;
- copro-ui typecheck;
- CoPro Studio production build;
- CoPro Studio typecheck;
- package tests;
- release-train check;
- phone-size render capture;
- desktop-size render capture.

Before v1 add interaction automation, responsive screenshot comparisons, PWA/offline reload, project persistence and full export acceptance.
