import { PublicInboxView } from "@/components/PublicInboxView";

type Props = {
  params: Promise<{ inbox: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicInboxPage({ params, searchParams }: Props) {
  const { inbox } = await params;
  const sp = await searchParams;

  return (
    <PublicInboxView
      inbox={decodeURIComponent(inbox)}
      token={sp.token?.trim() || ""}
    />
  );
}
