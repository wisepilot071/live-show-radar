import type { Metadata } from "next";
import { NotificationInbox } from "@/components/inbox/NotificationInbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return <NotificationInbox />;
}
