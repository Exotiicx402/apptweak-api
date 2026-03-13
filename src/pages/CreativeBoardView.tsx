import { Radar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import ReadOnlyKanbanBoard from "@/components/creative-scanner/ReadOnlyKanbanBoard";

const CreativeBoardView = () => {
  const { data: creativeRequests } = useQuery({
    queryKey: ["creative-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Creative Requests Board</h1>
            <p className="text-sm text-muted-foreground">
              Live view of creative requests from <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">#hours-creative-polymarket</code>
            </p>
          </div>
        </div>

        {creativeRequests && creativeRequests.length > 0 ? (
          <ReadOnlyKanbanBoard requests={creativeRequests} />
        ) : (
          <Card>
            <CardContent className="py-12">
              <p className="text-sm text-muted-foreground text-center">No creative requests yet.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CreativeBoardView;
