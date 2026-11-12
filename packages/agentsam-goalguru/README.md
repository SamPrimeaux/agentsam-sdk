# AgentSam GoalGuru

One account-owned goals app, mounted as a full page or Side Stage in any compatible React host.

```tsx
import { GoalGuruPanel, createGoalGuruHttpTransport } from '@inneranimalmedia/agentsam-goalguru';
import '@inneranimalmedia/agentsam-goalguru/theme.css';

const request = createGoalGuruHttpTransport('/api/studio/living-plan');
// In a host's React component: <GoalGuruPanel request={request} mode="page" onContinue={openInHostWork} />
```

The package contains the manifest, UI, typed transport and scoped CSS. An installed host supplies its own authenticated, account-scoped API, install/launch metadata and Work navigation; the package never stores credentials or grants itself access. In Local Studio the existing D1-backed `user_goals`, `user_goal_steps`, `user_goal_activity` and ticket associations supply the API. Browser-only legacy conversation goals are import-only.
