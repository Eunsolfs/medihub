import { createFileRoute } from "@tanstack/react-router";

import { InstallWizard } from "#src/components/install/install-wizard.tsx";

export const Route = createFileRoute("/install")({
  component: InstallWizard,
});
