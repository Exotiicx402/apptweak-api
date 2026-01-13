import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface MetaCampaignData {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  cpm: string;
  cpc: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaDataPreviewProps {
  data: MetaCampaignData[] | null;
  isLoading: boolean;
  error: string | null;
  previewDate: string | null;
}

export function MetaDataPreview({ data, isLoading, error, previewDate }: MetaDataPreviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading Meta data...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data</CardTitle>
          <CardDescription>
            No campaign data found for {previewDate || "the selected date"}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatNumber = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "0" : num.toLocaleString();
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
  };

  const formatPercent = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "0.00%" : `${num.toFixed(2)}%`;
  };

  const getConversions = (actions?: Array<{ action_type: string; value: string }>) => {
    if (!actions || actions.length === 0) return "0";
    const conversions = actions.find(
      (a) => a.action_type === "purchase" || a.action_type === "complete_registration"
    );
    return conversions?.value || actions[0]?.value || "0";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Meta Campaign Data</CardTitle>
            <CardDescription>
              Preview for {previewDate} • {data.length} campaign{data.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <Badge variant="secondary">{data.length} campaigns</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Campaign</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Reach</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">CPM</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((campaign) => (
                <TableRow key={campaign.campaign_id}>
                  <TableCell className="font-medium">
                    <div>
                      <div className="truncate max-w-[200px]" title={campaign.campaign_name}>
                        {campaign.campaign_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{campaign.campaign_id}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(campaign.impressions)}</TableCell>
                  <TableCell className="text-right">{formatNumber(campaign.reach)}</TableCell>
                  <TableCell className="text-right">{formatNumber(campaign.clicks)}</TableCell>
                  <TableCell className="text-right">{formatPercent(campaign.ctr)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.spend)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.cpm)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.cpc)}</TableCell>
                  <TableCell className="text-right">{getConversions(campaign.actions)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
