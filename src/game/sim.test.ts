import { describe, expect, it } from "vitest";
import { report, act, checkAchievements, resolveEvent, checkObjective, DAY_SECONDS, newSim, nextSol, tick } from "./sim";

const runDay = (s = newSim()) => { for (let t = 0; t < DAY_SECONDS * 3 && s.status === "day"; t += 0.5) { if (s.event) s = resolveEvent(s, 1).sim; s = tick(s, 0.5); } return s; };

describe("survival sim", () => {
  it("campaign is 10 Sols and pauses between Sols", () => {
    let s = runDay();
    expect(s.status).toBe("summary");
    for (let i = 2; i <= 10; i++) { s = nextSol(s); s = { ...s, condition: 100 }; s = runDay(s); }
    expect(s.status).toBe("won");
  });
  it("oxygen falls without the generator", () => {
    const s = runDay({ ...newSim(), systems: { oxygen: false, greenhouse: false, drill: false } });
    expect(s.oxygen).toBeLessThan(80);
  });
  it("no power stops the greenhouse", () => {
    const s = tick({ ...newSim(), energy: 0, panels: 0 }, 1);
    expect(s.unpowered).toContain("greenhouse");
  });
  it("shield upgrade costs 25 materials and 20 energy", () => {
    const { sim } = act(newSim(), "shield");
    expect(sim.materials).toBe(15); expect(sim.energy).toBe(50); expect(sim.shield).toBe(45);
  });
  it("one empty resource does not instantly fail the mission", () => {
    const s = tick({ ...newSim(), food: 0 }, 5);
    expect(s.status).toBe("day");
  });
  it("research costs energy and materials", () => {
    const { sim } = act(newSim(), "tech-panels");
    expect(sim.materials).toBe(25); expect(sim.energy).toBe(50); expect(sim.research).toContain("panels");
  });
  it("storage expansion raises capacity by 30 for 20 materials", () => {
    const { sim } = act(newSim(), "storage");
    expect(sim.capacity).toBe(130); expect(sim.materials).toBe(20);
  });
  it("completing an objective advances and rewards 10 materials", () => {
    const r = checkObjective({ ...newSim(), lifeSupport: 95 });
    expect(r.sim.objective).toBe(1); expect(r.sim.materials).toBe(50);
  });
  it("fast drilling makes more water", () => {
    const base = { ...newSim(), systems: { oxygen: false, greenhouse: false, drill: true } };
    expect(tick({ ...base, drillHigh: true }, 5).water).toBeGreaterThan(tick(base, 5).water);
  });
  it("events pause time until a choice is made", () => {
    const s = { ...newSim(), sol: 2, event: { kind: "dustdevil" as const } };
    expect(tick(s, 1).time).toBe(0);
    const r = resolveEvent(s, 1);
    expect(r.sim.event).toBeNull(); expect(r.sim.panels).toBe(30);
  });
  it("scanning a site costs 6 energy and 4 oxygen and records the discovery", () => {
    const { sim } = act(newSim(), "scan-ice");
    expect(sim.energy).toBe(64); expect(sim.oxygen).toBe(76); expect(sim.discoveries).toEqual(["ice"]);
    expect(checkAchievements(sim).unlocked.map((a) => a.id)).toContain("discovery");
  });
  it("studying ice at the lab gives 30 water", () => {
    const s = { ...newSim(), discoveries: ["ice"] };
    expect(act(s, "review-ice").sim.water).toBe(100);
  });
  it("a broken system stops working until repaired", () => {
    const s = tick({ ...newSim(), broken: "greenhouse" }, 1);
    expect(s.unpowered).toContain("greenhouse");
    expect(act(s, "fix-broken").sim.broken).toBeNull();
  });
  it("running out of oxygen damages the base gradually and is named as the cause", () => {
    let s = { ...newSim(), oxygen: 0, systems: { oxygen: false, greenhouse: false, drill: false } };
    s = tick(s, 10);
    expect(s.status).toBe("day"); expect(s.condition).toBeGreaterThan(90);
    for (let i = 0; i < 600 && s.status === "day"; i++) { if (s.event) s = { ...s, event: null }; s = nextSol(tick(s, 1)); }
    expect(s.status).toBe("lost");
    expect(report(s).cause?.title).toBe("Oxygen ran out");
  });
  it("a well-managed win is a sustainable outpost", () => {
    const s = { ...newSim(), status: "won" as const, objective: 9, condition: 90 };
    expect(report(s).grade).toContain("Sustainable");
  });
});

import { priorities, pickPrimary, stormOf, stormPhase, weatherNow } from "./sim";
describe("priorities and storms", () => {
  const top = (s: ReturnType<typeof newSim>) => priorities(s)[0]!;
  it("low energy points to the solar panels", () => expect(top({ ...newSim(), energy: 10 }).station).toBe("solar"));
  it("low water points to the ice drill", () => expect(top({ ...newSim(), water: 10 }).station).toBe("drill"));
  it("low food points to the greenhouse", () => expect(top({ ...newSim(), food: 10 }).station).toBe("greenhouse"));
  it("low oxygen points to life support", () => expect(top({ ...newSim(), oxygen: 20 }).station).toBe("dome"));
  it("a malfunction points to the broken building", () => expect(top({ ...newSim(), broken: "drill" }).station).toBe("drill"));
  it("critical oxygen beats low energy, water and research", () => {
    const l = priorities({ ...newSim(), oxygen: 5, energy: 10, water: 15 });
    expect(l[0]!.id).toBe("oxygen"); expect(l[0]!.level).toBe(1); expect(l[l.length - 1]!.level).toBe(4);
  });
  it("after oxygen is fixed the next urgent problem leads", () => {
    expect(top({ ...newSim(), oxygen: 60, energy: 10, water: 15 }).level).toBe(2);
  });
  it("guidance does not flip between equal-level problems", () => {
    const l = priorities({ ...newSim(), energy: 10, water: 5 });
    expect(pickPrimary(l, "energy")?.id).toBe("energy");
    expect(pickPrimary(priorities({ ...newSim(), energy: 10, oxygen: 5 }), "energy")?.id).toBe("oxygen");
  });
  it("storms only happen on clear Sols, are warned 10s ahead and end", () => {
    for (let seed = 0; seed < 200; seed++) for (let sol = 1; sol <= 10; sol++) {
      const s = { ...newSim(), seed, sol }, st = stormOf(s);
      if (!st) continue;
      expect(sol).toBeGreaterThan(1); expect(st.end - st.start).toBeGreaterThanOrEqual(15);
      expect(stormPhase({ ...s, time: st.start - 5 })).toBe("approaching");
      expect(weatherNow({ ...s, time: st.start + 1 })).not.toBe("clear");
      expect(weatherNow({ ...s, time: st.end + 1 })).toBe("clear");
    }
  });
});
