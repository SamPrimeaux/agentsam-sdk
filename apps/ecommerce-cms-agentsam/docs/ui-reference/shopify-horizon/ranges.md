# Range bounds

Decided ranges, one per family. The reference recorded no slider limits, so these are chosen so no value seen in the reference is ever clipped. Change a family here and every panel follows.

| Family | Controls | Largest value seen | Live code bounds | Review panel bounds | Decided |
|---|---|---|---|---|---|
| padding | 54 | 100 | none found | none | 0-200 |
| radius | 17 | 100 | buttons 0-60, inputs 0-32 (theme-settings-live.js) | 0-100 | 0-100 |
| gap | 11 | 28 | none found | none | 0-100 |
| thickness | 10 | 1 | none found | 0-10 | 0-10 |
| other | 7 | 50 | page width 720-1920 step 20 | none | per control, see panel file |

## Conflicts in current AgentSam code

- Button corner radius: live slider 0-60, review panel 0-100. The reference shows 100px on badges, pills and email signup, which a 0-60 slider would clip.
- Input corner radius: live 0-32, review panel 0-100.
- Page width: live is a number input 720-1920 step 20, review panel is a select (Narrow, Standard, Wide, Full width).

Rule: the reference wins over current AgentSam code. Tighter live bounds (button radius 0-60, input radius 0-32) are raised to the decided range.
