import type { AiModelProfile } from "@/lib/aiProvider";
import {
  getSetting,
  normalizeAiCooldownSeconds,
  type SystemSettingKey,
  type SystemSettings,
} from "@/lib/settings";

export type AiRuntimeRole = "student" | "teacher" | "admin";

const cooldownSettings = {
  programming: {
    student: {
      fallback: 20,
      key: "aiProgrammingStudentCooldownSeconds",
    },
    teacher: {
      fallback: 30,
      key: "aiProgrammingTeacherCooldownSeconds",
    },
    admin: {
      fallback: 30,
      key: "aiProgrammingAdminCooldownSeconds",
    },
  },
  objective: {
    student: {
      fallback: 30,
      key: "aiObjectiveStudentCooldownSeconds",
    },
    teacher: {
      fallback: 30,
      key: "aiObjectiveTeacherCooldownSeconds",
    },
    admin: {
      fallback: 30,
      key: "aiObjectiveAdminCooldownSeconds",
    },
  },
} as const satisfies Record<
  AiModelProfile,
  Partial<
    Record<
      AiRuntimeRole,
      {
        fallback: number;
        key: SystemSettingKey;
      }
    >
  >
>;

export function getAiCooldownDefinition(
  profile: AiModelProfile,
  role: AiRuntimeRole,
) {
  const definitions = cooldownSettings[profile] as Partial<
    Record<
      AiRuntimeRole,
      {
        fallback: number;
        key: SystemSettingKey;
      }
    >
  >;
  return definitions[role] ?? null;
}

export function resolveAiCooldownSeconds(
  settings: SystemSettings,
  profile: AiModelProfile,
  role: AiRuntimeRole,
) {
  const definition = getAiCooldownDefinition(profile, role);
  if (!definition) return null;
  return normalizeAiCooldownSeconds(
    settings[definition.key],
    definition.fallback,
  );
}

export async function getAiCooldownSeconds(
  profile: AiModelProfile,
  role: AiRuntimeRole,
) {
  const definition = getAiCooldownDefinition(profile, role);
  if (!definition) return null;
  const value = await getSetting(definition.key);
  return normalizeAiCooldownSeconds(value, definition.fallback);
}
