# Round 5

Remaining: Adam’s acceptance play and a fresh source-unread retest after shipping. The three fixes are implemented with test and review evidence recorded in the round report. Adam accepts by playing; a fresh source-unread retest remains separate from builder verification.

- Keep the working location stable after selecting a building tool. Reserve prompt space. Add labelled zoom and Fit hill controls; preserve the view centre on zoom. Test actual cell placement and prompt changes at 360×690 and 1280×800.
- Explain completed and unfinished doors through one UI helper, used by Look and Door. Verify the existing alarm/adult/reach prerequisites without changing simulation.
- Add a compact shelter summary that opens the people sheet. Distinguish capacity from current exposure. Give the sheet a separate scroll body and stable close controls. Verify native wheel and touch scrolling in Playwright while time advances.
- Preserve simulation sources, HF 2.8.0 and export shape. Run existing exact replay and continuation tests. Save rendered before/after evidence, review with two independent agents, run npm run check, sign the commit, push main, deploy and verify the live release and phone render.

Review focus: text expansion must not move a working cell; zoom must not commit a paint stroke; exposure must not be inferred from bed capacity; live status updates must preserve scrolling; door copy must not promise a person's decision.
