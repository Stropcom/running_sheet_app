// Region colours. Fixed strings so Tailwind sees every class.
//   Western gold · Northern maroon · Eastern sky blue · Southern dark blue ·
//   Central red
import type { CommandCode } from "@shared/commands";

export const COMMAND_CHIP_CLASS: Record<CommandCode, string> = {
  WESTERN:
    "text-[#9a6b00] bg-[#9a6b00]/10 border-[#9a6b00]/40 dark:text-[#f2c14e] dark:bg-[#f2c14e]/10 dark:border-[#f2c14e]/40",
  NORTHERN:
    "text-[#7a1f2e] bg-[#7a1f2e]/10 border-[#7a1f2e]/40 dark:text-[#e0788a] dark:bg-[#e0788a]/10 dark:border-[#e0788a]/40",
  EASTERN:
    "text-[#0b7bbd] bg-[#0b7bbd]/10 border-[#0b7bbd]/40 dark:text-[#5fd0f0] dark:bg-[#5fd0f0]/10 dark:border-[#5fd0f0]/40",
  SOUTHERN:
    "text-[#1a3a8a] bg-[#1a3a8a]/10 border-[#1a3a8a]/40 dark:text-[#7f93ee] dark:bg-[#7f93ee]/10 dark:border-[#7f93ee]/40",
  CENTRAL:
    "text-[#c0242b] bg-[#c0242b]/10 border-[#c0242b]/40 dark:text-[#ff7a7a] dark:bg-[#ff7a7a]/10 dark:border-[#ff7a7a]/40",
};
