# Bella — InnerAnimal Companion

- **Package:** InnerAnimal-Bella-v1.1.0
- **Character:** Chocolate Labrador Retriever
- **Role:** Everyday companion · encouragement & presence
- **Signature action:** A happy, unhurried tail wag
- **Visual identity:** Rich chocolate coat, warm amber eyes, cream chest blaze, lightly silvered muzzle

## Runtime package

- 16 independent gallery states, each exported as a transparent 256×256 RGBA APNG
- 8 frames per state at 6 fps (128 total gallery animation frames)
- 10 shared AgentSam runtime states mapped to the appropriate Bella gallery animations
- Avatar 128×128, icon 64×64, portrait 256×256
- Original state atlas, contact sheet, palette and registration metadata retained
- Original source keyframes preserved unchanged under `keyframes/`

## Runtime state mapping

| AgentSam state | Bella artwork |
| --- | --- |
| idle | idle |
| blinking | blink |
| thinking | thinking |
| working | working |
| waiting | waiting |
| attention | attentive |
| success | success |
| error | alert-error |
| resting | resting |
| signature | tail-wag |

## Animation construction

Each original pose is rendered as an 8-frame transparent APNG using a restrained, eased whole-character micro-motion cycle (breathing, small sway, nod or bounce according to the pose). The 16 source keyframes are retained unchanged. These are not skeletal or independently articulated tail, paw or facial rigs; visual approval remains pending.
