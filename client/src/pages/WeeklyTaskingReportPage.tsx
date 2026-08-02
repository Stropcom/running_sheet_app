import DashboardLayout from "@/components/DashboardLayout";
import { CalendarClock } from "lucide-react";

export default function WeeklyTaskingReportPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Weekly Tasking Report
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              What the unit can do next week
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </div>
    </DashboardLayout>
  );
}
