import { COMMAND_CHIP_CLASS } from "@/lib/commandStyle";
import { COMMAND_SHORT, type CommandCode } from "@shared/commands";

/** A Command's name in its own colour. */
export function CommandChip({
  command,
  extra,
  title,
}: {
  command: CommandCode;
  extra?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${COMMAND_CHIP_CLASS[command]}`}
    >
      {COMMAND_SHORT[command]}
      {extra ? ` ${extra}` : ""}
    </span>
  );
}
