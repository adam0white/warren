# Warren lived-history admission correction, 2026-10-28

This standalone consumer uses published HF 4.5.2 and public calls only. It corrects
the false G2 blocker conclusion merged in PR #8. The original receiving world did
not declare remembered places or the travellers group. Published HF registers
`world.facts` subjects as lifecycle entities before portable admission.

`source.hf.json.gz` retains the complete Warren candidate archive: seed 11,
public chalk at minute 300, play through 900 (ten hours), public release of
Meryem at 900, then play through 930. Optional goals have ended. Its exact
projected v2 passport is in `target-person.json`; no memory is removed.

Copy this directory outside a workspace and run:

```sh
export PATH=/opt/homebrew/bin:$PATH
pnpm install --frozen-lockfile
node probe.mjs
```

Exit 0 verifies exact source replay and reprojection, reproduces refusal for the
original incomplete receiving world, then admits the **same unchanged passport**
when the actual places and travellers group are declared through world facts.
The admitted target replays exactly. No fake people/kin or package patch is used.
`result.json` records both outcomes.

The negative fixture remains useful: incomplete receiving worlds refuse retained
references. It does not establish a framework gap. This is a Warren-to-Warren
contract proof, not whole-game delivery or general cross-game acceptance. The
current port candidate targets a later published pin and needs its own controls.
