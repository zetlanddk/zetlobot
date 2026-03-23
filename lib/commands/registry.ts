import { CommandHandler } from "./types";
import { helpHandler } from "./handlers/help";
import { lookupHandler } from "./handlers/lookup";
import { impersonateHandler } from "./handlers/impersonate";

const commands = new Map<string, CommandHandler>([
  ["/help", helpHandler],
  ["/lookup", lookupHandler],
  ["/impersonate", impersonateHandler],
]);

export function getHandler(command: string): CommandHandler | undefined {
  return commands.get(command);
}
