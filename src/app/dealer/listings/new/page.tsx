import { ListingForm } from "@/components/ListingForm";
import { Flash, PageHeader } from "@/components/ui";
import { createListingAction } from "../../actions";

export const metadata = { title: "New listing" };

export default async function NewListing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="New listing" subtitle="Saved as a draft. Add photos and documents, then submit for moderation." crumbs={[{ href: "/dealer/listings", label: "Inventory" }]} />
      <Flash sp={sp} />
      <ListingForm action={createListingAction} submitLabel="Save draft" />
    </div>
  );
}
