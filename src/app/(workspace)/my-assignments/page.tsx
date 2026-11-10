import type { Metadata } from "next";
import { MicIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { AssignmentCard } from "@/components/assignments/assignment-card";
import { requireSessionUser } from "@/server/auth/session";
import { listMyAssignments } from "@/server/services/assignments";
import { isToday, isPast, differenceInCalendarDays } from "date-fns";

export const metadata: Metadata = { title: "My assignments" };

export default async function MyAssignmentsPage() {
  const user = await requireSessionUser();
  const items = await listMyAssignments(user.id);
  const now = new Date();
  const groups: Array<{ title: string; items: typeof items }> = [
    { title: "Needs a new version", items: items.filter((a) => a.segment.status === "CHANGES_REQUESTED" || a.segment.status === "REOPENED") },
    { title: "Overdue", items: items.filter((a) => a.overdue && !["CHANGES_REQUESTED", "REOPENED"].includes(a.segment.status)) },
    { title: "Due today", items: items.filter((a) => a.dueAt && isToday(new Date(a.dueAt)) && !a.overdue && !["CHANGES_REQUESTED", "REOPENED"].includes(a.segment.status)) },
    { title: "This week", items: items.filter((a) => a.dueAt && !isToday(new Date(a.dueAt)) && !isPast(new Date(a.dueAt)) && differenceInCalendarDays(new Date(a.dueAt), now) <= 7 && !["CHANGES_REQUESTED", "REOPENED"].includes(a.segment.status)) },
    { title: "Later", items: items.filter((a) => a.dueAt && differenceInCalendarDays(new Date(a.dueAt), now) > 7 && !["CHANGES_REQUESTED", "REOPENED"].includes(a.segment.status)) },
    { title: "No due date", items: items.filter((a) => !a.dueAt && !["CHANGES_REQUESTED", "REOPENED"].includes(a.segment.status)) },
  ];
  return (
    <>
      <PageHeader title="My assignments" description="Lines assigned to you, grouped by urgency. Upload a recording from any card." />
      {items.length === 0 ? (
        <EmptyState icon={MicIcon} title="Nothing assigned yet" description="When a manager assigns you a segment it will appear here with the script, reference material and due date." />
      ) : (
        <div className="space-y-8">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.title}>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  {g.title} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{g.items.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.items.map((a) => (
                    <AssignmentCard key={a.id} assignment={a} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
