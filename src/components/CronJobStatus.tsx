import { useState } from "react";
import { Clock, CheckCircle, XCircle, RefreshCw, AlertCircle, Edit2, Save, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCronStatus } from "@/hooks/useCronStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const SCHEDULE_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 2 hours", value: "0 */2 * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Custom", value: "custom" },
];

export function CronJobStatus() {
  const { data, isLoading, error, refetch, isFetching } = useCronStatus();
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [newSchedule, setNewSchedule] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleEditClick = (jobid: number, currentSchedule: string) => {
    setEditingJobId(jobid);
    setNewSchedule(currentSchedule);
    // Check if current schedule matches a preset
    const preset = SCHEDULE_PRESETS.find(p => p.value === currentSchedule);
    setIsCustom(!preset || preset.value === "custom");
  };

  const handleCancelEdit = () => {
    setEditingJobId(null);
    setNewSchedule("");
    setIsCustom(false);
  };

  const handlePresetChange = (value: string) => {
    if (value === "custom") {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setNewSchedule(value);
    }
  };

  const handleSaveSchedule = async (jobid: number) => {
    if (!newSchedule.trim()) {
      toast.error("Please enter a valid cron schedule");
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-cron-schedule', {
        body: { jobid, schedule: newSchedule.trim() },
      });

      if (error) throw error;

      toast.success("Schedule updated successfully");
      setEditingJobId(null);
      setNewSchedule("");
      setIsCustom(false);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update schedule";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scheduled Jobs
          </CardTitle>
          <CardDescription>Loading cron job status...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Scheduled Jobs
          </CardTitle>
          <CardDescription>Failed to load cron job status</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error.message}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4" 
            onClick={() => refetch()}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const jobs = data?.jobs || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Scheduled Jobs
            </CardTitle>
            <CardDescription>Cron job status and run history</CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cron jobs found.</p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div 
                key={job.jobid} 
                className="p-4 rounded-lg border bg-card"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium">{job.jobname}</h4>
                    
                    {editingJobId === job.jobid ? (
                      <div className="mt-2 space-y-2">
                        <Select
                          onValueChange={handlePresetChange}
                          defaultValue={
                            SCHEDULE_PRESETS.find(p => p.value === job.schedule)?.value || "custom"
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select schedule" />
                          </SelectTrigger>
                          <SelectContent>
                            {SCHEDULE_PRESETS.map((preset) => (
                              <SelectItem key={preset.value} value={preset.value}>
                                {preset.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {isCustom && (
                          <Input
                            value={newSchedule}
                            onChange={(e) => setNewSchedule(e.target.value)}
                            placeholder="* * * * * (cron expression)"
                            className="w-48 font-mono text-xs"
                          />
                        )}
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveSchedule(job.jobid)}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                            <span className="ml-1">Save</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                          >
                            <X className="w-3 h-3" />
                            <span className="ml-1">Cancel</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground font-mono">
                          {job.schedule}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => handleEditClick(job.jobid, job.schedule)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Badge variant={job.active ? "default" : "secondary"}>
                    {job.active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {job.last_run ? (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex items-center gap-2">
                      {job.last_run.status === 'succeeded' ? (
                        <CheckCircle className="w-4 h-4 text-primary" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="text-sm font-medium">
                        Last run: {job.last_run.status}
                      </span>
                    </div>
                    
                    <dl className="grid gap-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Started</dt>
                        <dd className="font-medium">
                          {formatDistanceToNow(new Date(job.last_run.start_time), { addSuffix: true })}
                        </dd>
                      </div>
                      {job.last_run.end_time && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Duration</dt>
                          <dd className="font-medium">
                            {Math.round(
                              (new Date(job.last_run.end_time).getTime() - 
                               new Date(job.last_run.start_time).getTime()) / 1000
                            )}s
                          </dd>
                        </div>
                      )}
                      {job.last_run.return_message && (
                        <div className="mt-2">
                          <dt className="text-muted-foreground mb-1">Message</dt>
                          <dd className="font-mono text-xs bg-muted p-2 rounded overflow-x-auto">
                            {job.last_run.return_message.substring(0, 200)}
                            {job.last_run.return_message.length > 200 && '...'}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                    No run history available yet
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
