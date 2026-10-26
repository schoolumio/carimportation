import type { PaymentProviderKey } from "@prisma/client";
import type { PaymentProvider } from "./provider";
import { sandboxProvider } from "./sandbox";
import { manualPilotProvider } from "./manual-pilot";

export function providerFor(key: PaymentProviderKey): PaymentProvider {
  switch (key) {
    case "SANDBOX":
      return sandboxProvider;
    case "MANUAL_PILOT":
      return manualPilotProvider;
    case "LIVE_PARTNER":
      throw new Error("No live escrow/safeguarding partner is integrated. See docs/INTEGRATIONS.md.");
  }
}
