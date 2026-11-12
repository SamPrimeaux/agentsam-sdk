# AgentSam packaged component preview (development only)

This is a real-component preview, not a second UI framework or app.
It imports Nav from the existing navigation package and AgentComposer from
the existing Workbench package. Every callback runs against isolated demo
state. There is no account operation, fixture registry, or production route.

From the SDK checkout:

    npm --prefix packages/agentsam-nav run preview:components
    python3 -m http.server 4176 --directory packages/agentsam-nav

Open http://127.0.0.1:4176/dev/ .

Run repeatable desktop/mobile interaction acceptance:

    npm --prefix packages/agentsam-nav run test:preview

This uses Local Studio's existing Playwright dependency and locally installed
Chrome; it checks actual Radix menus, chat actions, Sources/Outputs,
controlled composer, theme/mode, mobile positioning, and runtime errors.
Proof screenshots are ignored in dev/.generated/ .
The production package exports and routes remain unchanged.
