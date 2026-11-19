# AllChat

## Project purpose

AllChat is a local-first prototype for coordinating multiple AI models through a structured planning workflow: independent proposals, cross-review, a BOSS synthesis and revision loop, a human decision point, then handoff to an execution model.

## Prototype scope

- The first version is a clickable UI prototype with clearly labeled demo data.
- The English product homepage introduces the multi-agent planning platform and links to its workspace below. Keep the existing group-chat presentation for independent model submissions and reviews.
- Do not imply that real model providers are connected or that agents have executed code.
- Show proposals, open objections, approvals for the current revision, and execution handoff. End discussion automatically once every participant explicitly confirms that the same revision has no unresolved ambiguity and can be implemented. A new revision requires fresh approvals from every participant.
- Use chat bubbles to display records of independent model submissions. Models submit their own proposals and review a shared revision. The timeline is a presentation of those outputs.
- No backend, provider credentials, database, or external service calls in this prototype.
- Avoid adding dependencies unless the prototype cannot reasonably work without them.

## Visual style

- Use the approved interface at commit `76080dd` as the reference for all future UI changes.
- Use the grayscale Vantablack palette in `styles.css`. Keep the homepage and its navigation pure black (`#000000`). Reuse the existing grayscale tokens and square-edged controls for new screens and components.
- Keep the English homepage full-screen with the original pixel wordmark and animated square particles. Respect reduced-motion settings. Use Geist for headings and JetBrains Mono for controls and supporting text, with system CJK fallbacks.
- Keep review records in the existing single-window layout. Use monochrome model icons and message bubbles for independent proposals, review findings, and approvals.

## Structure and naming

- Keep the first prototype in a small number of root-level files (`index.html`, `styles.css`, `app.js`). Draw the homepage's product-specific pixel art on canvas in app.js rather than adding generated image files.
- Store the four original participant portraits as local PNGs in `assets/avatars/`, named after their lowercase model family. Replace a portrait in place when its design changes.
- Use local monochrome model marks from Lobe Icons in `assets/icons/` for the chat. Name them after the upstream icon IDs. The original portraits are kept as historical assets.
- Bundle Latin Geist and JetBrains Mono WOFF2 files and their license notices under `assets/fonts/`.
- Use descriptive English names for files, variables, and UI data identifiers.
- Do not add generated output or unrelated project documentation.

## Verification

- This prototype should work by opening `index.html` in a Linux browser.
- Run any available syntax/build checks that do not require installing dependencies.
- Report clearly which interactions are simulated and which checks were run.
