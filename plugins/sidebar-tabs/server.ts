import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { AUTOMATIC, migratedValue, modeOf, PROVIDER_KEY, STANDARD, type Mode } from "./tabs-model.ts";

type Sdk = BbPluginApi["sdk"];

/** Write only the list preference, guarded by its revision; one retry when a window wrote first. Returns the value left in place. */
async function writeList(sdk: Sdk, decide: (value: unknown) => string | null): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const { preferences } = await sdk.system.uiPreferences.list();
    const { value, revision } = preferences[PROVIDER_KEY];
    const next = decide(value);
    if (next === null || next === value) return value;
    try {
      await sdk.system.uiPreferences.set({ key: PROVIDER_KEY, value: next, expectedRevision: revision });
      return next;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

export default async function plugin(bb: BbPluginApi) {
  // The user chose «мои» while it was sessions' own list; keep that choice now that the host owns the list.
  // Install only: a reload or update never moves a user who picked bb's list.
  bb.onInstall(async () => {
    const value = await writeList(bb.sdk, migratedValue);
    bb.log.info(`list preference after install: ${JSON.stringify(value)}`);
  });

  bb.cli.register(defineCli({
    name: "sidebar-tabs",
    summary: "Sidebar list mode: «мои» (sidebar tabs) or «штатные» (bb's list)",
    commands: {
      mode: cliCommand({
        summary: "Show the sidebar list mode, or switch it to mine or standard",
        positionals: [{ name: "mode", description: "mine | standard; omit to show", required: false }],
        options: { json: { type: "boolean", description: "Print JSON" } },
        async run(input) {
          const wanted = input.positionals.mode;
          if (wanted !== undefined && wanted !== "mine" && wanted !== "standard") throw new PluginCliError("Режим: mine или standard");
          const value = wanted === undefined
            ? (await bb.sdk.system.uiPreferences.list()).preferences[PROVIDER_KEY].value
            : await writeList(bb.sdk, (current) => (modeOf(current) === wanted ? null : wanted === "standard" ? STANDARD : AUTOMATIC));
          const mode: Mode = modeOf(value);
          if (input.options.json) return { exitCode: 0, stdout: JSON.stringify({ mode, value }) };
          return { exitCode: 0, stdout: `${mode === "mine" ? "мои" : "штатные"} (${PROVIDER_KEY} = ${JSON.stringify(value)})` };
        },
      }),
    },
  }));
}
