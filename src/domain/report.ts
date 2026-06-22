import type { BattleReport, DamageCause } from "./battle";

export const DAMAGE_CAUSE_LABEL: Record<DamageCause, string> = {
  rifle_fire: "Projectile fire",
  melee: "Melee",
  explosion: "Explosion",
  trampling: "Trampling",
  energy_weapon: "Energy weapon",
  telekinetic_attack: "Telekinetic attack",
  bleed_out: "Bleed-out",
  rout_combat_ineffective: "Rout / combat ineffective",
};

export const formatTime = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
};

export const summarizeOutcome = (report: BattleReport): string => {
  if (report.outcome.kind === "army_a_victory") {
    return "Army A victory";
  }
  if (report.outcome.kind === "army_b_victory") {
    return "Army B victory";
  }
  if (report.outcome.kind === "draw") {
    return "Draw";
  }
  return "Stalemate";
};
