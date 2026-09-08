"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/paths";

export interface ServiceAvailability {
  claude: boolean;
  polly: boolean;
  s3: boolean;
  transcribe: boolean;
}

const NONE: ServiceAvailability = {
  claude: false,
  polly: false,
  s3: false,
  transcribe: false,
};

/**
 * Ask the server which integrations are configured.
 *
 * Measurement never depends on this — every agent works with no keys at all.
 * Only the interpretation, speech and history layers do, so those are hidden
 * rather than shown as buttons that error.
 */
export function useServices(): { services: ServiceAvailability; loaded: boolean } {
  const [services, setServices] = useState<ServiceAvailability>(NONE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = api("/api/services");
    if (!url) {
      setLoaded(true);
      return;
    }
    fetch(url)
      .then((r) => (r.ok ? r.json() : NONE))
      .then((data: ServiceAvailability) => {
        if (!cancelled) setServices(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { services, loaded };
}
