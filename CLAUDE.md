# AllChat

## Project purpose

AllChat is a local-first prototype for coordinating multiple AI models through a structured planning workflow: independent proposals, cross-review, a BOSS synthesis and revision loop, a human decision point, then handoff to an execution model.

## Prototype scope

- The first version is a clickable UI prototype with clearly labeled demo data.
- Do not imply that real model providers are connected or that agents have executed code.
- Show proposals, open objections, approvals for the current revision, and execution handoff. End discussion automatically once every participant explicitly confirms that the same revision has no unresolved ambiguity and can be implemented. A new revision requires fresh approvals from every participant.
- No backend, provider credentials, database, or external service calls in this prototype.
- Avoid adding dependencies unless the prototype cannot reasonably work without them.

## Structure and naming

- Keep the first prototype in a small number of root-level files (`index.html`, `styles.css`, `app.js`).
- Use descriptive English names for files, variables, and UI data identifiers.
- Do not add generated output or unrelated project documentation.

## Verification

- This prototype should work by opening `index.html` in a Linux browser.
- Run any available syntax/build checks that do not require installing dependencies.
- Report clearly which interactions are simulated and which checks were run.
