# One80Compass design handoff kit

This package converts the user's nine-panel visual montage and One80Labs style guides into practical instructions for building the One80Compass React portal.

Files:
- `references/all-screens-montage.png`: full original reference.
- `references/01-*.png` through `09-*.png`: individual screen crops. Note: these are enlarged by your viewer but sourced at low effective resolution from the montage.
- `design-tokens.css`: color, font and baseline layout tokens.
- `SCREEN_SPEC.md`: concrete screen/components/layout/behavior requirements.
- `CURSOR_IMPLEMENTATION_PROMPT.md`: agent instructions and visual verification workflow.

Copy this folder into `<your-react-repo>/docs/design/` and paste the content of CURSOR_IMPLEMENTATION_PROMPT.md into Cursor Agent. This is a design handoff, not working React source code. Exact duplication would require a coded reference UI or editable design file plus iteration.
