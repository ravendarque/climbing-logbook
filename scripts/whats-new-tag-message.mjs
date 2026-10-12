// Prints the release tag's message: the version, then the PR's "What's new" lines (#917).
import { tagMessage, whatsNewFromPrBody } from "./lib/whats-new.mjs";

process.stdout.write(`${tagMessage(process.env.VERSION, whatsNewFromPrBody(process.env.PR_BODY ?? ""))}\n`);
