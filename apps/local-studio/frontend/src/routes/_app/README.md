# Superseded route donors

`routes/_app/*` and `routes/_app.tsx` are historical donors, not runtime routes. The canonical application routes live under `routes/(apps)/*`, and the route generator explicitly excludes this entire legacy tree.

Do not add new product code here. Port any remaining required behavior into the canonical `(apps)` route or shared component before retiring a donor. The downloaded desktop shell is `AgentSamShell`; `AppShellFrame` is not an active route shell.
