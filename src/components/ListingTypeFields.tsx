"use client";
import { useState } from "react";

// Shows only the availability statuses that are valid for the selected listing type (server re-validates).
export function ListingTypeFields({ types, availabilityByType, availabilityLabels, defaultType, defaultAvailability }: {
  types: { value: string; label: string }[];
  availabilityByType: Record<string, string[]>;
  availabilityLabels: Record<string, string>;
  defaultType: string;
  defaultAvailability?: string;
}) {
  const [type, setType] = useState(defaultType);
  const allowed = availabilityByType[type] ?? [];
  return (
    <>
      <label className="block">
        <span className="label">Listing type <span className="text-danger">*</span></span>
        <select name="listingType" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Availability status <span className="text-danger">*</span></span>
        <select name="availability" className="input" defaultValue={allowed.includes(defaultAvailability ?? "") ? defaultAvailability : allowed[0]} key={type}>
          {allowed.map((a) => <option key={a} value={a}>{availabilityLabels[a]}</option>)}
        </select>
        <span className="hint block">Only statuses appropriate for this listing type can be selected.</span>
      </label>
    </>
  );
}
