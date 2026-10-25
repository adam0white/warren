/** Actual retained browser run, not generated healthy source state. */
import { snapshot } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { act, advance, fingerprint, load, replay, save } from '../src/sim/game.ts';
import { projectNativeReturn } from '../src/sim/native-return.ts';

import { currentCareSaved } from './current-care.ts';

const actual = () => load(currentCareSaved());
describe('finite native return from actual played Warren care', () => {
  it('captures actual Kian and releases Meryem only at a natural boundary, with exact replay', async () => {
    const g = actual();
    const before = snapshot(g.s.people.find((p) => p.id === 'kian')!);
    expect(act(g, { verb: 'prepare-native-return', who: 'kian' })).toBe(true);
    const k = await projectNativeReturn(g.s, 'kian');
    expect(k.raw).toEqual(before);
    expect(k.transfer.checkpoint.sha256).toBe(
      'f8dc20cd2eff854f47bca2f30743ad84b1702066250c88253548f4cdc6a20a75',
    );
    expect(k.transfer.warrenCare?.visit.dependent.sleepPressure).toBe(0.18374932648343162);
    expect(k.transfer.warrenCare?.visit.source.dependent.sleepPressure).toBe(0.2337493264834316);
    expect(k.transfer.person.calendar.commitments.find((c) => c.id === 'c3')?.status).toBe('pending');
    expect(act(g, { verb: 'prepare-native-return', who: 'meryem' })).toBe(true);
    const m = await projectNativeReturn(g.s, 'meryem');
    expect(m.raw.now).toBeGreaterThanOrEqual(665);
    expect(m.raw.activity).toBeNull();
    const s = save(g);
    expect(fingerprint(replay(s.seed, s.inputs, s.minute, s.game, s.chapter).s)).toBe(s.fingerprint);
  });
  it('refuses missing agreement, expired return, changed source care and actual clinical/project restrictions', async () => {
    for (const mutate of [
      (g: ReturnType<typeof actual>) => {
        delete g.s.adaVisit;
      },
      (g: ReturnType<typeof actual>) => {
        g.s.adaVisit!.returnBy = 600;
      },
      (g: ReturnType<typeof actual>) => {
        g.s.adaVisit!.source.dependent.sleepPressure = 0;
      },
      (g: ReturnType<typeof actual>) => {
        g.s.people.find((p) => p.id === 'kian')!.body.alive = false;
      },
    ]) {
      const g = actual();
      mutate(g);
      act(g, { verb: 'prepare-native-return', who: 'kian' });
      await expect(projectNativeReturn(g.s, 'kian')).rejects.toThrow();
    }
  });
  it('invalidates prepared sources after further play, live death, expiry or a failed preparation', async () => {
    const g = actual();
    act(g, { verb: 'prepare-native-return', who: 'kian' });
    advance(g, 630);
    await expect(projectNativeReturn(g.s, 'kian')).rejects.toThrow(
      /person has changed since the return was prepared/,
    );
    act(g, { verb: 'prepare-native-return', who: 'kian' });
    expect(g.s.nativeDepartures?.kian?.person.activity).toBeNull();
    await expect(projectNativeReturn(g.s, 'kian')).resolves.toBeDefined();
    g.s.people.find((p) => p.id === 'kian')!.body.alive = false; // Declared terminal refusal control.
    await expect(projectNativeReturn(g.s, 'kian')).rejects.toThrow(
      /person has changed since the return was prepared/,
    );
    expect(act(g, { verb: 'prepare-native-return', who: 'kian' })).toBe(true); // Logs invalidation, not a new capture.
    expect(g.s.nativeDepartures?.kian).toBeUndefined();
    const expired = actual();
    act(expired, { verb: 'prepare-native-return', who: 'kian' });
    advance(expired, 1200);
    await expect(projectNativeReturn(expired.s, 'kian')).rejects.toThrow();
    expect(act(expired, { verb: 'prepare-native-return', who: 'kian' })).toBe(true);
    expect(expired.s.nativeDepartures?.kian).toBeUndefined();
    const saved = save(expired);
    expect(fingerprint(replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter).s)).toBe(
      saved.fingerprint,
    );
  });
  it('does not omit an additional actual duty or unfinished goal', async () => {
    for (const kind of ['duty', 'goal']) {
      const g = actual(),
        p = g.s.people.find((p) => p.id === 'kian')!;
      if (kind === 'duty')
        p.agenda.commitments.push({
          ...p.agenda.commitments[0]!,
          id: 'other-duty',
          actions: ['go-home'],
          toId: 'home:west',
          targetId: 'home:west',
        });
      else p.agenda.goals.push({ ...p.agenda.goals[0]!, id: 'unfinished-project', status: 'active' });
      act(g, { verb: 'prepare-native-return', who: 'kian' });
      await expect(projectNativeReturn(g.s, 'kian')).rejects.toThrow();
    }
  });
});
