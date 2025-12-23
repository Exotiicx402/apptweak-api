import { Clock, CheckCircle, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCronStatus } from "@/hooks/useCronStatus";
import { formatDistanceToNow } from "date-fns";

export function CronJobStatus() {
  const { data, isLoading, error, refetch, isFetching } = useCronStatus();

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
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {job.schedule}
                    </p>
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
