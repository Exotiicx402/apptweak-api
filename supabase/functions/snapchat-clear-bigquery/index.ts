import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get Google access token for BigQuery
async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials');
  }

  console.log('Exchanging Google refresh token for access token...');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google token error:', errorText);
    throw new Error(`Failed to get Google access token: ${response.status}`);
  }

  const data = await response.json();
  console.log('Successfully obtained Google access token');
  return data.access_token;
}

// Get BigQuery target table configuration
function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const rawProjectId = Deno.env.get('BQ_PROJECT_ID')?.trim();
  const rawDatasetId = Deno.env.get('BQ_DATASET_ID')?.trim();
  const rawTableId = Deno.env.get('SNAPCHAT_BQ_TABLE_ID')?.trim();

  let projectId = rawProjectId || '';
  let datasetId = rawDatasetId || '';
  let tableId = rawTableId || '';

  const splitRef = (value: string) => value.replace(/`/g, '').split(/[.:]/).filter(Boolean);

  if (tableId && (tableId.includes('.') || tableId.includes(':'))) {
    const parts = splitRef(tableId);
    if (parts.length >= 3) {
      projectId = parts[0];
      datasetId = parts[1];
      tableId = parts[2];
    } else if (parts.length === 2) {
      datasetId = parts[0];
      tableId = parts[1];
    }
  }

  if (datasetId && (datasetId.includes('.') || datasetId.includes(':'))) {
    const parts = splitRef(datasetId);
    if (parts.length >= 2) {
      projectId = projectId || parts[0];
      datasetId = parts[1];
      if (!tableId && parts.length >= 3) {
        tableId = parts[2];
      }
    }
  }

  if (projectId && (projectId.includes('.') || projectId.includes(':'))) {
    const parts = splitRef(projectId);
    if (parts.length >= 1) {
      projectId = parts[0];
      if (!datasetId && parts.length >= 2) datasetId = parts[1];
      if (!tableId && parts.length >= 3) tableId = parts[2];
    }
  }

  if (!projectId || !datasetId || !tableId) {
    throw new Error('Missing BigQuery configuration (BQ_PROJECT_ID, BQ_DATASET_ID, SNAPCHAT_BQ_TABLE_ID)');
  }

  console.log('Resolved BigQuery target', { projectId, datasetId, tableId });

  return { projectId, datasetId, tableId };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting BigQuery table clear operation...');

    // Get access token
    const googleToken = await getGoogleAccessToken();

    // Get table reference
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTableRef = `\`${projectId}.${datasetId}.${tableId}\``;

    console.log(`Clearing all rows from table: ${fullTableRef}`);

    // Execute DELETE query
    const deleteQuery = `DELETE FROM ${fullTableRef} WHERE TRUE`;

    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: deleteQuery,
          useLegacySql: false,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BigQuery API error: ${response.status} ${errorText}`);
      throw new Error(`BigQuery API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const rowsDeleted = result.numDmlAffectedRows ? parseInt(result.numDmlAffectedRows, 10) : 0;

    console.log(`Successfully deleted ${rowsDeleted} rows from ${fullTableRef}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully cleared all data from BigQuery table`,
        rowsDeleted,
        table: `${projectId}.${datasetId}.${tableId}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in snapchat-clear-bigquery function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
