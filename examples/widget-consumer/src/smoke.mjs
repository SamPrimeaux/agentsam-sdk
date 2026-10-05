import * as widgets from "@inneranimalmedia/agentsam-workbench/widgets";

'
    'const exportsList = Object.keys(widgets);

'
    'if (!exportsList.length) {
'
    '  throw new Error("Widget package export resolved but contains no exports");
'
    '}

'
    'console.log("PASS: external-style consumer resolved widget package");
'
    'console.log(exportsList.sort());
