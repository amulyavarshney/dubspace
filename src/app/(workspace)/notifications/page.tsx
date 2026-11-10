import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { requireSessionUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const data = await listNotifications(user.id, { limit: 100 });
  return (
    <>
      <PageHeader title="Notifications" description="Assignments, submissions, feedback and approvals that involve you." />
      <NotificationList initial={JSON.parse(JSON.stringify(data))} />
    </>
  );
}
