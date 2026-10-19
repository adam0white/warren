# The Warren, playtest round 1 (2026-10-19)

Build: commit 3dc00d6 (0.1.0, HF 2.8.0), live at https://warren.adamwhite.work, played on a 360×780 headless phone through `scripts/drive.ts`. Each tester was a source-unread model given a persona and the same brief. Their reports below are verbatim. Diaries and exports are kept in the session scratchpad, not in the repo.

| Tester | Model | Got to | Score |
|---|---|---|---|
| Colony-sim veteran | Opus | spring 23rd, year 2; 40+ souls | 5/10 |
| Idle/incremental addict | Sonnet | autumn 25th, year 2; 9 souls | 3/10 |
| Wildcard: retired history teacher from Nevşehir, 67 | Haiku | night of the 38th of harvest, year 1; 9 souls | 5/10 |
| Mischief edge-pusher | Opus | 48th of spring, year 2; some 20 souls | 6/10 |

## What changed in response (commit 6ed1783)

- Water: fetching water is now paid household work (HF `material`), so the hearth jars stay filled. All three testers saw "the water jars are dry" for the whole run. Measured after the fix: full jars by day 16 and a well by day 48 with the bot (seed 1).
- The person card's × works: the card was redrawn every frame and the button was replaced between press and click.
- The card's broken "well." line is replaced with how the person seems ("Hasan seems to be feeling pride.").
- Smoke slows the days to 'slow' and riders to 'walk'. The speed the player chose comes back when the riders leave.
- The open notebook slows the days to 'slow' instead of letting them run at full speed.
- A crowd at the hearth spills into nearby cells, three to a cell, instead of one blot.
- Look explains stale air, darkness and an unlit door, and the door tool states its rule before you place one.
- When the water, lamp and depth goals first show, Yusuf Usta says where to look.
- A false bell is answered in the journal, more drily each time. Chalk under the ridge draws a line from Yusuf Usta.
- Years now count from the first day under the hill. The year no longer turns over mid-winter.

