import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { assertShipmentAccess } from "@/server/logistics/service";
import { documentsForOrder } from "@/server/documents/service";
import { nextStates, STATE_LABEL } from "@/server/orders/state-machine";
import { can } from "@/server/auth/actor";
import { ActivityLog, JourneyProgress, StateBadge } from "@/components/OrderTimeline";
import { Card, Field, Flash, KeyValue, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { BENEFICIARY_LABEL } from "@/lib/labels";
import { bookingAction, customsAction, etaAction, partnerCostAction, partnerDocAction, partnerMilestoneAction, recordDeliveryAction, scheduleDeliveryAction, trackingAction } from "../../actions";

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");

export default async function PartnerShipment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  try { await assertShipmentAccess(actor, id, ["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER"]); } catch { notFound(); }
  const s = await prisma.shipment.findUniqueOrThrow({ where: { id }, include: { order: { include: { listing: true, delivery: true } }, customs: true, events: { orderBy: { occurredAt: "asc" } }, etaRevisions: true, assignments: true } });
  const transitions = await prisma.orderTransition.findMany({ where: { orderId: s.orderId }, orderBy: { sequence: "asc" } });
  const docs = await documentsForOrder(actor, s.orderId);
  const roles = new Set(s.assignments.filter((a) => a.userId === actor.userId).map((a) => a.role));
  const ops = can(actor, "shipment.manage");
  const isLog = ops || roles.has("LOGISTICS_OPERATOR");
  const isClr = ops || roles.has("CLEARING_PARTNER");
  const isDel = ops || roles.has("DELIVERY_PARTNER");
  const perms = ["order.transition.logistics", "order.transition.clearing", "order.transition.delivery", "order.transition.ops"].filter((p) => can(actor, p as never));
  const allowed = nextStates(s.order.path, s.order.state).filter((t) => t.to !== "DELIVERED" && t.performers.some((p) => perms.includes(p)));
  const back = `/partner/shipments/${id}`;
  const H = () => <><input type="hidden" name="shipmentId" value={id} /><input type="hidden" name="back" value={back} /></>;
  return (
    <div className="container-page space-y-6 py-8">
      <PageHeader title={`Shipment ${s.reference}`} subtitle={`${s.order.listing?.title ?? ""} · order ${s.order.orderNumber}`} crumbs={[{ href: "/partner", label: "Shipments" }]} actions={<StateBadge state={s.order.state} />} />
      <Flash sp={sp} />
      <Card title="Progress"><JourneyProgress path={s.order.path} state={s.order.state} transitions={transitions} /></Card>
      <Card title="Record milestone">
        {allowed.length ? allowed.map((t) => (
          <form key={t.to} action={partnerMilestoneAction} className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <H /><input type="hidden" name="to" value={t.to} />
            <div><p className="font-medium">{STATE_LABEL[t.to]}</p><p className="text-xs text-slate-500">{t.label}{t.evidenceRequired && " — evidence required"}</p><input name="description" className="input mt-1" placeholder="Details" /></div>
            <input type="file" name="file" required={t.evidenceRequired} accept="application/pdf,image/*" className="text-sm" />
            <button className="btn-primary btn-sm">Record</button>
          </form>
        )) : <p className="muted">No milestone for your role at the current stage.</p>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {isLog && (
          <Card title="Booking & vessel">
            <form action={bookingAction} className="grid gap-2 sm:grid-cols-2"><H />
              <Field label="Booking ref" name="bookingRef" defaultValue={s.bookingRef ?? ""} /><Field label="Vessel" name="vesselName" defaultValue={s.vesselName ?? ""} />
              <Field label="Voyage" name="voyageNumber" defaultValue={s.voyageNumber ?? ""} /><Field label="Container" name="containerNumber" defaultValue={s.containerNumber ?? ""} />
              <Field label="Bill of lading" name="billOfLading" defaultValue={s.billOfLading ?? ""} /><Field label="Origin port" name="originPort" defaultValue={s.originPort ?? ""} />
              <Field label="Planned departure" name="plannedDeparture" type="date" defaultValue={d(s.plannedDeparture)} />
              <div className="flex items-end"><button className="btn-secondary btn-sm">Save</button></div>
            </form>
          </Card>
        )}
        <Card title="Add tracking update">
          <form action={trackingAction} className="grid gap-2"><H />
            <Field label="Milestone" name="milestone" required placeholder="e.g. Transhipment, Gate-in, Port arrival notice" />
            <Field label="Description" name="description" required />
            <div className="grid grid-cols-2 gap-2"><Field label="Location" name="location" /><Field label="Occurred at" name="occurredAt" type="datetime-local" /></div>
            <input type="file" name="file" accept="application/pdf,image/*" className="text-sm" />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="internal" /> Internal only (hide from buyer)</label>
            <button className="btn-secondary btn-sm w-fit">Add update</button>
          </form>
        </Card>
        {(isLog || isClr) && (
          <Card title="Revise ETA">
            <KeyValue items={[["Original", s.originalEtaStart ? `${d(s.originalEtaStart)} – ${d(s.originalEtaEnd)}` : "—"], ["Current", s.currentEtaStart ? `${d(s.currentEtaStart)} – ${d(s.currentEtaEnd)}` : "—"]]} />
            <form action={etaAction} className="mt-2 grid gap-2"><H />
              <div className="grid grid-cols-2 gap-2"><Field label="New ETA from" name="newStart" type="date" required /><Field label="to" name="newEnd" type="date" required /></div>
              <Field label="Reason" name="reason" required /><Field label="Supporting information" name="supportingInfo" required hint="e.g. carrier schedule notice dated …" />
              <input type="file" name="file" accept="application/pdf,image/*" className="text-sm" />
              <button className="btn-secondary btn-sm w-fit">Revise ETA</button>
            </form>
          </Card>
        )}
        {isClr && (
          <Card title="Customs & clearing">
            <form action={customsAction} className="grid gap-2 sm:grid-cols-2"><H />
              <label className="block"><span className="label">Status</span><select name="status" defaultValue={s.customs?.status ?? "NOT_STARTED"} className="input">{["NOT_STARTED", "DOCUMENTS_SUBMITTED", "ASSESSED", "DUTY_PAID", "EXAMINATION", "RELEASED", "HELD"].map((x) => <option key={x} value={x}>{x.replace(/_/g, " ").toLowerCase()}</option>)}</select></label>
              <Field label="Declaration ref" name="declarationRef" defaultValue={s.customs?.declarationRef ?? ""} />
              <Field label="Assessed value (₦)" name="assessedValue" defaultValue={s.customs?.assessedValue?.toFixed(2) ?? ""} />
              <Field label="Duty (₦)" name="dutyAmount" defaultValue={s.customs?.dutyAmount?.toFixed(2) ?? ""} />
              <Field label="VAT (₦)" name="vatAmount" defaultValue={s.customs?.vatAmount?.toFixed(2) ?? ""} />
              <Field label="Levies (₦)" name="leviesAmount" defaultValue={s.customs?.leviesAmount?.toFixed(2) ?? ""} />
              <Field label="Clearing fee (₦)" name="clearingFee" defaultValue={s.customs?.clearingFee?.toFixed(2) ?? ""} />
              <Field label="Terminal charges (₦)" name="terminalCharges" defaultValue={s.customs?.terminalCharges?.toFixed(2) ?? ""} />
              <input type="file" name="file" accept="application/pdf,image/*" className="text-sm sm:col-span-2" />
              <textarea name="notes" className="input sm:col-span-2" defaultValue={s.customs?.notes ?? ""} placeholder="Notes" />
              <button className="btn-secondary btn-sm w-fit">Save customs record</button>
            </form>
          </Card>
        )}
        {isDel && (
          <Card title="Delivery">
            <form action={scheduleDeliveryAction} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"><H />
              <Field label="Address" name="address" defaultValue={s.order.delivery?.address ?? ""} required />
              <Field label="Scheduled for" name="scheduledFor" type="datetime-local" required />
              <button className="btn-secondary btn-sm">Schedule</button>
            </form>
            {s.order.delivery?.scheduledFor && <p className="mt-1 text-xs text-slate-500">Scheduled <LocalTime iso={s.order.delivery.scheduledFor} /></p>}
            {s.order.state === "READY_FOR_HANDOVER" && (
              <form action={recordDeliveryAction} className="mt-4 grid gap-2 border-t pt-3 sm:grid-cols-2"><H />
                <Field label="Recipient name" name="recipientName" required /><Field label="Delivered at" name="deliveredAt" type="datetime-local" />
                <Field label="Odometer" name="odometer" type="number" /><input type="file" name="file" required accept="application/pdf,image/*" className="text-sm" />
                <textarea name="notes" className="input sm:col-span-2" placeholder="Condition notes at handover" />
                <button className="btn-primary btn-sm w-fit">Record delivery</button>
              </form>
            )}
          </Card>
        )}
        <Card title="Submit additional charge">
          <form action={partnerCostAction} className="grid gap-2 sm:grid-cols-2"><H />
            <input name="code" className="input" placeholder="Code e.g. DEMURRAGE" required /><input name="label" className="input" placeholder="Label" required />
            <input name="amount" className="input" placeholder="Amount (₦)" required />
            <select name="beneficiary" className="input">{Object.entries(BENEFICIARY_LABEL).filter(([k]) => k !== "CONTINGENCY_RESERVE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="clause" className="input sm:col-span-2" placeholder="Contract clause (only if contractual)" />
            <textarea name="reason" className="input sm:col-span-2" placeholder="Why did this cost arise?" required />
            <input type="file" name="file" required accept="application/pdf,image/*" className="text-sm" />
            <button className="btn-secondary btn-sm w-fit">Submit</button>
          </form>
        </Card>
        <Card title="Documents">
          <ul className="space-y-1 text-sm">{docs.map((x) => <li key={x.id}><a className="link" href={x.link}>{x.filename}</a> · {x.category}</li>)}</ul>
          <form action={partnerDocAction} className="mt-2 flex flex-wrap gap-2"><H /><select name="category" className="input w-auto"><option value="bill-of-lading">Bill of lading</option><option value="export-document">Export document</option><option value="arrival-notice">Arrival notice</option><option value="customs-release">Customs release</option><option value="photos">Photos</option></select><input type="file" name="file" required className="text-sm" /><button className="btn-secondary btn-sm">Upload</button></form>
        </Card>
      </div>
      <Card title="Activity"><ActivityLog transitions={transitions} events={s.events} etaRevisions={s.etaRevisions} /></Card>
    </div>
  );
}
