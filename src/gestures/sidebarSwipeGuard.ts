import type { App, Workspace } from "obsidian";

/**
 * Obsidian mobile detects sidebar-open swipes itself (outside the DOM event
 * system) and announces them by calling `workspace.trigger("swipe", { direction, points })`.
 * Our overlay's own pointer-event stopPropagation() never sees that internal
 * call, so it can't stop it. Instead we wrap `trigger` on the live workspace
 * instance and swallow horizontal swipe events while `isActive()` is true.
 */
export function installSidebarSwipeGuard(app: App, isActive: () => boolean): () => void {
	const workspace = app.workspace as Workspace & { trigger: Workspace["trigger"] };
	const originalTrigger = workspace.trigger.bind(workspace);

	workspace.trigger = ((name: string, ...data: unknown[]) => {
		if (name === "swipe" && isActive()) {
			const detail = data[0] as { direction?: string } | undefined;
			if (detail?.direction === "x") {
				return;
			}
		}
		return originalTrigger(name, ...data);
	}) as Workspace["trigger"];

	return () => {
		workspace.trigger = originalTrigger;
	};
}
