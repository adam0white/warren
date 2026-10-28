# Warren lived-history admission refusal, 2026-10-28

This is a standalone consumer of published HF 4.5.2. It uses only public HF calls.
It does not run a copied actor kernel or patch the package.

`source.hf.json.gz` is the complete HF archive from the Warren candidate:
seed 11, ordinary public chalk at 300, play through 900, public release of Meryem
at 900, then play through 930. Her optional goals have ended. Projection succeeds.
The source archive replays exactly. `target-person.json` contains that exact public
projection plus the receiving opening and explicit clock mapping; no memory is
removed. `target-spec.json` is the candidate's actual receiving Warren definition.

Copy this directory into an empty scratch directory, outside a workspace. Run:

```sh
export PATH=/opt/homebrew/bin:$PATH
pnpm install --frozen-lockfile
node probe.mjs
```

Exit 0 means the refusal reproduced. The script verifies the full source replay,
restores it, projects Meryem again, requires exact equality with the incoming
passport, and requires `createPerson` to return `invalid-admission` at `$.portable`.
`result.json` is the isolated consumer's exit 0 result.

The lived memory names `travellers` and places including `house:usta`, `field`,
`hearth`, `surface` and `below`. Published `portable-admission.js` accepts
entity references only to the receiving actor, declared person sources, current
people or lifecycle entities. The opening lifecycle accepts kin premises/scopes,
not world-place declarations. Inventing person sources or kin premises for these
places, changing the references to the receiving actor, or deleting the memories
would change their meaning. This is the measured **G2** portability blocker.

This proves one Warren-to-Warren refusal. It does not establish that every
passport or every cross-game journey fails. The simpler release-at 300 opening
projected and admitted; that did not cover lived history.
