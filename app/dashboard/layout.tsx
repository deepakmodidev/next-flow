import { AppHeader } from "@/app/_components/AppHeader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />
      {children}
    </div>
  );
}
