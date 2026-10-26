import { requirePerm } from "@/server/web/session";
import { ListingForm } from "@/components/ListingForm";
import { Flash, PageHeader } from "@/components/ui";
import { adminCreateListingAction } from "../../actions";

export const metadata = { title: "New platform listing" };

export default async function NewPlatformListing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("listing.manage.all");
  return (
    <div>
      <PageHeader title="New platform-owned listing" subtitle="Record sourcing, purchase costs and documents after creating the draft." crumbs={[{ href: "/admin/listings", label: "Listings" }]} />
      <Flash sp={sp} />
      <ListingForm action={adminCreateListingAction} submitLabel="Create draft" />
    </div>
  );
}