Not changed yet (see the design doc's Deferred list): mid-game events between raids, a visible growth record for idle players, the idle player's request for numbers (declined: show, don't count).

## Colony-sim veteran (Opus)

> **1. Verdict.** It has the right premise and the best writing I've seen in a tiny colony sim. What it lacks is the swarm, any readable pressure, and enough events between the two raids. **5/10.** I'd come back for a version where people spread out and the systems are visible.
>
> **2. The first minute.** The hook landed. "Nobody obeys. Everyone follows the worn path." is a Dwarf Fortress promise in one line. Chalk a wall, Musa "broke through the first chalked wall and stood in the new space, coughing dust", then mark a store, and the haystack vanished from the field into the jars. That was a great first loop. What hurt it:
> - The clock keeps running while the notebook is open; two days passed while a person card sat open.
> - The card's × wouldn't close. The driver showed the picture of the hill was lying on top of it.
>
> **3. What I understood, and what confused me.**
>
> Understood:
> - The tools: chalk, store, beds, lamp, door, bell.
> - Digging stops in the dark. Hanging a lamp first puts up a lamp mark, and someone has to make the lamp: "No lamp in hand. Someone will shape one at the hearth, if they will."
> - The look tool reads the stone: "Hard stone. Slow to cut." and "Loose, crumbling stone… it can come down." That's real reading of the ground.
> - People choose for themselves. Kadir "is not sure about the bell any more."
>
> Confused:
> - **Water.** From the 21st of harvest, year one, onward, the top bar said "the water jars are dry". Tapping the well did nothing. When I quit, about 150 in-game days later, I still hadn't found water.
> - **Air.** At depth a chalk mark read "no air". Look said only "Open ground." I dug a vent to the surface and the mark still said "no air". I never learned the rule.
> - **Beds.** The goal "Beds below for everyone" was ticked with 6 beds for 11 people.
> - **Food.** "Jars below for a month or so" stayed the same for about 60 days while the population tripled.
>
> **4. Best and worst moments.**
> - **Best (harvest 33rd, year one):** I rang the bell and the journal answered. Ayşe: "After I eat at the hearth, then I will." Kadir and Yusuf Usta: "Not now. After I eat at the hearth." Then Musa, Hasan and Hatice were "caught near the entrance and struck." People got hurt for their supper, and that's a story I'd retell. The survivors huddled in the dark at the bottom of the shaft, and it looked great.
> - **Worst (autumn 26th–27th, year one):** At trot speed, the smoke and the riders both arrived inside a single wait, so I never got to ring the bell. Then: "They rode off north with some of our grain, and 9 of us were hurt." I had no warning, and the speed didn't slow when the smoke appeared.
>
> **5. Where I got bored and quit.** From late autumn on, the whole game was: chalk, wait, the "dark" label, mark a lamp, wait about 10 days for someone to make it. Families kept arriving ("They had heard there was room") until there were 40 or more. But all 40 were drawn as one black blob on the hearth tile, so there was no swarm to watch. I quit because the only goal left, "Water under the hill.", sat behind the air rule I couldn't read, and nothing was pressing on me.
>
> **6. Three changes that would make me play again, most important first.**
> 1. **Show the swarm and the systems.** Spread people across the tunnels doing visible jobs. Show what water, air and food mean, and let them bite. Thirst and hunger should have consequences, and the jar count should move as more people arrive.
> 2. **Explain blocks where they happen.** Look on a "no air" mark should say what fixes it, the same way it explains the stone. And tell me where water is likely to be.
> 3. **Slow the game down automatically on smoke.** Then the bell becomes a real decision at any speed. Also more mid-game events (cave-ins, finds, quarrels) to break up the lamp-and-wait stretch.
>
> **7. Bugs and text that looked wrong.**
> - The person card's × couldn't be tapped because the picture of the hill sat on top of it (about 30 seconds of failed taps, 2 in-game days passing).
> - The year turns over mid-winter: "the 27th day of winter, first year" was followed by "the 34th day of winter, second year", with no line in the journal.
> - Closing the notebook jumps the view back to the top of the hill.
> - The first lamp I placed with no lamp in hand failed silently. I only saw the "No lamp in hand" note on a later attempt.
> - The tip box ("Drag over open ground to make it a store…") covers the shaft I'm working on.
> - The goal "Beds below for everyone" was ticked with 6 beds for 11 people.
> - "Jars below for a month or so" didn't change for about 60 days.
>
> **8. How far I got.** Spring 23rd, year two (the export file is named day 219). "40 souls and more." I had built:
> - 4 levels, with 2 shafts and a loop
> - 13 beds
> - 1 store
> - about 8 lamps
> - a rolling-stone door
> - a vent to the surface
>
> Water was never found, and my deep shaft stopped at the "no air" mark.

From the veteran's diary: "That is a genuine RimWorld moment: they died-ish for supper. I love it and hate it." And: "I'm starting to feel the numbers are decorative."

## Idle/incremental addict (Sonnet)

> **1. Verdict.** As an idle-game player, I found nothing to grow, so I left. Raiders hurt three people every few months, I never saw them coming, and a year passed with almost no visible change. 3/10.
>
> **2. First minute.** The hand-drawn cross-section looked good. The opening text ("Nobody obeys. Everyone follows the worn path.") made me curious. After I chalked one room and set gallop, the game gave me nothing to chase. I got no counters, no resources ticking up and no "next unlock" in view.
>
> **3. People and controls.**
> - I understood chalk, store, beds, lamp, door and the bell as tools.
> - The people are named and have notebook cards ("Hasan listens for the bell."), but I never saw what any of them were doing.
> - Confusions:
>   - Store only works on open ground, so you must chalk and wait for a dig first. The journal told me "Rooms are marked on open ground. Chalk the stone first." after the fact.
>   - I hung a lamp and saw no effect.
>   - The "water jars are dry" status never changed, and I never found a way to fix it.
>   - The speed setting reset to walk after each raid, so my gallop didn't stick.
>
> **4. Best and worst moments.**
> - Best: harvest 37, year 1. A dug passage and storeroom had appeared by themselves, and the jar room filled with jars by spring of year 2. That was the one time I felt the colony act on my chalk.
> - Worst: "They rode off north with much of our grain, and 3 of us were hurt" (harvest 37, year 1). I had no warning and nothing I could do about it.
>
> **5. Boredom and quitting.**
> - Year 1 harvest 37, "Kerem was caught near the entrance and struck", then the same kind of raid again at autumn 24.
> - Year 2, summer 31 and harvest 10: more raids, "Hasan was caught near the entrance and struck".
> - By year 2 autumn 25 I had set gallop, waited several minutes, and the picture was nearly the same as before. All nine huddled in the cellar. "Nine souls" never changed.
> - I quit at autumn 25, year 2, because I saw no growth and no reason to come back.
>
> **6. Three changes that would make me play again.**
> - **Visible growth.** Show a count, rooms or capacity that goes up over time, so waiting feels like progress.
> - **Warning and a reason to return.** The bell only works if I'm watching for smoke, which an idle player can't do. A raid warning I can set in advance, or a short "while you were away" summary, would work.
> - **Unlocks and feedback.** Name the next goal and show what each tool did. The lamp needs a visible effect. The water problem needs a way to solve it, and speed should stay where I set it.
>
> **7. Bugs and oddities.**
> - The game says time is frozen between commands, but the date moved on its own during UI taps, for example spring 32 to 43 during notebook and people taps.
> - After a tap-by-number that switched to the beds tool, my touch placed a bed in the wrong place.
> - A chalk drag I made at harvest 10, year 2 did not appear.
> - Speed drops back to walk after raid events.
> - The "dark" chalk marker is unexplained until the lamp hint appears.
> - The view auto-pans to a person when you open their card and doesn't recenter.
>
> **8. How far I got.** Autumn 25, year 2 (export filename says day 423), with nine people, the same as at the start.

Designer's note (confirmed from the export): the idle player made two inputs in 423 days (a 6-cell chalk on day 4 and a store on day 56) and never marked beds. Families arrive only when there are free beds, so the hill stayed at nine. That is the game's premise working, but nothing on screen said beds were what brought people.

## Wildcard: retired history teacher from Nevşehir, 67 (Haiku)

> **1. Verdict:** Quiet and honest about the work of digging, and the first hour feels like a real village. But I could not work out how to keep the people alive. I stopped on the 38th of harvest. Score: 5/10.
>
> **2. The first minute:** The opening text about Yusuf Usta's cellar, the burned villages and the barley hooked me. "Nobody obeys. Everyone follows the worn path." is a true line about how people here live. The first chalk marks worked the way the note said. When Musa broke through the wall on the 19th, I felt the thing was real. My one complaint is the small italic text in the margin boxes. My eyes were tired by the second screen.
>
> **3. What I understood and what confused me:** I understood the digging, the jars and the lamp. The notebook names are right for here: the Kaya, Demir and dig-master's houses. The journal reads like a person wrote it: "The floor is worn smooth now along the busiest passage, and they walk it quicker for that." What I could not understand:
> - Water. The top line says "the water jars are dry" from the 20th to the 38th, and nothing I tried changed it. The 20th had "a little water at the hearth"; I never saw where water comes from.
> - The stone door. I tapped the narrow shaft on the 32nd and got a dashed ring. It was still a dashed ring on the 38th. The rule came up only in the journal on the 38th: "open on two opposite sides only. Three at most." I needed that rule before I placed it.
> - The bell. I rang it on the 32nd, and the journal said, "You rang the bell, though no one had seen smoke." That is fair, but I did not know what smoke meant or where to look for it.
>
> **4. Best and worst moments:**
> - Best: the 20th. I chalked a wall, waited 30 seconds, and Musa broke through it. It was the first time the picture did what I told it.
> - Worst: the 32nd. I waited 30 seconds with four chalk marks on the stone, and the riders came. "They rode off north with some of our grain, and 3 of us were hurt." I did not see it coming and no warning stopped me from waiting. I had to learn it by losing people.
>
> **5. Where I got bored, frustrated or quit:** I got bored while waiting on the 30th to 38th. Nothing in the picture moved except the time. Frustration came from the Yusuf Usta card. Tapping the close × did nothing for me; the driver timed out. The card stayed on screen until I tapped the empty sky. The cards themselves are thin: "sit and rest · well enough. well. Hasan listens for the bell." I do not know how Hasan feels. "Well." on its own line looks like a broken sentence. I quit on the 38th because the water had been dry about 18 days and the door had not moved.
>
> **6. Three changes that would make me play again:**
> 1. Show where water comes from, and a clear warning before the water runs out, in plain words.
> 2. Give the stone door a visible result, or a plain line when it is waiting on people, instead of a dashed ring.
> 3. Give each person a fuller line about how they feel, and fix the close button on the card so it works on the first tap.
>
> **7. Bugs and wrong-looking text:**
> - The Yusuf Usta card stayed open after the close × was tapped. It closed only when I tapped empty sky.
> - The card reads "well." as its own line.
> - The margin says "the water jars are dry" for about 18 days with no change.
> - The dashed door outline in the shaft did not carve by the 38th.
> - Driver errors: "tap Close" and "tap 2" timed out on `[data-drive]` / the card's × a few times. I retried and the second try worked.

## Mischief edge-pusher (Opus)

Played build 3dc00d6; report received after 6ed1783 was deployed. Changes it led to are in 9eaf251 (round 2).

> ## 1. Verdict
> The bell is the best thing in it. The village notices my lies and stops believing me, person by person, in a way that is believable and a little funny. Everything else I tried to abuse was either refused in silence or let through without anyone noticing. **6/10.**
>
> ## 2. The first minute
> The intro hands me the bell and says "Ring the bell when there is smoke." Of course I rang it before doing anything else. The journal said "You rang the bell, though no one had seen smoke." Hasan replied: "Not now. After I drink from the jar." The game had caught me in a lie in the first ten seconds, and that hooked me. The chalk tutorial ("Choose chalk, then drag across the stone beside it") was clear.
>
> ## 3. What I understood, and what confused me
> **Understood:**
> - I chalk where to dig, mark rooms, hang lamps and ring the bell.
> - People do the work when they feel like it ("After I eat at the hearth, then I will.").
> - Each person's card shows what they are doing, how they feel, and whether they trust the bell.
>
> **Confused:**
> - **Invisible walls for chalk.** Chalk east toward the neighbours' houses stopped dead at a faint seam in the stone, twice (22nd of harvest, 15th of winter). Chalk up toward a house floor stopped one row under the grass (48th of spring, year two). No message and no voice. I couldn't tell whether that was the neighbours' land, a rule, or a bug.
> - **"dark" was the only sign the digging had stopped.** From the 23rd to the 39th of autumn nothing happened. The only clue was a red "dark" label about 6 pixels high at each dig face.
> - **Lamp taps that did nothing.** Tapping the dark grey squares did nothing, and so did tapping a lamp onto the open sky. Neither gave a message. Lamps work only on the lit floor next to the dark, and I worked that out by guessing.
> - **The notebook doesn't pause time.** Reading nine people's cards cost a week of game time (12th to 19th of autumn).
>
> ## 4. Best and worst moments
> **Best: the 21st of harvest and the 12th of autumn.** I read the cards after four false rings. Most people now said "is not sure about the bell any more." Three still "listen for the bell":
> - Zehra, who is 12
> - Yusuf Usta, who is 74
> - Selim, from the Uçar house, which arrived after my lies
>
> The child, the old man and the new guy. Later Yusuf gave up on me too. İsmail of the newly arrived Polat house doubted me after a single false ring (48th of winter, year two). That is the world answering my mischief.
>
> **Worst: the 31st of harvest.** I was fiddling with room marks and missed the riders. "Hatice / Zehra / Yusuf Usta / Meryem was caught above ground and struck." "They rode off north with much of our grain, and 4 of us were hurt." Right after that the page gave me "✓ When the smoke comes, everyone below." It felt like a gold star for a raid I slept through.
>
> ## 5. Where I got bored and quit
> I spent about 200 days making the bell worthless. I wanted to see a raid where I ring honestly and nobody comes. Then I watched from the 49th of winter to the 47th of spring in year two, about 80 days, with my finger on the bell. No smoke came. The only journal entry was the Doğan house arriving, and the faces went "dark" again, so even the digging stopped.
>
> The last chalk refused in silence on the 48th of spring, year two, and I quit there. I never found out whether my false alarms changed how a raid went; the screen never showed it either way.
>
> ## 6. Three changes that would bring me back
> 1. **Make the bell's lost credit cost something at a real raid, and say it in the journal.** For example: "Hasan heard the bell and kept reaping. He'd heard it before." I set that up for 200 days and the game never answered it.
> 2. **Have someone say why when the chalk refuses.** For example: "That's the Aydın ground, Usta." or "You'll come up in Musa's kitchen." Silent invisible walls are the least fun kind of no.
> 3. **Make "dark stopped the picks" loud.** Put it in the journal or as a voice line, not as a 6-pixel label. Weeks of nothing happening read as a broken game.
>
> ## 7. Bugs and wrong-looking text
> - **The journal showed old entries after a raid.** On the 34th of harvest, the newest entry was from the 22nd, although the raid had ended on the 31st. After I closed it and reopened it at slow speed, the 29th–31st raid entries appeared.
> - **A late honest ring counted as a lie.** On the 21st of autumn the journal said "Smoke again in the south." On the 23rd, after the riders had left, I rang and got "You rang the bell, though no one had seen smoke." It's defensible because the smoke was gone, but it reads wrong.
> - **The objective tick right after four people were hurt**, quoted under Worst.
> - **Beds in a corridor were accepted.** "✓ Beds below for everyone before the frost." was ticked, but nobody slept below even in winter. I got away with it, and nobody remarked on it.
> - **A confusing date jump.** The journal goes from "the 25th day of winter, first year" straight to "the 48th day of winter, second year" with nothing between. Hatice aged from 58 to 59, so the year probably turns mid-winter rather than a whole year passing silently, but I couldn't tell which.
> - **No message for failed actions.** Lamp taps on the dark squares and on the sky did nothing. Chalk past the seams did nothing.
> - **The door accepted message is the refusal text.** Placing a valid door in the entrance shaft still showed the refusal rule: "A door fits a narrow passage: open on two opposite sides only. Three at most."
> - **Clipped text.** A journal line ("Hatice: 'After I pray, then I will.'") showed half-hidden behind the bottom toolbar.
> - **Repetitive lines.** Six identical "After I pray, then I will." lines in a row at dusk on the 23rd of autumn.
> - **The journal wouldn't scroll by drag; the drag selected text instead.** This may be the test driver rather than the game.
>
> ## 8. How far I got
> - **Reached:** the 48th day of spring, second year (export reports day 242).
> - **Population:** the top bar says "some 20 souls": the original nine plus the Uçar house (4), the Polat house (2) and the Doğan house (5).
> - **Raids:** two, on the 29th–31st of harvest and the 21st–23rd of autumn. Each hurt 4 people and took grain.
> - **Water:** "the water jars are dry" for almost the whole game.

## HF-character harness (packages/playtester, adapter `adapters/warren.ts`)

Run on build 7067eac: all personas, 2 seeds, 20-minute cap. Summary lines verbatim:

```
commuter          6 min, quit at harvest y1, frustrated 2/2, rewards 5.5
unwinder         15 min, quit at autumn y1, frustrated 2/2, rewards 7.5
completionist    20 min, time-limit, frustrated 2/2, rewards 9
restless        8.5 min, quit at harvest y1, frustrated 2/2, rewards 6.5
mischief       15.5 min, quit at autumn y1, bored 2/2, rewards 0 (rose to 34.5)
exploiter        20 min, time-limit, frustrated 2/2, rewards 7
rulesLawyer       5 min, quit at harvest y1, frustrated 2/2, rewards 3
returner      11.75 min, came back 6/6
frustrated by ["Ayşe was caught above ground and struck.", "Hasan was caught above ground and struck.", "Riders on the hill. ..."]
edge mischief-ignored edge:chalk (toward the neighbours) [fun to keep]: the game lets it pass in silence (206 tries, answered 3%)
edge degenerate-loop edge:bell [close]: nothing new came of it (8 inputs running; answered 0%)
```

Every persona was frustrated by the first raid, and the mischief of chalking toward the neighbours and ringing a false bell went unanswered. Both are answered in 6ed1783 (see above). The many "silent-input" lines are partly an adapter artefact: the screen shows a chalk mark at once, which the adapter did not report as an event.
