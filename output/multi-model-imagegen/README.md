# Multi Timers visual mockups

Design exploration before application implementation. These are generated visual references; SPECIFICATION.md remains the source of functional requirements.

## Direction

Warm ivory surfaces, forest-green active timer, restrained sage status accents, and large monospaced time displays. Today's cumulative task time is the primary metric; current-session duration is secondary. Desktop uses a compact table; mobile reflows into a single column with large touch controls.

Both views show the same sample state: Study X is running with 01:03:42 today and 00:18:42 in the current session, Study Y is paused at 00:35:00, and Reading is done at 00:20:00. Favorites and copying tasks to tomorrow are visible beneath the list.

## Generation record

- Endpoint provider: OpenAI, official images API.
- Model provider: OpenAI.
- Requested and used model: `gpt-image-2.5-sunburst`.
- Quality: `xhigh`.
- Format/background: PNG, opaque.
- Desktop: 1536 × 1024, new generation, one image; prefix `multi-timers-desktop`.
- Mobile: 1024 × 1536, reference-image edit using the desktop image, one image; prefix `multi-timers-mobile`.
- Tool: multi-model-imagegen skill's `scripts/image_gen.py`.

Full prompts are preserved in [desktop-prompt.txt](desktop-prompt.txt) and [mobile-prompt.txt](mobile-prompt.txt). Images are [multi-timers-desktop.png](multi-timers-desktop.png) and [multi-timers-mobile.png](multi-timers-mobile.png).

## Implementation interpretation

- Paused is a display state derived from a task having recorded time and no active session; it does not add a new stored day status.
- Selection checkboxes select tasks for copying; Done is a separate status/action.
- Copy selected is disabled until one or more tasks are selected, even if the generated image suggests an enabled action.
- Active-panel stickiness, task details, settings, editing, empty states, and errors are covered by the specification and are not demonstrated by these static images.
- Favor solid color surfaces over any subtle texture introduced by image generation.
- No application code was written for these mockups.
