import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSchedules, useToggleSchedule, useUpdateSchedule } from "@/hooks/useSchedules";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, RefreshCw, Settings } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SCHEDULE_OPTIONS = [
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */2 * * *", label: "Every 2 hours" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 0 * * *", label: "Daily at midnight" },
];

export default function Schedules() {
  const { data: schedules, isLoading, refetch } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const updateSchedule = useUpdateSchedule();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleToggle = async (jobId: number, currentActive: boolean) => {
    try {
      await toggleSchedule.mutateAsync(jobId);
      toast({
        title: currentActive ? "Schedule Paused" : "Schedule Activated",
        description: `The schedule has been ${currentActive ? "paused" : "activated"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle schedule. Check if toggle function exists.",
        variant: "destructive",
      });
    }
  };

  const handleScheduleChange = async (jobId: number, newSchedule: string) => {
    try {
      await updateSchedule.mutateAsync({ jobId, schedule: newSchedule });
      setEditingId(null);
      toast({
        title: "Schedule Updated",
        description: "The schedule frequency has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update schedule. Check if update function exists.",
        variant: "destructive",
      });
    }
  };

  const getPlatformColor = (name: string) => {
    if (name.includes("Unity")) return "bg-purple-500";
    if (name.includes("Snapchat")) return "bg-yellow-500";
    if (name.includes("Meta")) return "bg-blue-500";
    if (name.includes("Google Ads")) return "bg-red-500";
    if (name.includes("AppTweak")) return "bg-green-500";
    return "bg-gray-500";
  };

  const getDescription = (name: string) => {
    if (name === "Unity (Today)") return "Syncs current day Unity data to BigQuery";
    if (name === "Unity (Yesterday)") return "Syncs previous day Unity data to BigQuery";
    if (name === "Snapchat") return "Syncs Snapchat ad data to BigQuery";
    if (name === "Meta") return "Syncs Meta Ads data to BigQuery";
    if (name.includes("Google Ads")) return "Syncs Google Ads data to BigQuery";
    if (name === "AppTweak Rankings") return "Syncs app rankings to Google Sheets";
    return "Scheduled sync job";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Schedule Manager</h1>
                <p className="text-sm text-muted-foreground">
                  Manage all platform sync schedules
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <nav className="border-b bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-2">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/controls">Controls</NavLink>
            <NavLink to="/unity-sync">Unity</NavLink>
            <NavLink to="/snapchat-sync">Snapchat</NavLink>
            <NavLink to="/meta-sync">Meta</NavLink>
            <NavLink to="/google-ads-sync">Google Ads</NavLink>
            <NavLink to="/schedules">Schedules</NavLink>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Active Schedules
            </CardTitle>
            <CardDescription>
              View and manage cron schedules for all platform syncs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : schedules && schedules.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${getPlatformColor(schedule.name)}`} />
                          <span className="font-medium">{schedule.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {getDescription(schedule.name)}
                      </TableCell>
                      <TableCell>
                        {editingId === schedule.id ? (
                          <Select
                            defaultValue={schedule.schedule}
                            onValueChange={(value) => handleScheduleChange(schedule.id, value)}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCHEDULE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto py-1 px-2"
                            onClick={() => setEditingId(schedule.id)}
                          >
                            {schedule.scheduleDisplay}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={schedule.active ? "default" : "secondary"}>
                          {schedule.active ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={schedule.active}
                          onCheckedChange={() => handleToggle(schedule.id, schedule.active)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No schedules found</p>
                <p className="text-sm">Schedules will appear here once configured</p>
              </div>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
