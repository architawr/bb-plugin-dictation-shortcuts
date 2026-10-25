import { useEffect, useRef } from "react";
import { definePluginApp, useComposer, useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { mountHints } from "./hints";
import { mountKeyboard, toggleNativeVoice } from "./keyboard";

const roots = new Map<string, HTMLElement>();
const spaceInserters = new Map<HTMLElement, () => void>();
const focusers = new Map<HTMLElement, () => void>();
let readConfig: (() => ReturnType<ReturnType<typeof useSdk>["system"]["config"]>) | undefined;
function ComposerAnchor() {
  const composer = useComposer();
  const sdk = useSdk();
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>("[data-app-composer]");
    if (!root) return;
    roots.set(composer.key, root);
    spaceInserters.set(root, () => composer.insert(" "));
    focusers.set(root, () => composer.focus());
    readConfig = () => sdk.system.config();
    return () => { if (roots.get(composer.key) === root) roots.delete(composer.key); spaceInserters.delete(root); focusers.delete(root); };
  }, [composer, composer.key, sdk]);
  return <span ref={anchor} hidden aria-hidden="true" />;
}
export default definePluginApp((app) => {
  app.composer.customize({ id: "anchor", banners: [{ id: "anchor", component: ComposerAnchor, chrome: "bare" }] });
  app.composer.experimental_registerCommand({
    id: "toggle",
    title: "Toggle dictation (Enter finishes, Escape cancels)",
    defaultShortcut: { key: "Space", control: true, shift: true },
    run({ composer }) {
      const root = roots.get(composer.key);
      if (!root?.isConnected || !toggleNativeVoice(root)) {
        toast.info("Voice input is unavailable here. Check Settings → AI services → Voice input.");
      }
    },
  });
  app.contentScripts.register({ id: "dictation-keys", mount: () => {
    const stopKeys = mountKeyboard(document, {
      insertSpace: root => spaceInserters.get(root)?.(),
      focusComposer: root => focusers.get(root)?.(),
    });
    const stopHints = mountHints(document, async () => readConfig?.());
    return () => { stopKeys(); stopHints(); };
  } });
});
