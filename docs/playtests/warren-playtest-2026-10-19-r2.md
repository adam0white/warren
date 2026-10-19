# The Warren, playtest round 2 (2026-10-19)

Build: commit 6ed1783 (0.1.0, HF 2.8.0), live at https://warren.adamwhite.work, on a 360×780 headless phone through `scripts/drive.ts`. Same brief as round 1; new source-unread testers. Their reports below are verbatim. Diaries and exports stay in the session scratchpad, not in the repo.

| Tester | Model | Got to | Score |
|---|---|---|---|
| Colony-sim veteran (RimWorld, Dwarf Fortress) | Opus | 11th of summer, year 1; about 40 souls | 6/10 |
| Idle commuter | Sonnet | 60th of summer, year 5; about 30 souls | 4.5/10 |
| Wildcard: a 12-year-old ant-farm and Minecraft fan | Haiku | 22nd of autumn, year 1; 9 souls | 5/10 |

Scores against round 1: veteran 5 → 6, idle 3 → 4.5, wildcard 5 → 5 (a different persona).

## What changed in response

Commit 9eaf251 (0.2.0):

- Every refused chalk, lamp and door says why (theirs, already open, bedrock, out of reach from open ground). Chalk with no way to reach it from open ground says so at once (the 12-year-old's X's in empty dirt).
- "Lamp hung." when a lamp mark is placed, and the ghost lamp explains it waits for someone to make it.
- A bell that rings true after false ones gets a doubting answer ("X heard the bell and kept on with … He had heard it before."). Repeated stock answers fold into one line.
- When every chalked face is dark or in stale air for a day, the journal says the picks have stopped and why.
- Families turned away for want of beds are noted.
- Arrivals are more likely outside winter (the idle commuter's flat headcount).
- The raid goal reads "Live through the first riders." instead of "When the smoke comes, everyone below", which ticked whoever was caught. It now claims only what it checks.
- Lab telemetry client (milestones, chapter screens, a "send this run" button).

Commit 8963225 (round 3):

- **Shafts are entrances.** Riders now come down any opening to the sky, not only the first shaft. Opening a new shaft to the sky writes a note: air will come down, and so could riders; a door below would close it (the idle commuter's accidental shaft).
- **Raids say why.** The raid's end line adds causes: how many were above ground, whether they were caught near an entrance with no door, whether the near jars were found.
- **The why on the card.** Each person card shows their own reason for what they are doing, from HF's narration of the decision. HF narrates paid work as money ("It pays."); here that becomes the work's reason ("The jars at the hearth were low."). Recorded as HF request 6.
- **The card floats over the picture** instead of below the screen (veteran: "The card itself is below the screen").
- The driver's `export` resolves the path on the caller's side (the idle commuter's file landed in the wrong folder).

Not changed (deferred, with dates in the design doc): goals judged on outcomes rather than actions, food pressure, a "while you were away" summary for idle players, slowing for big finds such as water, the dig shown as a visible animation, and odd states on cards (asleep while "hungry, thirsty").

## Colony-sim veteran (Opus)

> **1. Verdict.** A lovely ant farm with a real system or two under it. But from outside I mostly can't tell whether the people decide or just run need-timers, and nothing I built changed how a raid ended in a way I could read. **6/10.**
>
> **2. The first minute.** The title card hooked me: riders, burned villages, ripe barley, and "Nobody obeys. Everyone follows the worn path." That line is a promise to someone like me. The ink cross-section looks like a real ant farm. I chalked a wall, and "Hatice broke through the first chalked wall and stood in the new space, coughing dust." Good. The tutorial goals (chalk, lamp, store) ticked over quickly. The first frame after Begin was blank; a second look showed the hill.
>
> **3. What I understood, and what confused me.**
> - **What I could do:** chalk where to dig, paint stores and beds, mark lamps and doors, ring the bell. People dig what is chalked "if they will".
> - **The best system is air.** Tapping a dead end said: "The air is stale: no lamp burns and nobody will cut here. Air comes down an opening to the sky; it carries a long way straight down a shaft, not far sideways." Geometry as a resource. That's real.
> - **Lamps confused me most.** My marks sat as dotted red rings for weeks. Tapping one said "Open ground. Dark. A lamp hung here would let them work." Much later I learned that "Havva fired a lamp and hung it where you had marked." Nothing told me a lamp needs a free person to make it.
> - **Stale air fails silently.** Chalking the air shaft upward from below did nothing, with no message. I had to chalk it from the surface down.
> - **The door did nothing I could see.** I built it after the first raid. Grain was still taken and people were still hurt.
> - **Person cards are thin:** an activity, one condition, a feeling, a quote. No temperament, no friendships, no reason. Hatice feels "pride" while asleep and "nursing a hurt". I never saw anyone take on work I hadn't marked.
>
> **4. Best and worst moments.**
> - **Best: the 27th of spring, water.** "Hasan's pick went into the damp layer and it seeped, then ran. A well under the hill." I had followed Yusuf's rumour west and down, and seen hatching in the stone where it is damp. Then new households came "They had heard there was water under the hill." Close second: the third raid (90th to 91st of spring), with Rıza replying to the bell: "I'm asleep."
> - **Worst: the 33rd of harvest, after the first raid.** Four were hurt, Yusuf, Ayşe and Zehra were "caught above ground", and the page gave me "✓ When the smoke comes, everyone below." Goals check what I did, not what happened. "Beds below for everyone" ticked the moment I painted eight beds for nine people, before anyone slept.
>
> **5. Bored, frustrated, quitting.**
> - From the 46th of harvest to the 13th of autumn, and again over the turn into spring, whole weeks passed with everyone on "sit and rest" while my lamp marks waited for a hand.
> - Food never bit. It read "a few jars below" from mid-winter to summer, with 30 to 40 people, and nobody starved.
> - Water was struck while I was on gallop; the game slows for smoke but not for its biggest discovery.
> - I quit after the third raid (10th of summer). Hurt counts went 4, 3, 8 even with a door, and grain was lost every time. In the third raid everyone was "caught near the entrance", with a knot of people jammed in the entrance shaft above my rolling stone. With 40 people and one way down, that may be an emergent traffic jam I'd love, but the game never says so. I can't tell cause from noise, so I stopped experimenting.
>
> **6. Three changes that would bring me back.**
> 1. **Show why.** Give each card one line on why the person is doing what they do. After a raid, give one line on what went wrong (for example the door wasn't shut, or the shaft was jammed). Without causes, emergence reads as random.
> 2. **Make my building change outcomes visibly**, and judge goals on outcomes. A door, a second entrance or a wider shaft should measurably change a raid. "Everyone below" should tick only if everyone was below.
> 3. **Make pending orders and stalls legible.** Show "waiting for a lamp-maker", warn when a chalk mark is in stale air, slow the game for water like it does for smoke, and give food real pressure.
>
> **7. Bugs and wrong-looking text.**
> - **The person card's close button can't be tapped.** The X never takes a tap; the driver timed out because the canvas covers it. Workaround: tap bare stone with look.
> - **The selected person locks the camera.** While a card is open, my pans don't hold.
> - **The card itself is below the screen.** I could only read it in the text output.
> - **The hint bubble covers the area I'm working on.** It sat right over the new rooms and over the entrance shaft when I placed the door.
> - **Overlapping text.** After panning, the red goal text writes over the houses. A half-hidden journal line ("under the hill.", "Esma was caught near the entrance…") shows behind the toolbar.
> - **Odd states on the cards.** Hatice was "hungry, thirsty" while asleep, then "worn out" yet "feeling joy" while carrying spoil. Hasan was "hungry, thirsty" while drinking from the jar.
> - **No explanation for the hard band.** "Below here the stone turns hard and slow", but the stone looks the same in the picture.
> - **Clock labels jump oddly.** One tap went from morning to dusk, then the next showed evening; a "night, the 35th" came before "midday, the 35th". This may just be how the day's labels are named.
>
> **8. How far I got.** The 11th day of summer, first year (export file day 297), about 40 souls in 10 households, with a well, a vent, two bedrooms, a store and one door. Seed 902528025, The Warren 0.1.0, HF 2.8.0. I used about 110 commands.
>
> Files are in /private/tmp/claude-504/-Users-abdul-code-human-framework/675a9839-8299-4863-91be-017a92a76ff0/scratchpad/warren-pt/r2-vet:
> - export.json
> - diary.md
> - the screenshots 001.png to 226.png
>
> The driver stopped cleanly after quit (PID 8747); quit itself printed a harmless "fetch failed" error.

## Idle commuter (Sonnet)

> **1. Verdict.** A gentle, well-written fiction, but it is not an idle game. The numbers don't grow while I'm away, and after year 3 there was nothing to check back for. **4.5/10.**
>
> **2. The first minute.** I liked the pitch: "Nobody obeys. Everyone follows the worn path." The hill cross-section is charming. Setting gallop on the first screen worked, and the days flew by. I had no idea what mattered, though. The only guidance was the red margin hint ("Chalk a wall where you would dig").
>
> **3. What I understood.**
> - I knew where to chalk, what the store, beds, lamp and door tools do, and that the notebook has a journal and a people list.
> - Nine named people live in three houses. Tapping one gives a one-line card ("Elif listens for the bell").
> - I never worked out what the bell is for, or what I do about the raiders besides "everyone below".
> - I couldn't tell what the dark grey cells mean until I read a hint about lamps. The tool notes ("Tap a passage one cell wide, open on two opposite sides only") are precise but hard to apply.
> - A new tool's note card sits over the picture. It hid the map until I tapped something else.
>
> **4. Best and worst moments.**
> - **Best:** the 40th day of winter, year 2. "The Ünal house came up the road with a donkey and 2 others. They had heard there was room." Refugees arriving unprompted is the kind of reward I play idle games for, and the journal read well after being away. Three more houses followed that year, taking us from nine to about 30.
> - **Also good:** the 33rd day of harvest, year 3. "Rabia's pick went through into a room nobody alive had dug: soot on the ceiling, a trough cut in the wall, two clay lamps in a niche."
> - **Worst:** the 22nd day of autumn, year 1. Five people "caught near the entrance and struck" in one day, then "They rode off north with some of our grain, and 7 of us were hurt." I had watched them leave. My second shaft was an accidental chalk drag that opened the hill to the surface, and nothing warned me.
>
> **5. Boredom and quitting.**
> - From year 3 to year 5 the headcount sat at about 30. The hint read "Water under the hill" the whole time. The journal only repeated "The barley is ripe again" and "First frost". The dig toward water crawled, with "the stone turns hard and slow". I stopped on the 60th day of summer, year 5.
> - The game drops the speed to slow after raids and other events, so my "set it and leave it" playstyle failed repeatedly. I re-tapped gallop about eight times.
> - A long wait gives no summary of what changed, no totals, no "while you were away" card, and no stockpile number. Jars show only as "a few jars below".
>
> **6. Three changes that would bring me back.**
> 1. **Visible growth and a reason to return.** I'd want a "while you were gone" card, a population goal, and a clear next target. Hints that sit unchanged for three years don't count.
> 2. **Keep my speed setting after events.** Flag danger with a notification instead of dropping to slow.
> 3. **Teach the dangers before they happen.** The raiders, the entrance rule, lamps and dark cells, the bell and the door all need a one-time explanation. I needed a warning that a chalked shaft to the surface is an entrance.
>
> **7. Bugs and odd text.**
> - Scene card button numbering shifts when a person card or the notebook is open. My batch taps hit the wrong button and reopened the notebook.
> - The "Close" button stays listed (button 2) after I closed a card.
> - The journal repeats the same "caught near the entrance and struck" line for different people, and the entries felt out of order. For example, "Kerem was caught near the entrance" was listed on the 22nd day of autumn, while the live margin line said the 23rd.
> - When I started digging toward the water, the status line said "the jars below are empty" for about 100 days in year 1 winter and spring, with no consequence I could see.
> - `export` printed "Saved … to export.json" but wrote the file into the driver's working directory (`/Users/abdul/code/human-framework`). I moved it to the path below.
>
> **8. How far I got.** I stopped on the 60th day of summer, year 5, with some 30 souls (up from nine) and 85 screenshots. The diary is at `/private/tmp/claude-504/-Users-abdul-code-human-framework/675a9839-8299-4863-91be-017a92a76ff0/scratchpad/warren-pt/r2-idle/diary.md`.
>
> Export: `/private/tmp/claude-504/-Users-abdul-code-human-framework/675a9839-8299-4863-91be-017a92a76ff0/scratchpad/warren-pt/r2-idle/export.json` (day 1809). The driver was shut down with `quit`; it threw a socket-closed error on the way out.

## Wildcard: 12-year-old ant-farm and Minecraft fan (Haiku)

> **1. Verdict:** Cool idea, and the first 10 minutes are good. Then nothing I dig seems to matter, so I got bored and stopped on day 22 of autumn. **Score: 5/10.**
>
> **2. First minute:** Hooked a little. The cross-section looks like an ant farm, which I love. I tapped the people, the houses and the dirt mound. The people did not react, and the note just told me to chalk a wall. Chalking the X's under the cellar did nothing for a long time. I thought the game was broken.
>
> **3. What I understood:** I'm a dig-master. I can chalk walls, hang a lamp, set beds, put a door in, and ring the bell when there's smoke. I understood the bell and the smoke. The bell made sound rings and everyone went to bed, which looked cool. The door note was a wall of words ("a passage one cell wide, open on two opposite sides only... a rolling stone if it is lit... three doors at most"). I skimmed it and didn't get it. The lamp note said "a lamp hangs in open ground", but I tapped open ground and no lamp showed up in the picture. Confusing.
>
> **4. Best and worst moments:**
> - **Best:** Night, 20th of harvest / 8th of autumn. The chalk X's I drew beside the cellar finally went in: "Ayşe broke through the first chalked wall and stood in the new space, coughing dust." This was the first time anything happened because of me, and I was pumped. The riders at night on the 32nd of harvest were also scary in a good way.
> - **Worst:** Afternoon, 19th of autumn: "Hatice was caught near the entrance and struck." I went into the notebook, found Hatice's card ("58, the Demir house. sit and rest · nursing a hurt"), and felt sad. Then the worst part: the four X's I drew in open dirt in the first half-hour were still not dug on the 22nd, and the game just says "Wait for someone to take up a pick." No one ever did.
>
> **5. Where I got bored, frustrated or quit:**
> - Panning down showed only dirt. The X's sit in empty dirt and connect to nothing. Dead space.
> - The margin hint "Mark a room for jars..." stayed the same for about 40 game-minutes of waiting. I felt like nothing I did counted.
> - I was frustrated with the notebook close: one tap timed out (`locator.click: Timeout 30000ms exceeded`) and the picture then sat shifted left, with a house cut off at the edge.
> - Tapping gallop/slow felt random. Time jumped midday to dusk to night while I just tapped. I didn't know what the speed did.
> - I quit because I had no new thing to try and the waiting felt the same. I'd go play Minecraft.
>
> **6. Three changes that would most make me play again:**
> 1. Show the dig. When someone picks up a pick, show them chipping, and let the chalk X's become real tunnels I can see, not just dirt.
> 2. Make the door and lamp notes short and show the result on the picture right away. Say "lamp hung here" with a visible glow.
> 3. Give me a reason to come back: a secret room, a jar I can find, or a rider I can trap. The secret ones are what I'd replay for.
>
> **7. Bugs, glitches or text that looked wrong:**
> - Lamp note: "A lamp hangs in open ground, below the surface." No lamp visible where I tapped (touch 300,400 on the 20th-day screen, and the same after).
> - Notebook close: first tap "Close" failed with `locator.click: Timeout 30000ms exceeded. waiting for locator('[data-drive]')`. Second try worked. The picture stayed shifted left afterwards.
> - The journal text overlapped the dashed divider and dirt texture on the deep screen, so it was hard to read ("A door fits a narrow passage..." was faint).
> - Hint "Wait for someone to take up a pick." persisted through the whole run without anyone picking up a pick.
> - Speed label "[speed] walk (of slow, walk, trot, gallop)" always printed the same template in the driver output, so I could not tell the current speed from text. (The screenshot did show it.)
>
> **8. How far I got:** In-game date 22nd day of autumn, first year (morning). Nine souls at the start, still nine at the end. One room was dug, with beds, the hearth, and jars. Hatice was struck; one person was hurt by the riders. Driver reached 53 days in the export. About 47 commands were used.
>
> **Export:** `/private/tmp/claude-504/-Users-abdul-code-human-framework/675a9839-8299-4863-91be-017a92a76ff0/scratchpad/warren-pt/r2-wild/export.json` (1.1 MB). Diary: `.../r2-wild/diary.md`. Screenshots `001.png` to `043.png` are in the same folder.
>
> Process note: I used `touch`, `drag`, `pan`, `wait`, `tap` and `export` only. I didn't read the source or the design docs. The driver was stopped with `quit` (no PID kill needed). PORT was 5383. One earlier command failed because fish treats `$D` differently, so I used absolute paths in bash after that.

## HF-character harness, cohort 2 (build 6ed1783)

Summary lines verbatim:

```
the-warren-0.1.0 6ed1783, seeds 1,2
  commuter        5.5 min, ended {"quit":1,"agenda":1,"game-over":0,"time-limit":0}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 4, quit at {"harvest y1":1}
  unwinder         13 min, ended {"quit":2,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 7.5, quit at {"autumn y1":2}
  completionist    20 min, ended {"quit":0,"agenda":0,"game-over":0,"time-limit":2}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 9.5, quit at {}
  restless        8.5 min, ended {"quit":2,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 6.5, quit at {"harvest y1":2}
  mischief         11 min, ended {"quit":2,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":2}, bored 2/2, frustrated 2/2, rewards 0 (rose to 44), quit at {"autumn y1":1,"harvest y1":1}
  exploiter        20 min, ended {"quit":0,"agenda":0,"game-over":0,"time-limit":2}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 7, quit at {}
  rulesLawyer       8 min, ended {"quit":2,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":2}, bored 0/2, frustrated 2/2, rewards 6.5, quit at {"harvest y1":2}
  returner      11.75 min, ended {"quit":5,"agenda":1,"game-over":0,"time-limit":2}, outcomes {"none":8}, bored 0/8, frustrated 5/8, rewards 2.75, quit at {"autumn y1":3,"harvest y1":2}, came back 6/6
  bored at {"harvest y1":2}
  frustrated by ["Hasan was caught above ground and struck.","Riders on the hill. Hooves over our heads, voices at the entrance.; Kerem was caught near ","Emine was caught above ground and struck."]
  edge degenerate-loop watch [close]: nothing new came of it and engagement did not hold: a rut (14 inputs running; engagement 0.84 → 0.89; new reward kinds 0; answered 0%)
  edge degenerate-loop edge:chalk:535 [close]: nothing new came of it and engagement did not hold: a rut (9 inputs running; engagement 0.8 → 0.79; new reward kinds 0; answered 0%)
  edge degenerate-loop lamp:238 [close]: nothing new came of it and engagement did not hold: a rut (10 inputs running; engagement 0.8 → 0.8; new reward kinds 0; answered 0%)
  edge degenerate-loop lamp:248 [close]: nothing new came of it and engagement did not hold: a rut (8 inputs running; engagement 0.44 → 0.44; new reward kinds 0; answered 0%)
  edge degenerate-loop lamp:257 [close]: nothing new came of it and engagement did not hold: a rut (9 inputs running; engagement 0.96 → 0.89; new reward kinds 0; answered 0%)
  edge mischief-ignored edge:chalk:297 [fun to keep]: the game lets it pass in silence: give it an answer (a line, a small cost or a small reward) so the edge becomes play (150 tries, answered 6%)
  edge mischief-ignored edge:chalk:331 [fun to keep]: the game lets it pass in silence: give it an answer (a line, a small cost or a small reward) so the edge becomes play (50 tries, answered 4%)
  edge mischief-ignored edge:chalk:467 [fun to keep]: the game lets it pass in silence: give it an answer (a line, a small cost or a small reward) so the edge becomes play (15 tries, answered 0%)
  edge mischief-ignored edge:chalk:535 [fun to keep]: the game lets it pass in silence: give it an answer (a line, a small cost or a small reward) so the edge becomes play (26 tries, answered 4%)
  edge mischief-answered bell [fun to keep]: the game answers it: provocation is already part of play (1 input (edge:bell), 247 tries, answered 100%)
```

The false bell is now answered every time (100%). The first raid still frustrates every persona. Chalk toward the neighbours still shows as mostly silent in the harness; the game now flashes a reason on screen, which the adapter does not count as an answer (an adapter limit, assumed, not measured).
